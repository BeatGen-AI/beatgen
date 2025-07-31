"""
Link table model for the many-to-many relationship between Projects and Track types
"""

from typing import Optional, TYPE_CHECKING
import uuid
from sqlmodel import Field, Relationship
from sqlalchemy import Column, Enum as SAEnum, Index
from pydantic import ConfigDict
from datetime import datetime

from app2.models.base import ProjectTrackBase, all_optional
from app2.types.track_types import TrackType

# Handle circular imports
if TYPE_CHECKING:
    from .project import Project
    from .track_models.audio_track import AudioTrack
    from .track_models.midi_track import MidiTrack
    from .track_models.sampler_track import SamplerTrack
    from .track_models.drum_track import DrumTrack


# Database model
class ProjectTrack(ProjectTrackBase, table=True):
    """
    Represents the association between a Project and a specific track type,
    storing properties specific to this relationship (e.g., position, volume).
    """

    __tablename__ = "project_tracks"
    __table_args__ = (
        # Critical indexes for polymorphic join performance
        Index("idx_project_tracks_track_type", "track_type"),
        Index("idx_project_tracks_project_id", "project_id"),
        Index("idx_project_tracks_composite", "project_id", "track_type"),
        Index("idx_project_tracks_track_lookup", "track_id", "track_type"),
    )

    # Basic identification fields
    project_id: uuid.UUID = Field(
        default=None, foreign_key="projects.id", primary_key=True
    )

    # We need a composite primary key but can't use foreign keys for each track type
    # as the foreign key would depend on track_type
    track_id: uuid.UUID = Field(default=None, primary_key=True)

    # Relationships
    project: Optional["Project"] = Relationship(
        back_populates="project_tracks",
        sa_relationship_kwargs={"foreign_keys": "[ProjectTrack.project_id]"},
    )

    # Define explicit join conditions for each track type relationship
    audio_track: Optional["AudioTrack"] = Relationship(
        back_populates="project_tracks",
        sa_relationship_kwargs={
            "primaryjoin": "and_(ProjectTrack.track_id == AudioTrack.id, ProjectTrack.track_type == 'AUDIO')",
            "foreign_keys": "[ProjectTrack.track_id]",
            "overlaps": "midi_track, sampler_track, drum_track, project_tracks",
        },
    )

    midi_track: Optional["MidiTrack"] = Relationship(
        back_populates="project_tracks",
        sa_relationship_kwargs={
            "primaryjoin": "and_(ProjectTrack.track_id == MidiTrack.id, ProjectTrack.track_type == 'MIDI')",
            "foreign_keys": "[ProjectTrack.track_id]",
            "overlaps": "audio_track, sampler_track, drum_track, project_tracks",
        },
    )

    sampler_track: Optional["SamplerTrack"] = Relationship(
        back_populates="project_tracks",
        sa_relationship_kwargs={
            "primaryjoin": "and_(ProjectTrack.track_id == SamplerTrack.id, ProjectTrack.track_type == 'SAMPLER')",
            "foreign_keys": "[ProjectTrack.track_id]",
            "overlaps": "audio_track, midi_track, drum_track, project_tracks",
        },
    )

    drum_track: Optional["DrumTrack"] = Relationship(
        back_populates="project_tracks",
        sa_relationship_kwargs={
            "primaryjoin": "and_(ProjectTrack.track_id == DrumTrack.id, ProjectTrack.track_type == 'DRUM')",
            "foreign_keys": "[ProjectTrack.track_id]",
            "overlaps": "audio_track,midi_track,project_tracks,sampler_track",
        },
    )


# API Models
class ProjectTrackRead(ProjectTrackBase):
    """Base DTO for Project-Track relationships"""

    model_config = ConfigDict(
        extra='forbid',  # Don't allow extra fields
        arbitrary_types_allowed=False,  # Stricter type checking
        json_encoders={
            datetime: lambda dt: dt.isoformat() + "Z"
        }
    )

    project_id: uuid.UUID
    track_id: uuid.UUID


class ProjectTrackCreate(ProjectTrackBase):
    """Model for creating a new project-track relationship"""

    model_config = ConfigDict(
        extra='forbid',
        arbitrary_types_allowed=False,
        json_encoders={
            datetime: lambda dt: dt.isoformat() + "Z"
        }
    )

    project_id: uuid.UUID
    track_id: uuid.UUID


class ProjectTrackUpdate(all_optional(ProjectTrackRead, "ProjectTrackUpdate")):
    """Model for updating project-track settings"""

    model_config = ConfigDict(
        extra='forbid',
        arbitrary_types_allowed=False,
        json_encoders={
            datetime: lambda dt: dt.isoformat() + "Z"
        }
    )

    track_id: uuid.UUID
    project_id: uuid.UUID
