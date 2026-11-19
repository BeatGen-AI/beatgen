"""
Sampler Track model for SQL database
"""

from typing import List, Optional, TYPE_CHECKING, Dict
from sqlalchemy import Column, Enum
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship
import uuid

from app2.models.base import TrackBase, all_optional
from app2.models.enums.storage_type_literal import StorageTypeLiteral, DEFAULT_USER_SAMPLE

# Handle circular imports
if TYPE_CHECKING:
    from app2.models.user import User
    from app2.models.project_track import ProjectTrack
    from app2.models.track_models.drum_track import DrumTrack


class SamplerTrackBase(TrackBase):
    """Base model for sampler tracks"""

    base_midi_note: int
    grain_size: float
    overlap: float
    audio_storage_key: str
    audio_file_format: str
    audio_file_size: int
    audio_file_name: str
    audio_file_duration: float
    audio_file_sample_rate: int
    storage_type: StorageTypeLiteral = Field(
        default=DEFAULT_USER_SAMPLE,
        sa_column=Column(
            Enum(
                "USER_AUDIO", "USER_SAMPLE", "PUBLIC_DRUM", "PUBLIC_SOUNDFONT",
                name="storagetype",  # Use the existing enum type in the database
                create_type=False
            ),
            nullable=False,
            default=DEFAULT_USER_SAMPLE
        )
    )
    midi_notes_json: Dict = Field(default_factory=dict, sa_column=Column(JSONB))
    waveform_data: Optional[List[float]] = Field(default=None, sa_column=Column(JSONB))


# Database model
class SamplerTrack(SamplerTrackBase, table=True):
    """Sampler Track model for the database"""

    __tablename__ = "sampler_tracks"

    # Explicitly define the primary key. Like the audio, MIDI and drum track ids it carries no foreign key:
    # project_tracks is a many-to-many link with the composite primary key (project_id, track_id), so
    # track_id alone is not unique and cannot be referenced (it made create_all fail on a fresh database).
    # The project_tracks relationship below joins with explicit primaryjoin/foreign_keys instead.
    id: uuid.UUID = Field(primary_key=True)

    # User relationship
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    user: Optional["User"] = Relationship(back_populates="sampler_tracks")

    drum_track_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="drum_tracks.id", index=True
    )
    drum_track: Optional["DrumTrack"] = Relationship(back_populates="sampler_tracks")

    # Relationships to project tracks
    project_tracks: list["ProjectTrack"] = Relationship(
        back_populates="sampler_track",
        sa_relationship_kwargs={
            "primaryjoin": "and_(ProjectTrack.track_id == SamplerTrack.id, ProjectTrack.track_type == 'sampler')",
            "foreign_keys": "[ProjectTrack.track_id]",
            "overlaps": "project_tracks",
        },
    )


# API Models
class SamplerTrackRead(SamplerTrackBase):
    """API response model for sampler track data"""

    id: uuid.UUID
    drum_track_id: Optional[uuid.UUID] = Field(default=None)


class SamplerTrackCreate(SamplerTrackBase):
    """API request model for creating a sampler track"""

    id: uuid.UUID
    drum_track_id: Optional[uuid.UUID] = Field(default=None)


class SamplerTrackUpdate(all_optional(SamplerTrackBase, "SamplerTrackUpdate")):
    """API request model for updating a sampler track"""

    id: uuid.UUID
    drum_track_id: Optional[uuid.UUID] = Field(default=None)
