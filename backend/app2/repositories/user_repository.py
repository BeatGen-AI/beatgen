"""
User repository for database operations using SQLModel
"""

from typing import Dict, Any, Optional
from sqlmodel import Session, select
import traceback
import uuid

from app2.models.user import User
from app2.core.exceptions import DatabaseException, NotFoundException
from .base_repository import BaseRepository


class UserRepository(BaseRepository[User]):
    """Repository for user operations"""

    def __init__(self, session: Session):
        """
        Initialize the repository with User model class and session

        Args:
            session: The SQLModel session for database operations
        """
        super().__init__(User, session)

    async def get_profile(self, user_id: uuid.UUID) -> User:
        """
        Get a user's profile

        Args:
            user_id: The ID of the user

        Returns:
            The user profile as User object

        Raises:
            NotFoundException: If the profile is not found
            DatabaseException: If the operation fails
        """
        self.logger.info(f"Getting profile for user {user_id}")
        try:
            result = await self.find_by_id(str(user_id))
            self.logger.info(f"Found profile for user {user_id}")
            return result
        except Exception as e:
            if isinstance(e, NotFoundException):
                raise
            self.logger.error(f"Error getting user profile: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to get user profile: {str(e)}")

    async def update_profile(
        self, user_id: uuid.UUID, profile_data: Dict[str, Any]
    ) -> User:
        """
        Update a user's profile

        Args:
            user_id: The ID of the user
            profile_data: The updated profile data

        Returns:
            The updated profile as User object

        Raises:
            NotFoundException: If the profile is not found
            DatabaseException: If the operation fails
        """
        self.logger.info(f"Updating profile for user {user_id}")
        try:
            result = await self.update(str(user_id), profile_data)
            self.logger.info(f"Updated profile for user {user_id}")
            return result
        except Exception as e:
            if isinstance(e, NotFoundException):
                raise
            self.logger.error(f"Error updating user profile: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to update user profile: {str(e)}")

    async def create_profile(
        self,
        user_id: uuid.UUID,
        email: str,
        username: Optional[str] = None,
        display_name: Optional[str] = None,
    ) -> User:
        """
        Create or get user profile. Email is the source of truth.
        
        This method ensures that the same email always maps to the same profile,
        regardless of the authentication method used (email/password vs OAuth).

        Args:
            user_id: The Supabase Auth ID
            email: The user's email (primary identifier)
            username: The user's username (optional)
            display_name: The user's display name (optional)

        Returns:
            The user profile (existing or newly created)

        Raises:
            DatabaseException: If the operation fails
        """
        self.logger.info(
            f"Ensuring profile for email {email} (Auth ID: {user_id})"
        )

        # Email is our source of truth - check if profile exists with this email
        existing_by_email = await self.find_by_email(email)
        if existing_by_email:
            self.logger.info(
                f"Profile already exists for email {email} with ID {existing_by_email.id}"
            )
            
            # Update display name if provided and different
            if display_name and display_name != existing_by_email.display_name:
                try:
                    await self.update(
                        str(existing_by_email.id),
                        {"display_name": display_name}
                    )
                    self.logger.info(f"Updated display name for {email}")
                except Exception as e:
                    self.logger.warning(f"Failed to update display name: {e}")
            
            return existing_by_email

        # No existing profile with this email - create new one
        # Use the Auth ID provided by Supabase for this session
        profile_data = {
            "id": user_id,
            "email": email,
            "username": username,
            "display_name": display_name,
            "avatar_url": None,
        }
        profile_data_cleaned = {k: v for k, v in profile_data.items() if v is not None}

        try:
            created_profile = await self.create(profile_data_cleaned)
            self.logger.info(
                f"Successfully created profile for {email} with ID {user_id}"
            )
            return created_profile
        except Exception as e:
            self.logger.error(
                f"Database error creating profile for {email}: {str(e)}",
                exc_info=True,
            )
            raise DatabaseException(f"Failed to create profile record: {str(e)}")

    async def find_by_email(self, email: str) -> Optional[User]:
        """
        Find a user by email

        Args:
            email: The email to search for

        Returns:
            The user if found, None otherwise

        Raises:
            DatabaseException: If the query fails
        """
        self.logger.info(f"Finding user with email {email}")
        try:
            statement = select(self.model_class).where(self.model_class.email == email)
            result = self.session.exec(statement).first()

            if result:
                self.logger.info(f"Found user with email {email}")
            else:
                self.logger.info(f"No user found with email {email}")

            return result
        except Exception as e:
            self.logger.error(f"Error finding user by email: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to find user by email: {str(e)}")

    async def find_by_username(self, username: str) -> Optional[User]:
        """Alias for get_user_by_username for consistency"""
        return await self.get_user_by_username(username)

    async def get_user_by_username(self, username: str) -> Optional[User]:
        """
        Find a user by username.

        Args:
            username: The username to search for.

        Returns:
            The user if found, None otherwise.

        Raises:
            DatabaseException: If the query fails.
        """
        self.logger.info(f"Finding user with username {username}")
        try:
            statement = select(self.model_class).where(self.model_class.username == username)
            # Use session.exec for async execution if your BaseRepository/session setup supports it.
            # Assuming self.session is an async-capable session or appropriately wrapped.
            result = self.session.exec(statement).first()

            if result:
                self.logger.info(f"Found user with username {username}")
            else:
                self.logger.info(f"No user found with username {username}")
            return result
        except Exception as e:
            self.logger.error(f"Error finding user by username: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to find user by username: {str(e)}")
