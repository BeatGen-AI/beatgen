"""
Data Transfer Objects for Track Instance operations
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator
import uuid


class TrackInstanceCreate(BaseModel):
    """Model for creating a new track instance"""
    
    x_position: float = Field(ge=0, description="Horizontal position in ticks")
    y_position: float = Field(ge=0, description="Vertical position in pixels")
    trim_start_ticks: Optional[int] = Field(default=0, ge=0, description="Trim start in ticks")
    trim_end_ticks: Optional[int] = Field(default=None, description="Trim end in ticks")
    volume: Optional[float] = Field(default=1.0, ge=0, le=2, description="Volume level (0-2)")
    pan: Optional[float] = Field(default=0.0, ge=-1, le=1, description="Pan position (-1 to 1)")
    mute: Optional[bool] = Field(default=False, description="Mute state")
    
    @field_validator('trim_end_ticks')
    @classmethod
    def validate_trim_end(cls, v, info):
        if v is not None and hasattr(info, 'data') and 'trim_start_ticks' in info.data:
            trim_start = info.data.get('trim_start_ticks', 0)
            if v <= trim_start:
                raise ValueError('trim_end_ticks must be greater than trim_start_ticks')
        return v


class TrackInstanceUpdate(BaseModel):
    """Model for updating a track instance"""
    
    x_position: Optional[float] = Field(default=None, ge=0)
    y_position: Optional[float] = Field(default=None, ge=0)
    trim_start_ticks: Optional[int] = Field(default=None, ge=0)
    trim_end_ticks: Optional[int] = Field(default=None)
    volume: Optional[float] = Field(default=None, ge=0, le=2)
    pan: Optional[float] = Field(default=None, ge=-1, le=1)
    mute: Optional[bool] = Field(default=None)
    
    @field_validator('trim_end_ticks')
    @classmethod
    def validate_trim_end(cls, v, info):
        if v is not None and hasattr(info, 'data') and info.data.get('trim_start_ticks') is not None:
            trim_start = info.data.get('trim_start_ticks', 0)
            if v <= trim_start:
                raise ValueError('trim_end_ticks must be greater than trim_start_ticks')
        return v


class TrackInstanceRead(BaseModel):
    """Model for reading track instance data"""
    
    id: int = Field(description="Instance ID within the track")
    x_position: float = Field(description="Horizontal position in ticks")
    y_position: float = Field(description="Vertical position in pixels")
    trim_start_ticks: int = Field(description="Trim start in ticks")
    trim_end_ticks: Optional[int] = Field(description="Trim end in ticks")
    volume: float = Field(description="Volume level")
    pan: float = Field(description="Pan position")
    mute: bool = Field(description="Mute state")
    created_at: Optional[datetime] = Field(default=None, description="Instance creation time")


class PositionMetadata(BaseModel):
    """Model for position metadata structure"""
    
    instances: List[TrackInstanceRead] = Field(default_factory=list)
    next_instance_id: int = Field(default=0, ge=0)
    
    @field_validator('instances')
    @classmethod
    def validate_instances(cls, v):
        if len(v) > 100:  # Prevent DoS via too many instances
            raise ValueError('Too many instances (max 100)')
        
        # Check for duplicate instance IDs
        ids = [instance.id for instance in v]
        if len(ids) != len(set(ids)):
            raise ValueError('Duplicate instance IDs detected')
        
        return v
    
    @field_validator('next_instance_id')
    @classmethod
    def validate_next_id(cls, v, info):
        if hasattr(info, 'data') and 'instances' in info.data and info.data['instances']:
            max_id = max([inst.id for inst in info.data['instances']], default=-1)
            if v <= max_id:
                raise ValueError('next_instance_id must be greater than all existing IDs')
        return v


class TrackInstanceBatchUpdate(BaseModel):
    """Model for batch updating track instances"""
    
    track_id: uuid.UUID
    instance_id: int
    updates: TrackInstanceUpdate


class CopyTrackInstancesRequest(BaseModel):
    """Model for copying track instances"""
    
    track_id: uuid.UUID
    instance_ids: List[int] = Field(min_items=1, max_items=50)


class PasteTrackInstancesRequest(BaseModel):
    """Model for pasting track instances"""
    
    clipboard_data: Dict[str, Any]
    position_offset: Dict[str, float] = Field(default_factory=dict)
    
    @field_validator('position_offset')
    @classmethod
    def validate_position_offset(cls, v):
        # Ensure x and y are provided and are valid
        if 'x' not in v:
            v['x'] = 0.0
        if 'y' not in v:
            v['y'] = 0.0
        
        if v['x'] < 0:
            raise ValueError('x offset cannot be negative')
        if v['y'] < 0:
            raise ValueError('y offset cannot be negative')
        
        return v


class DuplicateTrackInstancesRequest(BaseModel):
    """Model for duplicating track instances"""
    
    instance_ids: List[int] = Field(min_items=1, max_items=50)
    position_offset: Dict[str, float] = Field(default_factory=lambda: {"x": 4800, "y": 0})
    
    @field_validator('position_offset')
    @classmethod
    def validate_position_offset(cls, v):
        if 'x' not in v:
            v['x'] = 4800  # Default to 1 measure offset
        if 'y' not in v:
            v['y'] = 0
        
        return v


class TrackInstanceOperationResponse(BaseModel):
    """Generic response for track instance operations"""
    
    success: bool
    message: str
    instances: Optional[List[TrackInstanceRead]] = None
    errors: Optional[List[str]] = None