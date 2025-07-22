from typing import Dict, Any
from fastapi import Depends, HTTPException, status
from app2.api.dependencies import get_current_user
from app2.core.logging import get_logger

logger = get_logger("beatgen.api.admin_dependencies")

# Admin user IDs - must match frontend/src/utils/adminUtils.ts
ADMIN_USER_IDS = [
    'b9c0588e-cd7c-4a3f-9bd9-a6f6dcc321ff',
    # Add more admin user IDs here as needed
]


async def require_admin_user(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Dependency that requires admin privileges.
    
    Args:
        current_user: The current authenticated user from get_current_user
        
    Returns:
        The current user info if they are an admin
        
    Raises:
        HTTPException: If the user is not an admin (403 Forbidden)
    """
    user_id = current_user.get("id")
    
    if not user_id:
        logger.warning("Admin access attempted without user ID in token")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required: User ID not found"
        )
    
    if user_id not in ADMIN_USER_IDS:
        logger.warning(f"Non-admin user {user_id} attempted admin access")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required: Insufficient privileges"
        )
    
    logger.info(f"Admin access granted for user {user_id}")
    return current_user


def is_admin_user(user_id: str) -> bool:
    """
    Check if a user ID is in the admin list.
    
    Args:
        user_id: The user ID to check
        
    Returns:
        True if the user is an admin, False otherwise
    """
    return user_id in ADMIN_USER_IDS