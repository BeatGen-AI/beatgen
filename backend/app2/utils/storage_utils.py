"""
Utility functions for storage bucket and path resolution
"""

from typing import Tuple, Optional
from app2.models.enums.storage_type import StorageType


def get_storage_location(file_type: str = "audio", is_public: bool = False) -> Tuple[str, str]:
    """
    Get the bucket name and prefix for a given file type
    Simplified: All user audio files go to tracks/audio
    
    Args:
        file_type: The type of file (audio, soundfont, etc.)
        is_public: Whether the file is publicly accessible
        
    Returns:
        Tuple of (bucket_name, prefix)
    """
    # Public soundfonts still get their own location
    if file_type == "soundfont" or file_type == "instrument":
        return ("public", "soundfonts")  # Changed from assets to public
    
    # Public drum samples
    if file_type == "drum_sample" or (is_public and file_type == "audio"):
        return ("public", "drum_samples")  # Changed from assets to public
    
    # Everything else (all user audio including samples) goes to tracks/audio
    return ("tracks", "audio")


def get_storage_location_from_type(storage_type: StorageType) -> Tuple[str, str]:
    """
    Get the bucket name and prefix from a StorageType enum
    
    Args:
        storage_type: The StorageType enum value
        
    Returns:
        Tuple of (bucket_name, prefix)
    """
    return storage_type.get_bucket_and_prefix()


def get_full_storage_path(file_type: str, relative_path: str, is_public: bool = False) -> str:
    """
    Get the full storage path for a file
    
    Args:
        file_type: The type of file
        relative_path: The relative path within the storage location
        is_public: Whether the file is publicly accessible
        
    Returns:
        The full storage path including prefix
    """
    _, prefix = get_storage_location(file_type, is_public)
    
    if prefix:
        return f"{prefix}/{relative_path}"
    return relative_path