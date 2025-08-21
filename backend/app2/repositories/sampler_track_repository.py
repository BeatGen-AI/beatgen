"""
Repository for SamplerTrack models - Stateless implementation
"""

from typing import List, Optional, Dict, Any
import uuid
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app2.core.logging import get_repository_logger

from app2.models.track_models.sampler_track import SamplerTrack

logger = get_repository_logger("SamplerTrack")


class SamplerTrackRepository:
    """Stateless repository for sampler track operations"""

    @staticmethod
    async def create(session: AsyncSession, track_data: Dict[str, Any]) -> SamplerTrack:
        """Create a new sampler track"""
        try:
            sampler_track = SamplerTrack(**track_data)
            session.add(sampler_track)
            await session.flush()  # Flush to get ID but don't commit
            return sampler_track
        except Exception as e:
            logger.error(f"Error creating sampler track: {str(e)}")
            raise

    @staticmethod
    async def get(session: AsyncSession, track_id: uuid.UUID) -> Optional[SamplerTrack]:
        """Get a sampler track by ID"""
        query = select(SamplerTrack).where(SamplerTrack.id == track_id)
        result = await session.execute(query)
        return result.scalars().first()

    @staticmethod
    async def get_by_user_id(session: AsyncSession, user_id: uuid.UUID) -> List[SamplerTrack]:
        """Get all sampler tracks for a specific user"""
        query = select(SamplerTrack).where(SamplerTrack.user_id == user_id)
        result = await session.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_by_user_id_paginated(
        session: AsyncSession, user_id: uuid.UUID, skip: int, limit: int
    ) -> tuple[List[SamplerTrack], int]:
        """Get paginated sampler tracks for a specific user."""
        # Query for items with joined relationships
        items_query = (
            select(SamplerTrack)
            .options(joinedload(SamplerTrack.drum_track))
            .where(SamplerTrack.user_id == user_id)
            .offset(skip)
            .limit(limit)
        )
        items_result = await session.execute(items_query)
        items = items_result.scalars().unique().all()

        # Query for total count
        count_query = (
            select(func.count(SamplerTrack.id))
            .select_from(SamplerTrack)
            .where(SamplerTrack.user_id == user_id)
        )
        count_result = await session.execute(count_query)
        total_count = count_result.scalar_one_or_none() or 0

        return items, total_count

    @staticmethod
    async def update(session: AsyncSession, track_id: uuid.UUID, track_data: Dict[str, Any]) -> SamplerTrack:
        """Update a sampler track"""
        track = await SamplerTrackRepository.get(session, track_id)
        if track:
            for key, value in track_data.items():
                if hasattr(track, key):
                    setattr(track, key, value)
            await session.flush()
        return track

    @staticmethod
    async def delete(session: AsyncSession, track_id: uuid.UUID) -> bool:
        """Delete a sampler track"""
        track = await SamplerTrackRepository.get(session, track_id)
        if track:
            await session.delete(track)
            await session.flush()
            return True
        return False