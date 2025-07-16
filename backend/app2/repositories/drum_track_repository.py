"""
Repository for DrumTrack models
"""

from typing import List
import uuid
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app2.models.track_models.drum_track import (
    DrumTrack,
)
from app2.repositories.base_repository import BaseRepository


class DrumTrackRepository(BaseRepository[DrumTrack]):
    """Repository for drum track operations"""

    def __init__(self, session: AsyncSession):
        super().__init__(DrumTrack, session)

    async def get(self, track_id: uuid.UUID) -> DrumTrack:
        """Get a drum track by ID"""
        query = select(DrumTrack).where(DrumTrack.id == track_id)
        result = await self.session.execute(query)
        return result.scalars().first()

    async def get_by_user_id(self, user_id: uuid.UUID) -> List[DrumTrack]:
        """Get all drum tracks for a specific user"""
        query = select(DrumTrack).where(DrumTrack.user_id == user_id)
        result = await self.session.execute(query)
        return result.scalars().all()

    async def get_by_user_id_paginated(
        self, user_id: uuid.UUID, skip: int, limit: int
    ) -> tuple[List[DrumTrack], int]:
        """Get paginated drum tracks for a specific user."""
        # Query for items with joined relationships
        items_query = (
            select(DrumTrack)
            .options(joinedload(DrumTrack.sampler_tracks))
            .where(DrumTrack.user_id == user_id)
            .offset(skip)
            .limit(limit)
        )
        items_result = await self.session.execute(items_query)
        items = items_result.scalars().unique().all()

        # Query for total count
        count_query = (
            select(func.count(DrumTrack.id))
            .select_from(DrumTrack)
            .where(DrumTrack.user_id == user_id)
        )
        count_result = await self.session.execute(count_query)
        total_count = count_result.scalar_one_or_none() or 0

        return items, total_count
