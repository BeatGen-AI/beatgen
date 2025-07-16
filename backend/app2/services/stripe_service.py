import stripe
from typing import Optional, Dict, Any
from datetime import datetime
from sqlmodel import Session, select
import logging

from app2.models.user import User
from app2.models.subscription import (
    StripeCustomer, 
    Subscription, 
    SubscriptionPlan,
    PaymentEvent
)
from app2.core.config import settings
from app2.infrastructure.database.sqlmodel_client import get_async_session

logger = logging.getLogger(__name__)

# Create a singleton Stripe client
stripe_client = stripe.StripeClient(api_key=settings.stripe.SECRET_KEY)


class StripeService:
    def __init__(self):
        pass
    
    async def create_or_get_customer(self, user: User) -> str:
        """Create a Stripe customer for a user or return existing one"""
        async with get_async_session() as session:
            # Check if customer already exists
            stmt = select(StripeCustomer).where(StripeCustomer.user_id == user.id)
            result = session.exec(stmt)
            existing_customer = result.first()
            
            if existing_customer:
                return existing_customer.stripe_customer_id
            
            # Create new Stripe customer
            try:
                # Use module-level API for consistency
                import stripe as stripe_module
                stripe_module.api_key = settings.stripe.SECRET_KEY
                
                stripe_customer = stripe_module.Customer.create(
                    email=user.email,
                    metadata={
                        "user_id": str(user.id),
                        "username": user.username or "",
                    }
                )
                
                # Save to database
                db_customer = StripeCustomer(
                    user_id=user.id,
                    stripe_customer_id=stripe_customer.id,
                )
                session.add(db_customer)
                session.commit()
                
                return stripe_customer.id
                
            except stripe.StripeError as e:
                logger.error(f"Stripe error creating customer: {str(e)}")
                raise
    
    async def create_checkout_session(
        self, 
        user: User, 
        price_id: str,
        success_url: str,
        cancel_url: str,
        ui_mode: str = "hosted"  # "hosted" or "embedded"
    ) -> Dict[str, Any]:
        """Create a Stripe checkout session for subscription"""
        customer_id = await self.create_or_get_customer(user)
        
        try:
            # Use module-level stripe API for checkout sessions as it's more compatible
            import stripe as stripe_module
            stripe_module.api_key = settings.stripe.SECRET_KEY
            
            session_params = {
                "customer": customer_id,
                "payment_method_types": ["card"],
                "mode": "subscription",
                "line_items": [{
                    "price": price_id,
                    "quantity": 1,
                }],
                "metadata": {
                    "user_id": str(user.id),
                },
                "ui_mode": ui_mode,
            }
            
            # Add any embedded-specific parameters here if needed
            # Note: payment_method_options with setup_future_usage is not allowed in subscription mode
            # Stripe automatically handles payment method saving for subscriptions
            
            # For embedded mode, use return_url instead of success_url/cancel_url
            if ui_mode == "embedded":
                # Use success_url as the return_url for embedded mode
                # Stripe will append the session_id to this URL
                session_params["return_url"] = success_url.replace("{CHECKOUT_SESSION_ID}", "{CHECKOUT_SESSION_ID}")
            else:
                # For hosted mode, use success_url and cancel_url
                session_params["success_url"] = success_url
                session_params["cancel_url"] = cancel_url
            
            session = stripe_module.checkout.Session.create(**session_params)
            
            result = {
                "checkout_url": session.url,
                "session_id": session.id,
            }
            
            # For embedded checkout, include client_secret
            if ui_mode == "embedded":
                result["client_secret"] = session.client_secret
            
            return result
            
        except stripe.StripeError as e:
            logger.error(f"Stripe error creating checkout session: {str(e)}")
            raise
    
    async def cancel_subscription(
        self, 
        user: User, 
        at_period_end: bool = True
    ) -> Dict[str, Any]:
        """Cancel a user's subscription"""
        async with get_async_session() as session:
            # Get active subscription
            stmt = select(Subscription).where(
                Subscription.user_id == user.id,
                Subscription.status.in_(["active", "trialing"])
            )
            result = session.exec(stmt)
            subscription = result.first()
            
            if not subscription:
                raise ValueError("No active subscription found")
            
            try:
                # Use module-level API
                import stripe as stripe_module
                stripe_module.api_key = settings.stripe.SECRET_KEY
                
                if at_period_end:
                    # Cancel at end of billing period
                    stripe_sub = stripe_module.Subscription.modify(
                        subscription.stripe_subscription_id,
                        cancel_at_period_end=True
                    )
                else:
                    # Cancel immediately
                    stripe_sub = stripe_module.Subscription.delete(
                        subscription.stripe_subscription_id
                    )
                
                # Update database
                subscription.cancel_at_period_end = at_period_end
                if not at_period_end:
                    subscription.status = "canceled"
                    subscription.canceled_at = datetime.utcnow()
                
                session.add(subscription)
                session.commit()
                
                return {
                    "status": "scheduled" if at_period_end else "canceled",
                    "cancel_at": stripe_sub.cancel_at if at_period_end else None,
                }
                
            except stripe.StripeError as e:
                logger.error(f"Stripe error canceling subscription: {str(e)}")
                raise
    
    async def get_subscription_status(self, user: User) -> Optional[Dict[str, Any]]:
        """Get current subscription status for a user"""
        async with get_async_session() as session:
            # Get active subscription with plan details
            stmt = (
                select(Subscription, SubscriptionPlan)
                .join(SubscriptionPlan)
                .where(
                    Subscription.user_id == user.id,
                    Subscription.status.in_(["active", "trialing", "past_due"])
                )
            )
            result = session.exec(stmt)
            row = result.first()
            
            if not row:
                return None
            
            subscription, plan = row
            
            return {
                "subscription_id": str(subscription.id),
                "stripe_subscription_id": subscription.stripe_subscription_id,
                "status": subscription.status,
                "plan": {
                    "id": str(plan.id),
                    "name": plan.name,
                    "tier": plan.tier,
                    "price_cents": plan.price_cents,
                    "billing_period": plan.billing_period,
                    "features": plan.features,
                },
                "current_period_start": subscription.current_period_start.isoformat(),
                "current_period_end": subscription.current_period_end.isoformat(),
                "cancel_at_period_end": subscription.cancel_at_period_end,
                "trial_end": subscription.trial_end.isoformat() if subscription.trial_end else None,
            }
    
    async def reactivate_subscription(self, user: User) -> Dict[str, Any]:
        """Reactivate a subscription that's set to cancel at period end"""
        async with get_async_session() as session:
            # Get active subscription that's set to cancel
            stmt = select(Subscription).where(
                Subscription.user_id == user.id,
                Subscription.status.in_(["active", "trialing"]),
                Subscription.cancel_at_period_end == True
            )
            result = session.exec(stmt)
            subscription = result.first()
            
            if not subscription:
                raise ValueError("No subscription pending cancellation found")
            
            try:
                # Use module-level API
                import stripe as stripe_module
                stripe_module.api_key = settings.stripe.SECRET_KEY
                
                # Update subscription to not cancel
                stripe_sub = stripe_module.Subscription.modify(
                    subscription.stripe_subscription_id,
                    cancel_at_period_end=False
                )
                
                # Update database
                subscription.cancel_at_period_end = False
                subscription.updated_at = datetime.utcnow()
                
                session.add(subscription)
                session.commit()
                
                return {
                    "status": "reactivated",
                    "message": "Your subscription has been reactivated"
                }
                
            except stripe.StripeError as e:
                logger.error(f"Stripe error reactivating subscription: {str(e)}")
                raise
    
    async def create_portal_session(self, user: User, return_url: str) -> str:
        """Create a Stripe customer portal session"""
        customer_id = await self.create_or_get_customer(user)
        
        try:
            # Use module-level API
            import stripe as stripe_module
            stripe_module.api_key = settings.stripe.SECRET_KEY
            
            session = stripe_module.billing_portal.Session.create(
                customer=customer_id,
                return_url=return_url,
            )
            
            return session.url
            
        except stripe.StripeError as e:
            logger.error(f"Stripe error creating portal session: {str(e)}")
            raise
    
    async def sync_subscription_from_stripe(self, stripe_subscription: Dict[str, Any]) -> Optional[Subscription]:
        """Sync subscription data from Stripe webhook"""
        async with get_async_session() as session:
            # Extract data from the subscription dict
            customer_id = stripe_subscription['customer']
            subscription_id = stripe_subscription['id']
            status = stripe_subscription['status']
            
            # For webhook events, we need to get period dates from the invoice
            if 'current_period_start' in stripe_subscription:
                current_period_start = stripe_subscription['current_period_start']
                current_period_end = stripe_subscription['current_period_end']
            else:
                # Use billing_cycle_anchor as start date
                current_period_start = stripe_subscription.get('billing_cycle_anchor', stripe_subscription['created'])
                
                # Calculate period end based on the plan interval
                plan = stripe_subscription.get('plan', {})
                interval = plan.get('interval', 'month')
                interval_count = plan.get('interval_count', 1)
                
                # Calculate end date based on interval
                if interval == 'month':
                    # Add months
                    from dateutil.relativedelta import relativedelta
                    start_dt = datetime.fromtimestamp(current_period_start)
                    end_dt = start_dt + relativedelta(months=interval_count)
                    current_period_end = int(end_dt.timestamp())
                elif interval == 'year':
                    # Add years
                    from dateutil.relativedelta import relativedelta
                    start_dt = datetime.fromtimestamp(current_period_start)
                    end_dt = start_dt + relativedelta(years=interval_count)
                    current_period_end = int(end_dt.timestamp())
                else:
                    # Default to 30 days for other intervals
                    current_period_end = current_period_start + (30 * 24 * 60 * 60 * interval_count)
            
            cancel_at_period_end = stripe_subscription['cancel_at_period_end']
            canceled_at = stripe_subscription.get('canceled_at')
            trial_end = stripe_subscription.get('trial_end')
            price_id = stripe_subscription['items']['data'][0]['price']['id']
            
            # Find the user by customer ID
            stmt = select(StripeCustomer).where(
                StripeCustomer.stripe_customer_id == customer_id
            )
            result = session.exec(stmt)
            customer = result.first()
            
            if not customer:
                logger.error(f"Customer not found for Stripe customer ID: {customer_id}")
                return None
            
            # Get the plan
            stmt = select(SubscriptionPlan).where(
                SubscriptionPlan.stripe_price_id == price_id
            )
            result = session.exec(stmt)
            plan = result.first()
            
            if not plan:
                logger.error(f"Plan not found for Stripe price ID: {price_id}")
                return None
            
            # Check if subscription exists
            stmt = select(Subscription).where(
                Subscription.stripe_subscription_id == subscription_id
            )
            result = session.exec(stmt)
            subscription = result.first()
            
            if subscription:
                # Update existing subscription
                subscription.status = status
                subscription.current_period_start = datetime.fromtimestamp(
                    current_period_start
                )
                subscription.current_period_end = datetime.fromtimestamp(
                    current_period_end
                )
                subscription.cancel_at_period_end = cancel_at_period_end
                if canceled_at:
                    subscription.canceled_at = datetime.fromtimestamp(
                        canceled_at
                    )
                if trial_end:
                    subscription.trial_end = datetime.fromtimestamp(
                        trial_end
                    )
                subscription.updated_at = datetime.utcnow()
            else:
                # Create new subscription
                subscription = Subscription(
                    user_id=customer.user_id,
                    stripe_subscription_id=subscription_id,
                    stripe_customer_id=customer_id,
                    plan_id=plan.id,
                    status=status,
                    current_period_start=datetime.fromtimestamp(
                        current_period_start
                    ),
                    current_period_end=datetime.fromtimestamp(
                        current_period_end
                    ),
                    cancel_at_period_end=cancel_at_period_end,
                    trial_end=datetime.fromtimestamp(trial_end) 
                        if trial_end else None,
                )
                session.add(subscription)
            
            session.commit()
            return subscription
    
    async def record_payment_event(
        self, 
        stripe_event: Dict[str, Any],
        user_id: str
    ) -> None:
        """Record a payment event for audit trail"""
        async with get_async_session() as session:
            # Check if event already processed
            stmt = select(PaymentEvent).where(
                PaymentEvent.stripe_event_id == stripe_event["id"]
            )
            result = session.exec(stmt)
            if result.first():
                return  # Already processed
            
            invoice = stripe_event["data"]["object"]
            
            payment_event = PaymentEvent(
                user_id=user_id,
                stripe_event_id=stripe_event["id"],
                stripe_invoice_id=invoice.get("id"),
                stripe_payment_intent_id=invoice.get("payment_intent"),
                event_type=stripe_event["type"],
                amount_cents=invoice.get("amount_paid"),
                currency=invoice.get("currency"),
                status=invoice.get("status"),
                event_data=stripe_event,
            )
            
            session.add(payment_event)
            session.commit()
    
    @staticmethod
    def verify_webhook_signature(payload: bytes, signature: str, webhook_secret: str) -> Dict[str, Any]:
        """Verify webhook signature and return event"""
        return stripe.Webhook.construct_event(payload, signature, webhook_secret)