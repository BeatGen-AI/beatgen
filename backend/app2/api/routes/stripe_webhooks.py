from fastapi import APIRouter, Request, HTTPException, Header
from typing import Optional
from sqlmodel import select
from datetime import datetime, timezone
import logging
import traceback

from app2.core.config import settings
from app2.services.stripe_service import StripeService, stripe_client
from app2.services.credits_service import credits_service
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
            result = await session.execute(stmt)
            if result.scalars().first():
                logger.info(f"Event {event['id']} already processed")
                return {"status": "already_processed"}
    
    # Log the event type
    logger.info(f"Processing Stripe webhook: {event['type']}")
    
    try:
        # Handle different event types
        if event["type"] == "customer.subscription.created":
            logger.info(f"🔵 WEBHOOK - Starting handle_subscription_created for {event['data']['object']['id']}")
            await handle_subscription_created(event["data"]["object"])
            logger.info(f"✅ WEBHOOK - Completed handle_subscription_created for {event['data']['object']['id']}")
        
        elif event["type"] == "customer.subscription.updated":
            logger.info(f"🔵 WEBHOOK - Starting handle_subscription_updated for {event['data']['object']['id']}")
            await handle_subscription_updated(event["data"]["object"])
            logger.info(f"✅ WEBHOOK - Completed handle_subscription_updated for {event['data']['object']['id']}")
        
        elif event["type"] == "customer.subscription.deleted":
            logger.info(f"🔵 WEBHOOK - Starting handle_subscription_deleted for {event['data']['object']['id']}")
            await handle_subscription_deleted(event["data"]["object"])
            logger.info(f"✅ WEBHOOK - Completed handle_subscription_deleted for {event['data']['object']['id']}")
        
        elif event["type"] == "invoice.payment_succeeded":
            logger.info(f"🔵 WEBHOOK - Starting handle_payment_succeeded for {event['data']['object']['id']}")
            await handle_payment_succeeded(event)
            logger.info(f"✅ WEBHOOK - Completed handle_payment_succeeded for {event['data']['object']['id']}")
        
        elif event["type"] == "invoice.payment_failed":
            logger.info(f"🔵 WEBHOOK - Starting handle_payment_failed for {event['data']['object']['id']}")
            await handle_payment_failed(event)
            logger.info(f"✅ WEBHOOK - Completed handle_payment_failed for {event['data']['object']['id']}")
        
        elif event["type"] == "customer.subscription.trial_will_end":
            logger.info(f"🔵 WEBHOOK - Starting handle_trial_ending for {event['data']['object']['id']}")
            await handle_trial_ending(event["data"]["object"])
            logger.info(f"✅ WEBHOOK - Completed handle_trial_ending for {event['data']['object']['id']}")
        
        elif event["type"] == "checkout.session.completed":
            logger.info(f"🔵 WEBHOOK - Starting handle_checkout_completed for {event['data']['object']['id']}")
            await handle_checkout_completed(event["data"]["object"])
            logger.info(f"✅ WEBHOOK - Completed handle_checkout_completed for {event['data']['object']['id']}")
        
        elif event["type"] == "product.created":
            logger.info(f"🔵 WEBHOOK - Starting handle_product_created for {event['data']['object']['id']}")
            await handle_product_created(event["data"]["object"])
            logger.info(f"✅ WEBHOOK - Completed handle_product_created for {event['data']['object']['id']}")
        
        elif event["type"] == "product.updated":
            logger.info(f"🔵 WEBHOOK - Starting handle_product_updated for {event['data']['object']['id']}")
            await handle_product_updated(event["data"]["object"])
            logger.info(f"✅ WEBHOOK - Completed handle_product_updated for {event['data']['object']['id']}")
        
        elif event["type"] == "product.deleted":
            logger.info(f"🔵 WEBHOOK - Starting handle_product_deleted for {event['data']['object']['id']}")
            await handle_product_deleted(event["data"]["object"])
            logger.info(f"✅ WEBHOOK - Completed handle_product_deleted for {event['data']['object']['id']}")
        
        elif event["type"] == "price.created":
            logger.info(f"🔵 WEBHOOK - Starting handle_price_created for {event['data']['object']['id']}")
            await handle_price_created(event["data"]["object"])
            logger.info(f"✅ WEBHOOK - Completed handle_price_created for {event['data']['object']['id']}")
        
        elif event["type"] == "price.updated":
            logger.info(f"🔵 WEBHOOK - Starting handle_price_updated for {event['data']['object']['id']}")
            await handle_price_updated(event["data"]["object"])
            logger.info(f"✅ WEBHOOK - Completed handle_price_updated for {event['data']['object']['id']}")
        
        elif event["type"] == "price.deleted":
            logger.info(f"🔵 WEBHOOK - Starting handle_price_deleted for {event['data']['object']['id']}")
            await handle_price_deleted(event["data"]["object"])
            logger.info(f"✅ WEBHOOK - Completed handle_price_deleted for {event['data']['object']['id']}")
        
        else:
            logger.info(f"Unhandled event type: {event['type']}")
    
    except Exception as e:
        logger.error(f"❌ WEBHOOK - Error processing webhook event {event['type']}: {e}")
        logger.error(f"❌ WEBHOOK - Full error details: {traceback.format_exc()}")
        # Return success to avoid Stripe retrying
        # We'll handle the error internally
    
    return {"status": "success"}


