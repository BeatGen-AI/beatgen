"""
Storage type literal type for use in Pydantic models
This avoids duplicate enum definitions in generated TypeScript
"""

from typing import Literal

# Define the literal type for storage types
StorageTypeLiteral = Literal[
    "USER_AUDIO",
    "USER_SAMPLE", 
    "PUBLIC_DRUM",
    "PUBLIC_SOUNDFONT"
]

# Default values for each model type
DEFAULT_USER_AUDIO = "USER_AUDIO"
DEFAULT_USER_SAMPLE = "USER_SAMPLE"
DEFAULT_PUBLIC_DRUM = "PUBLIC_DRUM"
DEFAULT_PUBLIC_SOUNDFONT = "PUBLIC_SOUNDFONT"