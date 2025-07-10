# Stripe Subscription Implementation Guide

## Overview
This document outlines the database schema and webhook implementation for adding Stripe subscription payments to BeatGen.

## Database Models (SQLModel)

### 1. Stripe Customer Model
```python
# backend/app2/models/subscription.py

from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime
import uuid

class StripeCustomer(SQLModel, table=True):
    """Maps BeatGen users to Stripe customers"""
    __tablename__ = "stripe_customers"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", unique=True, index=True)
    stripe_customer_id: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    user: Optional["User"] = Relationship(back_populates="stripe_customer")
    subscriptions: List["Subscription"] = Relationship(back_populates="stripe_customer")
```

### 2. Subscription Plan Model
```python
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
    billing_period: str  # 'monthly', 'yearly'
    features: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    subscriptions: List["Subscription"] = Relationship(back_populates="plan")
```

### 3. Subscription Model
```python
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
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    user: Optional["User"] = Relationship(back_populates="subscriptions")
    stripe_customer: Optional["StripeCustomer"] = Relationship(back_populates="subscriptions")
    plan: Optional["SubscriptionPlan"] = Relationship(back_populates="subscriptions")
```

### 4. Payment Event Model
```python
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
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    user: Optional["User"] = Relationship()
```

### 5. Update User Model
```python
# backend/app2/models/user.py - Add these relationships to existing User model

from typing import Optional, List

class User(SQLModel, table=True):
    # ... existing fields ...
    
    # Add these relationships
    stripe_customer: Optional["StripeCustomer"] = Relationship(
        back_populates="user", 
        sa_relationship_kwargs={"uselist": False}
    )
    subscriptions: List["Subscription"] = Relationship(back_populates="user")
```

## Stripe Webhook Events

### Critical Events to Handle

1. **Customer Events**
   - `customer.created` - When Stripe customer is created
   - `customer.updated` - Customer info changes

2. **Subscription Lifecycle Events** (Most Important!)
   - `customer.subscription.created` - New subscription started
   - `customer.subscription.updated` - Status change, plan change, etc.
   - `customer.subscription.deleted` - Subscription canceled/ended
   - `customer.subscription.trial_will_end` - 3 days before trial ends

3. **Payment Events**
   - `invoice.payment_succeeded` - Monthly/yearly payment successful
   - `invoice.payment_failed` - Payment failed - subscription at risk
   - `invoice.upcoming` - Invoice will be created in ~1 hour

4. **Checkout Events** (if using Stripe Checkout)
   - `checkout.session.completed` - Customer completed checkout
   - `checkout.session.expired` - Checkout session expired

### Webhook Handler Structure

```python
# backend/app2/api/routes/stripe_webhooks.py

from fastapi import APIRouter, Request, HTTPException, Header
import stripe
from sqlmodel import Session, select

from app2.infrastructure.database.sqlmodel_client import get_session
from app2.models.subscription import PaymentEvent
from app2.core.config import settings

router = APIRouter()
stripe.api_key = settings.STRIPE_SECRET_KEY

@router.post("/stripe")
async def stripe_webhook(
    request: Request, 
    stripe_signature: str = Header(None)
):
    payload = await request.body()
    
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    # Check if we've already processed this event (idempotency)
    async with get_session() as session:
        existing_event = await session.exec(
            select(PaymentEvent).where(
                PaymentEvent.stripe_event_id == event['id']
            )
        ).first()
        
        if existing_event:
            return {"status": "already_processed"}
    
    # Handle different event types
    if event['type'] == 'customer.subscription.created':
        await handle_subscription_created(event['data']['object'])
        
    elif event['type'] == 'customer.subscription.updated':
        await handle_subscription_updated(event['data']['object'])
        
    elif event['type'] == 'customer.subscription.deleted':
        await handle_subscription_deleted(event['data']['object'])
        
    elif event['type'] == 'invoice.payment_succeeded':
        await handle_payment_succeeded(event['data']['object'])
        
    elif event['type'] == 'invoice.payment_failed':
        await handle_payment_failed(event['data']['object'])
    
    # Store event for idempotency
    await store_webhook_event(event)
    
    return {"status": "success"}
```

### Event Handler Responsibilities

#### handle_subscription_created
- Find user by stripe_customer_id
- Create subscription record in database
- Update user permissions/features

#### handle_subscription_updated
- Update subscription status in database
- Handle plan changes (upgrades/downgrades)
- Update cancel_at_period_end flag

#### handle_subscription_deleted
- Mark subscription as canceled in database
- Revoke user's premium features
- Send cancellation confirmation email

#### handle_payment_succeeded
- Log successful payment in payment_events
- Update subscription period dates
- Send receipt email to user

#### handle_payment_failed
- Log failed payment attempt
- Send payment failure notification email
- Note: If final attempt, Stripe will cancel subscription

## File Structure

```
beatgen/
├── docs/
│   └── stripe-implementation.md (this file)
├── backend/
│   └── app2/
│       ├── models/
│       │   └── subscription.py (new - SQLModel models)
│       ├── services/
│       │   └── stripe_service.py (new)
│       ├── api/
│       │   └── routes/
│       │       ├── subscriptions.py (new)
│       │       └── stripe_webhooks.py (new)
│       └── repositories/
│           └── subscription_repository.py (new)
└── frontend/
    └── src/
        └── platform/
            ├── api/
            │   └── subscriptions.ts (new)
            └── components/
                └── subscription/ (new)
                    ├── PricingTable.tsx
                    └── SubscriptionStatus.tsx
```

## Environment Variables

Add to your `.env` file:
```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Next Steps

1. Create SQLModel models in `backend/app2/models/subscription.py`
2. Import models in `backend/app2/models/__init__.py` to ensure table creation
3. Implement Stripe service class for backend
4. Set up webhook endpoint and handlers
5. Create API endpoints for subscription management
6. Build frontend components for subscription UI