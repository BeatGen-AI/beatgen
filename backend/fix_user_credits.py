#!/usr/bin/env python3
"""Script to fix user credits that are showing wrong tier"""

import asyncio
from sqlmodel import select
from app2.infrastructure.database.sqlmodel_client import get_async_session
from app2.models.user import User
from app2.models.subscription import Subscription
from app2.services.credits_service import credits_service
import sys

async def fix_user_credits(user_email: str):
    """Fix credits for a specific user based on their active subscription"""
    async with get_async_session() as session:
        # Find user
        stmt = select(User).where(User.email == user_email)
        result = session.exec(stmt)
        user = result.first()
        
        if not user:
            print(f"User not found: {user_email}")
            return
        
        print(f"Found user: {user.email} (ID: {user.id})")
        
        # Find active subscription
        stmt = select(Subscription).where(
            Subscription.user_id == user.id,
            Subscription.status.in_(["active", "trialing"])
        )
        result = session.exec(stmt)
        subscription = result.first()
        
        if not subscription:
            print("No active subscription found")
            return
        
        # Get the plan tier
        if subscription.plan:
            tier = subscription.plan.tier
            print(f"Active subscription tier: {tier}")
        else:
            print("Subscription has no plan linked")
            return
        
        # Update credits to match subscription
        print(f"Updating credits to {tier} tier...")
        updated_credits = await credits_service.update_subscription_tier(str(user.id), tier)
        
        print(f"Credits updated successfully!")
        print(f"- Balance: {updated_credits.balance}")
        print(f"- Monthly allocation: {updated_credits.monthly_allocation}")
        print(f"- Tier: {updated_credits.subscription_tier}")
        print(f"- Has rollover: {updated_credits.has_rollover}")

async def main():
    if len(sys.argv) < 2:
        print("Usage: python fix_user_credits.py <user_email>")
        sys.exit(1)
    
    user_email = sys.argv[1]
    await fix_user_credits(user_email)

if __name__ == "__main__":
    asyncio.run(main())