"""
Password validation utilities for the application.
"""

from typing import Optional
from app2.core.logging import get_logger

logger = get_logger("beatgen.utils.password_validation")

# Password validation constants
MIN_PASSWORD_LENGTH = 8


def validate_password(password: str) -> Optional[str]:
    """
    Validate a password against the application's password policy.
    
    Password requirements:
    - At least 8 characters long
    - Must contain at least 3 of the following:
      - Uppercase letters (A-Z)
      - Lowercase letters (a-z)
      - Numbers (0-9)
      - Special characters (!@#$%^&*()_+-=[]{};':"\\|,.<>/?)
    
    Args:
        password: The password to validate
        
    Returns:
        None if password is valid, or an error message string if invalid
    """
    if not password:
        return "Password is required"
    
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters long"
    
    # Check character types
    has_uppercase = any(c.isupper() for c in password)
    has_lowercase = any(c.islower() for c in password)
    has_numbers = any(c.isdigit() for c in password)
    has_special = any(c in "!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>\\/?`~" for c in password)
    
    # Count how many character types are present
    complexity_count = sum([has_uppercase, has_lowercase, has_numbers, has_special])
    
    if complexity_count < 3:
        return "Password must contain at least 3 of the following: uppercase letters, lowercase letters, numbers, and special characters"
    
    return None


def is_password_valid(password: str) -> bool:
    """
    Check if a password is valid.
    
    Args:
        password: The password to validate
        
    Returns:
        True if password is valid, False otherwise
    """
    return validate_password(password) is None