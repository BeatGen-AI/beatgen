"""
Assistant message models for storing chat history in the database
"""

from typing import Optional
from sqlmodel import Field, Column
from sqlalchemy.dialects.postgresql import JSONB, ENUM
from sqlalchemy import TIMESTAMP
from datetime import datetime
import uuid
from pydantic import BaseModel
from enum import Enum

from app2.models.base import DefaultUUIDStandardBase


class GenerationStep(str, Enum):
    """Enum for different generation steps in music creation"""
    RESEARCH_MUSICAL_CONTEXT = "RESEARCH_MUSICAL_CONTEXT"
    DETERMINE_MUSICAL_PARAMS = "DETERMINE_MUSICAL_PARAMS"
    DETERMINE_MUSICAL_PARAMS_TOOL = "DETERMINE_MUSICAL_PARAMS_TOOL"
    INSTRUMENT_SELECTION = "INSTRUMENT_SELECTION"
    INSTRUMENT_SELECTION_TOOL = "INSTRUMENT_SELECTION_TOOL"
    DRUM_SELECTION = "DRUM_SELECTION"
    DRUM_SELECTION_TOOL = "DRUM_SELECTION_TOOL"
    DRUM_BEAT_GENERATION_TOOL = "DRUM_BEAT_GENERATION_TOOL"
    CHORD_GENERATION_TOOL = "CHORD_GENERATION_TOOL"
    MELODY_GENERATION_TOOL = "MELODY_GENERATION_TOOL"
    COMPLETE = "COMPLETE"


class AssistantMessage(DefaultUUIDStandardBase, table=True):
    """
    Model for storing assistant chat messages and responses.
    
    This table stores both user messages and assistant responses,
    distinguished by the 'role' field.
    """
    
    __tablename__ = "assistant_messages"
    
    # Foreign key to project
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    
    # Optional link to request manager for assistant messages
    request_id: Optional[str] = Field(default=None, max_length=255)
    
    # Message role: 'user' or 'assistant'
    role: str = Field(max_length=20)
    
    # Message content (the actual text)
    content: Optional[str] = Field(default=None)
    
    # Mode when message was sent ('generate', 'edit', 'chat', 'generate-audio')
    mode: Optional[str] = Field(default=None, max_length=50)
    
    # Generation step (only for generate mode messages)
    step: Optional[GenerationStep] = Field(default=None, sa_column=Column(ENUM(GenerationStep, name="generation_step")))
    
    # JSON metadata for storing complex data (events, actions, etc.)
    message_metadata: dict = Field(default_factory=dict, sa_column=Column(JSONB))
    
    # When the assistant finished responding (for assistant messages)
    completed_at: Optional[datetime] = Field(default=None, sa_type=TIMESTAMP(timezone=True))


# API Models for responses

class AssistantMessageRead(BaseModel):
    """API response model for assistant message data"""
    
    id: uuid.UUID
    project_id: uuid.UUID
    request_id: Optional[str] = None
    role: str
    content: Optional[str] = None
    mode: Optional[str] = None
    step: Optional[GenerationStep] = None
    message_metadata: dict = {}
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


