"""
Repository for AudioTrack models
"""

from typing import List
import uuid
from sqlmodel import Session, select, func

from app2.models.track_models.audio_track import (
    AudioTrack,
)
from app2.repositories.base_repository import BaseRepository


class AudioTrackRepository(BaseRepository[AudioTrack]):
    """Repository for audio track operations"""

    def __init__(self, session: Session):
        super().__init__(AudioTrack, session)

    async def get(self, track_id: uuid.UUID) -> AudioTrack:
        """Get an audio track by ID"""
        query = select(AudioTrack).where(AudioTrack.id == track_id)
        return self.session.exec(query).first()

    async def get_by_user_id(self, user_id: uuid.UUID) -> List[AudioTrack]:
        """Get all audio tracks for a specific user"""
        query = select(AudioTrack).where(AudioTrack.user_id == user_id)
        return self.session.exec(query).all()

    async def get_by_user_id_paginated(
        self, user_id: uuid.UUID, skip: int, limit: int
    ) -> tuple[List[AudioTrack], int]:
        """Get paginated audio tracks for a specific user."""
        # Query for items
        items_query = (
            select(AudioTrack)
            .where(AudioTrack.user_id == user_id)
            .offset(skip)
            .limit(limit)
        )
        items = self.session.exec(items_query).all()

        # Query for total count
        # Ensure the count is performed on a unique, non-nullable column if possible, e.g., AudioTrack.id
        count_query = (
            select(func.count(AudioTrack.id))
            .select_from(AudioTrack)
            .where(AudioTrack.user_id == user_id)
        )
        total_count = self.session.exec(count_query).one_or_none() or 0 # Use one_or_none() and default to 0

        return items, total_count
