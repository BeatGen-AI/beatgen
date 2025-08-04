from typing import Dict, Any, Optional
import traceback
import uuid
import httpx
import hashlib
import os

from fastapi import Request, Response

from app2.core.logging import get_service_logger
from app2.core.exceptions import UnauthorizedException, ServiceException, ValidationException, NotFoundException
from app2.infrastructure.database.supabase_client import supabase
from app2.infrastructure.jwt_verifier import jwt_verifier
from app2.repositories.user_repository import UserRepository
from app2.models.user import User
from app2.core.config import settings
from app2.services.credits_service import credits_service

logger = get_service_logger("auth")


class AuthService:
    """Service for authentication operations"""

    def __init__(self, user_repository: UserRepository):
        """
        Initialize the service with repositories

        Args:
            user_repository: The repository for user operations
        """
        self.user_repository = user_repository
        
        logger.info("🔐 AUTH SYSTEM: Native Supabase auth enabled")
        logger.info("   ✅ Using public.users.id = auth.users.id")
        logger.info("   🚀 Suitable for multi-server deployment")

    async def create_user(
        self,
        email: str,
        password: str,
        username: Optional[str] = None,
        display_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Register a new user account

        Args:
            email: User's email address
            password: User's password
            username: Optional username
            display_name: Optional display name

        Returns:
            Dict with access_token, token_type, and user_id

        Raises:
            ServiceException: If registration fails
        """
        logger.info(f"Creating new user with email: {email}")
        try:
            # Register user with Supabase Auth
            auth_response = supabase.client.auth.sign_up({
                "email": email, 
                "password": password
            })

            if not auth_response.user:
                logger.error("No user returned from Supabase sign_up")
                raise ServiceException("Failed to create user account")

            user_id = auth_response.user.id
            logger.info(f"User created with Supabase Auth ID: {user_id}")

            # Create user profile using the Supabase Auth ID directly
            try:
                user_profile = await self.user_repository.create_profile(
                    user_id=uuid.UUID(user_id),
                    email=email,
                    username=username,
                    display_name=display_name,
                )
                logger.info(
                    f"User profile created in public table for User ID: {user_id}"
                )
                
                # Initialize user credits for new user
                await credits_service.initialize_user_credits(user_profile, tier="free")
                logger.info(f"User credits initialized for User ID: {user_id}")
            except Exception as repo_err:
                logger.error(
                    f"Failed to create profile for User ID {user_id}: {repo_err}",
                    exc_info=True,
                )
                raise ServiceException(f"Failed to save user profile: {repo_err}")

            # Return token and user info
            if auth_response.session:
                return {
                    "access_token": auth_response.session.access_token,
                    "token_type": "bearer",
                    "user_id": user_id,
                }
            else:
                return {"access_token": "", "token_type": "bearer", "user_id": user_id}
        except Exception as e:
            logger.error(f"Failed to create user: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"User registration failed: {str(e)}")

    async def login_user(self, email_or_username: str, password: str) -> Dict[str, Any]:
        """
        Authenticate user with email/username and password

        Args:
            email_or_username: User's email address or username
            password: User's password

        Returns:
            Dict with access_token, token_type, and user_id

        Raises:
            UnauthorizedException: If credentials are invalid
            ServiceException: If login fails due to other reasons
        """
        logger.info(f"Authenticating user with: {email_or_username}")
        
        # Determine if login is with email or username
        # Basic check: if it contains '@', assume it's an email.
        # More robust validation could be added here (e.g., regex for email).
        is_email = "@" in email_or_username
        
        login_payload = {}
        if is_email:
            login_payload["email"] = email_or_username
            logger.info(f"Attempting login with email: {email_or_username}")
        else:
            # If it's a username, we first need to get the email associated with it.
            # This assumes Supabase Auth primarily uses email for sign_in_with_password.
            # If Supabase supports direct username login, this logic would change.
            logger.info(f"Attempting login with username: {email_or_username}. Looking up email.")
            try:
                user_profile = await self.user_repository.get_user_by_username(username=email_or_username)
                if not user_profile or not user_profile.email:
                    logger.error(f"No user found with username: {email_or_username} or email is missing.")
                    raise UnauthorizedException("Invalid username or password")
                login_payload["email"] = user_profile.email
                logger.info(f"Found email {user_profile.email} for username {email_or_username}")
            except Exception as e:
                logger.error(f"Error fetching user by username {email_or_username}: {str(e)}")
                raise UnauthorizedException("Invalid username or password")

        login_payload["password"] = password

        try:
            # Sign in with Supabase Auth using the determined email
            auth_response = supabase.client.auth.sign_in_with_password(login_payload)

            # Extract user data
            if not auth_response.user:
                logger.error("No user returned from Supabase sign_in")
                raise UnauthorizedException("Invalid email or password")

            user_id = auth_response.user.id
            email = auth_response.user.email
            logger.info(f"User authenticated with ID: {user_id}")
            
            # Return token and user info
            return {
                "access_token": auth_response.session.access_token,
                "token_type": "bearer",
                "user_id": user_id,
            }
        except Exception as e:
            logger.error(f"Failed to authenticate user: {str(e)}")
            logger.error(traceback.format_exc())
            if "invalid" in str(e).lower() or "not found" in str(e).lower():
                raise UnauthorizedException("Invalid email or password")
            raise ServiceException(f"Authentication failed: {str(e)}")

    async def send_password_reset(self, email: str, redirect_to: Optional[str] = None) -> bool:
        """
        Send password reset email

        Args:
            email: User's email address
            redirect_to: Optional URL to redirect to after password reset

        Returns:
            True if email was sent successfully

        Raises:
            ServiceException: If operation fails
        """
        logger.info(f"Sending password reset email to: {email}")
        try:
            # Prepare options with redirect URL if provided
            options = {}
            if redirect_to:
                options['redirect_to'] = redirect_to
                logger.info(f"Password reset will redirect to: {redirect_to}")
            else:
                # Default redirect to frontend reset password page
                default_redirect = f"{settings.app.FRONTEND_BASE_URL}/reset-password"
                options['redirect_to'] = default_redirect
                logger.info(f"Using default redirect: {default_redirect}")
            
            # Use Supabase Auth to send password reset email
            supabase.client.auth.reset_password_email(email, options)
            logger.info(f"Password reset email sent to: {email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send password reset email: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to send password reset email: {str(e)}")

    async def verify_token(self, token: str, use_jwt_verification: bool = None) -> Dict[str, Any]:
        """
        Verify a JWT token and get the user info

        Args:
            token: The JWT token to verify
            use_jwt_verification: Whether to use local JWT verification (faster) or Supabase API

        Returns:
            The user info from the token

        Raises:
            UnauthorizedException: If the token is invalid
        """
        logger.debug(f"Verifying token: {token[:10]}...")
        
        # Default to JWT verification (can be overridden with env var AUTH_USE_JWT_VERIFICATION=false)
        if use_jwt_verification is None:
            use_jwt_verification = os.getenv("AUTH_USE_JWT_VERIFICATION", "true").lower() == "true"
        
        try:
            if use_jwt_verification:
                try:
                    # Try local JWT verification first (much faster)
                    logger.info("🔐 Attempting local JWT verification")
                    user_info = await jwt_verifier.verify_token(token)
                    logger.info(f"⚡ JWT VERIFIED LOCALLY for user: {user_info['id']} (fast path)")
                    return user_info
                except Exception as jwt_error:
                    # If JWT verification fails (e.g., JWKS not available), fall back to API
                    logger.warning(f"🔄 JWT verification failed, FALLING BACK to Supabase API: {str(jwt_error)[:100]}")
                    logger.info("🐌 Using Supabase API verification (slow path)")
                    user_info = supabase.verify_token(token)
                    logger.info(f"✅ SUPABASE API verified token for user: {user_info['id']} (fallback successful)")
                    return user_info
            else:
                # Direct Supabase API verification
                logger.info("🐌 Using Supabase API verification (JWT disabled)")
                user_info = supabase.verify_token(token)
                logger.info(f"✅ SUPABASE API verified token for user: {user_info['id']} (direct API)")
                return user_info
            
        except Exception as e:
            logger.error(f"Token verification failed: {str(e)}")
            logger.error(traceback.format_exc())
            raise UnauthorizedException(f"Invalid token: {str(e)}")

    async def get_current_user(self, token: str) -> Dict[str, Any]:
        """
        Get the current user from a token

        Args:
            token: The JWT token

        Returns:
            The user info with the canonical user ID

        Raises:
            UnauthorizedException: If the token is invalid
        """
        # Verify the JWT token and get user info
        user_info = await self.verify_token(token)
        
        # With native Supabase auth, the auth.users.id = public.users.id
        # So we can use the auth ID directly as the canonical user ID
        auth_id = user_info.get("id")
        user_email = user_info.get("email", "unknown")
        logger.info(f"🚀 NATIVE AUTH: User {user_email} (id: {auth_id}) using native Supabase auth")
        
        user_info["canonical_user_id"] = auth_id
        
        return user_info

    async def create_user_profile(
        self,
        user_id: str,
        email: str,
        username: Optional[str] = None,
        display_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new user profile in the database

        Args:
            user_id: The ID of the user
            email: The user's email
            username: The user's username (optional)
            display_name: The user's display name (optional)

        Returns:
            The created profile

        Raises:
            ServiceException: If the operation fails
        """
        logger.info(f"Creating user profile for user ID: {user_id}")
        try:
            profile = await self.user_repository.create_profile(
                uuid.UUID(user_id), email, username, display_name
            )
            logger.info(f"Created user profile for user ID: {user_id}")
            return profile
        except Exception as e:
            logger.error(f"Error creating user profile: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to create user profile: {str(e)}")

    async def get_google_auth_url(self, response: Response) -> str:
        """
        Generate the Google OAuth URL (using PKCE flow managed by the client library).

        Args:
            response: The outgoing FastAPI response object (no longer used for cookies here)

        Returns:
            The URL to redirect the user to for Google authentication

        Raises:
            ServiceException: If the URL cannot be generated
        """
        try:
            logger.info("Generating Google OAuth URL (PKCE handled by library)")

            # Define the backend callback URL where Google will send the code
            backend_callback_url = f"{settings.app.BASE_URL}/auth/callback/google"
            logger.info(
                f"[Service] Using callback URL: {backend_callback_url} (from settings.app.BASE_URL: {settings.app.BASE_URL})"
            )

            # Let Supabase handle PKCE entirely - no custom implementation needed
            logger.info("Using Supabase's built-in PKCE handling")

            # Use Supabase client to get the OAuth URL.
            auth_response = supabase.client.auth.sign_in_with_oauth(
                {
                    "provider": "google",
                    "options": {
                        "redirect_to": backend_callback_url,
                        "scopes": "openid email profile",  # Request standard scopes
                    },
                }
            )

            if not auth_response or not auth_response.url:
                logger.error("Supabase sign_in_with_oauth did not return a valid URL.")
                raise ServiceException(
                    "Failed to generate Google OAuth URL from Supabase."
                )

            # No need to store PKCE verifier - Supabase handles this internally

            generated_url = auth_response.url
            logger.info(f"Generated OAuth URL: {generated_url[:30]}...")
            return generated_url

        except Exception as e:
            logger.error(f"Failed to generate Google OAuth URL: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to generate Google OAuth URL: {str(e)}")

    async def check_username_availability(self, username: str) -> bool:
        """
        Check if a username is available
        
        Args:
            username: The username to check
            
        Returns:
            True if available, False if taken
        """
        try:
            existing_user = await self.user_repository.find_by_username(username)
            return existing_user is None
        except Exception as e:
            logger.error(f"Error checking username availability: {str(e)}")
            return False

    async def complete_profile(self, user_id: uuid.UUID, username: str) -> User:
        """
        Complete a user's profile by setting their username
        
        Args:
            user_id: The user's ID
            username: The username to set
            
        Returns:
            The updated user profile
            
        Raises:
            ValidationException: If username is invalid
            ServiceException: If operation fails
        """
        try:
            # Validate username format
            if not username or len(username) < 3:
                raise ValidationException("Username must be at least 3 characters long")
            if len(username) > 30:
                raise ValidationException("Username must be 30 characters or less")
            if not username.replace("_", "").isalnum():
                raise ValidationException("Username can only contain letters, numbers, and underscores")
            
            # Check if username is already taken
            existing_user = await self.user_repository.find_by_username(username)
            if existing_user:
                raise ValidationException("Username is already taken")
            
            # Update the user's profile with the username
            return await self.user_repository.update_profile(
                user_id=user_id,
                profile_data={"username": username}
            )
        except (ValidationException, NotFoundException) as e:
            raise
        except Exception as e:
            logger.error(f"Error completing profile: {str(e)}")
            raise ServiceException(f"Failed to complete profile: {str(e)}")


    async def check_profile_complete(self, user_id: uuid.UUID) -> bool:
        """
        Check if a user's profile is complete (has username set)
        
        Args:
            user_id: The user's ID
            
        Returns:
            True if profile is complete (has username), False otherwise
        """
        try:
            user = await self.user_repository.get_profile(user_id)
            return user.username is not None
        except NotFoundException:
            return False
        except Exception as e:
            logger.error(f"Error checking profile completion: {str(e)}")
            raise ServiceException(f"Failed to check profile status: {str(e)}")

    async def updateUser(self, password: str) -> bool:
        """
        Update user with password (standard Supabase pattern)
        
        This is the standard Supabase method for adding email/password authentication 
        to an OAuth account: updateUser({ password: 'validpassword' })
        
        Args:
            password: The password to set
            
        Returns:
            True if successful
        """
        try:
            logger.info("Updating user with password using Supabase updateUser method")
            
            # Use Supabase's native updateUser method
            supabase.client.auth.update_user({
                "password": password
            })
            
            logger.info("Password updated successfully using updateUser method")
            return True
                
        except Exception as e:
            logger.error(f"Error in updateUser: {str(e)}")
            raise ServiceException(f"Failed to update user: {str(e)}")
    
    async def add_password_to_oauth_user(
        self, user_id: str, password: str, access_token: str
    ) -> bool:
        """
        Add email/password auth to a user who signed up with OAuth
        
        Note: This allows the user to sign in with email/password, but Supabase
        will still show the original provider (e.g., 'google') in the dashboard.
        This is expected behavior - Supabase tracks the original signup method.
        
        Args:
            user_id: The user's ID
            password: The password to set
            access_token: The user's current session access token
            
        Returns:
            True if successful
        """
        try:
            logger.info(f"Adding password auth to user {user_id}")
            
            # Use Supabase's native updateUser method - more secure than HTTP calls
            supabase.client.auth.update_user({
                "password": password
            })
            
            logger.info("Password set successfully - user can now sign in with email/password")
            return True
                
        except Exception as e:
            logger.error(f"Error adding password auth: {str(e)}")
            raise ServiceException(f"Failed to add password: {str(e)}")

    async def update_password_with_token(
        self, user_id: str, password: str, access_token: str
    ) -> bool:
        """
        Update password using a recovery token from password reset email
        
        Args:
            user_id: The user's ID
            password: The new password
            access_token: The recovery token from the password reset email
            
        Returns:
            True if successful
        """
        try:
            logger.info(f"Updating password for user {user_id} with recovery token")
            
            # Use Supabase's native updateUser method with recovery token
            # The recovery token should be set as the session token
            supabase.client.auth.update_user({
                "password": password
            })
            
            logger.info("Password updated successfully")
            return True
                
        except Exception as e:
            logger.error(f"Error updating password: {str(e)}")
            raise ServiceException(f"Failed to update password: {str(e)}")


    async def handle_google_callback(
        self, code: str, request: Request, response: Response
    ) -> Dict[str, Any]:
        """
        Handle the callback from Google OAuth (PKCE handled by library).

        Args:
            code: The authorization code from Google
            request: The incoming FastAPI request object (no longer used for cookies here)
            response: The outgoing FastAPI response object (no longer used for cookies here)

        Returns:
            Dict with access_token, token_type, and user_id

        Raises:
            ServiceException: If the authentication fails
        """
        logger.info(f"Handling Google OAuth callback with code: {code[:10]}...")

        try:
            logger.info("Handling Google OAuth callback (PKCE handled by library)")

            # Use Supabase's built-in session exchange (no custom PKCE needed)
            logger.info("Exchanging code for session using Supabase's built-in flow...")
            auth_response = supabase.client.auth.exchange_code_for_session( # type: ignore
                {"auth_code": code}
            )
            logger.info("Code exchanged successfully.")

            # No cookie cleanup needed - Supabase handles PKCE internally


            if not auth_response.user: # type: ignore
                logger.error("No user returned from Google OAuth after code exchange.")
                raise UnauthorizedException(
                    "Google authentication failed: Could not retrieve user session."
                )

            session_user_id = (
                auth_response.user.id
            )  # The Supabase Auth ID for this session
            email = auth_response.user.email or ""
            logger.info(
                f"Successfully exchanged code. Supabase Auth ID: {session_user_id}, Email: {email}"
            )

            logger.info(f"Ensuring profile exists for User ID: {session_user_id}")
            try:
                user_metadata = auth_response.user.user_metadata
                full_name = ""
                if isinstance(user_metadata, dict):
                    full_name = user_metadata.get("full_name", "")
                elif user_metadata:
                    logger.warning(
                        f"Unexpected type for user_metadata for user {session_user_id}: {type(user_metadata)}. Value: {user_metadata}"
                    )
                
                # With native Supabase auth, check if user profile already exists
                # If not, create it using the Supabase auth ID directly
                try:
                    existing_user = await self.user_repository.get_profile(session_user_id)
                    logger.info(f"Profile already exists for User ID: {session_user_id}")
                except NotFoundException:
                    # Create new user profile - convert string ID to UUID
                    user_profile = await self.user_repository.create_profile(
                        user_id=uuid.UUID(session_user_id),
                        email=email,
                        username=None,
                        display_name=full_name
                    )
                    logger.info(f"Created new profile for User ID: {session_user_id}")
                    
                    # Initialize user credits for new user
                    await credits_service.initialize_user_credits(user_profile, tier="free")
                    logger.info(f"User credits initialized for User ID: {session_user_id}")
                
            except Exception as create_err:
                logger.error(
                    f"Failed to create/ensure profile for User ID {session_user_id}: {create_err}",
                    exc_info=True,
                )
                raise ServiceException(f"Failed to save user profile: {create_err}")

            # Return token and user info as dict
            logger.info(
                f"handle_google_callback successful for {session_user_id}. Returning token info."
            )
            return {
                "access_token": auth_response.session.access_token,
                "token_type": "bearer",
                "user_id": session_user_id,  # Return the Supabase Auth ID
            }

        except Exception as e:
            logger.error(f"Google authentication failed in service: {str(e)}")
            logger.error(traceback.format_exc())
            # Reraise to be caught by API layer
            if isinstance(e, UnauthorizedException) or isinstance(e, ServiceException):
                raise e
            else:
                raise ServiceException(f"Google authentication failed: {str(e)}")
