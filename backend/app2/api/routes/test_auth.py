"""
Test authentication endpoints for creating valid test tokens.
These should only be available in non-production environments.
"""

from fastapi import APIRouter, HTTPException, status
from typing import Dict, Any
from pydantic import BaseModel

from app2.core.config import settings
from app2.core.logging import get_api_logger
from app2.services.auth_service import AuthService
from app2.api.dependencies import get_auth_service
from fastapi import Depends

router = APIRouter()
logger = get_api_logger("test_auth")

class TestTokenRequest(BaseModel):
    """Request model for creating test tokens"""
    user_id: str = "b9c0588e-cd7c-4a3f-9bd9-a6f6dcc321ff"
    email: str = "test@example.com"
    username: str = "testuser"

class TestTokenResponse(BaseModel):
    """Response model for test tokens"""
    access_token: str
    token_type: str
    user_id: str
    message: str

@router.post("/create-test-token", response_model=TestTokenResponse)
async def create_test_token(
    request: TestTokenRequest,
    auth_service: AuthService = Depends(get_auth_service)
) -> TestTokenResponse:
    """
    Create a test token for testing purposes.
    
    WARNING: This endpoint should only be available in test/dev environments!
    """
    # Security check - never allow this in production
    if settings.app.APP_ENV == "prod":
        logger.error("Attempted to use test token endpoint in production!")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found"
        )
    
    logger.info(f"Creating test token for user: {request.user_id}")
    
    try:
        # Create or ensure the test user exists
        await auth_service.create_user_profile(
            user_id=request.user_id,
            email=request.email,
            username=request.username,
            display_name="Test User"
        )
        
        # For testing, we'll create a mock response since we can't generate
        # real Supabase tokens without going through the full auth flow
        # In a real test setup, you'd need to create actual test users in Supabase
        
        return TestTokenResponse(
            access_token="test_token_placeholder",
            token_type="bearer",
            user_id=request.user_id,
            message="Test token created - use with caution!"
        )
        
    except Exception as e:
        logger.error(f"Failed to create test token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create test token: {str(e)}"
        )

@router.get("/health")
async def test_auth_health():
    """Health check for test auth endpoints"""
    if settings.app.APP_ENV == "prod":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    
    return {"status": "Test auth endpoints available", "env": settings.app.APP_ENV}