async def handle_subscription_created(subscription_data):
    """Handle new subscription creation"""
    logger.info(f"New subscription created: {subscription_data['id']}")
    logger.info(f"Subscription data keys: {list(subscription_data.keys())}")
    logger.info(f"Has current_period_start: {'current_period_start' in subscription_data}")
    
    try:
        logger.info(f"🔵 SUB_CREATED - Starting sync_subscription_from_stripe for {subscription_data['id']}")
        # The webhook data already has everything we need, so just use it directly
        subscription = await stripe_service.sync_subscription_from_stripe(subscription_data)
        logger.info(f"✅ SUB_CREATED - Completed sync_subscription_from_stripe for {subscription_data['id']}, result: {subscription}")
        
        # Allocate credits for the new subscription
        if subscription:
            user_id = subscription["user_id"]
            plan_tier = subscription["plan_tier"]
            
            if user_id and plan_tier:
                logger.info(f"🔵 SUB_CREATED - Allocating credits for user {user_id} with tier {plan_tier}")
                await credits_service.update_subscription_tier(str(user_id), plan_tier)
                logger.info(f"✅ SUB_CREATED - Completed credit allocation for user {user_id}")
            else:
                logger.error(f"❌ SUB_CREATED - Missing user_id or plan_tier: user_id={user_id}, plan_tier={plan_tier}")
        else:
            logger.error(f"❌ SUB_CREATED - No subscription found: subscription={subscription}")
            
    except Exception as e:
        logger.error(f"❌ SUB_CREATED - Error in handle_subscription_created: {e}")
        logger.error(f"❌ SUB_CREATED - Full traceback: {traceback.format_exc()}")
        raise  # Re-raise to ensure error is captured at webhook level


async def handle_subscription_updated(subscription_data):
    """Handle subscription updates (plan changes, status changes, etc.)"""
    logger.info(f"Subscription updated: {subscription_data['id']} - Status: {subscription_data['status']}")
    
    try:
        logger.info(f"🔵 SUB_UPDATED - Starting sync_subscription_from_stripe for {subscription_data['id']}")
        # The webhook data already has everything we need, so just use it directly
        subscription = await stripe_service.sync_subscription_from_stripe(subscription_data)
        logger.info(f"✅ SUB_UPDATED - Completed sync_subscription_from_stripe for {subscription_data['id']}")
        
        # Update credits if subscription is active and has a plan
        if subscription:
            user_id = subscription["user_id"]
            plan_tier = subscription["plan_tier"]
            
            if user_id:
                if subscription_data['status'] in ['active', 'trialing']:
                    if plan_tier:
                        logger.info(f"🔵 SUB_UPDATED - Updating credits for user {user_id} with tier {plan_tier}")
                        await credits_service.update_subscription_tier(str(user_id), plan_tier)
                        logger.info(f"✅ SUB_UPDATED - Completed credit update for user {user_id}")
                    else:
                        logger.error(f"❌ SUB_UPDATED - Missing plan_tier for user {user_id}")
                elif subscription_data['status'] == 'canceled' and subscription_data.get('canceled_at'):
                    # If subscription is immediately canceled (not at period end)
                    logger.info(f"🔵 SUB_UPDATED - Subscription immediately canceled for user {user_id}")
                    await credits_service.handle_subscription_cancellation(
                        str(user_id), 
                        datetime.fromtimestamp(subscription_data['canceled_at'])
                    )
                    logger.info(f"✅ SUB_UPDATED - Completed cancellation handling for user {user_id}")
            else:
                logger.error(f"❌ SUB_UPDATED - Missing user_id in subscription: {subscription}")
        else:
            logger.error(f"❌ SUB_UPDATED - No subscription found: subscription={subscription}")
            
    except Exception as e:
        logger.error(f"❌ SUB_UPDATED - Error in handle_subscription_updated: {e}")
        logger.error(f"❌ SUB_UPDATED - Full traceback: {traceback.format_exc()}")
        raise


