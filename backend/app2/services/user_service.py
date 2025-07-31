from typing import Dict, Any, Optional
import traceback
import uuid # For generating unique filenames
from fastapi import UploadFile # For type hinting

from app2.core.logging import get_service_logger
from app2.core.exceptions import (
    ServiceException,
    NotFoundException,
    UnauthorizedException,
)
from app2.repositories.user_repository import UserRepository
from app2.models.user import User
from app2.infrastructure.database.supabase_client import supabase

logger = get_service_logger("user")


class UserService:
    """Service for user operations"""

    def __init__(self, user_repository: UserRepository):
        """
        Initialize the service with repositories

        Args:
            user_repository: The repository for user operations
        """
        self.user_repository = user_repository

    async def get_profile_by_email(self, email: str) -> Optional[User]:
        """
        Get a user's profile by email
        
        Args:
            email: The email of the user
            
        Returns:
            The user profile or None if not found
            
        Raises:
            ServiceException: If the operation fails
        """
        logger.info(f"Getting profile for email: {email}")
        try:
            profile = await self.user_repository.find_by_email(email)
            if profile:
                logger.info(f"Found profile for email: {email}")
                return profile
            else:
                logger.info(f"No profile found for email: {email}")
                return None
        except Exception as e:
            logger.error(f"Error getting user profile by email: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to get user profile by email: {str(e)}") from e

    async def get_profile(self, user_id: str) -> User:
        """
        Get a user's profile

        Args:
            user_id: The ID of the user

        Returns:
            The user profile

        Raises:
            NotFoundException: If the profile is not found
            ServiceException: If the operation fails
        """
        logger.info(f"Getting profile for user ID: {user_id}")
        try:
            profile = await self.user_repository.get_profile(uuid.UUID(user_id))
            logger.info(f"Found profile for user ID: {user_id}")
            return profile
        except Exception as e:
            if isinstance(e, NotFoundException):
                raise
            logger.error(f"Error getting user profile: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to get user profile: {str(e)}") from e

    async def update_profile(
        self, user_id: str, profile_data: Dict[str, Any]
    ) -> User:
        """
        Update a user's profile

        Args:
            user_id: The ID of the user
            profile_data: The updated profile data

        Returns:
            The updated profile

        Raises:
            NotFoundException: If the profile is not found
            ServiceException: If the operation fails
        """
        logger.info(f"Updating profile for user ID: {user_id}")
        try:
            # Filter out fields that cannot be updated
            safe_data = {
                k: v
                for k, v in profile_data.items()
                if k not in ["id", "email", "created_at"]
            }

            profile = await self.user_repository.update_profile(uuid.UUID(user_id), safe_data)
            logger.info(f"Updated profile for user ID: {user_id}")
            return profile
        except Exception as e:
            if isinstance(e, NotFoundException):
                raise
            logger.error(f"Error updating user profile: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to update user profile: {str(e)}") from e

    async def change_password(
        self, user_id: str, current_password: str, new_password: str
    ) -> bool:
        """
        Change a user's password

        Args:
            user_id: The ID of the user
            current_password: The current password
            new_password: The new password

        Returns:
            True if password was changed successfully

        Raises:
            UnauthorizedException: If current password is invalid
            ServiceException: If the operation fails
        """
        logger.info(f"Changing password for user ID: {user_id}")
        try:
            # First verify the current password by attempting to sign in
            # Get user email from profile
            profile = await self.get_profile(user_id)
            email = profile.get("email")

            if not email:
                logger.error(f"No email found for user ID: {user_id}")
                raise ServiceException("User profile is incomplete")

            # Try to authenticate with current password
            try:
                auth_response = supabase.client.auth.sign_in_with_password(
                    {"email": email, "password": current_password}
                )

                if not auth_response.user:
                    logger.error(f"Authentication failed for user ID: {user_id}")
                    raise UnauthorizedException("Current password is incorrect")
            except Exception as auth_err:
                logger.error(f"Authentication failed: {str(auth_err)}")
                raise UnauthorizedException("Current password is incorrect")

            # Change password using Supabase Auth
            supabase.client.auth.update_user({"password": new_password})

            logger.info(f"Password changed for user ID: {user_id}")
            return True
        except Exception as e:
            if isinstance(e, UnauthorizedException):
                raise
            logger.error(f"Error changing password: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to change password: {str(e)}") from e

    async def update_avatar(self, user_id: str, file: UploadFile) -> Dict[str, Any]:
        """
        Uploads an avatar for the user, stores it in Supabase Storage, 
        and updates the user's profile with the new avatar URL.

        Args:
            user_id: The ID of the user.
            file: The avatar file to upload (FastAPI UploadFile object).

        Returns:
            The updated user profile including the new avatar_url.

        Raises:
            NotFoundException: If the user profile is not found.
            ServiceException: If the file upload or profile update fails.
            ValueError: If the file type is not supported.
        """
        logger.info(f"Updating avatar for user ID: {user_id}")

        # Validate file type
        allowed_content_types = ["image/jpeg", "image/png", "image/gif"]
        if file.content_type not in allowed_content_types:
            logger.error(f"Invalid file type for avatar: {file.content_type}. User ID: {user_id}")
            raise ValueError(f"Invalid file type: {file.content_type}. Please upload a JPG, PNG, or GIF.")

        # Ensure user profile exists (also fetches it for returning later)
        profile = await self.get_profile(user_id) # This will raise NotFoundException if not found

        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'png'
        # Sanitize filename further if needed, or use a fixed extension based on content_type
        if file.content_type == "image/jpeg":
            file_extension = "jpg"
        elif file.content_type == "image/png":
            file_extension = "png"
        elif file.content_type == "image/gif":
            file_extension = "gif"
        
        # Construct a unique path for the file in storage
        storage_path = f"{user_id}/avatar_{uuid.uuid4()}.{file_extension}"
        bucket_name = "profile-pics"

        try:
            logger.info(f"Uploading avatar to Supabase Storage. Bucket: {bucket_name}, Path: {storage_path}")
            
            # Read file content
            file_content = await file.read()
            
            # Upload to Supabase Storage
            # The Supabase Python client's `upload` method expects bytes.
            upload_response = supabase.client.storage.from_(bucket_name).upload(
                path=storage_path,
                file=file_content,
                file_options={"content-type": file.content_type, "cache-control": "3600"} # Set content type
            )
            
            # Construct the public URL (Supabase doesn't return it directly on upload v2)
            # The URL format is: {SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{FILE_PATH}
            public_url_response = supabase.client.storage.from_(bucket_name).get_public_url(storage_path)
            avatar_url = public_url_response

            logger.info(f"Avatar uploaded successfully. Public URL: {avatar_url}")

            # Update user profile with the new avatar URL
            updated_profile = await self.update_profile(user_id, {"avatar_url": avatar_url})
            logger.info(f"User profile updated with new avatar URL for user ID: {user_id}")
            
            return updated_profile # Return the full updated profile

        except Exception as e:
            logger.error(f"Failed to upload avatar or update profile for user {user_id}: {str(e)}", exc_info=True)
            # Attempt to delete the file from storage if upload succeeded but DB update failed, to prevent orphans
            # This part is tricky as we don't know at which stage the error occurred precisely without more checks.
            # For simplicity, we are not adding cleanup logic here, but it's a consideration for robustness.
            raise ServiceException(f"Failed to update avatar: {str(e)}") from e
