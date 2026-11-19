from supabase import create_client, Client, ClientOptions
from typing import Dict, Any, Callable
import traceback

from app2.core.config import settings
from app2.core.logging import get_logger
from app2.core.exceptions import DatabaseException

logger = get_logger("beatgen.infrastructure.supabase")

# Storage key under which the Supabase auth client keeps the PKCE code verifier of an OAuth sign-in
# (`f"{STORAGE_KEY}-code-verifier"`, STORAGE_KEY = "supabase.auth.token" in gotrue / supabase_auth).
PKCE_CODE_VERIFIER_KEY = "supabase.auth.token-code-verifier"


def new_auth_client(storage: Any = None):
    """Return a fresh Supabase auth client for one request.

    The process-wide `supabase.client` must never be used for auth calls: sign-in, sign-up, code exchange and
    `set_session` store the resulting session on the client that made the call, and every later call that relies
    on a stored session (`get_user()` with a falsy token, `update_user()`, ...) would then act as whoever
    authenticated last on that worker. A client created per request holds at most the session of the request that
    created it and is discarded afterwards. `auto_refresh_token=False` keeps it from starting a refresh timer for a
    session nobody holds any more, and `persist_session=False` keeps the session out of `storage`.

    Args:
        storage: Optional gotrue storage to use instead of a fresh in-memory one (only the OAuth start uses it, to
            keep the PKCE code verifier until the callback).
    """
    if not settings.supabase.URL or not settings.supabase.KEY:
        raise RuntimeError(
            "Supabase auth is not configured: SUPABASE_URL and SUPABASE_KEY must be set"
        )
    options = ClientOptions(auto_refresh_token=False, persist_session=False)
    if storage is not None:
        options.storage = storage
    return create_client(settings.supabase.URL, settings.supabase.KEY, options=options).auth


class SupabaseClient:
    """Client for Supabase interactions with consistent error handling"""

    _instance = None
    _client = None
    _admin_client = None

    def __new__(cls):
        """Singleton pattern to ensure only one instance exists"""
        if cls._instance is None:
            cls._instance = super(SupabaseClient, cls).__new__(cls)
            cls._initialize_client()
        return cls._instance

    @classmethod
    def _initialize_client(cls):
        """Initialize the Supabase client"""
        try:
            if not settings.supabase.URL or not settings.supabase.KEY:
                logger.critical(
                    "Supabase URL or key is missing. Please check your .env file"
                )
                logger.critical(
                    f"SUPABASE_URL: {'SET' if settings.supabase.URL else 'MISSING'}"
                )
                logger.critical(
                    f"SUPABASE_KEY: {'SET' if settings.supabase.KEY else 'MISSING'}"
                )
                # Don't crash immediately to allow for better error reporting
                # Create a dummy client that will raise appropriate errors when used
                from unittest.mock import MagicMock

                cls._client = MagicMock()
                cls._client.table.side_effect = Exception(
                    "Supabase client failed to initialize"
                )
                return

            logger.info(
                f"Initializing Supabase client with URL: {settings.supabase.URL[:20]}..."
            )
            cls._client: Client = create_client(
                settings.supabase.URL, settings.supabase.KEY
            )
            
            # Initialize admin client with service role key if available
            if settings.supabase.SERVICE_ROLE_KEY:
                try:
                    cls._admin_client: Client = create_client(
                        settings.supabase.URL, settings.supabase.SERVICE_ROLE_KEY
                    )
                    logger.info("Supabase admin client initialized successfully")
                except Exception as admin_error:
                    logger.error(f"Failed to initialize admin client: {str(admin_error)}")
                    logger.error(f"Service role key format: {settings.supabase.SERVICE_ROLE_KEY[:20]}...")
                    cls._admin_client = None
            else:
                logger.warning("No service role key provided - admin operations will not be available")
                cls._admin_client = None
                
            logger.info("Supabase client initialized successfully")
        except Exception as e:
            logger.critical(f"Failed to initialize Supabase client: {str(e)}")
            logger.critical(traceback.format_exc())
            # Create a dummy client that will raise appropriate errors when used
            from unittest.mock import MagicMock

            cls._client = MagicMock()
            cls._client.table.side_effect = Exception(
                "Supabase client failed to initialize"
            )

    @property
    def client(self) -> Client:
        """Get the Supabase client instance"""
        return self._client
    
    @property
    def admin_client(self) -> Client:
        """Get the Supabase admin client instance with service role key"""
        if self._admin_client is None:
            raise Exception("Admin client not available - service role key not configured")
        return self._admin_client

    def table(self, table_name: str):
        """Get a table reference"""
        return self._client.table(table_name)

    def storage(self):
        """Get the storage client"""
        return self._client.storage

    def verify_token(self, token: str) -> Dict[str, Any]:
        """Verify a Supabase JWT token with the Supabase Auth API and return the user info.

        The token must be non-empty: gotrue's `get_user()` treats a falsy token as "use the stored session".
        The call is made on a fresh auth client that holds no session, so it can only ever check this token.
        """
        if not isinstance(token, str) or not token.strip():
            raise DatabaseException("Authentication error: missing bearer token")
        try:
            logger.info(f"Verifying token: {token[:10]}...")
            user_response = new_auth_client().get_user(token)

            if user_response is None or user_response.user is None:
                logger.error("No user found for provided token")
                raise DatabaseException("Invalid authentication token")

            # Log successful authentication
            logger.info(f"Successfully authenticated user: {user_response.user.id}")

            # Return user ID from Supabase
            return {"id": user_response.user.id}
        except Exception as e:
            logger.error(f"Authentication error: {str(e)}")
            logger.error(f"Token: {token[:10]}...")
            logger.error(traceback.format_exc())
            raise DatabaseException(f"Authentication error: {str(e)}")

    def execute_query(self, table_name: str, query_builder: Callable):
        """
        Execute a query using a function that builds upon a table reference

        Args:
            table_name: The name of the table
            query_builder: A function that takes a table reference and returns a query

        Returns:
            The query result data

        Raises:
            DatabaseException: If the query fails
        """
        try:
            table_ref = self.table(table_name)
            query = query_builder(table_ref)
            response = query.execute()

            if hasattr(response, "error") and response.error:
                error_message = (
                    response.error.message
                    if hasattr(response.error, "message")
                    else str(response.error)
                )
                logger.error(f"Database query error: {error_message}")
                raise DatabaseException(f"Database query failed: {error_message}")

            return response.data
        except Exception as e:
            if isinstance(e, DatabaseException):
                raise
            logger.error(f"Database error: {str(e)}")
            logger.error(traceback.format_exc())
            raise DatabaseException(f"Database operation failed: {str(e)}")


# Create a global instance
supabase = SupabaseClient()