async def handle_subscription_deleted(subscription_data):
    """Handle subscription deletion/cancellation"""
    logger.info(f"Subscription deleted: {subscription_data['id']}")
    
    try:
        logger.info(f"🔵 SUB_DELETED - Starting sync_subscription_from_stripe for {subscription_data['id']}")
        # The webhook data already has everything we need, so just use it directly
        subscription = await stripe_service.sync_subscription_from_stripe(subscription_data)
        logger.info(f"✅ SUB_DELETED - Completed sync_subscription_from_stripe for {subscription_data['id']}")
        
        # When subscription is deleted, remove all credits
        if subscription:
            user_id = subscription["user_id"]
            
            if user_id:
                logger.info(f"🔵 SUB_DELETED - Removing credits for user {user_id} due to subscription deletion")
                await credits_service.handle_subscription_cancellation(
                    str(user_id), 
                    datetime.now(timezone.utc)  # Credits are removed immediately when subscription is deleted
                )
                logger.info(f"✅ SUB_DELETED - Completed credit removal for user {user_id}")
            else:
                logger.error(f"❌ SUB_DELETED - Missing user_id in subscription: {subscription}")
        else:
            logger.error(f"❌ SUB_DELETED - No subscription found: subscription={subscription}")
            
    except Exception as e:
        logger.error(f"❌ SUB_DELETED - Error in handle_subscription_deleted: {e}")
        logger.error(f"❌ SUB_DELETED - Full traceback: {traceback.format_exc()}")
        raise


