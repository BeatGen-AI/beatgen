"""
ProjectTrack repository for database operations using SQLModel
Handles operations on the project-track join table with the new track model structure
"""

from typing import Dict, Any, List, Optional, TYPE_CHECKING
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
import traceback
from datetime import datetime
import uuid
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from sqlalchemy.orm import selectinload

from app2.core.exceptions import DatabaseException, NotFoundException
from app2.core.logging import get_repository_logger
from app2.models.project_track import ProjectTrack
from app2.types.track_types import TrackType


class ProjectTrackRepository:
    """Repository for project-track relationship operations"""

    def __init__(self, session: AsyncSession):
        """
        Initialize the repository with database session

        Args:
            session: The async SQLModel session for database operations
        """
        self.session = session
        self.logger = get_repository_logger("project_track")

    async def get_by_project_id(self, project_id: uuid.UUID) -> List[ProjectTrack]:
        """
        Get all project-track associations for a project with all relationships loaded

        Args:
            project_id: The ID of the project

        Returns:
            List of project-track associations with all relationships loaded

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Getting project-tracks for project {project_id}")
        try:
            from sqlalchemy.orm import selectinload
            
            from app2.models.track_models.midi_track import MidiTrack
            from app2.models.track_models.drum_track import DrumTrack
            
            statement = (
                select(ProjectTrack)
                .options(
                    selectinload(ProjectTrack.audio_track),
                    selectinload(ProjectTrack.midi_track).selectinload(MidiTrack.instrument_file),
                    selectinload(ProjectTrack.sampler_track),
                    selectinload(ProjectTrack.drum_track).selectinload(DrumTrack.sampler_tracks)
                )
                .where(ProjectTrack.project_id == project_id)
            )
            result = await self.session.execute(statement)
            results = result.scalars().all()

            self.logger.info(
                f"Found {len(results)} project-tracks for project {project_id}"
            )
            return results
        except Exception as e:
            self.logger.error(f"Error getting project-tracks: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to get project-tracks: {str(e)}")

    async def get_by_track(
        self, track_type: TrackType, track_id: uuid.UUID
    ) -> List[ProjectTrack]:
        """
        Get all project-track associations for a track by its type and ID

        Args:
            track_type: The type of the track (AUDIO, MIDI, SAMPLER, DRUM)
            track_id: The ID of the track

        Returns:
            List of project-track associations

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Getting project-tracks for {track_type} track {track_id}")
        try:
            # Select based on track_id and track_type
            statement = (
                select(ProjectTrack)
                .options(
                    selectinload(ProjectTrack.audio_track),
                    selectinload(ProjectTrack.midi_track),
                    selectinload(ProjectTrack.sampler_track),
                    selectinload(ProjectTrack.drum_track)
                )
                .where(
                    ProjectTrack.track_type == track_type,
                    ProjectTrack.track_id == track_id
                )
            )

            result = await self.session.execute(statement)
            results = result.scalars().all()

            self.logger.info(
                f"Found {len(results)} project-tracks for {track_type} track {track_id}"
            )
            return results
        except Exception as e:
            self.logger.error(f"Error getting project-tracks: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to get project-tracks: {str(e)}")

    async def get_by_project_and_track(
        self, project_id: uuid.UUID, track_type: TrackType, track_id: uuid.UUID
    ) -> Optional[ProjectTrack]:
        """
        Get a project-track association by project ID and track details

        Args:
            project_id: The ID of the project
            track_type: The type of the track
            track_id: The ID of the track

        Returns:
            The project-track association if found, None otherwise

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(
            f"Getting project-track for project {project_id} and {track_type} track {track_id}"
        )
        try:
            from sqlalchemy.orm import selectinload
            
            # Select based on project_id, track_id and track_type
            statement = (
                select(ProjectTrack)
                .options(
                    selectinload(ProjectTrack.audio_track),
                    selectinload(ProjectTrack.midi_track),
                    selectinload(ProjectTrack.sampler_track),
                    selectinload(ProjectTrack.drum_track)
                )
                .where(
                    ProjectTrack.project_id == project_id,
                    ProjectTrack.track_type == track_type,
                    ProjectTrack.track_id == track_id,
                )
            )

            result = await self.session.execute(statement)
            result = result.scalars().first()

            if result:
                self.logger.info(
                    f"Found project-track for project {project_id} and {track_type} track {track_id}"
                )
            else:
                self.logger.info(
                    f"No project-track found for project {project_id} and {track_type} track {track_id}"
                )

            return result
        except Exception as e:
            self.logger.error(f"Error getting project-track: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to get project-track: {str(e)}")

    async def create(self, project_track_data: Dict[str, Any]) -> ProjectTrack:
        """
        Create a new project-track association with duplicate handling

        Args:
            project_track_data: The project-track data (must include project_id, track_type,
                                and the appropriate track_id field based on track_type)

        Returns:
            The created project-track association

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Creating new project-track: {project_track_data}")
        try:
            # Validate required fields
            if (
                "project_id" not in project_track_data
                or "track_type" not in project_track_data
                or "track_id" not in project_track_data
            ):
                raise ValueError("project_id, track_type, and track_id are required")

            # Create project-track instance
            project_track = ProjectTrack(**project_track_data)

            # Add to session and commit
            self.session.add(project_track)
            await self.session.commit()
            await self.session.refresh(project_track)

            self.logger.info(
                f"Created project-track for project {project_track.project_id}"
            )
            return project_track
        except IntegrityError as e:
            await self.session.rollback()
            # Handle duplicate key constraint violation
            if "duplicate key value violates unique constraint" in str(e):
                self.logger.info(f"ProjectTrack already exists, attempting update instead")
                # Try to update the existing record instead
                return await self.update(
                    project_track_data["project_id"],
                    project_track_data["track_type"],
                    project_track_data["track_id"],
                    project_track_data
                )
            else:
                self.logger.error(f"Integrity constraint violation: {str(e)}")
                raise DatabaseException(f"Constraint violation: {str(e)}")
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error creating project-track: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to create project-track: {str(e)}")

    async def update(
        self,
        project_id: uuid.UUID,
        track_type: TrackType,
        track_id: uuid.UUID,
        project_track_data: Dict[str, Any],
    ) -> ProjectTrack:
        """
        Update a project-track association

        Args:
            project_id: The ID of the project
            track_type: The type of the track
            track_id: The ID of the track
            project_track_data: The updated data

        Returns:
            The updated project-track association

        Raises:
            NotFoundException: If the project-track association is not found
            DatabaseException: If there's a database error
        """
        self.logger.info(
            f"Updating project-track for project {project_id} and {track_type} track {track_id}"
        )
        try:
            # Get existing project-track
            project_track = await self.get_by_project_and_track(
                project_id, track_type, track_id
            )

            if not project_track:
                self.logger.error(
                    f"Project-track not found for project {project_id} and {track_type} track {track_id}"
                )
                raise NotFoundException(
                    "ProjectTrack",
                    f"project_id={project_id}, track_type={track_type}, track_id={track_id}",
                )

            # Don't allow changing project_id, track_type, or track_id
            protected_fields = ["project_id", "track_type", "track_id"]
            for field in protected_fields:
                if field in project_track_data:
                    del project_track_data[field]

            # Update fields
            for key, value in project_track_data.items():
                if hasattr(project_track, key):
                    setattr(project_track, key, value)

            # Update timestamp if it exists
            if hasattr(project_track, "updated_at"):
                project_track.updated_at = datetime.utcnow()

            # Commit changes
            self.session.add(project_track)
            await self.session.commit()
            await self.session.refresh(project_track)

            self.logger.info(
                f"Updated project-track for project {project_id} and {track_type} track {track_id}"
            )
            return project_track
        except Exception as e:
            await self.session.rollback()
            if isinstance(e, NotFoundException):
                raise
            self.logger.error(f"Error updating project-track: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to update project-track: {str(e)}")

    async def delete(
        self, project_id: uuid.UUID, track_type: TrackType, track_id: uuid.UUID
    ) -> bool:
        """
        Delete a project-track association

        Args:
            project_id: The ID of the project
            track_type: The type of the track
            track_id: The ID of the track

        Returns:
            True if successful, False if the association doesn't exist

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(
            f"Deleting project-track for project {project_id} and {track_type} track {track_id}"
        )
        try:
            # Get existing project-track
            project_track = await self.get_by_project_and_track(
                project_id, track_type, track_id
            )

            if not project_track:
                self.logger.info(
                    f"Project-track not found for project {project_id} and {track_type} track {track_id}"
                )
                return False

            # Delete from database
            self.session.delete(project_track)
            await self.session.commit()

            self.logger.info(
                f"Deleted project-track for project {project_id} and {track_type} track {track_id}"
            )
            return True
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error deleting project-track: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to delete project-track: {str(e)}")

    async def delete_by_project_id(self, project_id: uuid.UUID) -> int:
        """
        Delete all project-track associations for a project

        Args:
            project_id: The ID of the project

        Returns:
            The number of associations deleted

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Deleting all project-tracks for project {project_id}")
        try:
            # Get all associations for this project
            project_tracks = await self.get_by_project_id(project_id)

            # Delete all associations
            for pt in project_tracks:
                self.session.delete(pt)

            # Commit changes
            await self.session.commit()

            self.logger.info(
                f"Deleted {len(project_tracks)} project-tracks for project {project_id}"
            )
            return len(project_tracks)
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error deleting project-tracks: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to delete project-tracks: {str(e)}")

    async def delete_by_track(self, track_type: TrackType, track_id: uuid.UUID) -> int:
        """
        Delete all project-track associations for a track

        Args:
            track_type: The type of the track
            track_id: The ID of the track

        Returns:
            The number of associations deleted

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(
            f"Deleting all project-tracks for {track_type} track {track_id}"
        )
        try:
            # Get all associations for this track
            project_tracks = await self.get_by_track(track_type, track_id)

            # Delete all associations
            for pt in project_tracks:
                self.session.delete(pt)

            # Commit changes
            await self.session.commit()

            self.logger.info(
                f"Deleted {len(project_tracks)} project-tracks for {track_type} track {track_id}"
            )
            return len(project_tracks)
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error deleting project-tracks: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to delete project-tracks: {str(e)}")

    async def upsert(self, project_track_data: Dict[str, Any]) -> ProjectTrack:
        """
        Insert or update project-track association using PostgreSQL UPSERT

        Args:
            project_track_data: The project-track data including all fields

        Returns:
            The created or updated project-track association

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Upserting project-track: {project_track_data}")
        try:
            # Validate required fields
            if (
                "project_id" not in project_track_data
                or "track_type" not in project_track_data
                or "track_id" not in project_track_data
            ):
                raise ValueError("project_id, track_type, and track_id are required")

            # Use raw SQL for PostgreSQL ON CONFLICT
            query = text("""
                INSERT INTO project_tracks 
                (created_at, updated_at, project_id, track_id, track_type, name, volume, pan, mute, 
                 duration_ticks, track_number, instance_metadata)
                VALUES 
                (:created_at, :updated_at, :project_id, :track_id, :track_type, :name, :volume, :pan, :mute,
                 :duration_ticks, :track_number, :instance_metadata)
                ON CONFLICT (project_id, track_id) 
                DO UPDATE SET
                    updated_at = EXCLUDED.updated_at,
                    track_type = EXCLUDED.track_type,
                    name = EXCLUDED.name,
                    volume = EXCLUDED.volume,
                    pan = EXCLUDED.pan,
                    mute = EXCLUDED.mute,
                    duration_ticks = EXCLUDED.duration_ticks,
                    track_number = EXCLUDED.track_number,
                    instance_metadata = EXCLUDED.instance_metadata
                RETURNING *
            """)
            
            # Prepare data with defaults for missing fields
            from datetime import datetime
            current_time = datetime.utcnow()
            
            # Handle instance_metadata - convert to JSON if needed
            import json
            instance_metadata = project_track_data.get("instance_metadata")
            if instance_metadata is not None:
                if isinstance(instance_metadata, list):
                    # Always store lists as JSON, even if empty
                    instance_metadata = json.dumps(instance_metadata)
                else:
                    # If not a list, log error and raise exception
                    self.logger.error(f"instance_metadata is not a list: {type(instance_metadata)} - {instance_metadata}")
                    raise ValueError(f"instance_metadata must be a list, got {type(instance_metadata)}")
            else:
                # If None, store as empty list
                instance_metadata = json.dumps([])
            
            upsert_data = {
                "created_at": current_time,
                "updated_at": current_time,
                "project_id": project_track_data["project_id"],
                "track_id": project_track_data["track_id"],
                "track_type": project_track_data["track_type"],
                "name": project_track_data.get("name", "Unnamed Track"),
                "volume": project_track_data.get("volume", 1.0),
                "pan": project_track_data.get("pan", 0.0),
                "mute": project_track_data.get("mute", False),
                "duration_ticks": project_track_data.get("duration_ticks", 0),
                "track_number": project_track_data.get("track_number", 0),
                "instance_metadata": instance_metadata,
            }
            
            result = await self.session.execute(query, upsert_data)
            await self.session.commit()
            
            # Convert result to ProjectTrack object
            row = result.fetchone()
            if row:
                project_track = ProjectTrack(**dict(row._mapping))
                self.logger.info(f"Upserted project-track for project {project_track.project_id}")
                return project_track
            else:
                raise DatabaseException("Upsert operation did not return a result")
                
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error upserting project-track: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to upsert project-track: {str(e)}")

    async def upsert_many(self, project_tracks_data: List[Dict[str, Any]]) -> List[ProjectTrack]:
        """
        Batch upsert for multiple project-track associations

        Args:
            project_tracks_data: List of project-track data dictionaries

        Returns:
            List of created or updated project-track associations

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Batch upserting {len(project_tracks_data)} project-tracks")
        try:
            results = []
            for project_track_data in project_tracks_data:
                result = await self.upsert(project_track_data)
                results.append(result)
            
            self.logger.info(f"Successfully upserted {len(results)} project-tracks")
            return results
            
        except Exception as e:
            self.logger.error(f"Error in batch upsert: {str(e)}")
            raise DatabaseException(f"Failed to batch upsert project-tracks: {str(e)}") from e

    async def delete_by_track_ids(self, project_id: uuid.UUID, track_ids: List[uuid.UUID]) -> int:
        """
        Delete project-track associations for specific track IDs within a project

        Args:
            project_id: The ID of the project
            track_ids: List of track IDs to remove from the project

        Returns:
            The number of associations deleted

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Deleting project-tracks for tracks {track_ids} in project {project_id}")
        try:
            # Get associations to delete
            statement = select(ProjectTrack).where(
                ProjectTrack.project_id == project_id,
                ProjectTrack.track_id.in_(track_ids)
            )
            result = await self.session.execute(statement)
            project_tracks = result.scalars().all()
            
            # Delete all associations
            for pt in project_tracks:
                self.session.delete(pt)
            
            # Commit changes
            await self.session.commit()
            
            self.logger.info(
                f"Deleted {len(project_tracks)} project-tracks for project {project_id}"
            )
            return len(project_tracks)
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error deleting project-tracks by track IDs: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to delete project-tracks: {str(e)}")


    async def get_track_with_settings(
        self, project_id: uuid.UUID
    ) -> List[ProjectTrack]:
        """
        Get all tracks with their project-specific settings for a project
        All relationships are eagerly loaded to prevent greenlet errors

        Args:
            project_id: The ID of the project

        Returns:
            List of ProjectTrack objects with all relationships loaded

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Getting tracks with settings for project {project_id}")
        try:
            # Get all project-track associations with all relationships loaded
            project_tracks = await self.get_by_project_id(project_id)
            
            self.logger.info(f"Successfully loaded {len(project_tracks)} project tracks with relationships")
            return project_tracks
        except Exception as e:
            self.logger.error(f"Error getting tracks with settings: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to get tracks with settings: {str(e)}")
