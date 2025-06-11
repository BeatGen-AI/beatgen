"""
Test-specific dependencies that bypass authentication for testing purposes.
These should only be used in test environments.
"""

from typing import Dict, Any
from app2.core.config import settings
from app2.core.logging import get_logger

logger = get_logger("beatgen.api.test_dependencies")

# Test user to use for all test operations
TEST_USER = {
    "id": "b9c0588e-cd7c-4a3f-9bd9-a6f6dcc321ff",
    "email": "test@example.com",
    "name": "Test User"
}

async def get_test_user() -> Dict[str, Any]:
    """
    Get a test user for testing purposes.
    This bypasses all authentication and returns a mock user.
    
    WARNING: This should NEVER be used in production!
    """
    if settings.app.APP_ENV == "prod":
        raise RuntimeError("Test authentication bypass cannot be used in production!")
    
    logger.info(f"Using test user bypass for testing: {TEST_USER['id']}")
    return TEST_USER


def get_current_user_for_testing():
    """
    Returns the test user dependency function.
    This can be used to override the normal auth dependency in tests.
    """
    return get_test_user