async def handle_payment_succeeded(event):
    """Handle successful payment"""
    invoice = event["data"]["object"]
    logger.info(f"Payment succeeded for invoice: {invoice['id']}")
    
    # Find user by customer ID
    async with get_async_session() as session:
        stmt = select(StripeCustomer).where(
            StripeCustomer.stripe_customer_id == invoice["customer"]
        )
        result = await session.execute(stmt)
        customer = result.scalars().first()
        
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
        result = await session.execute(stmt)
        customer = result.scalars().first()
        
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
    
    try:
        # For subscription mode, retrieve the subscription
        if checkout_session.get('mode') == 'subscription' and checkout_session.get('subscription'):
            logger.info(f"🔵 CHECKOUT - Processing subscription checkout for session {checkout_session['id']}")
            logger.info(f"🔵 CHECKOUT - Subscription ID: {checkout_session.get('subscription')}")
            
            try:
                # For checkout completion, we need to retrieve the full subscription
                # But we'll convert it to dict format for consistency
                logger.info(f"🔵 CHECKOUT - Retrieving subscription from Stripe: {checkout_session['subscription']}")
                subscription = stripe_client.subscriptions.retrieve(checkout_session['subscription'])
                logger.info(f"✅ CHECKOUT - Retrieved subscription {subscription.id} from checkout session")
                
                # Convert to dict and sync
                subscription_dict = subscription.to_dict()
                logger.info(f"🔵 CHECKOUT - Starting sync_subscription_from_stripe for {subscription.id}")
                synced_subscription = await stripe_service.sync_subscription_from_stripe(subscription_dict)
                logger.info(f"✅ CHECKOUT - Synced subscription to database: {synced_subscription}")
                
                # Allocate initial credits
                if synced_subscription:
                    user_id = synced_subscription["user_id"]
                    plan_tier = synced_subscription["plan_tier"]
                    
                    if user_id and plan_tier:
                        logger.info(f"🔵 CHECKOUT - Allocating initial credits for user {user_id} with tier {plan_tier}")
                        await credits_service.update_subscription_tier(str(user_id), plan_tier)
                        logger.info(f"✅ CHECKOUT - Completed initial credit allocation for user {user_id}")
                    else:
                        logger.error(f"❌ CHECKOUT - Missing user_id or plan_tier: user_id={user_id}, plan_tier={plan_tier}")
                else:
                    logger.error(f"❌ CHECKOUT - No synced subscription found: {synced_subscription}")
                
                # Also record the successful payment event
                if checkout_session.get('customer'):
                    logger.info(f"🔵 CHECKOUT - Recording payment event for customer {checkout_session['customer']}")
                    async with get_async_session() as session:
                        stmt = select(StripeCustomer).where(
                            StripeCustomer.stripe_customer_id == checkout_session['customer']
                        )
                        result = await session.execute(stmt)
                        customer = result.scalars().first()
                        
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
                            await session.commit()
                            logger.info(f"✅ CHECKOUT - Recorded checkout completion for user {customer.user_id}")
                        else:
                            logger.error(f"❌ CHECKOUT - Customer not found for payment event: {checkout_session['customer']}")
                else:
                    logger.warning(f"⚠️ CHECKOUT - No customer ID in checkout session")
                    
            except Exception as e:
                logger.error(f"❌ CHECKOUT - Error handling checkout completion: {e}")
                logger.error(f"❌ CHECKOUT - Full traceback: {traceback.format_exc()}")
                raise
        else:
            logger.info(f"⚠️ CHECKOUT - Checkout session is not subscription mode or missing subscription ID")
            logger.info(f"⚠️ CHECKOUT - Mode: {checkout_session.get('mode')}, Subscription: {checkout_session.get('subscription')}")
        
        # The subscription.created webhook will also fire, providing additional confirmation
        logger.info(f"✅ CHECKOUT - Completed checkout processing for session {checkout_session['id']}")
        
    except Exception as e:
        logger.error(f"❌ CHECKOUT - Error in handle_checkout_completed: {e}")
        logger.error(f"❌ CHECKOUT - Full traceback: {traceback.format_exc()}")
        raise


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
        result = await session.execute(stmt)
        existing = result.scalars().first()
        
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
            await session.commit()
            logger.info(f"Created subscription plan for product: {product['id']}")


async def handle_product_updated(product):
    """Handle product updates from Stripe"""
    logger.info(f"Product updated: {product['id']} - {product['name']}")
    
    async with get_async_session() as session:
        from app2.models.subscription import SubscriptionPlan
        
        stmt = select(SubscriptionPlan).where(
            SubscriptionPlan.stripe_product_id == product['id']
        )
        result = await session.execute(stmt)
        plan = result.scalars().first()
        
        if plan:
            plan.name = product['name']
            plan.is_active = product['active']
            plan.features = product.get('metadata', {})
            if 'tier' in product.get('metadata', {}):
                plan.tier = product['metadata']['tier'].lower()
            
            session.add(plan)
            await session.commit()
            logger.info(f"Updated subscription plan for product: {product['id']}")


async def handle_product_deleted(product):
    """Handle product deletion from Stripe"""
    logger.info(f"Product deleted: {product['id']}")
    
    async with get_async_session() as session:
        from app2.models.subscription import SubscriptionPlan
        
        stmt = select(SubscriptionPlan).where(
            SubscriptionPlan.stripe_product_id == product['id']
        )
        result = await session.execute(stmt)
        plan = result.scalars().first()
        
        if plan:
            # Soft delete - just mark as inactive
            plan.is_active = False
            session.add(plan)
            await session.commit()
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
        result = await session.execute(stmt)
        plan = result.scalars().first()
        
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
            await session.commit()
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
        result = await session.execute(stmt)
        plan = result.scalars().first()
        
        if plan:
            plan.price_cents = price['unit_amount']
            plan.currency = price['currency'].upper()
            plan.is_active = price['active']
            
            session.add(plan)
            await session.commit()
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
        result = await session.execute(stmt)
        plan = result.scalars().first()
        
        if plan:
            plan.is_active = False
            session.add(plan)
            await session.commit()
            logger.info(f"Deactivated plan for deleted price: {price['id']}")