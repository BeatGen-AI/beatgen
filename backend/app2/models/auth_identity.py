"""
SQLModel for auth_identities table
"""
from sqlmodel import SQLModel, Field
from datetime import datetime, timezone
from typing import Optional
import uuid
from enum import Enum
from sqlalchemy import TIMESTAMP, Column


class AuthProvider(str, Enum):
    """Supported authentication providers"""
    EMAIL = "email"
    GOOGLE = "google"
    GITHUB = "github"
    FACEBOOK = "facebook"


class AuthIdentityBase(SQLModel):
    """Base model for auth identity"""
    user_profile_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    auth_provider_id: uuid.UUID = Field(unique=True)
    provider: AuthProvider
    email: str = Field(index=True)
    last_used_at: Optional[datetime] = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True))
    )


class AuthIdentity(AuthIdentityBase, table=True):
    """Auth identity model for database"""
    __tablename__ = "auth_identities"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(TIMESTAMP(timezone=True))
    )


class AuthIdentityCreate(SQLModel):
    """Model for creating auth identity"""
    user_profile_id: uuid.UUID
    auth_provider_id: uuid.UUID
    provider: AuthProvider
    email: str


class AuthIdentityRead(AuthIdentityBase):
    """Model for reading auth identity"""
    id: uuid.UUID
    created_at: datetime


class AuthIdentityUpdate(SQLModel):
    """Model for updating auth identity"""
    last_used_at: Optional[datetime] = None