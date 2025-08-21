"""
Repository for DrumTrack models - Stateless implementation
"""

from typing import List, Optional, Dict, Any
import uuid
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app2.core.logging import get_repository_logger

from app2.models.track_models.drum_track import DrumTrack

logger = get_repository_logger("DrumTrack")


class DrumTrackRepository:
    """Stateless repository for drum track operations"""

    @staticmethod
    async def create(session: AsyncSession, track_data: Dict[str, Any]) -> DrumTrack:
        """Create a new drum track"""
        try:
            drum_track = DrumTrack(**track_data)
            session.add(drum_track)
            await session.flush()  # Flush to get ID but don't commit
            # Reload with relationships
            return await DrumTrackRepository.get(session, drum_track.id)
        except Exception as e:
            logger.error(f"Error creating drum track: {str(e)}")
            raise

    @staticmethod
    async def get(session: AsyncSession, track_id: uuid.UUID) -> Optional[DrumTrack]:
        """Get a drum track by ID"""
        query = (
            select(DrumTrack)
            .options(selectinload(DrumTrack.sampler_tracks))
            .where(DrumTrack.id == track_id)
        )
        result = await session.execute(query)
        return result.scalars().first()

    @staticmethod
    async def get_by_user_id(session: AsyncSession, user_id: uuid.UUID) -> List[DrumTrack]:
        """Get all drum tracks for a specific user"""
        query = (
            select(DrumTrack)
            .options(selectinload(DrumTrack.sampler_tracks))
            .where(DrumTrack.user_id == user_id)
        )
        result = await session.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_by_user_id_paginated(
        session: AsyncSession, user_id: uuid.UUID, skip: int, limit: int
    ) -> tuple[List[DrumTrack], int]:
        """Get paginated drum tracks for a specific user."""
        # Query for items with joined relationships
        items_query = (
            select(DrumTrack)
            .options(selectinload(DrumTrack.sampler_tracks))
            .where(DrumTrack.user_id == user_id)
            .offset(skip)
            .limit(limit)
        )
        items_result = await session.execute(items_query)
        items = items_result.scalars().unique().all()

        # Query for total count
        count_query = (
            select(func.count(DrumTrack.id))
            .select_from(DrumTrack)
            .where(DrumTrack.user_id == user_id)
        )
        count_result = await session.execute(count_query)
        total_count = count_result.scalar_one_or_none() or 0

        return items, total_count

    @staticmethod
    async def update(session: AsyncSession, track_id: uuid.UUID, track_data: Dict[str, Any]) -> DrumTrack:
        """Update a drum track"""
        track = await DrumTrackRepository.get(session, track_id)
        if track:
            for key, value in track_data.items():
                if hasattr(track, key):
                    setattr(track, key, value)
            await session.flush()
            # Reload with relationships
            return await DrumTrackRepository.get(session, track_id)
        return track

    @staticmethod
    async def delete(session: AsyncSession, track_id: uuid.UUID) -> bool:
        """Delete a drum track"""
        track = await DrumTrackRepository.get(session, track_id)
        if track:
            await session.delete(track)
            await session.flush()
            return True
        return False