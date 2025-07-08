from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Dict, Any, Optional
from pydantic import BaseModel
import logging

from app2.models.user import User
from app2.api.dependencies import get_current_user_model
from app2.services.stripe_service import StripeService
from app2.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

stripe_service = StripeService()


class CheckoutSessionRequest(BaseModel):
    price_id: str
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None
    ui_mode: Optional[str] = "hosted"  # "hosted" or "embedded"


class CancelSubscriptionRequest(BaseModel):
    at_period_end: bool = True


@router.post("/checkout-session")
async def create_checkout_session(
    request: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user_model)
) -> Dict[str, Any]:
    """Create a Stripe checkout session for subscription"""
    try:
        # Use provided URLs or default to frontend URLs
        success_url = request.success_url or f"{settings.app.FRONTEND_BASE_URL}/subscription/success?session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = request.cancel_url or f"{settings.app.FRONTEND_BASE_URL}/subscription/cancel"
        
        result = await stripe_service.create_checkout_session(
            user=current_user,
            price_id=request.price_id,
            success_url=success_url,
            cancel_url=cancel_url,
            ui_mode=request.ui_mode
        )
        
        return result
    except Exception as e:
        logger.error(f"Error creating checkout session: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/status")
async def get_subscription_status(
    current_user: User = Depends(get_current_user_model)
) -> Optional[Dict[str, Any]]:
    """Get current subscription status"""
    try:
        status = await stripe_service.get_subscription_status(current_user)
        if not status:
            return {
                "status": "inactive",
                "plan": None,
                "message": "No active subscription"
            }
        return status
    except Exception as e:
        logger.error(f"Error getting subscription status: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/cancel")
async def cancel_subscription(
    request: CancelSubscriptionRequest,
    current_user: User = Depends(get_current_user_model)
) -> Dict[str, Any]:
    """Cancel current subscription"""
    try:
        result = await stripe_service.cancel_subscription(
            user=current_user,
            at_period_end=request.at_period_end
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error canceling subscription: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/reactivate")
async def reactivate_subscription(
    current_user: User = Depends(get_current_user_model)
) -> Dict[str, Any]:
    """Reactivate a subscription that's set to cancel at period end"""
    try:
        result = await stripe_service.reactivate_subscription(user=current_user)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error reactivating subscription: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/portal-session")
async def create_portal_session(
    return_url: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user_model)
) -> Dict[str, str]:
    """Create a Stripe customer portal session"""
    try:
        # Use provided URL or default to frontend URL
        return_url = return_url or f"{settings.app.FRONTEND_BASE_URL}/account"
        
        portal_url = await stripe_service.create_portal_session(
            user=current_user,
            return_url=return_url
        )
        
        return {"portal_url": portal_url}
    except Exception as e:
        logger.error(f"Error creating portal session: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/plans")
async def get_available_plans() -> Dict[str, Any]:
    """Get available subscription plans from database"""
    try:
        from app2.models.subscription import SubscriptionPlan
        from app2.infrastructure.database.sqlmodel_client import get_async_session
        from sqlmodel import select
        
        async with get_async_session() as session:
            # Get all active plans
            stmt = select(SubscriptionPlan).where(
                SubscriptionPlan.is_active == True,
                SubscriptionPlan.stripe_price_id != ''  # Only plans with prices
            ).order_by(SubscriptionPlan.price_cents)
            
            result = session.exec(stmt)
            plans = result.all()
            
            # Format plans for API response
            formatted_plans = []
            for plan in plans:
                formatted_plans.append({
                    "id": plan.tier,
                    "name": plan.name,
                    "price_id": plan.stripe_price_id,
                    "price_cents": plan.price_cents,
                    "billing_period": plan.billing_period.value,  # Convert enum to string
                    "features": plan.features or {}
                })
            
            return {"plans": formatted_plans}
            
    except Exception as e:
        logger.error(f"Error fetching plans: {e}")
        # Return empty list if database is not set up yet
        return {"plans": []}