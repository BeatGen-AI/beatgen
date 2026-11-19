import stripe
from typing import Optional, Dict, Any
from datetime import datetime, timezone
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

# Checkout `ui_mode` as our API (and the frontend) names it -> the value Stripe expects. The Stripe API version
# pinned by stripe-python 17 (2026-11-18.endive) names these modes `hosted_page` / `embedded_page`.
CHECKOUT_UI_MODES = {"hosted": "hosted_page", "embedded": "embedded_page"}


class StripeService:
    def __init__(self):
        pass
    
    async def create_or_get_customer(self, user: User) -> str:
        """Create a Stripe customer for a user or return existing one"""
        async with get_async_session() as session:
            # Check if customer already exists
            stmt = select(StripeCustomer).where(StripeCustomer.user_id == user.id)
            result = await session.execute(stmt)
            existing_customer = result.scalars().first()
            
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
                await session.commit()
                
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
        if ui_mode not in CHECKOUT_UI_MODES:
            raise ValueError(f"Unsupported checkout ui_mode {ui_mode!r}; expected one of {sorted(CHECKOUT_UI_MODES)}")
        customer_id = await self.create_or_get_customer(user)
        
        try:
            # Use module-level stripe API for checkout sessions as it's more compatible
            import stripe as stripe_module
            stripe_module.api_key = settings.stripe.SECRET_KEY
            
            session_params = {
                "customer": customer_id,
                # API 2026-11-18.endive replaced `payment_method_types` with this filter on the dynamic set.
                "allowed_payment_method_types": ["card"],
                "mode": "subscription",
                "line_items": [{
                    "price": price_id,
                    "quantity": 1,
                }],
                "metadata": {
                    "user_id": str(user.id),
                },
                "ui_mode": CHECKOUT_UI_MODES[ui_mode],
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
            result = await session.execute(stmt)
            subscription = result.scalars().first()
            
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
                    subscription.canceled_at = datetime.now(timezone.utc)
                
                session.add(subscription)
                await session.commit()
                
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
            result = await session.execute(stmt)
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
            result = await session.execute(stmt)
            subscription = result.scalars().first()
            
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
                subscription.updated_at = datetime.now(timezone.utc)
                
                session.add(subscription)
                await session.commit()
                
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
    
    async def sync_subscription_from_stripe(self, stripe_subscription: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Sync subscription data from Stripe webhook"""
        async with get_async_session() as session:
            # Extract data from the subscription dict
            customer_id = stripe_subscription['customer']
            subscription_id = stripe_subscription['id']
            status = stripe_subscription['status']
            
            current_period_start, current_period_end = subscription_billing_period(stripe_subscription)
            cancel_at_period_end = stripe_subscription['cancel_at_period_end']
            canceled_at = stripe_subscription.get('canceled_at')
            trial_end = stripe_subscription.get('trial_end')
            price_id = stripe_subscription['items']['data'][0]['price']['id']
            
            # Find the user by customer ID
            stmt = select(StripeCustomer).where(
                StripeCustomer.stripe_customer_id == customer_id
            )
            result = await session.execute(stmt)
            customer = result.scalars().first()
            
            if not customer:
                logger.error(f"Customer not found for Stripe customer ID: {customer_id}")
                return None
            
            # Get the plan
            stmt = select(SubscriptionPlan).where(
                SubscriptionPlan.stripe_price_id == price_id
            )
            result = await session.execute(stmt)
            plan = result.scalars().first()
            
            if not plan:
                logger.error(f"Plan not found for Stripe price ID: {price_id}")
                return None
            
            # Check if subscription exists
            stmt = select(Subscription).where(
                Subscription.stripe_subscription_id == subscription_id
            )
            result = await session.execute(stmt)
            subscription = result.scalars().first()
            
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
                subscription.updated_at = datetime.now(timezone.utc)
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
            
            await session.commit()
            
            # Return essential data with plan info to avoid session detachment issues
            return {
                "user_id": subscription.user_id,
                "plan_id": subscription.plan_id,
                "plan_tier": plan.tier,
                "stripe_subscription_id": subscription.stripe_subscription_id,
                "status": subscription.status
            }
    
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
            result = await session.execute(stmt)
            if result.scalars().first():
                return  # Already processed
            
            invoice = stripe_event["data"]["object"]
            
            payment_event = PaymentEvent(
                user_id=user_id,
                stripe_event_id=stripe_event["id"],
                stripe_invoice_id=invoice.get("id"),
                stripe_payment_intent_id=_invoice_payment_intent_id(invoice),
                event_type=stripe_event["type"],
                amount_cents=invoice.get("amount_paid"),
                currency=invoice.get("currency"),
                status=invoice.get("status"),
                event_data=stripe_event,
            )
            
            session.add(payment_event)
            await session.commit()
    
    @staticmethod
    def verify_webhook_signature(payload: bytes, signature: str, webhook_secret: str) -> Dict[str, Any]:
        """Verify the webhook signature and return the event as a plain dict.

        stripe-python's `StripeObject` is no longer a `dict` (no `.get()`, not JSON-serializable), so the event is
        converted once here and every handler works on plain dicts.
        """
        return stripe.Webhook.construct_event(payload, signature, webhook_secret).to_dict()


def subscription_billing_period(stripe_subscription: Dict[str, Any]) -> tuple[int, int]:
    """(current_period_start, current_period_end) of a subscription payload, as Unix timestamps.

    Since Stripe API version 2025-03-31.basil the billing period lives on each subscription item, not on the
    subscription. Payloads of older API versions (e.g. an older webhook endpoint version) still carry it top-level.
    """
    if "current_period_start" in stripe_subscription:
        return stripe_subscription["current_period_start"], stripe_subscription["current_period_end"]
    items = stripe_subscription["items"]["data"]
    if not items:
        raise ValueError(
            f"Stripe subscription {stripe_subscription['id']} has no items to read its billing period from"
        )
    return items[0]["current_period_start"], items[0]["current_period_end"]


def _invoice_payment_intent_id(invoice: Dict[str, Any]) -> Optional[str]:
    """The invoice's PaymentIntent ID, if the payload carries one.

    Since API version 2025-03-31.basil `Invoice.payment_intent` is gone; payments are listed under
    `invoice.payments` (included only when expanded). Older API versions send `payment_intent` top-level.
    """
    if "payment_intent" in invoice:
        return invoice["payment_intent"]
    for invoice_payment in (invoice.get("payments") or {}).get("data", []):
        payment = invoice_payment.get("payment") or {}
        if payment.get("type") == "payment_intent":
            payment_intent = payment.get("payment_intent")
            return payment_intent if isinstance(payment_intent, str) else payment_intent["id"]
    return None