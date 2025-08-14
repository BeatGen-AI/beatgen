from fastapi import APIRouter, Depends, status, HTTPException, Query, Request, Response, Header
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import RedirectResponse
from typing import Any, Optional, Dict
from pydantic import BaseModel, EmailStr
import urllib.parse

from app2.api.dependencies import get_auth_service, get_current_user, get_current_user_with_token
from app2.services.auth_service import AuthService
from app2.core.logging import get_api_logger
from app2.core.exceptions import UnauthorizedException, ServiceException, ValidationException
from app2.core.config import settings
from app2.utils.password_validation import validate_password

# Import the schemas for compatibility with the old API
from app2.models.token import Token
from app2.models.user import UserCreate

router = APIRouter()
logger = get_api_logger("auth")


class ForgotPasswordRequest(BaseModel):
    """Request model for password reset"""

    email: EmailStr
    redirect_to: Optional[str] = None


class MessageResponse(BaseModel):
    """Generic success message response"""

    message: str


class OAuthURLResponse(BaseModel):
    """Response with OAuth URL for redirect"""

    url: str


class UsernameCheckRequest(BaseModel):
    """Request model for username availability check"""
    
    username: str


class UsernameCheckResponse(BaseModel):
    """Response for username availability check"""
    
    available: bool
    message: Optional[str] = None


class CompleteProfileRequest(BaseModel):
    """Request model for completing profile with username"""
    
    username: str


class AddPasswordRequest(BaseModel):
    """Request model for adding password to OAuth account"""
    
    password: str




class ResetPasswordRequest(BaseModel):
    """Request model for resetting password with token"""
    
    password: str


@router.post("/signup", response_model=Token, status_code=status.HTTP_201_CREATED)
async def signup(
    user_data: UserCreate, auth_service: AuthService = Depends(get_auth_service)
) -> Any:
    """
    Register a new user account
    """
    logger.info(f"Processing signup request for email: {user_data.email}, username: {user_data.username}")
    try:
        # Validate password before creating user
        password_error = validate_password(user_data.password)
        if password_error:
            raise ValidationException(password_error)
        
        # Call Supabase auth service to create user
        result = await auth_service.create_user(
            email=user_data.email,
            password=user_data.password,
            username=user_data.username,
            display_name=user_data.display_name,
        )
        logger.info(
            f"User registered successfully: {result.get('user_id', '') if result else 'N/A'}"
        )

        # Check if user creation failed or returned None
        if result is None:
            logger.error("User creation returned None from auth_service")
            raise ServiceException("User registration failed unexpectedly.")

        # Handle case where email confirmation is required
        if not result.get("access_token"):
            return {
                "access_token": "",  # No token yet, needs email verification
                "token_type": "bearer",
                # Include a message about email confirmation
                "message": "Signup successful. Please check your email to confirm your account.",
            }

        return {
            "access_token": result["access_token"],
            "token_type": "bearer",
            "user_id": result.get("user_id"),
        }
    except ValidationException as e:
        logger.warning(f"Signup validation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Signup failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Registration failed: {str(e)}",
        )


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    auth_service: AuthService = Depends(get_auth_service),
) -> Any:
    """
    Authenticate user and return access token

    Uses OAuth2PasswordRequestForm for compatibility with standard OAuth2 clients.
    The username field is used for email.
    """
    logger.info(f"Processing login request for email: {form_data.username}")
    try:
        # Call Supabase auth service to sign in user
        result = await auth_service.login_user(
            email_or_username=form_data.username,  # OAuth2 form uses 'username' field for email
            password=form_data.password,
        )
        logger.info(f"User logged in successfully: {result['user_id']}")
        return {
            "access_token": result["access_token"],
            "token_type": "bearer",
            "user_id": result.get("user_id"),
        }
    except UnauthorizedException as e:
        logger.error(f"Login failed - invalid credentials: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error(f"Login failed - unexpected error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    request: ForgotPasswordRequest,
    auth_service: AuthService = Depends(get_auth_service),
) -> Any:
    """
    Send password reset email

    For security reasons, always returns success whether the email exists or not.
    """
    logger.info(f"Processing password reset request for email: {request.email}")
    try:
        # Call Supabase auth service to send reset password email
        await auth_service.send_password_reset(request.email, request.redirect_to)
        logger.info(f"Password reset email sent to: {request.email}")
    except Exception as e:
        # Log the error but don't expose it to the client
        logger.error(f"Password reset failed: {str(e)}")

    # Always return the same message whether successful or not for security
    return {"message": "If the email exists, a password reset link will be sent"}


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    request: ResetPasswordRequest,
    authorization: str = Header(None),
    auth_service: AuthService = Depends(get_auth_service),
) -> Any:
    """
    Reset password using recovery token from email
    
    The recovery token should be sent in the Authorization header
    """
    # Extract the token from the Authorization header
    if not authorization:
        logger.error("No authorization header provided for password reset")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token"
        )
    
    # Remove "Bearer " prefix if present
    token = authorization.replace("Bearer ", "").strip()
    
    if not token:
        logger.error("Empty token in authorization header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization token"
        )
    
    logger.info(f"Processing password reset with recovery token: {token[:10]}...")
    
    try:
        # Validate password strength
        password_error = validate_password(request.password)
        if password_error:
            raise ValidationException(password_error)
        
        # Exchange the recovery token for a session and update the password
        # This is the proper way to handle recovery tokens in Supabase
        success = await auth_service.reset_password_with_recovery_token(
            password=request.password,
            recovery_token=token
        )
        
        if success:
            logger.info("Password reset successful")
            return {"message": "Password has been reset successfully"}
        else:
            raise ServiceException("Failed to reset password")
            
    except ValidationException as e:
        logger.warning(f"Validation error during password reset: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) from e
    except UnauthorizedException as e:
        logger.error(f"Authorization error during password reset: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired recovery token. Please request a new password reset."
        ) from e
    except Exception as e:
        logger.error(f"Password reset failed: {str(e)}")
        # Pass through the actual error message
        error_message = str(e)
        
        # Extract user-friendly message if it's buried in the exception
        if "Auth session missing" in error_message:
            error_message = "Invalid or expired recovery token. Please request a new password reset."
        elif "New password should be different" in error_message:
            error_message = "New password must be different from your current password"
        elif "same_password" in error_message:
            error_message = "New password cannot be the same as your current password"
        elif "Failed to reset password" in error_message:
            # Generic message, try to extract more detail
            error_message = "Failed to reset password. Please try again."
            
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_message
        ) from e


