from sqlmodel import SQLModel, Field, Relationship, Column
from sqlalchemy import JSON
from typing import Optional, List, TYPE_CHECKING, Dict, Any
from datetime import datetime, timezone
import uuid
from enum import Enum

if TYPE_CHECKING:
    from app2.models.user import User


class CreditTransactionType(str, Enum):
    MONTHLY_ALLOCATION = "monthly_allocation"  # Monthly credit allocation
    ROLLOVER = "rollover"  # Credits rolled over from previous month
    USAGE = "usage"  # Credits used
    PURCHASE = "purchase"  # One-time credit purchase (future feature)
    REFUND = "refund"  # Credits refunded
    SUBSCRIPTION_UPGRADE = "subscription_upgrade"  # Bonus credits for upgrading
    SUBSCRIPTION_CANCELLATION = "subscription_cancellation"  # Credits removed on cancellation
    ADMIN_ADJUSTMENT = "admin_adjustment"  # Manual adjustment by admin


class UserCredits(SQLModel, table=True):
    """Tracks user's current credit balance and monthly allocation"""
    __tablename__ = "user_credits"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", unique=True, index=True)
    
    # Current balance
    balance: int = Field(default=0, ge=0)  # Current credit balance
    
    # Monthly allocation based on plan
    monthly_allocation: int = Field(default=10)  # Free plan default
    
    # Tracking for rollover
    last_allocation_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    total_allocated: int = Field(default=0)  # Total credits ever allocated
    total_used: int = Field(default=0)  # Total credits ever used
    
    # Subscription info for credit management
    subscription_tier: Optional[str] = Field(default="free")  # free, starter, creator, pro
    has_rollover: bool = Field(default=False)  # Whether credits roll over
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Relationships
    user: Optional["User"] = Relationship(back_populates="credits")
    transactions: List["CreditTransaction"] = Relationship(back_populates="user_credits")


class CreditTransaction(SQLModel, table=True):
    """Audit log of all credit transactions"""
    __tablename__ = "credit_transactions"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    user_credits_id: uuid.UUID = Field(foreign_key="user_credits.id", index=True)
    
    transaction_type: CreditTransactionType
    amount: int  # Positive for additions, negative for usage
    balance_after: int  # Balance after this transaction
    
    description: Optional[str] = None
    
    # AI Generation specific fields (null for non-AI transactions)
    model_provider: Optional[str] = None  # openai, anthropic, deepseek, etc
    model_name: Optional[str] = None  # gpt-4, claude-3, deepseek-v2, etc
    request_tokens: Optional[int] = None  # Input tokens used
    response_tokens: Optional[int] = None  # Output tokens generated
    total_tokens: Optional[int] = None  # Total tokens (request + response)
    
    # Generation metadata
    request_id: Optional[str] = None  # Link to the specific generation request
    generation_type: Optional[str] = None  # music, chat, edit
    prompt_preview: Optional[str] = None  # First 200 chars of the prompt
    
    # Additional metadata as JSON for flexibility
    transaction_metadata: dict = Field(default={}, sa_column=Column(JSON))
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Relationships
    user: Optional["User"] = Relationship()
    user_credits: Optional["UserCredits"] = Relationship(back_populates="transactions")


