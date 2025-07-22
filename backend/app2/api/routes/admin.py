from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field
from uuid import UUID
from app2.api.admin_dependencies import require_admin_user
from app2.api.dependencies import (
    get_user_service, 
    get_current_user,
    get_drum_sample_service
)
from app2.services.user_service import UserService
from app2.services.credits_service import credits_service
from app2.services.drum_sample_service import DrumSampleService
from app2.models.public_models.drum_samples import DrumSamplePublicCreate, DrumSamplePublicRead
from app2.types.drum_sample_types import DrumSampleType
from app2.types.genre_types import GenreType
from app2.core.logging import get_logger

logger = get_logger("beatgen.api.admin")

router = APIRouter()


# Request/Response models
class AdminUserSearchResponse(BaseModel):
    id: str
    email: str
    username: Optional[str]
    display_name: Optional[str]
    created_at: str
    credits: Optional[Dict[str, Any]] = None


class AdminAddCreditsRequest(BaseModel):
    amount: int = Field(gt=0, description="Amount of credits to add (must be positive)")
    description: str = Field(min_length=1, max_length=255, description="Reason for adding credits")


class AdminChangeTierRequest(BaseModel):
    new_tier: str = Field(description="New subscription tier (free, starter, creator, pro)")


class AdminUserDetailsResponse(BaseModel):
    user: Dict[str, Any]
    credits: Optional[Dict[str, Any]]
    recent_transactions: list[Dict[str, Any]]


class AdminDrumSampleUploadResponse(BaseModel):
    id: str
    message: str
    sample: DrumSamplePublicRead


# Admin routes
@router.get("/users/search", response_model=AdminUserSearchResponse)
async def search_user_by_email(
    email: str,
    admin_user: Dict[str, Any] = Depends(require_admin_user),
    user_service: UserService = Depends(get_user_service)
):
    """
    Search for a user by email address.
    Admin only endpoint.
    """
    logger.info(f"Admin {admin_user['id']} searching for user with email: {email}")
    
    try:
        user = await user_service.get_profile_by_email(email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with email '{email}' not found"
            )
        
        # Get user's credits info
        credits = await credits_service.get_user_credits(str(user.id))
        
        return AdminUserSearchResponse(
            id=str(user.id),
            email=user.email,
            username=user.username,
            display_name=user.display_name,
            created_at=user.created_at.isoformat(),
            credits=credits
        )
    
    except Exception as e:
        logger.error(f"Error searching for user {email}: {str(e)}")
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to search for user"
        )


@router.get("/users/{user_id}", response_model=AdminUserDetailsResponse)
async def get_user_details(
    user_id: str,
    admin_user: Dict[str, Any] = Depends(require_admin_user),
    user_service: UserService = Depends(get_user_service)
):
    """
    Get detailed information about a user including credits and recent transactions.
    Admin only endpoint.
    """
    logger.info(f"Admin {admin_user['id']} requesting details for user: {user_id}")
    
    try:
        user = await user_service.get_profile(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with ID '{user_id}' not found"
            )
        
        # Get credits and transaction history
        credits = await credits_service.get_user_credits(user_id)
        recent_transactions = await credits_service.get_credit_history(user_id, limit=10)
        
        user_dict = {
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
            "created_at": user.created_at.isoformat(),
            "updated_at": user.updated_at.isoformat()
        }
        
        return AdminUserDetailsResponse(
            user=user_dict,
            credits=credits,
            recent_transactions=recent_transactions
        )
    
    except Exception as e:
        logger.error(f"Error getting user details for {user_id}: {str(e)}")
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get user details"
        )


@router.post("/users/{user_id}/credits/add")
async def add_credits_to_user(
    user_id: str,
    request: AdminAddCreditsRequest,
    admin_user: Dict[str, Any] = Depends(require_admin_user)
):
    """
    Add credits to a user's account.
    Admin only endpoint.
    """
    admin_user_id = admin_user["id"]
    logger.info(f"Admin {admin_user_id} adding {request.amount} credits to user {user_id}")
    
    try:
        updated_credits = await credits_service.add_credits_admin(
            user_id=user_id,
            amount=request.amount,
            description=request.description,
            admin_user_id=admin_user_id
        )
        
        if not updated_credits:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found or credits could not be added"
            )
        
        return {
            "success": True,
            "message": f"Successfully added {request.amount} credits to user",
            "credits": updated_credits
        }
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error adding credits to user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add credits"
        )


