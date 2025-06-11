"""
ProjectTrack repository for database operations using SQLModel
Handles operations on the project-track join table with the new track model structure
"""

from typing import Dict, Any, List, Optional
from sqlmodel import Session, select
import traceback
from datetime import datetime
import uuid
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text

from app2.core.exceptions import DatabaseException, NotFoundException
from app2.core.logging import get_repository_logger
from app2.models.project_track import ProjectTrack
from app2.types.track_types import TrackType
from app2.dto.track_instances_dto import (
    TrackInstanceCreate, 
    TrackInstanceUpdate, 
    TrackInstanceRead,
    PositionMetadata
)


class ProjectTrackRepository:
    """Repository for project-track relationship operations"""

    def __init__(self, session: Session):
        """
        Initialize the repository with database session

        Args:
            session: The SQLModel session for database operations
        """
        self.session = session
        self.logger = get_repository_logger("project_track")

    async def get_by_project_id(self, project_id: uuid.UUID) -> List[ProjectTrack]:
        """
        Get all project-track associations for a project

        Args:
            project_id: The ID of the project

        Returns:
            List of project-track associations

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Getting project-tracks for project {project_id}")
        try:
            statement = select(ProjectTrack).where(
                ProjectTrack.project_id == project_id
            )
            results = self.session.exec(statement).all()

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
            statement = select(ProjectTrack).where(
                ProjectTrack.track_type == track_type, ProjectTrack.track_id == track_id
            )

            results = self.session.exec(statement).all()

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
            # Select based on project_id, track_id and track_type
            statement = select(ProjectTrack).where(
                ProjectTrack.project_id == project_id,
                ProjectTrack.track_type == track_type,
                ProjectTrack.track_id == track_id,
            )

            result = self.session.exec(statement).first()

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
            self.session.commit()
            self.session.refresh(project_track)

            self.logger.info(
                f"Created project-track for project {project_track.project_id}"
            )
            return project_track
        except IntegrityError as e:
            self.session.rollback()
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
            self.session.rollback()
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
            self.session.commit()
            self.session.refresh(project_track)

            self.logger.info(
                f"Updated project-track for project {project_id} and {track_type} track {track_id}"
            )
            return project_track
        except Exception as e:
            self.session.rollback()
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
            self.session.commit()

            self.logger.info(
                f"Deleted project-track for project {project_id} and {track_type} track {track_id}"
            )
            return True
        except Exception as e:
            self.session.rollback()
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
            self.session.commit()

            self.logger.info(
                f"Deleted {len(project_tracks)} project-tracks for project {project_id}"
            )
            return len(project_tracks)
        except Exception as e:
            self.session.rollback()
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
            self.session.commit()

            self.logger.info(
                f"Deleted {len(project_tracks)} project-tracks for {track_type} track {track_id}"
            )
            return len(project_tracks)
        except Exception as e:
            self.session.rollback()
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
                 x_position, y_position, trim_start_ticks, trim_end_ticks, 
                 duration_ticks, track_number, position_metadata)
                VALUES 
                (:created_at, :updated_at, :project_id, :track_id, :track_type, :name, :volume, :pan, :mute,
                 :x_position, :y_position, :trim_start_ticks, :trim_end_ticks,
                 :duration_ticks, :track_number, :position_metadata)
                ON CONFLICT (project_id, track_id) 
                DO UPDATE SET
                    updated_at = EXCLUDED.updated_at,
                    track_type = EXCLUDED.track_type,
                    name = EXCLUDED.name,
                    volume = EXCLUDED.volume,
                    pan = EXCLUDED.pan,
                    mute = EXCLUDED.mute,
                    x_position = EXCLUDED.x_position,
                    y_position = EXCLUDED.y_position,
                    trim_start_ticks = EXCLUDED.trim_start_ticks,
                    trim_end_ticks = EXCLUDED.trim_end_ticks,
                    duration_ticks = EXCLUDED.duration_ticks,
                    track_number = EXCLUDED.track_number,
                    position_metadata = EXCLUDED.position_metadata
                RETURNING *
            """)
            
            # Prepare data with defaults for missing fields
            from datetime import datetime
            current_time = datetime.utcnow()
            
            # Handle position_metadata - ensure it's JSON
            import json
            position_metadata = project_track_data.get("position_metadata", {"instances": [], "next_instance_id": 0})
            if isinstance(position_metadata, dict):
                position_metadata_json = json.dumps(position_metadata)
            else:
                position_metadata_json = position_metadata
            
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
                "x_position": project_track_data.get("x_position", 0.0),
                "y_position": project_track_data.get("y_position", 0.0),
                "trim_start_ticks": project_track_data.get("trim_start_ticks", 0),
                "trim_end_ticks": project_track_data.get("trim_end_ticks", 0),
                "duration_ticks": project_track_data.get("duration_ticks", 0),
                "track_number": project_track_data.get("track_number", 0),
                "position_metadata": position_metadata_json,
            }
            
            result = self.session.execute(query, upsert_data)
            self.session.commit()
            
            # Convert result to ProjectTrack object
            row = result.fetchone()
            if row:
                project_track = ProjectTrack(**dict(row._mapping))
                self.logger.info(f"Upserted project-track for project {project_track.project_id}")
                return project_track
            else:
                raise DatabaseException("Upsert operation did not return a result")
                
        except Exception as e:
            self.session.rollback()
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
            raise DatabaseException(f"Failed to batch upsert project-tracks: {str(e)}")

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
            project_tracks = self.session.exec(statement).all()
            
            # Delete all associations
            for pt in project_tracks:
                self.session.delete(pt)
            
            # Commit changes
            self.session.commit()
            
            self.logger.info(
                f"Deleted {len(project_tracks)} project-tracks for project {project_id}"
            )
            return len(project_tracks)
        except Exception as e:
            self.session.rollback()
            self.logger.error(f"Error deleting project-tracks by track IDs: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to delete project-tracks: {str(e)}")

    async def get_track_with_settings(
        self, project_id: uuid.UUID
    ) -> List[Dict[str, Any]]:
        """
        Get all tracks with their project-specific settings for a project

        Args:
            project_id: The ID of the project

        Returns:
            List of dictionaries with track data and settings

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Getting tracks with settings for project {project_id}")
        try:
            # Get all project-track associations for this project
            project_tracks = await self.get_by_project_id(project_id)

            result = []

            # For each association, load the track based on its type
            for pt in project_tracks:
                # Use composite key (project_id, track_id) instead of a single id
                track_data = {
                    "project_id": pt.project_id,
                    "track_id": pt.track_id,
                    "name": pt.name,
                    "volume": pt.volume,
                    "pan": pt.pan,
                    "mute": pt.mute,
                    "x_position": pt.x_position,
                    "y_position": pt.y_position,
                    "trim_start_ticks": pt.trim_start_ticks,
                    "trim_end_ticks": pt.trim_end_ticks,
                    "duration_ticks": pt.duration_ticks,
                    "track_number": pt.track_number,
                    "track_type": pt.track_type,
                }

                # Get track based on type
                if pt.track_type == TrackType.AUDIO and pt.audio_track:
                    track_data["track"] = pt.audio_track
                elif pt.track_type == TrackType.MIDI and pt.midi_track:
                    track_data["track"] = pt.midi_track
                elif pt.track_type == TrackType.SAMPLER and pt.sampler_track:
                    track_data["track"] = pt.sampler_track
                elif pt.track_type == TrackType.DRUM and pt.drum_track:
                    track_data["track"] = pt.drum_track

                result.append(track_data)

            self.logger.info(f"result: {result}")

            self.logger.info(
                f"Found {len(result)} tracks with settings for project {project_id}"
            )
            return result
        except Exception as e:
            self.logger.error(f"Error getting tracks with settings: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to get tracks with settings: {str(e)}")

    # ========== TRACK INSTANCE METHODS ==========

    async def add_track_instance(
        self, 
        project_id: uuid.UUID, 
        track_id: uuid.UUID, 
        instance_data: TrackInstanceCreate
    ) -> TrackInstanceRead:
        """
        Add a new instance to an existing track
        
        Args:
            project_id: The ID of the project
            track_id: The ID of the track
            instance_data: The instance data to add
            
        Returns:
            The created track instance
            
        Raises:
            NotFoundException: If the project-track association is not found
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Adding instance to track {track_id} in project {project_id}")
        try:
            # Get current project-track
            statement = select(ProjectTrack).where(
                ProjectTrack.project_id == project_id,
                ProjectTrack.track_id == track_id
            )
            project_track = self.session.exec(statement).first()
            
            if not project_track:
                raise NotFoundException(
                    "ProjectTrack",
                    f"project_id={project_id}, track_id={track_id}"
                )
            
            # Get current position metadata or create default
            current_metadata = project_track.position_metadata or {
                "instances": [],
                "next_instance_id": 0
            }
            
            # Create new instance
            new_instance_id = current_metadata["next_instance_id"]
            new_instance_dict = {
                "id": new_instance_id,
                **instance_data.model_dump(),
                "created_at": datetime.utcnow()
            }
            
            # Add to instances list
            current_metadata["instances"].append(new_instance_dict)
            current_metadata["next_instance_id"] = new_instance_id + 1
            
            # Update database
            project_track.position_metadata = current_metadata
            project_track.updated_at = datetime.utcnow()
            
            self.session.add(project_track)
            self.session.commit()
            self.session.refresh(project_track)
            
            # Return the created instance
            created_instance = TrackInstanceRead(**new_instance_dict)
            self.logger.info(f"Added instance {new_instance_id} to track {track_id}")
            return created_instance
            
        except Exception as e:
            self.session.rollback()
            if isinstance(e, NotFoundException):
                raise
            self.logger.error(f"Error adding track instance: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to add track instance: {str(e)}")

    async def update_track_instance(
        self,
        project_id: uuid.UUID,
        track_id: uuid.UUID,
        instance_id: int,
        updates: TrackInstanceUpdate
    ) -> TrackInstanceRead:
        """
        Update a specific track instance
        
        Args:
            project_id: The ID of the project
            track_id: The ID of the track
            instance_id: The ID of the instance to update
            updates: The updates to apply
            
        Returns:
            The updated track instance
            
        Raises:
            NotFoundException: If the project-track or instance is not found
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Updating instance {instance_id} of track {track_id} in project {project_id}")
        try:
            # Get current project-track
            statement = select(ProjectTrack).where(
                ProjectTrack.project_id == project_id,
                ProjectTrack.track_id == track_id
            )
            project_track = self.session.exec(statement).first()
            
            if not project_track:
                raise NotFoundException(
                    "ProjectTrack",
                    f"project_id={project_id}, track_id={track_id}"
                )
            
            # Get current position metadata
            current_metadata = project_track.position_metadata or {
                "instances": [],
                "next_instance_id": 0
            }
            
            # Find the instance to update
            instance_index = None
            for i, instance in enumerate(current_metadata["instances"]):
                if instance["id"] == instance_id:
                    instance_index = i
                    break
            
            if instance_index is None:
                raise NotFoundException(
                    "TrackInstance",
                    f"instance_id={instance_id} in track_id={track_id}"
                )
            
            # Apply updates
            instance_dict = current_metadata["instances"][instance_index]
            update_data = updates.model_dump(exclude_unset=True)
            
            for field, value in update_data.items():
                instance_dict[field] = value
            
            # Update metadata
            current_metadata["instances"][instance_index] = instance_dict
            project_track.position_metadata = current_metadata
            project_track.updated_at = datetime.utcnow()
            
            self.session.add(project_track)
            self.session.commit()
            
            # Return updated instance
            updated_instance = TrackInstanceRead(**instance_dict)
            self.logger.info(f"Updated instance {instance_id} of track {track_id}")
            return updated_instance
            
        except Exception as e:
            self.session.rollback()
            if isinstance(e, NotFoundException):
                raise
            self.logger.error(f"Error updating track instance: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to update track instance: {str(e)}")

    async def remove_track_instance(
        self,
        project_id: uuid.UUID,
        track_id: uuid.UUID,
        instance_id: int
    ) -> bool:
        """
        Remove a specific track instance
        
        Args:
            project_id: The ID of the project
            track_id: The ID of the track
            instance_id: The ID of the instance to remove
            
        Returns:
            True if successful, False if instance not found
            
        Raises:
            NotFoundException: If the project-track is not found
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Removing instance {instance_id} of track {track_id} in project {project_id}")
        try:
            # Get current project-track
            statement = select(ProjectTrack).where(
                ProjectTrack.project_id == project_id,
                ProjectTrack.track_id == track_id
            )
            project_track = self.session.exec(statement).first()
            
            if not project_track:
                raise NotFoundException(
                    "ProjectTrack",
                    f"project_id={project_id}, track_id={track_id}"
                )
            
            # Get current position metadata
            current_metadata = project_track.position_metadata or {
                "instances": [],
                "next_instance_id": 0
            }
            
            # Remove the instance
            original_count = len(current_metadata["instances"])
            current_metadata["instances"] = [
                inst for inst in current_metadata["instances"] 
                if inst["id"] != instance_id
            ]
            
            if len(current_metadata["instances"]) == original_count:
                # Instance not found
                self.logger.info(f"Instance {instance_id} not found in track {track_id}")
                return False
            
            # Update metadata
            project_track.position_metadata = current_metadata
            project_track.updated_at = datetime.utcnow()
            
            self.session.add(project_track)
            self.session.commit()
            
            self.logger.info(f"Removed instance {instance_id} from track {track_id}")
            return True
            
        except Exception as e:
            self.session.rollback()
            if isinstance(e, NotFoundException):
                raise
            self.logger.error(f"Error removing track instance: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to remove track instance: {str(e)}")

    async def get_track_instances(
        self,
        project_id: uuid.UUID,
        track_id: uuid.UUID
    ) -> List[TrackInstanceRead]:
        """
        Get all instances for a track
        
        Args:
            project_id: The ID of the project
            track_id: The ID of the track
            
        Returns:
            List of track instances
            
        Raises:
            NotFoundException: If the project-track is not found
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Getting instances for track {track_id} in project {project_id}")
        try:
            # Get current project-track
            statement = select(ProjectTrack).where(
                ProjectTrack.project_id == project_id,
                ProjectTrack.track_id == track_id
            )
            project_track = self.session.exec(statement).first()
            
            if not project_track:
                raise NotFoundException(
                    "ProjectTrack",
                    f"project_id={project_id}, track_id={track_id}"
                )
            
            # Get instances from metadata
            current_metadata = project_track.position_metadata or {
                "instances": [],
                "next_instance_id": 0
            }
            
            instances = [
                TrackInstanceRead(**instance_dict)
                for instance_dict in current_metadata["instances"]
            ]
            
            self.logger.info(f"Found {len(instances)} instances for track {track_id}")
            return instances
            
        except Exception as e:
            if isinstance(e, NotFoundException):
                raise
            self.logger.error(f"Error getting track instances: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to get track instances: {str(e)}")

    async def batch_update_instances(
        self,
        project_id: uuid.UUID,
        updates: List[Dict[str, Any]]
    ) -> List[TrackInstanceRead]:
        """
        Batch update multiple track instances
        
        Args:
            project_id: The ID of the project
            updates: List of update dictionaries with format:
                     [{"track_id": UUID, "instance_id": int, "updates": TrackInstanceUpdate}]
        
        Returns:
            List of updated track instances
            
        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Batch updating {len(updates)} track instances in project {project_id}")
        try:
            updated_instances = []
            
            # Group updates by track_id for efficiency
            updates_by_track = {}
            for update in updates:
                track_id = update["track_id"]
                if track_id not in updates_by_track:
                    updates_by_track[track_id] = []
                updates_by_track[track_id].append(update)
            
            # Process each track
            for track_id, track_updates in updates_by_track.items():
                # Get project-track
                statement = select(ProjectTrack).where(
                    ProjectTrack.project_id == project_id,
                    ProjectTrack.track_id == track_id
                )
                project_track = self.session.exec(statement).first()
                
                if not project_track:
                    self.logger.warning(f"Project-track not found: {project_id}, {track_id}")
                    continue
                
                # Get current metadata
                current_metadata = project_track.position_metadata or {
                    "instances": [],
                    "next_instance_id": 0
                }
                
                # Apply all updates for this track
                for update in track_updates:
                    instance_id = update["instance_id"]
                    instance_updates = update["updates"]
                    
                    # Find instance
                    for instance_dict in current_metadata["instances"]:
                        if instance_dict["id"] == instance_id:
                            # Apply updates
                            if isinstance(instance_updates, TrackInstanceUpdate):
                                update_data = instance_updates.model_dump(exclude_unset=True)
                            else:
                                update_data = instance_updates
                            
                            for field, value in update_data.items():
                                instance_dict[field] = value
                            
                            updated_instances.append(TrackInstanceRead(**instance_dict))
                            break
                
                # Update metadata
                project_track.position_metadata = current_metadata
                project_track.updated_at = datetime.utcnow()
                self.session.add(project_track)
            
            self.session.commit()
            
            self.logger.info(f"Batch updated {len(updated_instances)} track instances")
            return updated_instances
            
        except Exception as e:
            self.session.rollback()
            self.logger.error(f"Error in batch update: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to batch update track instances: {str(e)}")
