"""
Database model for distributed request management
"""
from datetime import datetime
from enum import Enum
from typing import Dict, Any, Optional
from sqlmodel import SQLModel, Field, Column, Text, JSON
from uuid import uuid4, UUID


class RequestStatus(str, Enum):
    """Status of an assistant request"""
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    TIMED_OUT = "TIMED_OUT"


class DistributedRequest(SQLModel, table=True):
    """Database model for distributed request storage"""
    __tablename__ = "distributed_requests"
    
    # Primary key
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    
    # Request identification
    request_id: str = Field(unique=True, index=True)
    user_id: str = Field(index=True)
    
    # Request details
    status: RequestStatus = Field(default=RequestStatus.PENDING, index=True)
    mode: str
    prompt: str = Field(sa_column=Column(Text))
    model: str
    track_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        arbitrary_types_allowed = True