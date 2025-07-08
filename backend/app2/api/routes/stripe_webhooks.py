from fastapi import APIRouter, Request, HTTPException, Header
from typing import Optional
from sqlmodel import select
import logging

from app2.core.config import settings
from app2.services.stripe_service import StripeService, stripe_client
from app2.models.subscription import StripeCustomer, PaymentEvent, SubscriptionPlan
from app2.infrastructure.database.sqlmodel_client import get_async_session

router = APIRouter()
logger = logging.getLogger(__name__)

stripe_service = StripeService()


@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None)
):
    """Handle Stripe webhook events"""
    print(f"=== WEBHOOK RECEIVED ===")
    print(f"Signature header present: {stripe_signature is not None}")
    logger.info(f"Webhook endpoint hit with signature: {stripe_signature[:20] if stripe_signature else 'None'}...")
    
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing stripe-signature header")
    
    # Get the raw body
    payload = await request.body()
    
    try:
        # Verify webhook signature and construct event
        event = StripeService.verify_webhook_signature(
            payload, 
            stripe_signature, 
            settings.stripe.WEBHOOK_SECRET
        )
    except ValueError as e:
        logger.error(f"Invalid payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")
    except Exception as e:
        logger.error(f"Webhook signature verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    # For payment events, check if we've already processed this event
    if event["type"] in ["invoice.payment_succeeded", "invoice.payment_failed", "checkout.session.completed"]:
        async with get_async_session() as session:
            stmt = select(PaymentEvent).where(
                PaymentEvent.stripe_event_id == event["id"]
            )
            result = session.exec(stmt)
            if result.first():
                logger.info(f"Event {event['id']} already processed")
                return {"status": "already_processed"}
    
    # Log the event type
    logger.info(f"Processing Stripe webhook: {event['type']}")
    
    try:
        # Handle different event types
        if event["type"] == "customer.subscription.created":
            await handle_subscription_created(event["data"]["object"])
        
        elif event["type"] == "customer.subscription.updated":
            await handle_subscription_updated(event["data"]["object"])
        
        elif event["type"] == "customer.subscription.deleted":
            await handle_subscription_deleted(event["data"]["object"])
        
        elif event["type"] == "invoice.payment_succeeded":
            await handle_payment_succeeded(event)
        
        elif event["type"] == "invoice.payment_failed":
            await handle_payment_failed(event)
        
        elif event["type"] == "customer.subscription.trial_will_end":
            await handle_trial_ending(event["data"]["object"])
        
        elif event["type"] == "checkout.session.completed":
            await handle_checkout_completed(event["data"]["object"])
        
        elif event["type"] == "product.created":
            await handle_product_created(event["data"]["object"])
        
        elif event["type"] == "product.updated":
            await handle_product_updated(event["data"]["object"])
        
        elif event["type"] == "product.deleted":
            await handle_product_deleted(event["data"]["object"])
        
        elif event["type"] == "price.created":
            await handle_price_created(event["data"]["object"])
        
        elif event["type"] == "price.updated":
            await handle_price_updated(event["data"]["object"])
        
        elif event["type"] == "price.deleted":
            await handle_price_deleted(event["data"]["object"])
        
        else:
            logger.info(f"Unhandled event type: {event['type']}")
    
    except Exception as e:
        logger.error(f"Error processing webhook event: {e}")
        # Return success to avoid Stripe retrying
        # We'll handle the error internally
    
    return {"status": "success"}


async def handle_subscription_created(subscription_data):
    """Handle new subscription creation"""
    logger.info(f"New subscription created: {subscription_data['id']}")
    logger.info(f"Subscription data keys: {list(subscription_data.keys())}")
    logger.info(f"Has current_period_start: {'current_period_start' in subscription_data}")
    # The webhook data already has everything we need, so just use it directly
    await stripe_service.sync_subscription_from_stripe(subscription_data)


async def handle_subscription_updated(subscription_data):
    """Handle subscription updates (plan changes, status changes, etc.)"""
    logger.info(f"Subscription updated: {subscription_data['id']} - Status: {subscription_data['status']}")
    # The webhook data already has everything we need, so just use it directly
    await stripe_service.sync_subscription_from_stripe(subscription_data)


async def handle_subscription_deleted(subscription_data):
    """Handle subscription deletion/cancellation"""
    logger.info(f"Subscription deleted: {subscription_data['id']}")
    # The webhook data already has everything we need, so just use it directly
    await stripe_service.sync_subscription_from_stripe(subscription_data)


async def handle_payment_succeeded(event):
    """Handle successful payment"""
    invoice = event["data"]["object"]
    logger.info(f"Payment succeeded for invoice: {invoice['id']}")
    
    # Find user by customer ID
    async with get_async_session() as session:
        stmt = select(StripeCustomer).where(
            StripeCustomer.stripe_customer_id == invoice["customer"]
        )
        result = session.exec(stmt)
        customer = result.first()
        
        if customer:
            await stripe_service.record_payment_event(event, customer.user_id)
        else:
            logger.error(f"Customer not found for payment: {invoice['customer']}")


async def handle_payment_failed(event):
    """Handle failed payment"""
    invoice = event["data"]["object"]
    logger.warning(f"Payment failed for invoice: {invoice['id']}")
    
    # Find user by customer ID
    async with get_async_session() as session:
        stmt = select(StripeCustomer).where(
            StripeCustomer.stripe_customer_id == invoice["customer"]
        )
        result = session.exec(stmt)
        customer = result.first()
        
        if customer:
            await stripe_service.record_payment_event(event, customer.user_id)
            # TODO: Send payment failure email to user
        else:
            logger.error(f"Customer not found for failed payment: {invoice['customer']}")


async def handle_trial_ending(subscription):
    """Handle trial ending soon (3 days before)"""
    logger.info(f"Trial ending soon for subscription: {subscription['id']}")
    # TODO: Send trial ending email to user


async def handle_checkout_completed(checkout_session):
    """Handle completed checkout session"""
    logger.info(f"Checkout completed: {checkout_session['id']}")
    
    # For subscription mode, retrieve the subscription
    if checkout_session.get('mode') == 'subscription' and checkout_session.get('subscription'):
        try:
            # For checkout completion, we need to retrieve the full subscription
            # But we'll convert it to dict format for consistency
            subscription = stripe_client.subscriptions.retrieve(checkout_session['subscription'])
            logger.info(f"Retrieved subscription {subscription.id} from checkout session")
            
            # Convert to dict and sync
            subscription_dict = subscription.to_dict()
            await stripe_service.sync_subscription_from_stripe(subscription_dict)
            
            # Also record the successful payment event
            if checkout_session.get('customer'):
                async with get_async_session() as session:
                    stmt = select(StripeCustomer).where(
                        StripeCustomer.stripe_customer_id == checkout_session['customer']
                    )
                    result = session.exec(stmt)
                    customer = result.first()
                    
                    if customer:
                        # Create a payment event for the initial payment
                        payment_event = PaymentEvent(
                            user_id=customer.user_id,
                            stripe_event_id=f"checkout_{checkout_session['id']}",
                            event_type="checkout.session.completed",
                            amount_cents=checkout_session.get('amount_total'),
                            currency=checkout_session.get('currency'),
                            status="succeeded",
                            event_data={"checkout_session": checkout_session},
                        )
                        session.add(payment_event)
                        session.commit()
                        logger.info(f"Recorded checkout completion for user {customer.user_id}")
        except Exception as e:
            logger.error(f"Error handling checkout completion: {e}")
    
    # The subscription.created webhook will also fire, providing additional confirmation


async def handle_product_created(product):
    """Handle product creation from Stripe"""
    logger.info(f"Product created: {product['id']} - {product['name']}")
    
    # Extract tier from metadata or name
    tier = product.get('metadata', {}).get('tier', 'basic').lower()
    
    async with get_async_session() as session:
        from app2.models.subscription import SubscriptionPlan, BillingPeriod
        
        # Check if product already exists
        stmt = select(SubscriptionPlan).where(
            SubscriptionPlan.stripe_product_id == product['id']
        )
        result = session.exec(stmt)
        existing = result.first()
        
        if not existing:
            # Create new product - we'll update with price info when price is created
            plan = SubscriptionPlan(
                stripe_product_id=product['id'],
                stripe_price_id='',  # Will be updated when price is created
                name=product['name'],
                tier=tier,
                price_cents=0,  # Will be updated when price is created
                billing_period=BillingPeriod.MONTHLY,  # Default, will be updated
                features=product.get('metadata', {}),
                is_active=product['active']
            )
            session.add(plan)
            session.commit()
            logger.info(f"Created subscription plan for product: {product['id']}")


async def handle_product_updated(product):
    """Handle product updates from Stripe"""
    logger.info(f"Product updated: {product['id']} - {product['name']}")
    
    async with get_async_session() as session:
        from app2.models.subscription import SubscriptionPlan
        
        stmt = select(SubscriptionPlan).where(
            SubscriptionPlan.stripe_product_id == product['id']
        )
        result = session.exec(stmt)
        plan = result.first()
        
        if plan:
            plan.name = product['name']
            plan.is_active = product['active']
            plan.features = product.get('metadata', {})
            if 'tier' in product.get('metadata', {}):
                plan.tier = product['metadata']['tier'].lower()
            
            session.add(plan)
            session.commit()
            logger.info(f"Updated subscription plan for product: {product['id']}")


async def handle_product_deleted(product):
    """Handle product deletion from Stripe"""
    logger.info(f"Product deleted: {product['id']}")
    
    async with get_async_session() as session:
        from app2.models.subscription import SubscriptionPlan
        
        stmt = select(SubscriptionPlan).where(
            SubscriptionPlan.stripe_product_id == product['id']
        )
        result = session.exec(stmt)
        plan = result.first()
        
        if plan:
            # Soft delete - just mark as inactive
            plan.is_active = False
            session.add(plan)
            session.commit()
            logger.info(f"Deactivated subscription plan for product: {product['id']}")


async def handle_price_created(price):
    """Handle price creation from Stripe"""
    logger.info(f"Price created: {price['id']} for product {price['product']}")
    
    async with get_async_session() as session:
        from app2.models.subscription import SubscriptionPlan, BillingPeriod
        
        # Find the product this price belongs to
        stmt = select(SubscriptionPlan).where(
            SubscriptionPlan.stripe_product_id == price['product']
        )
        result = session.exec(stmt)
        plan = result.first()
        
        if plan:
            # Update the plan with price information
            plan.stripe_price_id = price['id']
            plan.price_cents = price['unit_amount']
            plan.currency = price['currency'].upper()
            
            # Determine billing period from Stripe's interval
            if price.get('recurring'):
                interval = price['recurring']['interval']
                # Map Stripe intervals to our enum
                if interval == 'month':
                    plan.billing_period = BillingPeriod.MONTHLY
                elif interval == 'year':
                    plan.billing_period = BillingPeriod.YEARLY
                else:
                    # Default to monthly for any other interval
                    logger.warning(f"Unsupported interval '{interval}', defaulting to monthly")
                    plan.billing_period = BillingPeriod.MONTHLY
            
            session.add(plan)
            session.commit()
            logger.info(f"Updated plan with price: {price['id']}")
        else:
            # Price created before product webhook - create placeholder
            logger.warning(f"Price created for unknown product: {price['product']}")


async def handle_price_updated(price):
    """Handle price updates from Stripe"""
    logger.info(f"Price updated: {price['id']}")
    
    async with get_async_session() as session:
        from app2.models.subscription import SubscriptionPlan
        
        stmt = select(SubscriptionPlan).where(
            SubscriptionPlan.stripe_price_id == price['id']
        )
        result = session.exec(stmt)
        plan = result.first()
        
        if plan:
            plan.price_cents = price['unit_amount']
            plan.currency = price['currency'].upper()
            plan.is_active = price['active']
            
            session.add(plan)
            session.commit()
            logger.info(f"Updated plan price: {price['id']}")


async def handle_price_deleted(price):
    """Handle price deletion from Stripe"""
    logger.info(f"Price deleted: {price['id']}")
    
    # Usually you don't delete prices, just deactivate them
    async with get_async_session() as session:
        from app2.models.subscription import SubscriptionPlan
        
        stmt = select(SubscriptionPlan).where(
            SubscriptionPlan.stripe_price_id == price['id']
        )
        result = session.exec(stmt)
        plan = result.first()
        
        if plan:
            plan.is_active = False
            session.add(plan)
            session.commit()
            logger.info(f"Deactivated plan for deleted price: {price['id']}")