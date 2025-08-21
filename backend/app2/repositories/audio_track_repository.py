"""
Repository for AudioTrack models - Stateless implementation
"""

from typing import List, Dict, Any
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, func
from app2.core.logging import get_repository_logger

from app2.models.track_models.audio_track import AudioTrack

logger = get_repository_logger("AudioTrack")


class AudioTrackRepository:
    """Stateless repository for audio track operations"""

    @staticmethod
    async def create(session: AsyncSession, track_data: Dict[str, Any]) -> AudioTrack:
        """Create a new audio track"""
        try:
            audio_track = AudioTrack(**track_data)
            session.add(audio_track)
            await session.flush()  # Flush to get ID but don't commit
            return audio_track
        except Exception as e:
            logger.error(f"Error creating audio track: {str(e)}")
            raise

    @staticmethod
    async def get(session: AsyncSession, track_id: uuid.UUID) -> AudioTrack:
        """Get an audio track by ID"""
        query = select(AudioTrack).where(AudioTrack.id == track_id)
        result = await session.execute(query)
        return result.scalars().first()

    @staticmethod
    async def get_by_user_id(session: AsyncSession, user_id: uuid.UUID) -> List[AudioTrack]:
        """Get all audio tracks for a specific user"""
        query = select(AudioTrack).where(AudioTrack.user_id == user_id)
        result = await session.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_by_user_id_paginated(
        session: AsyncSession, user_id: uuid.UUID, skip: int, limit: int
    ) -> tuple[List[AudioTrack], int]:
        """Get paginated audio tracks for a specific user."""
        # Query for items
        items_query = (
            select(AudioTrack)
            .where(AudioTrack.user_id == user_id)
            .order_by(AudioTrack.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        items_result = await session.execute(items_query)
        items = items_result.scalars().all()

        # Query for total count
        count_query = (
            select(func.count(AudioTrack.id))
            .select_from(AudioTrack)
            .where(AudioTrack.user_id == user_id)
        )
        count_result = await session.execute(count_query)
        total_count = count_result.scalar_one_or_none() or 0

        return items, total_count

    @staticmethod
    async def update(session: AsyncSession, track_id: uuid.UUID, track_data: Dict[str, Any]) -> AudioTrack:
        """Update an audio track"""
        track = await AudioTrackRepository.get(session, track_id)
        if track:
            for key, value in track_data.items():
                if hasattr(track, key):
                    setattr(track, key, value)
            await session.flush()
        return track

    @staticmethod
    async def delete(session: AsyncSession, track_id: uuid.UUID) -> bool:
        """Delete an audio track"""
        track = await AudioTrackRepository.get(session, track_id)
        if track:
            await session.delete(track)
            await session.flush()
            return True
        return False
