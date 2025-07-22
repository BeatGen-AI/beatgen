from sqlmodel import SQLModel, Field, Relationship, Column
from sqlalchemy import JSON
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime, timezone
import uuid
from enum import Enum

if TYPE_CHECKING:
    from app2.models.user import User


class BillingPeriod(str, Enum):
    MONTHLY = "monthly"
    YEARLY = "yearly"


class StripeCustomer(SQLModel, table=True):
    """Maps BeatGen users to Stripe customers"""
    __tablename__ = "stripe_customers"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", unique=True, index=True)
    stripe_customer_id: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Relationships
    user: Optional["User"] = Relationship(back_populates="stripe_customer")
    subscriptions: List["Subscription"] = Relationship(back_populates="stripe_customer")


class SubscriptionPlan(SQLModel, table=True):
    """Available subscription plans"""
    __tablename__ = "subscription_plans"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    stripe_product_id: str = Field(unique=True, index=True)
    stripe_price_id: str = Field(unique=True, index=True)
    name: str
    tier: str  # 'free', 'basic', 'pro', 'enterprise'
    price_cents: int
    currency: str = Field(default="USD")
    billing_period: BillingPeriod
    features: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Relationships
    subscriptions: List["Subscription"] = Relationship(back_populates="plan")


class Subscription(SQLModel, table=True):
    """Active user subscriptions"""
    __tablename__ = "subscriptions"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    stripe_subscription_id: str = Field(unique=True, index=True)
    stripe_customer_id: str = Field(foreign_key="stripe_customers.stripe_customer_id")
    plan_id: uuid.UUID = Field(foreign_key="subscription_plans.id")
    
    status: str  # 'active', 'past_due', 'canceled', 'incomplete', 'trialing'
    
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool = Field(default=False)
    canceled_at: Optional[datetime] = None
    trial_end: Optional[datetime] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Relationships
    user: Optional["User"] = Relationship(back_populates="subscriptions")
    stripe_customer: Optional["StripeCustomer"] = Relationship(back_populates="subscriptions")
    plan: Optional["SubscriptionPlan"] = Relationship(back_populates="subscriptions")


class PaymentEvent(SQLModel, table=True):
    """Stripe webhook events for audit trail"""
    __tablename__ = "payment_events"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    stripe_event_id: str = Field(unique=True, index=True)  # For idempotency
    stripe_invoice_id: Optional[str] = None
    stripe_payment_intent_id: Optional[str] = None
    
    event_type: str
    amount_cents: Optional[int] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    
    # Store full event for debugging
    event_data: dict = Field(sa_column=Column(JSON))
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Relationships
    user: Optional["User"] = Relationship()