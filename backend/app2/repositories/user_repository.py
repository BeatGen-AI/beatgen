"""
User repository for database operations using SQLModel with Redis caching
"""

from typing import Dict, Any, Optional
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
import traceback
import uuid
import json
from datetime import datetime

from app2.models.user import User
from app2.core.exceptions import DatabaseException, NotFoundException
from app2.infrastructure.redis_client import redis_client
from .base_repository import BaseRepository


class UserRepository(BaseRepository[User]):
    """Repository for user operations with Redis caching"""

    def __init__(self, session: AsyncSession):
        """
        Initialize the repository with User model class and session

        Args:
            session: The async SQLModel session for database operations
        """
        super().__init__(User, session)
        self.redis = redis_client.get_client()
        self.cache_ttl = 300  # 5 minutes
    
    def _serialize_user(self, user: User) -> str:
        """Serialize user object to JSON string for Redis storage"""
        user_dict = user.model_dump()
        # Convert datetime objects to ISO strings for JSON serialization
        for field in ['created_at', 'updated_at']:
            if user_dict.get(field):
                user_dict[field] = user_dict[field].isoformat()
        return json.dumps(user_dict, default=str)
    
    def _deserialize_user(self, cached_data: str) -> User:
        """Deserialize JSON string from Redis back to User object"""
        user_dict = json.loads(cached_data)
        # Convert ISO strings back to datetime objects
        for field in ['created_at', 'updated_at']:
            if user_dict.get(field) and isinstance(user_dict[field], str):
                user_dict[field] = datetime.fromisoformat(user_dict[field].replace('Z', '+00:00'))
        return User(**user_dict)

    async def find_by_id(self, id: str) -> User:
        """
        Find a user by ID with Redis caching
        
        Args:
            id: The ID of the user to find (as string)
            
        Returns:
            The User model instance
            
        Raises:
            NotFoundException: If the user is not found
            DatabaseException: If the query fails
        """
        cache_key = f"user:{id}"
        
        try:
            # Check Redis cache first
            cached_data = await self.redis.get(cache_key)
            if cached_data:
                self.logger.info(f"📦 Redis cache hit for user {id}")
                return self._deserialize_user(cached_data)
            
            # Cache miss - fetch from database
            self.logger.info(f"💾 Redis cache miss - fetching user {id} from database")
            user = await super().find_by_id(id)
            
            # Cache the result in Redis
            serialized_user = self._serialize_user(user)
            await self.redis.setex(cache_key, self.cache_ttl, serialized_user)
            self.logger.info(f"✅ Cached user {id} in Redis for {self.cache_ttl}s")
            
            return user
            
        except json.JSONDecodeError as e:
            self.logger.warning(f"⚠️ Invalid JSON in Redis cache for user {id}, fetching from DB: {e}")
            # Remove invalid cache entry
            await self.redis.delete(cache_key)
            return await super().find_by_id(id)
        except Exception as e:
            self.logger.error(f"Error fetching user {id}: {str(e)}")
            # If Redis fails, fallback to database
            if "redis" in str(e).lower():
                self.logger.warning(f"⚠️ Redis error, falling back to database for user {id}")
                return await super().find_by_id(id)
            raise

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
    
    async def update(self, id: str, data: Dict[str, Any]) -> User:
        """
        Update a user and invalidate Redis cache
        
        Args:
            id: The ID of the user to update
            data: Dictionary of fields to update
            
        Returns:
            The updated User model instance
        """
        cache_key = f"user:{id}"
        
        try:
            # Update the user in database
            updated_user = await super().update(id, data)
            
            # Invalidate Redis cache
            await self.redis.delete(cache_key)
            self.logger.info(f"🗑️ Invalidated Redis cache for user {id}")
            
            # Cache the updated user
            serialized_user = self._serialize_user(updated_user)
            await self.redis.setex(cache_key, self.cache_ttl, serialized_user)
            self.logger.info(f"✅ Cached updated user {id} in Redis")
            
            return updated_user
        except Exception as e:
            self.logger.error(f"Error updating user {id}: {str(e)}")
            # If Redis fails during update, still return the updated user
            if "redis" in str(e).lower():
                self.logger.warning(f"⚠️ Redis error during user update, continuing without cache")
                return updated_user
            raise

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
    
    async def clear_user_cache(self, user_id: uuid.UUID) -> bool:
        """
        Clear user cache from Redis
        
        Args:
            user_id: The ID of the user to clear from cache
            
        Returns:
            True if cache was cleared, False if key didn't exist
        """
        cache_key = f"user:{str(user_id)}"
        try:
            result = await self.redis.delete(cache_key)
            if result:
                self.logger.info(f"🗑️ Cleared Redis cache for user {user_id}")
            else:
                self.logger.debug(f"No cache entry found for user {user_id}")
            return bool(result)
        except Exception as e:
            self.logger.warning(f"⚠️ Failed to clear cache for user {user_id}: {e}")
            return False

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
            result = await self.session.execute(statement)
            user = result.scalars().first()

            if user:
                self.logger.info(f"Found user with email {email}")
            else:
                self.logger.info(f"No user found with email {email}")

            return user
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
            result = await self.session.execute(statement)
            user = result.scalars().first()

            if user:
                self.logger.info(f"Found user with username {username}")
            else:
                self.logger.info(f"No user found with username {username}")
            return user
        except Exception as e:
            self.logger.error(f"Error finding user by username: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to find user by username: {str(e)}")
