"""
Storage type enum for tracking where files are stored
"""

from enum import Enum


class StorageType(str, Enum):
    """Storage type enum matching PostgreSQL enum"""
    
    USER_AUDIO = "USER_AUDIO"
    USER_SAMPLE = "USER_SAMPLE"
    PUBLIC_DRUM = "PUBLIC_DRUM"
    PUBLIC_SOUNDFONT = "PUBLIC_SOUNDFONT"
    
    @classmethod
    def from_file_type(cls, file_type: str, is_public: bool = False) -> "StorageType":
        """Get storage type from file type and public flag"""
        if file_type == "audio":
            return cls.USER_AUDIO
        elif file_type == "sample":
            return cls.USER_SAMPLE
        elif file_type == "drum":
            return cls.PUBLIC_DRUM
        elif file_type == "soundfont" or file_type == "instrument":
            return cls.PUBLIC_SOUNDFONT
        else:
            return cls.USER_AUDIO  # Default
    
    def get_bucket_and_prefix(self) -> tuple[str, str]:
        """Get the storage bucket and prefix for this storage type
        
        Note: Both USER_AUDIO and USER_SAMPLE go to tracks/audio
        This is a simplification - all user uploads go to the same place
        """
        if self == StorageType.USER_AUDIO:
            return ("tracks", "audio")
        elif self == StorageType.USER_SAMPLE:
            return ("tracks", "audio")  # Samples ALSO go to /audio, not /samples
        elif self == StorageType.PUBLIC_DRUM:
            return ("assets", "drum_samples_public")
        elif self == StorageType.PUBLIC_SOUNDFONT:
            return ("assets", "soundfonts_public")
        else:
            return ("tracks", "audio")  # Default