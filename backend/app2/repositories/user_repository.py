"""
User repository for database operations using SQLModel with Redis caching
Stateless implementation with session parameter
"""

from typing import Dict, Any, Optional
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
import traceback
import uuid
import json
from datetime import datetime, timezone

from app2.models.user import User
from app2.core.exceptions import DatabaseException, NotFoundException
from app2.infrastructure.redis_client import redis_client
from app2.core.logging import get_repository_logger

logger = get_repository_logger("user")


class UserRepository:
    """Stateless repository for user operations with Redis caching"""
    
    cache_ttl = 300  # 5 minutes
    
    @staticmethod
    def _serialize_user(user: User) -> str:
        """Serialize user object to JSON string for Redis storage"""
        user_dict = user.model_dump()
        # Convert datetime objects to ISO strings for JSON serialization
        for field in ['created_at', 'updated_at']:
            if user_dict.get(field):
                user_dict[field] = user_dict[field].isoformat()
        return json.dumps(user_dict, default=str)
    
    @staticmethod
    def _deserialize_user(cached_data: str) -> User:
        """Deserialize JSON string from Redis back to User object"""
        user_dict = json.loads(cached_data)
        # Convert ISO strings back to datetime objects
        for field in ['created_at', 'updated_at']:
            if user_dict.get(field) and isinstance(user_dict[field], str):
                user_dict[field] = datetime.fromisoformat(user_dict[field].replace('Z', '+00:00'))
        return User(**user_dict)

    @staticmethod
    async def create(session: AsyncSession, user_data: Dict[str, Any]) -> User:
        """
        Create a new user
        
        Args:
            session: The async database session
            user_data: The data for the new user
            
        Returns:
            The created User instance
            
        Raises:
            DatabaseException: If the operation fails
        """
        logger.info(f"Creating new user")
        try:
            # Ensure timestamps are set
            now = datetime.now(timezone.utc)
            user_data.setdefault("created_at", now)
            user_data.setdefault("updated_at", now)
            
            user = User(**user_data)
            session.add(user)
            await session.flush()
            
            logger.info(f"Created user with ID: {user.id}")
            return user
        except Exception as e:
            logger.error(f"Error creating user: {str(e)}")
            raise DatabaseException(f"Failed to create user: {str(e)}")
    
    @staticmethod
    async def find_by_id(session: AsyncSession, id: str) -> User:
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
            redis = redis_client.get_client()
            cached_data = await redis.get(cache_key)
            if cached_data:
                logger.info(f"📦 Redis cache hit for user {id}")
                return UserRepository._deserialize_user(cached_data)
            
            # Cache miss - fetch from database
            logger.info(f"💾 Redis cache miss - fetching user {id} from database")
            
            # Direct database query
            statement = select(User).where(User.id == id)
            result = await session.execute(statement)
            user = result.scalars().first()
            
            if not user:
                logger.error(f"User with ID {id} not found")
                raise NotFoundException("User", id)
            
            # Cache the result in Redis
            serialized_user = UserRepository._serialize_user(user)
            await redis.setex(cache_key, UserRepository.cache_ttl, serialized_user)
            logger.info(f"✅ Cached user {id} in Redis for {UserRepository.cache_ttl}s")
            
            return user
            
        except json.JSONDecodeError as e:
            logger.warning(f"⚠️ Invalid JSON in Redis cache for user {id}, fetching from DB: {e}")
            # Remove invalid cache entry
            redis = redis_client.get_client()
            await redis.delete(cache_key)
            
            # Fetch from database
            statement = select(User).where(User.id == id)
            result = await session.execute(statement)
            user = result.scalars().first()
            if not user:
                raise NotFoundException("User", id)
            return user
        except Exception as e:
            logger.error(f"Error fetching user {id}: {str(e)}")
            # If Redis fails, fallback to database
            if "redis" in str(e).lower():
                logger.warning(f"⚠️ Redis error, falling back to database for user {id}")
                statement = select(User).where(User.id == id)
                result = await session.execute(statement)
                user = result.scalars().first()
                if not user:
                    raise NotFoundException("User", id)
                return user
            raise

    @staticmethod
    async def get_profile(session: AsyncSession, user_id: uuid.UUID) -> User:
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
        logger.info(f"Getting profile for user {user_id}")
        try:
            result = await UserRepository.find_by_id(session, str(user_id))
            logger.info(f"Found profile for user {user_id}")
            return result
        except Exception as e:
            if isinstance(e, NotFoundException):
                raise
            logger.error(f"Error getting user profile: {str(e)}")
            logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to get user profile: {str(e)}")
    
    @staticmethod
    async def update(session: AsyncSession, id: str, data: Dict[str, Any]) -> User:
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
            # First get the existing user
            statement = select(User).where(User.id == id)
            result = await session.execute(statement)
            user = result.scalars().first()
            
            if not user:
                raise NotFoundException("User", id)
            
            # Update fields
            data["updated_at"] = datetime.now(timezone.utc)
            for key, value in data.items():
                if hasattr(user, key):
                    setattr(user, key, value)
            
            await session.flush()
            
            # Invalidate Redis cache
            redis = redis_client.get_client()
            await redis.delete(cache_key)
            logger.info(f"🗑️ Invalidated Redis cache for user {id}")
            
            # Cache the updated user
            serialized_user = UserRepository._serialize_user(user)
            await redis.setex(cache_key, UserRepository.cache_ttl, serialized_user)
            logger.info(f"✅ Cached updated user {id} in Redis")
            
            return user
        except Exception as e:
            logger.error(f"Error updating user {id}: {str(e)}")
            # If Redis fails during update, still return the updated user
            if "redis" in str(e).lower() and 'user' in locals():
                logger.warning(f"⚠️ Redis error during user update, continuing without cache")
                return user
            raise

    @staticmethod
    async def update_profile(
        session: AsyncSession, user_id: uuid.UUID, profile_data: Dict[str, Any]
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
        logger.info(f"Updating profile for user {user_id}")
        try:
            result = await UserRepository.update(session, str(user_id), profile_data)
            logger.info(f"Updated profile for user {user_id}")
            return result
        except Exception as e:
            if isinstance(e, NotFoundException):
                raise
            logger.error(f"Error updating user profile: {str(e)}")
            logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to update user profile: {str(e)}")
    
    @staticmethod
    async def clear_user_cache(user_id: uuid.UUID) -> bool:
        """
        Clear user cache from Redis
        
        Args:
            user_id: The ID of the user to clear from cache
            
        Returns:
            True if cache was cleared, False if key didn't exist
        """
        cache_key = f"user:{str(user_id)}"
        try:
            redis = redis_client.get_client()
            result = await redis.delete(cache_key)
            if result:
                logger.info(f"🗑️ Cleared Redis cache for user {user_id}")
            else:
                logger.debug(f"No cache entry found for user {user_id}")
            return bool(result)
        except Exception as e:
            logger.warning(f"⚠️ Failed to clear cache for user {user_id}: {e}")
            return False

    @staticmethod
    async def create_profile(
        session: AsyncSession,
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
        logger.info(
            f"Ensuring profile for email {email} (Auth ID: {user_id})"
        )

        # Email is our source of truth - check if profile exists with this email
        existing_by_email = await UserRepository.find_by_email(session, email)
        if existing_by_email:
            logger.info(
                f"Profile already exists for email {email} with ID {existing_by_email.id}"
            )
            
            # Update display name if provided and different
            if display_name and display_name != existing_by_email.display_name:
                try:
                    await UserRepository.update(
                        session,
                        str(existing_by_email.id),
                        {"display_name": display_name}
                    )
                    logger.info(f"Updated display name for {email}")
                except Exception as e:
                    logger.warning(f"Failed to update display name: {e}")
            
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
            # Create new user
            user = User(**profile_data_cleaned)
            session.add(user)
            await session.flush()
            
            logger.info(
                f"Successfully created profile for {email} with ID {user_id}"
            )
            return user
        except Exception as e:
            logger.error(
                f"Database error creating profile for {email}: {str(e)}",
                exc_info=True,
            )
            raise DatabaseException(f"Failed to create profile record: {str(e)}")

    @staticmethod
    async def find_by_email(session: AsyncSession, email: str) -> Optional[User]:
        """
        Find a user by email

        Args:
            email: The email to search for

        Returns:
            The user if found, None otherwise

        Raises:
            DatabaseException: If the query fails
        """
        logger.info(f"Finding user with email {email}")
        try:
            statement = select(User).where(User.email == email)
            result = await session.execute(statement)
            user = result.scalars().first()

            if user:
                logger.info(f"Found user with email {email}")
            else:
                logger.info(f"No user found with email {email}")

            return user
        except Exception as e:
            logger.error(f"Error finding user by email: {str(e)}")
            logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to find user by email: {str(e)}")

    @staticmethod
    async def find_by_username(session: AsyncSession, username: str) -> Optional[User]:
        """Alias for get_user_by_username for consistency"""
        return await UserRepository.get_user_by_username(session, username)

    @staticmethod
    async def get_user_by_username(session: AsyncSession, username: str) -> Optional[User]:
        """
        Find a user by username.

        Args:
            username: The username to search for.

        Returns:
            The user if found, None otherwise.

        Raises:
            DatabaseException: If the query fails.
        """
        logger.info(f"Finding user with username {username}")
        try:
            statement = select(User).where(User.username == username)
            result = await session.execute(statement)
            user = result.scalars().first()

            if user:
                logger.info(f"Found user with username {username}")
            else:
                logger.info(f"No user found with username {username}")
            return user
        except Exception as e:
            logger.error(f"Error finding user by username: {str(e)}")
            logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to find user by username: {str(e)}")
