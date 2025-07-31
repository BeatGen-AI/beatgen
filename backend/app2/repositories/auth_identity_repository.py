# """
# Repository for auth identity operations

# Note: This repository manually converts enum values to strings in queries
# to avoid prepared statement issues with Supabase's transaction mode pooler.
# Enum parameters can cause type registration problems in prepared statements.
# """
# from typing import Optional, List
# from sqlmodel import select
# from sqlalchemy.ext.asyncio import AsyncSession
# import uuid
# import traceback

# from app2.models.auth_identity import AuthIdentity, AuthProvider
# from app2.models.user import User
# from app2.core.exceptions import DatabaseException, NotFoundException
# from .base_repository import BaseRepository


# class AuthIdentityRepository(BaseRepository[AuthIdentity]):
#     """Repository for auth identity operations"""

#     def __init__(self, session: AsyncSession):
#         """Initialize the repository with AuthIdentity model and session"""
#         super().__init__(AuthIdentity, session)

#     async def find_by_auth_provider_id(
#         self, auth_provider_id: uuid.UUID
#     ) -> Optional[AuthIdentity]:
#         """
#         Find an auth identity by provider ID
        
#         Args:
#             auth_provider_id: The auth provider's user ID
            
#         Returns:
#             The auth identity if found, None otherwise
#         """
#         self.logger.info(f"Finding auth identity for provider ID: {auth_provider_id}")
#         try:
#             statement = select(self.model_class).where(
#                 self.model_class.auth_provider_id == auth_provider_id
#             )
#             result = await self.session.execute(statement)
#             auth_identity = result.scalars().first()
            
#             if auth_identity:
#                 self.logger.info(
#                     f"Found auth identity for provider ID {auth_provider_id}: "
#                     f"user_profile_id={auth_identity.user_profile_id}"
#                 )
#             else:
#                 self.logger.info(f"No auth identity found for provider ID: {auth_provider_id}")
                
#             return auth_identity
#         except Exception as e:
#             self.logger.error(f"Error finding auth identity: {str(e)}")
#             self.logger.error(traceback.format_exc())
#             raise DatabaseException(f"Failed to find auth identity: {str(e)}")

#     async def find_by_user_profile_id(
#         self, user_profile_id: uuid.UUID
#     ) -> List[AuthIdentity]:
#         """
#         Find all auth identities for a user profile
        
#         Args:
#             user_profile_id: The user profile ID
            
#         Returns:
#             List of auth identities for the user
#         """
#         self.logger.info(f"Finding auth identities for user profile: {user_profile_id}")
#         try:
#             statement = select(self.model_class).where(
#                 self.model_class.user_profile_id == user_profile_id
#             )
#             result = await self.session.execute(statement)
#             results = result.scalars().all()
            
#             self.logger.info(
#                 f"Found {len(results)} auth identities for user profile: {user_profile_id}"
#             )
#             return list(results)
#         except Exception as e:
#             self.logger.error(f"Error finding auth identities: {str(e)}")
#             self.logger.error(traceback.format_exc())
#             raise DatabaseException(f"Failed to find auth identities: {str(e)}")

#     async def find_by_email_and_provider(
#         self, email: str, provider: AuthProvider
#     ) -> Optional[AuthIdentity]:
#         """
#         Find auth identity by email and provider
        
#         Args:
#             email: User's email
#             provider: Auth provider
            
#         Returns:
#             The auth identity if found
#         """
#         self.logger.info(f"Finding auth identity for {email} with provider {provider}")
#         try:
#             # Convert enum to string to avoid prepared statement issues with transaction mode
#             provider_str = provider.value if hasattr(provider, 'value') else str(provider)
#             statement = select(self.model_class).where(
#                 self.model_class.email == email,
#                 self.model_class.provider == provider_str
#             )
#             result = await self.session.execute(statement)
#             auth_identity = result.scalars().first()
            
#             if auth_identity:
#                 self.logger.info(f"Found auth identity for {email}/{provider}")
#             else:
#                 self.logger.info(f"No auth identity found for {email}/{provider}")
                
#             return auth_identity
#         except Exception as e:
#             self.logger.error(f"Error finding auth identity: {str(e)}")
#             self.logger.error(traceback.format_exc())
#             raise DatabaseException(f"Failed to find auth identity: {str(e)}")

#     async def create_identity(
#         self,
#         user_profile_id: uuid.UUID,
#         auth_provider_id: uuid.UUID,
#         provider: AuthProvider,
#         email: str
#     ) -> AuthIdentity:
#         """
#         Create a new auth identity mapping
        
#         Args:
#             user_profile_id: The user profile ID
#             auth_provider_id: The auth provider's user ID
#             provider: The auth provider type
#             email: The user's email
            
#         Returns:
#             The created auth identity
#         """
#         self.logger.info(
#             f"Creating auth identity: user={user_profile_id}, "
#             f"provider={provider}, auth_id={auth_provider_id}"
#         )
        
#         # Convert enum to string to avoid prepared statement issues with transaction mode
#         provider_str = provider.value if hasattr(provider, 'value') else str(provider)
#         identity_data = {
#             "user_profile_id": user_profile_id,
#             "auth_provider_id": auth_provider_id,
#             "provider": provider_str,
#             "email": email
#         }
        
#         try:
#             identity = await self.create(identity_data)
#             self.logger.info(
#                 f"Successfully created auth identity {identity.id} "
#                 f"for user {user_profile_id}"
#             )
#             return identity
#         except Exception as e:
#             self.logger.error(f"Failed to create auth identity: {str(e)}")
#             self.logger.error(traceback.format_exc())
#             raise DatabaseException(f"Failed to create auth identity: {str(e)}")

#     async def update_last_used(self, identity_id: uuid.UUID) -> None:
#         """
#         Update the last_used_at timestamp for an identity
        
#         Args:
#             identity_id: The identity ID to update
#         """
#         try:
#             from datetime import datetime, timezone
#             await self.update(str(identity_id), {"last_used_at": datetime.now(timezone.utc)})
#             self.logger.info(f"Updated last_used_at for identity {identity_id}")
#         except Exception as e:
#             # Don't fail auth if we can't update timestamp
#             self.logger.warning(f"Failed to update last_used_at: {str(e)}")