@router.get("/login/google", response_model=OAuthURLResponse)
async def login_google(
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
) -> Any:
    """
    Get Google OAuth URL for the frontend to redirect to
    """
    logger.info(f"[API] Received GET /auth/login/google from {request.client.host}")
    logger.info(f"[DIAGNOSTIC] APP_ENV={settings.app.APP_ENV}, BASE_URL={settings.app.BASE_URL}, FRONTEND_BASE_URL={settings.app.FRONTEND_BASE_URL}")
    logger.info("Starting Google OAuth flow")
    try:
        redirect_url = await auth_service.get_google_auth_url(response)
        logger.info(f"[API] Google auth URL generated: {redirect_url}")
        return {"url": redirect_url}
    except Exception as e:
        logger.error(f"Failed to generate Google auth URL: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OAuth error: {str(e)}",
        )


@router.get("/callback/google")
async def callback_google(
    request: Request,
    response: Response,
    code: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    auth_service: AuthService = Depends(get_auth_service),
) -> Any:
    """
    Handle Google OAuth callback
    """
    logger.info(
        f"[API] Received GET /auth/callback/google from {request.client.host}"
    )

    # Log all query parameters received
    params = dict(request.query_params)
    logger.info(f"[API] Received callback query params: {params}")

    # Check if Google returned an error
    if error:
        logger.error(
            f"Google returned an error during OAuth callback: {error} - {error_description}"
        )
        # Redirect to frontend with error information
        error_redirect_url = f"{settings.app.FRONTEND_BASE_URL}?error=google_auth_failed&error_description={error_description or error}"
        logger.info(f"Redirecting to frontend with error: {error_redirect_url}")
        return RedirectResponse(error_redirect_url)

    # Check for the code parameter
    if not code:
        logger.error("[API] No code parameter found in successful callback request")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing required 'code' parameter in callback",
        )

    logger.info(f"[API] Code received: {code[:10]}... Attempting to handle callback.")
    try:
        # Call the service to exchange code and get user info
        result = await auth_service.handle_google_callback(code, request, response)

        user_id = result.get("user_id")
        access_token = result.get("access_token")
        logger.info(
            f"[API] Service handle_google_callback successful for user: {user_id}"
        )

        if not access_token:
            logger.error(
                "[API] Service handle_google_callback did not return an access token."
            )
            # Redirect to frontend with an error
            error_desc = urllib.parse.quote("Failed to retrieve access token after Google login")
            error_redirect_url = f"{settings.app.FRONTEND_BASE_URL}?error=token_missing&error_description={error_desc}"
            logger.info(f"Redirecting to frontend with error: {error_redirect_url}")
            return RedirectResponse(error_redirect_url)

        # Determine the final redirect URL for the frontend
        frontend_redirect_url = settings.app.FRONTEND_BASE_URL or "/"
        
        # Append access_token to the fragment
        redirect_url_with_token = f"{frontend_redirect_url}#access_token={access_token}"
        # Optionally, you might want to include token_type or expires_in if your frontend expects them in the hash
        # redirect_url_with_token += f"&token_type=bearer" 

        logger.info(f"[API] Preparing redirect to frontend with token in hash: {redirect_url_with_token}")
        return RedirectResponse(redirect_url_with_token)

    except (UnauthorizedException, ServiceException) as e:
        if isinstance(e, ServiceException) and str(e).startswith("PKCE_REDIRECT::"):
            redirect_url = str(e).split("::", 1)[1]
            logger.warning(f"[API] PKCE verifier missing, redirecting to: {redirect_url}")
            return RedirectResponse(redirect_url)
        
        logger.error(
            f"[API] Google OAuth callback processing failed: {str(e)}", exc_info=True
        )
        # Redirect to frontend with error information
        error_desc = urllib.parse.quote(str(e))
        error_redirect_url = f"{settings.app.FRONTEND_BASE_URL}?error=google_auth_failed&error_description={error_desc}"
        logger.info(f"Redirecting to frontend with error: {error_redirect_url}")
        return RedirectResponse(error_redirect_url)
    except Exception as e:
        logger.error(
            f"[API] Unexpected error during Google OAuth callback: {str(e)}",
            exc_info=True,
        )
        error_desc = urllib.parse.quote("An unexpected error occurred during login.")
        error_redirect_url = f"{settings.app.FRONTEND_BASE_URL}?error=unexpected&error_description={error_desc}"
        logger.info(f"Redirecting to frontend with error: {error_redirect_url}")
        return RedirectResponse(error_redirect_url)


