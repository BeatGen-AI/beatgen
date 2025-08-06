"""
Soundfont models for SQL database
"""

from typing import TYPE_CHECKING, List
from sqlalchemy import Column, Enum
from sqlmodel import Field, Relationship

from app2.models.base import InstrumentFileBase
from app2.models.enums.storage_type_literal import StorageTypeLiteral, DEFAULT_PUBLIC_SOUNDFONT

if TYPE_CHECKING:
    from app2.models.track_models.midi_track import MidiTrack


# Database model
class InstrumentFile(InstrumentFileBase, table=True):
    """Instrument model for the database"""

    __tablename__ = "instrument_files"
    
    storage_type: StorageTypeLiteral = Field(
        default=DEFAULT_PUBLIC_SOUNDFONT,
        sa_column=Column(
            Enum(
                "USER_AUDIO", "USER_SAMPLE", "PUBLIC_DRUM", "PUBLIC_SOUNDFONT",
                name="storagetype",  # Match the database enum name (no underscore)
                create_type=False
            ),
            nullable=False,
            default=DEFAULT_PUBLIC_SOUNDFONT
        )
    )

    # Relationship with specialized track models
    midi_tracks: List["MidiTrack"] = Relationship(back_populates="instrument_file")


# API Models
class InstrumentFileRead(InstrumentFileBase):
    """API response model for instrument file data"""

    pass
