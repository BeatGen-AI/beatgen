"""
Script to sync Stripe products and prices to our database
"""
import asyncio
from sqlmodel import Session, select
from app2.infrastructure.database.sqlmodel_client import engine
from app2.models.subscription import SubscriptionPlan, BillingPeriod
from app2.services.stripe_service import stripe_client
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def sync_products_and_prices():
    """Sync all active products and prices from Stripe"""
    # Get all active products
    products = stripe_client.products.list()
    active_products = [p for p in products.data if p['active']]
    logger.info(f"Found {len(active_products)} active products")
    
    # Get all active prices
    prices = stripe_client.prices.list()
    active_prices = [p for p in prices.data if p['active']]
    logger.info(f"Found {len(active_prices)} active prices")
    
    # Create a map of product_id to product
    product_map = {p['id']: p for p in products.data}
    
    with Session(engine) as session:
        for price in active_prices:
            # Skip if product not found or not active
            product = product_map.get(price['product'])
            if not product:
                logger.warning(f"Product not found for price {price['id']}")
                continue
            
            # Check if plan already exists
            stmt = select(SubscriptionPlan).where(
                SubscriptionPlan.stripe_price_id == price['id']
            )
            existing_plan = session.exec(stmt).first()
            
            if existing_plan:
                logger.info(f"Plan already exists for price {price['id']}")
                continue
            
            # Determine billing period
            billing_period = BillingPeriod.MONTHLY
            if price.get('recurring'):
                if price['recurring']['interval'] == 'year':
                    billing_period = BillingPeriod.YEARLY
                elif price['recurring']['interval'] == 'month':
                    billing_period = BillingPeriod.MONTHLY
                else:
                    logger.warning(f"Unsupported interval: {price['recurring']['interval']}")
                    continue
            
            # Extract tier from product metadata or name
            tier = product.get('metadata', {}).get('tier', 'starter').lower()
            if 'creator' in product['name'].lower():
                tier = 'creator'
            elif 'pro' in product['name'].lower():
                tier = 'pro'
            elif 'starter' in product['name'].lower():
                tier = 'starter'
            
            # Create the plan
            plan = SubscriptionPlan(
                stripe_product_id=product['id'],
                stripe_price_id=price['id'],
                name=product['name'],
                tier=tier,
                price_cents=price.get('unit_amount', 0) or 0,
                currency=price['currency'].upper(),
                billing_period=billing_period,
                features=product.get('metadata', {}),
                is_active=product['active'] and price['active']
            )
            
            session.add(plan)
            logger.info(f"Created plan: {product['name']} - {billing_period.value} (${price.get('unit_amount', 0)/100})")
        
        session.commit()
        logger.info("Sync completed successfully")


if __name__ == "__main__":
    sync_products_and_prices()