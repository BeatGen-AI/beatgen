from typing import Dict, Any, Annotated
import hashlib
from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app2.core.config import settings
from app2.core.exceptions import UnauthorizedException
from app2.core.logging import get_logger
from app2.infrastructure.database.sqlmodel_client import get_session


from app2.repositories.user_repository import UserRepository
from app2.repositories.drum_sample_public_repository import DrumSamplePublicRepository

from app2.services.auth_service import AuthService
from app2.services.user_service import UserService
from app2.services.project_service import ProjectService
from app2.services.track_service import TrackService
from app2.services.file_service import FileService
from app2.services.drum_sample_service import DrumSampleService
from app2.services.assistant_message_service import AssistantMessageService

logger = get_logger("beatgen.api.dependencies")

# OAuth2 scheme for token extraction
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Database session dependency
SessionDep = Annotated[AsyncSession, Depends(get_session)]


# Repository instances
# Note: Most repositories now use static methods and don't need instantiation
# The session is passed directly to static methods when called
# Only repositories that haven't been refactored yet still need instantiation


def get_drum_sample_public_repository(
    session: SessionDep,
) -> DrumSamplePublicRepository:
    """Get the drum sample public repository instance"""
    return DrumSamplePublicRepository(session)


# Service instances
def get_auth_service(session: SessionDep) -> AuthService:
    """Get the auth service instance with session"""
    return AuthService(session)


def get_user_service(session: SessionDep) -> UserService:
    """Get the user service instance with session"""
    return UserService(session)


def get_track_service(session: SessionDep) -> TrackService:
    """Get the track service instance with request-scoped session"""
    return TrackService(session)


def get_project_service(session: SessionDep) -> ProjectService:
    """Get the project service instance with request-scoped session"""
    return ProjectService(session)


def get_file_service(session: SessionDep) -> FileService:
    """Get the file service instance with session"""
    return FileService(session)


def get_drum_sample_service(
    drum_sample_repository: Annotated[
        DrumSamplePublicRepository, Depends(get_drum_sample_public_repository)
    ],
) -> DrumSampleService:
    """Get the drum sample service instance"""
    return DrumSampleService(drum_sample_repository)


def get_assistant_message_service(session: SessionDep) -> AssistantMessageService:
    """Get the assistant message service instance with request-scoped session"""
    return AssistantMessageService(session)


# Auth dependency with request-scoped caching
async def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    auth_service: AuthService = Depends(get_auth_service),
) -> Dict[str, Any]:
    """
    Get the current authenticated user with request-scoped caching

    Args:
        request: The FastAPI request object (for caching)
        token: The JWT token from the request
        auth_service: The auth service

    Returns:
        The user info

    Raises:
        UnauthorizedException: If the token is invalid
    """
    # Check if user info is already cached in this request
    # Use full hash to avoid collision risk
    cache_key = f"current_user_{hashlib.sha256(token.encode()).hexdigest()}"
    if hasattr(request.state, cache_key):
        logger.debug("Returning cached user info")
        return getattr(request.state, cache_key)
    
    try:
        logger.debug("Fetching user info from auth service")
        user_info = await auth_service.get_current_user(token)
        # Cache the result in request state
        setattr(request.state, cache_key, user_info)
        return user_info
    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        raise UnauthorizedException("Could not validate credentials")


async def get_current_user_with_token(
    user_info: Dict[str, Any] = Depends(get_current_user),
    token: str = Depends(oauth2_scheme),
) -> Dict[str, Any]:
    """
    Get the current authenticated user with access token included
    
    Args:
        user_info: The cached user info from get_current_user
        token: The JWT token from the request
        
    Returns:
        The user info with access_token included
        
    Raises:
        UnauthorizedException: If the token is invalid
    """
    # Add the access token to the user info for operations that need it
    user_info_with_token = user_info.copy()
    user_info_with_token["access_token"] = token
    return user_info_with_token


async def get_current_user_model(
    request: Request,
    user_info: Dict[str, Any] = Depends(get_current_user),
    session: SessionDep = None,
):
    """
    Get the current authenticated user as a User model with request-scoped caching

    Args:
        request: The FastAPI request object (for caching)
        user_info: The user info from the token
        session: The database session

    Returns:
        The User model

    Raises:
        UnauthorizedException: If the user is not found
    """
    from app2.models.user import User
    
    user_id = user_info.get("id")
    if not user_id:
        raise UnauthorizedException("User ID not found in token")
    
    # Check if user model is already cached in this request
    cache_key = f"current_user_model_{user_id}"
    if hasattr(request.state, cache_key):
        logger.debug("Returning cached user model")
        return getattr(request.state, cache_key)
    
    try:
        # Use static method with session
        user = await UserRepository.find_by_id(session, user_id)
        # Cache the result in request state
        setattr(request.state, cache_key, user)
        return user
    except Exception:
        raise UnauthorizedException("User not found")