@router.patch("/users/{user_id}/tier")
async def change_user_tier(
    user_id: str,
    request: AdminChangeTierRequest,
    admin_user: Dict[str, Any] = Depends(require_admin_user)
):
    """
    Change a user's subscription tier.
    Admin only endpoint.
    """
    admin_user_id = admin_user["id"]
    logger.info(f"Admin {admin_user_id} changing user {user_id} tier to {request.new_tier}")
    
    try:
        updated_credits = await credits_service.change_user_tier_admin(
            user_id=user_id,
            new_tier=request.new_tier,
            admin_user_id=admin_user_id
        )
        
        if not updated_credits:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found or tier could not be changed"
            )
        
        return {
            "success": True,
            "message": f"Successfully changed user tier to {request.new_tier}",
            "credits": updated_credits
        }
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error changing tier for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to change user tier"
        )


@router.get("/users/{user_id}/credits")
async def get_user_credits(
    user_id: str,
    admin_user: Dict[str, Any] = Depends(require_admin_user)
):
    """
    Get a user's current credit status.
    Admin only endpoint.
    """
    logger.info(f"Admin {admin_user['id']} requesting credits for user: {user_id}")
    
    try:
        credits = await credits_service.get_user_credits(user_id)
        
        if not credits:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User credits not found"
            )
        
        return credits
    
    except Exception as e:
        logger.error(f"Error getting credits for user {user_id}: {str(e)}")
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get user credits"
        )


@router.get("/users/{user_id}/credits/history")
async def get_user_credit_history(
    user_id: str,
    limit: int = 50,
    admin_user: Dict[str, Any] = Depends(require_admin_user)
):
    """
    Get a user's credit transaction history.
    Admin only endpoint.
    """
    logger.info(f"Admin {admin_user['id']} requesting credit history for user: {user_id}")
    
    try:
        history = await credits_service.get_credit_history(user_id, limit)
        return {"transactions": history}
    
    except Exception as e:
        logger.error(f"Error getting credit history for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get credit history"
        )


# Admin drum sample management endpoints
@router.post("/sounds/drum-samples", response_model=AdminDrumSampleUploadResponse)
async def upload_drum_sample(
    file: UploadFile = File(...),
    display_name: str = Form(...),
    kit_name: str = Form(...),
    genre: str = Form(...),
    category: str = Form(...),
    description: Optional[str] = Form(None),
    admin_user: Dict[str, Any] = Depends(require_admin_user),
    drum_sample_service: DrumSampleService = Depends(get_drum_sample_service)
):
    """
    Upload a new drum sample to the public library.
    Admin only endpoint.
    """
    logger.info(f"Admin {admin_user['id']} uploading drum sample: {display_name}")
    
    try:
        # Validate file type
        if not file.content_type or not file.content_type.startswith('audio/'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an audio file"
            )
        
        # Validate enum values
        try:
            genre_enum = GenreType(genre)
            category_enum = DrumSampleType(category)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid genre or category: {str(e)}"
            )
        
        # Create the drum sample
        sample_data = DrumSamplePublicCreate(
            file_name=file.filename or "unknown.wav",
            display_name=display_name,
            kit_name=kit_name,
            genre=genre_enum,
            category=category_enum,
            description=description,
            file_format=file.content_type.split('/')[-1],
            file_size=0,  # Will be set by service
            storage_key="",  # Will be set by service
        )
        
        # Read file content
        file_content = await file.read()
        
        # Upload and create sample
        created_sample = await drum_sample_service.create_public_sample(
            sample_data, file_content, admin_user['id']
        )
        
        return AdminDrumSampleUploadResponse(
            id=str(created_sample.id),
            message="Drum sample uploaded successfully",
            sample=created_sample
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error uploading drum sample: {str(e)}")
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload drum sample"
        )


@router.get("/sounds/drum-samples", response_model=List[DrumSamplePublicRead])
async def get_all_drum_samples(
    admin_user: Dict[str, Any] = Depends(require_admin_user),
    drum_sample_service: DrumSampleService = Depends(get_drum_sample_service)
):
    """
    Get all drum samples in the public library.
    Admin only endpoint.
    """
    logger.info(f"Admin {admin_user['id']} requesting all drum samples")
    
    try:
        samples = await drum_sample_service.get_all_samples()
        return samples
    except Exception as e:
        logger.error(f"Error getting drum samples: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get drum samples"
        )


@router.delete("/sounds/drum-samples/{sample_id}")
async def delete_drum_sample(
    sample_id: UUID,
    admin_user: Dict[str, Any] = Depends(require_admin_user),
    drum_sample_service: DrumSampleService = Depends(get_drum_sample_service)
):
    """
    Delete a drum sample from the public library.
    Admin only endpoint.
    """
    logger.info(f"Admin {admin_user['id']} deleting drum sample: {sample_id}")
    
    try:
        success = await drum_sample_service.delete_sample(sample_id, admin_user['id'])
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Drum sample not found"
            )
        
        return {"success": True, "message": "Drum sample deleted successfully"}
    
    except Exception as e:
        logger.error(f"Error deleting drum sample {sample_id}: {str(e)}")
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete drum sample"
        )