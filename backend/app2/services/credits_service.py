"""
Credits management service for handling user credits
"""
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from dateutil.relativedelta import relativedelta
from sqlmodel import select

from app2.models.user import User
from app2.models.credits import UserCredits, CreditTransaction, CreditTransactionType
from app2.models.subscription import Subscription
from app2.infrastructure.database.sqlmodel_client import get_async_session

logger = logging.getLogger(__name__)

# Credit allocations per plan
CREDIT_ALLOCATIONS = {
    "free": {"monthly": 10, "rollover": False},
    "starter": {"monthly": 50, "rollover": True},
    "creator": {"monthly": 150, "rollover": True},
    "pro": {"monthly": -1, "rollover": False},  # -1 means unlimited
}


class CreditsService:
    """Service for managing user credits"""
    
    async def initialize_user_credits(self, user: User, tier: str = "free") -> UserCredits:
        """Initialize credits for a new user"""
        async with get_async_session() as session:
            # Check if user already has credits
            stmt = select(UserCredits).where(UserCredits.user_id == user.id)
            result = await session.execute(stmt)
            existing_credits = result.scalars().first()
            
            if existing_credits:
                logger.info(f"User {user.id} already has credits initialized")
                return existing_credits
            
            # Get credit allocation for tier
            allocation = CREDIT_ALLOCATIONS.get(tier, CREDIT_ALLOCATIONS["free"])
            
            # Create new credits record
            user_credits = UserCredits(
                user_id=user.id,
                balance=allocation["monthly"] if allocation["monthly"] != -1 else 0,
                monthly_allocation=allocation["monthly"],
                subscription_tier=tier,
                has_rollover=allocation["rollover"],
                last_allocation_date=datetime.now(timezone.utc)
            )
            
            session.add(user_credits)
            
            # Create initial transaction
            if allocation["monthly"] > 0:
                transaction = CreditTransaction(
                    user_id=user.id,
                    user_credits_id=user_credits.id,
                    transaction_type=CreditTransactionType.MONTHLY_ALLOCATION,
                    amount=allocation["monthly"],
                    balance_after=allocation["monthly"],
                    description=f"Initial {tier} plan allocation"
                )
                session.add(transaction)
            
            
            await session.commit()
            logger.info(f"Initialized credits for user {user.id} with {tier} tier")
            
            return user_credits
    
    async def update_subscription_tier(self, user_id: str, new_tier: str) -> UserCredits:
        """Update user's credit allocation when subscription changes"""
        async with get_async_session() as session:
            # Get user credits
            stmt = select(UserCredits).where(UserCredits.user_id == user_id)
            result = await session.execute(stmt)
            user_credits = result.scalars().first()
            
            if not user_credits:
                # Initialize if doesn't exist
                user = await session.get(User, user_id)
                if not user:
                    raise ValueError(f"User {user_id} not found")
                return await self.initialize_user_credits(user, new_tier)
            
            # Get new allocation
            allocation = CREDIT_ALLOCATIONS.get(new_tier, CREDIT_ALLOCATIONS["free"])
            old_tier = user_credits.subscription_tier
            
            # Update credits record
            user_credits.subscription_tier = new_tier
            user_credits.monthly_allocation = allocation["monthly"]
            user_credits.has_rollover = allocation["rollover"]
            user_credits.updated_at = datetime.now(timezone.utc)
            
            # If upgrading, give immediate bonus credits
            if old_tier and self._get_tier_level(new_tier) > self._get_tier_level(old_tier):
                old_allocation = CREDIT_ALLOCATIONS.get(old_tier, {}).get("monthly", 0)
                new_allocation = allocation["monthly"]
                
                # Calculate bonus as difference between plans
                # For pro plan (unlimited = -1), give a large bonus
                if new_tier == "pro":
                    bonus = 1000  # Large bonus for upgrading to pro
                else:
                    bonus = new_allocation - old_allocation
                
                if bonus > 0:
                    user_credits.balance += bonus
                    
                    transaction = CreditTransaction(
                        user_id=user_id,
                        user_credits_id=user_credits.id,
                        transaction_type=CreditTransactionType.SUBSCRIPTION_UPGRADE,
                        amount=bonus,
                        balance_after=user_credits.balance,
                        description=f"Upgrade bonus from {old_tier} to {new_tier} (+{bonus} credits)"
                    )
                    session.add(transaction)
            
            # If pro plan, set unlimited credits
            if new_tier == "pro":
                user_credits.balance = 999999  # Effectively unlimited
            
            session.add(user_credits)
            await session.commit()
            
            logger.info(f"Updated user {user_id} from {old_tier} to {new_tier} tier")
            return user_credits
    
    async def handle_subscription_cancellation(self, user_id: str, effective_date: datetime) -> None:
        """Handle credit changes when subscription is cancelled"""
        async with get_async_session() as session:
            # Get user credits
            stmt = select(UserCredits).where(UserCredits.user_id == user_id)
            result = await session.execute(stmt)
            user_credits = result.scalars().first()
            
            if not user_credits:
                logger.warning(f"No credits found for user {user_id}")
                return
            
            # When subscription ends, reset to free tier
            # This will be called when the subscription actually ends, not when cancellation is initiated
            old_balance = user_credits.balance
            user_credits.balance = 0  # Remove all credits
            user_credits.subscription_tier = "free"
            user_credits.monthly_allocation = CREDIT_ALLOCATIONS["free"]["monthly"]
            user_credits.has_rollover = CREDIT_ALLOCATIONS["free"]["rollover"]
            user_credits.updated_at = datetime.now(timezone.utc)
            
            # Record the removal
            if old_balance > 0:
                transaction = CreditTransaction(
                    user_id=user_id,
                    user_credits_id=user_credits.id,
                    transaction_type=CreditTransactionType.SUBSCRIPTION_CANCELLATION,
                    amount=-old_balance,
                    balance_after=0,
                    description="Credits removed due to subscription cancellation"
                )
                session.add(transaction)
            
            session.add(user_credits)
            await session.commit()
            
            logger.info(f"Removed {old_balance} credits from user {user_id} due to subscription cancellation")
    
    async def allocate_monthly_credits(self, user_id: str) -> Optional[UserCredits]:
        """Allocate monthly credits to a user"""
        async with get_async_session() as session:
            # Get user credits and schedule
            stmt = select(UserCredits).where(UserCredits.user_id == user_id)
            result = await session.execute(stmt)
            user_credits = result.scalars().first()
            
            if not user_credits:
                logger.warning(f"No credits found for user {user_id}")
                return None
            
            # Check if pro plan (unlimited)
            if user_credits.subscription_tier == "pro":
                logger.info(f"User {user_id} has pro plan, skipping allocation")
                return user_credits
            
            # Handle rollover for non-free plans
            rollover_amount = 0
            if user_credits.has_rollover and user_credits.subscription_tier != "free":
                rollover_amount = user_credits.balance
            
            # Calculate new balance
            new_credits = user_credits.monthly_allocation
            if user_credits.subscription_tier == "free":
                # Free plan doesn't roll over
                user_credits.balance = new_credits
            else:
                # Paid plans roll over
                user_credits.balance = rollover_amount + new_credits
            
            user_credits.last_allocation_date = datetime.now(timezone.utc)
            user_credits.total_allocated += new_credits
            
            # Record allocation transaction
            transaction = CreditTransaction(
                user_id=user_id,
                user_credits_id=user_credits.id,
                transaction_type=CreditTransactionType.MONTHLY_ALLOCATION,
                amount=new_credits,
                balance_after=user_credits.balance,
                description=f"Monthly {user_credits.subscription_tier} allocation",
                transaction_metadata={"rollover_amount": rollover_amount}
            )
            session.add(transaction)
            
            
            session.add(user_credits)
            await session.commit()
            
            logger.info(f"Allocated {new_credits} credits to user {user_id} (rollover: {rollover_amount})")
            return user_credits
    
    async def use_credits(
        self, 
        user_id: str, 
        amount: int, 
        description: str, 
        metadata: Optional[Dict] = None,
        # New AI-specific parameters
        model_provider: Optional[str] = None,
        model_name: Optional[str] = None,
        request_tokens: Optional[int] = None,
        response_tokens: Optional[int] = None,
        request_id: Optional[str] = None,
        generation_type: Optional[str] = None,
        prompt_preview: Optional[str] = None
    ) -> bool:
        """Use credits for a user action"""
        async with get_async_session() as session:
            # Get user credits
            stmt = select(UserCredits).where(UserCredits.user_id == user_id)
            result = await session.execute(stmt)
            user_credits = result.scalars().first()
            
            if not user_credits:
                logger.error(f"No credits found for user {user_id}")
                return False
            
            # Check if pro plan (unlimited)
            if user_credits.subscription_tier == "pro":
                # Pro users have unlimited credits, just record the usage
                total_tokens = (request_tokens or 0) + (response_tokens or 0) if request_tokens or response_tokens else None
                transaction = CreditTransaction(
                    user_id=user_id,
                    user_credits_id=user_credits.id,
                    transaction_type=CreditTransactionType.USAGE,
                    amount=-amount,
                    balance_after=user_credits.balance,  # Balance stays the same for pro
                    description=description,
                    transaction_metadata=metadata,
                    # AI-specific fields
                    model_provider=model_provider,
                    model_name=model_name,
                    request_tokens=request_tokens,
                    response_tokens=response_tokens,
                    total_tokens=total_tokens,
                    request_id=request_id,
                    generation_type=generation_type,
                    prompt_preview=prompt_preview[:200] if prompt_preview else None
                )
                session.add(transaction)
                user_credits.total_used += amount
                session.add(user_credits)
                await session.commit()
                return True
            
            # Check if enough credits
            if user_credits.balance < amount:
                logger.warning(f"User {user_id} has insufficient credits: {user_credits.balance} < {amount}")
                return False
            
            # Deduct credits
            user_credits.balance -= amount
            user_credits.total_used += amount
            user_credits.updated_at = datetime.now(timezone.utc)
            
            # Record transaction
            total_tokens = (request_tokens or 0) + (response_tokens or 0) if request_tokens or response_tokens else None
            transaction = CreditTransaction(
                user_id=user_id,
                user_credits_id=user_credits.id,
                transaction_type=CreditTransactionType.USAGE,
                amount=-amount,
                balance_after=user_credits.balance,
                description=description,
                transaction_metadata=metadata,
                # AI-specific fields
                model_provider=model_provider,
                model_name=model_name,
                request_tokens=request_tokens,
                response_tokens=response_tokens,
                total_tokens=total_tokens,
                request_id=request_id,
                generation_type=generation_type,
                prompt_preview=prompt_preview[:200] if prompt_preview else None
            )
            
            session.add(transaction)
            session.add(user_credits)
            await session.commit()
            
            logger.info(f"User {user_id} used {amount} credits for: {description}")
            return True
    
    async def get_user_credits(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user's current credit status"""
        async with get_async_session() as session:
            stmt = select(UserCredits).where(UserCredits.user_id == user_id)
            result = await session.execute(stmt)
            user_credits = result.scalars().first()
            
            if not user_credits:
                return None
            
            # Calculate next allocation date based on last allocation
            next_allocation_date = None
            if user_credits.last_allocation_date and user_credits.subscription_tier != "pro":
                next_allocation_date = (user_credits.last_allocation_date + relativedelta(months=1)).isoformat()
            
            return {
                "balance": user_credits.balance if user_credits.subscription_tier != "pro" else "unlimited",
                "monthly_allocation": user_credits.monthly_allocation,
                "subscription_tier": user_credits.subscription_tier,
                "has_rollover": user_credits.has_rollover,
                "total_used": user_credits.total_used,
                "last_allocation_date": user_credits.last_allocation_date.isoformat(),
                "next_allocation_date": next_allocation_date,
                "is_unlimited": user_credits.subscription_tier == "pro"
            }
    
    async def get_credit_history(self, user_id: str, limit: int = 50) -> list[Dict[str, Any]]:
        """Get user's credit transaction history"""
        async with get_async_session() as session:
            stmt = (
                select(CreditTransaction)
                .where(CreditTransaction.user_id == user_id)
                .order_by(CreditTransaction.created_at.desc())
                .limit(limit)
            )
            result = await session.execute(stmt)
            transactions = result.scalars().all()
            
            return [
                {
                    "id": str(t.id),
                    "type": t.transaction_type,
                    "amount": t.amount,
                    "balance_after": t.balance_after,
                    "description": t.description,
                    "created_at": t.created_at.isoformat(),
                    "metadata": t.transaction_metadata,
                    # AI-specific fields
                    "model_provider": t.model_provider,
                    "model_name": t.model_name,
                    "request_tokens": t.request_tokens,
                    "response_tokens": t.response_tokens,
                    "total_tokens": t.total_tokens,
                    "request_id": t.request_id,
                    "generation_type": t.generation_type,
                    "prompt_preview": t.prompt_preview
                }
                for t in transactions
            ]
    
    def _get_tier_level(self, tier: str) -> int:
        """Get numeric level for tier comparison"""
        levels = {"free": 0, "starter": 1, "creator": 2, "pro": 3}
        return levels.get(tier, 0)
    
    async def add_credits_admin(
        self,
        user_id: str,
        amount: int,
        description: str,
        admin_user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Add credits to a user account (admin only)"""
        if amount <= 0:
            raise ValueError("Credit amount must be positive")
            
        async with get_async_session() as session:
            # Get user credits
            stmt = select(UserCredits).where(UserCredits.user_id == user_id)
            result = await session.execute(stmt)
            user_credits = result.scalars().first()
            
            if not user_credits:
                logger.error(f"No credits found for user {user_id}")
                return None
            
            # Don't add credits to pro users (they have unlimited)
            if user_credits.subscription_tier == "pro":
                logger.info(f"User {user_id} has pro plan, skipping credit addition")
                return None
            
            # Add credits to balance
            old_balance = user_credits.balance
            user_credits.balance += amount
            user_credits.updated_at = datetime.utcnow()
            
            # Create admin adjustment transaction
            transaction = CreditTransaction(
                user_id=user_id,
                user_credits_id=user_credits.id,
                transaction_type=CreditTransactionType.ADMIN_ADJUSTMENT,
                amount=amount,
                balance_after=user_credits.balance,
                description=description,
                transaction_metadata={
                    "admin_user_id": admin_user_id,
                    "previous_balance": old_balance,
                    "action": "add_credits"
                }
            )
            session.add(transaction)
            session.add(user_credits)
            
            await session.commit()
            
            logger.info(f"Admin {admin_user_id} added {amount} credits to user {user_id}. Balance: {old_balance} -> {user_credits.balance}")
            
            # Return updated credits status
            return await self.get_user_credits(user_id)
    
    async def change_user_tier_admin(
        self,
        user_id: str,
        new_tier: str,
        admin_user_id: str
    ) -> Optional[Dict[str, Any]]:
        """Change user's subscription tier (admin only)"""
        if new_tier not in CREDIT_ALLOCATIONS:
            raise ValueError(f"Invalid tier: {new_tier}")
            
        async with get_async_session() as session:
            # Get current user credits
            stmt = select(UserCredits).where(UserCredits.user_id == user_id)
            result = await session.execute(stmt)
            user_credits = result.scalars().first()
            
            if not user_credits:
                # Initialize if doesn't exist
                user = await session.get(User, user_id)
                if not user:
                    logger.error(f"User {user_id} not found")
                    return None
                user_credits = await self.initialize_user_credits(user, new_tier)
            
            old_tier = user_credits.subscription_tier
            
            # Use existing update_subscription_tier method
            updated_credits = await self.update_subscription_tier(user_id, new_tier)
            
            # Add additional admin metadata transaction for audit
            admin_transaction = CreditTransaction(
                user_id=user_id,
                user_credits_id=updated_credits.id,
                transaction_type=CreditTransactionType.ADMIN_ADJUSTMENT,
                amount=0,  # No credit change, just tier change record
                balance_after=updated_credits.balance,
                description=f"Admin tier change from {old_tier} to {new_tier}",
                transaction_metadata={
                    "admin_user_id": admin_user_id,
                    "action": "tier_change",
                    "old_tier": old_tier,
                    "new_tier": new_tier
                }
            )
            session.add(admin_transaction)
            await session.commit()
            
            logger.info(f"Admin {admin_user_id} changed user {user_id} tier from {old_tier} to {new_tier}")
            
            # Return updated credits status
            return await self.get_user_credits(user_id)


# Create singleton instance
credits_service = CreditsService()