@router.post("/check-username", response_model=UsernameCheckResponse)
async def check_username(
    request: UsernameCheckRequest,
    auth_service: AuthService = Depends(get_auth_service)
) -> Any:
    """
    Check if a username is available
    """
    logger.info(f"Checking username availability: {request.username}")
    try:
        # Basic validation
        username = request.username.strip()
        if not username or len(username) < 3:
            return UsernameCheckResponse(
                available=False,
                message="Username must be at least 3 characters long"
            )
        if len(username) > 30:
            return UsernameCheckResponse(
                available=False,
                message="Username must be 30 characters or less"
            )
        if not username.replace("_", "").isalnum():
            return UsernameCheckResponse(
                available=False,
                message="Username can only contain letters, numbers, and underscores"
            )
        
        # Check availability
        available = await auth_service.check_username_availability(username)
        
        return UsernameCheckResponse(
            available=available,
            message=None if available else "Username is already taken"
        )
    except Exception as e:
        logger.error(f"Error checking username availability: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check username availability"
        )


@router.post("/complete-profile")
async def complete_profile(
    request: CompleteProfileRequest,
    current_user: dict = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service)
) -> Any:
    """
    Complete user profile by setting username (for OAuth users)
    """
    user_id = current_user.get("id")  # The user ID from the auth service
    logger.info(f"Completing profile for user {user_id} with username: {request.username}")
    
    try:
        # Complete the profile
        updated_user = await auth_service.complete_profile(
            user_id=user_id,
            username=request.username.strip()
        )
        
        return {
            "message": "Profile completed successfully",
            "user": {
                "id": str(updated_user.id),
                "email": updated_user.email,
                "username": updated_user.username,
                "display_name": updated_user.display_name
            }
        }
    except ValidationException as e:
        logger.warning(f"Validation error completing profile: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error completing profile: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete profile"
        )


@router.get("/profile-status")
async def profile_status(
    current_user: dict = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service)
) -> Any:
    """
    Check if user's profile is complete (has username)
    """
    user_id = current_user.get("id")
    logger.info(f"Checking profile status for user {user_id}")
    
    try:
        is_complete = await auth_service.check_profile_complete(user_id)
        return {
            "profile_complete": is_complete,
            "needs_username": not is_complete
        }
    except Exception as e:
        logger.error(f"Error checking profile status: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check profile status"
        )


@router.post("/add-password")
async def add_password(
    request: AddPasswordRequest,
    current_user: dict = Depends(get_current_user_with_token),
    auth_service: AuthService = Depends(get_auth_service)
) -> Any:
    """
    Add password authentication to an OAuth user account
    """
    user_id = current_user.get("id")  # Supabase auth ID
    access_token = current_user.get("access_token")  # We need the token for the update
    
    logger.info(f"Adding password auth for user {user_id}")
    
    try:
        # Validate password
        password_error = validate_password(request.password)
        if password_error:
            raise ValidationException(password_error)
        
        # Add password to the user
        success = await auth_service.add_password_to_oauth_user(
            user_id=user_id,
            password=request.password,
            access_token=access_token
        )
        
        if success:
            return {"message": "Password added successfully"}
        else:
            raise ServiceException("Failed to add password")
            
    except ValidationException as e:
        logger.warning(f"Validation error adding password: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error adding password: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add password"
        )


