"""
API endpoints for credits management
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, List
from pydantic import BaseModel

from app2.models.user import User
from app2.services.credits_service import credits_service
from app2.api.dependencies import get_current_user_model

router = APIRouter()


class UseCreditsRequest(BaseModel):
    amount: int
    description: str
    metadata: Dict[str, Any] = {}


class CreditsResponse(BaseModel):
    balance: int | str  # Can be "unlimited" for pro users
    monthly_allocation: int
    subscription_tier: str
    has_rollover: bool
    total_used: int
    last_allocation_date: str
    next_allocation_date: str | None
    is_unlimited: bool


class CreditTransactionResponse(BaseModel):
    id: str
    type: str
    amount: int
    balance_after: int
    description: str
    created_at: str
    metadata: Dict[str, Any] | None
    # AI-specific fields
    model_provider: str | None
    model_name: str | None
    request_tokens: int | None
    response_tokens: int | None
    total_tokens: int | None
    request_id: str | None
    generation_type: str | None
    prompt_preview: str | None


@router.get("/status", response_model=CreditsResponse)
async def get_credits_status(
    current_user: User = Depends(get_current_user_model)
):
    """Get current user's credit status"""
    credits = await credits_service.get_user_credits(str(current_user.id))
    
    if not credits:
        # Initialize credits if not found
        await credits_service.initialize_user_credits(current_user)
        credits = await credits_service.get_user_credits(str(current_user.id))
    
    if not credits:
        raise HTTPException(status_code=500, detail="Failed to initialize credits")
    
    return credits


@router.post("/use")
async def use_credits(
    request: UseCreditsRequest,
    current_user: User = Depends(get_current_user_model)
):
    """Use credits for an action"""
    if request.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    success = await credits_service.use_credits(
        str(current_user.id),
        request.amount,
        request.description,
        request.metadata
    )
    
    if not success:
        # Get current balance to show in error
        credits = await credits_service.get_user_credits(str(current_user.id))
        current_balance = credits.get("balance", 0) if credits else 0
        
        raise HTTPException(
            status_code=402,
            detail={
                "error": "Insufficient credits",
                "required": request.amount,
                "current_balance": current_balance,
                "message": f"You need {request.amount} credits but only have {current_balance}"
            }
        )
    
    # Return updated balance
    updated_credits = await credits_service.get_user_credits(str(current_user.id))
    return {
        "success": True,
        "balance": updated_credits.get("balance", 0) if updated_credits else 0,
        "is_unlimited": updated_credits.get("is_unlimited", False) if updated_credits else False
    }


@router.get("/history", response_model=List[CreditTransactionResponse])
async def get_credit_history(
    limit: int = 50,
    current_user: User = Depends(get_current_user_model)
):
    """Get credit transaction history"""
    if limit > 100:
        limit = 100
    
    history = await credits_service.get_credit_history(str(current_user.id), limit)
    return history


@router.post("/allocate-monthly")
async def allocate_monthly_credits(
    current_user: User = Depends(get_current_user_model)
):
    """
    Manually trigger monthly credit allocation (admin endpoint)
    In production, this would be called by a scheduled job
    """
    # TODO: Add admin check
    result = await credits_service.allocate_monthly_credits(str(current_user.id))
    
    if not result:
        raise HTTPException(status_code=404, detail="User credits not found")
    
    return {
        "success": True,
        "balance": result.balance,
        "monthly_allocation": result.monthly_allocation,
        "message": f"Allocated {result.monthly_allocation} credits"
    }