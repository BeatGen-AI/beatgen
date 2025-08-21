"""
Repository for MidiTrack models - Stateless implementation
"""

from typing import List, Optional, Dict, Any
import uuid
from sqlmodel import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app2.core.logging import get_repository_logger

from app2.models.track_models.midi_track import MidiTrack

logger = get_repository_logger("MidiTrack")


class MidiTrackRepository:
    """Stateless repository for midi track operations"""

    @staticmethod
    async def create(session: AsyncSession, track_data: Dict[str, Any]) -> MidiTrack:
        """Create a new midi track"""
        try:
            midi_track = MidiTrack(**track_data)
            session.add(midi_track)
            await session.flush()  # Flush to get ID but don't commit
            # Reload with relationships
            return await MidiTrackRepository.get(session, midi_track.id)
        except Exception as e:
            logger.error(f"Error creating midi track: {str(e)}")
            raise

    @staticmethod
    async def get(session: AsyncSession, midi_track_id: uuid.UUID) -> Optional[MidiTrack]:
        """Get a midi track by ID"""
        query = (
            select(MidiTrack)
            .options(selectinload(MidiTrack.instrument_file))
            .where(MidiTrack.id == midi_track_id)
        )
        result = await session.execute(query)
        return result.scalars().first()

    @staticmethod
    async def get_by_user_id(session: AsyncSession, user_id: uuid.UUID) -> List[MidiTrack]:
        """Get all midi tracks for a specific user"""
        query = (
            select(MidiTrack)
            .options(selectinload(MidiTrack.instrument_file))
            .where(MidiTrack.user_id == user_id)
        )
        result = await session.execute(query)
        return result.scalars().all()

    @staticmethod
    async def get_by_user_id_paginated(
        session: AsyncSession, user_id: uuid.UUID, skip: int, limit: int
    ) -> tuple[List[MidiTrack], int]:
        """Get paginated midi tracks for a specific user."""
        # Query for items with joined relationship
        items_query = (
            select(MidiTrack)
            .options(selectinload(MidiTrack.instrument_file))
            .where(MidiTrack.user_id == user_id)
            .offset(skip)
            .limit(limit)
        )
        items_result = await session.execute(items_query)
        items = items_result.scalars().unique().all()

        # Query for total count
        count_query = (
            select(func.count(MidiTrack.id))
            .select_from(MidiTrack)
            .where(MidiTrack.user_id == user_id)
        )
        count_result = await session.execute(count_query)
        total_count = count_result.scalar_one_or_none() or 0

        return items, total_count

    @staticmethod
    async def update(session: AsyncSession, track_id: uuid.UUID, track_data: Dict[str, Any]) -> MidiTrack:
        """Update a midi track"""
        track = await MidiTrackRepository.get(session, track_id)
        if track:
            for key, value in track_data.items():
                if hasattr(track, key):
                    setattr(track, key, value)
            await session.flush()
            # Reload with relationships
            return await MidiTrackRepository.get(session, track_id)
        return track

    @staticmethod
    async def delete(session: AsyncSession, track_id: uuid.UUID) -> bool:
        """Delete a midi track"""
        track = await MidiTrackRepository.get(session, track_id)
        if track:
            await session.delete(track)
            await session.flush()
            return True
        return False