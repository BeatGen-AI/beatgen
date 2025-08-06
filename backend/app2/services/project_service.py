"""
Service for project operations with specialized track models
"""

from typing import Dict, Any, List
import traceback
from datetime import datetime, timezone
import uuid
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession

from app2.core.logging import get_service_logger
from app2.core.exceptions import ServiceException, NotFoundException, ForbiddenException
from app2.repositories.project_repository import ProjectRepository
from app2.repositories.project_track_repository import ProjectTrackRepository
from app2.repositories.midi_track_repository import MidiTrackRepository
from app2.repositories.audio_track_repository import AudioTrackRepository
from app2.repositories.sampler_track_repository import SamplerTrackRepository
from app2.repositories.drum_track_repository import DrumTrackRepository
from app2.models.project import ProjectWithTracks, ProjectRead, CombinedTrack, ProjectWithTrackPreviews, TrackPreview
from app2.types.track_types import TrackType
from app2.services.track_service import TrackService
from app2.dto.projects_dto import Page, PageParams
from app2.models.track_models.audio_track import AudioTrackRead
from app2.models.track_models.midi_track import MidiTrackRead
from app2.models.track_models.sampler_track import SamplerTrackRead
from app2.models.track_models.drum_track import DrumTrackRead

logger = get_service_logger("project")


class ProjectService:
    """Service for project operations with request-scoped session management"""

    def __init__(self, session: AsyncSession):
        """
        Initialize the service with a database session

        Args:
            session: The async database session for this request
        """
        self.session = session
        # Create repositories within request scope
        self.project_repository = ProjectRepository(session)
        self.project_track_repository = ProjectTrackRepository(session)
        self.track_service = TrackService(session)


    async def get_user_projects(
        self, user_id: uuid.UUID, page_params: PageParams
    ) -> Page[ProjectWithTrackPreviews]:
        """
        Get all projects for a user with pagination and lightweight track previews

        Args:
            user_id: The ID of the user
            page_params: Pagination parameters (page, size)

        Returns:
            A paginated list of projects with track previews

        Raises:
            ServiceException: If the operation fails
        """
        logger.info(
            f"Getting projects for user ID: {user_id} with params: {page_params}"
        )
        try:
            import time
            service_start = time.time()
            
            # Get projects with tracks from repository
            projects, total_items = (
                await self.project_repository.get_by_user_id_paginated(
                    user_id, page_params.page, page_params.size
                )
            )
            
            repo_time = time.time() - service_start
            logger.info(f"⏱️ Repository call took: {repo_time * 1000:.2f}ms")
            
            validation_start = time.time()
            projects_with_previews = []
            
            for project in projects:
                # Create lightweight track previews
                track_previews = []
                
                for project_track in project.project_tracks:
                    # Create lightweight track preview with only essential data
                    track_preview = TrackPreview(
                        id=project_track.track_id,
                        name=project_track.name,
                        track_type=project_track.track_type,
                        track_number=project_track.track_number,
                        mute=project_track.mute,
                        instance_metadata=project_track.instance_metadata or []
                    )
                    track_previews.append(track_preview)
                
                # Create ProjectWithTrackPreviews
                project_with_previews = ProjectWithTrackPreviews(
                    id=project.id,
                    name=project.name,
                    bpm=project.bpm,
                    time_signature_numerator=project.time_signature_numerator,
                    time_signature_denominator=project.time_signature_denominator,
                    key_signature=project.key_signature,
                    user_id=project.user_id,
                    created_at=project.created_at,
                    updated_at=project.updated_at,
                    track_previews=track_previews,
                )
                projects_with_previews.append(project_with_previews)
            
            validation_time = time.time() - validation_start
            logger.info(f"⏱️ Model validation took: {validation_time * 1000:.2f}ms")
            
            logger.info(
                f"Found {len(projects)} projects (total: {total_items}) for user ID: {user_id}"
            )

            return Page.create(
                items=projects_with_previews, total_items=total_items, params=page_params
            )
        except Exception as e:
            logger.error(f"Error getting user projects: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to get user projects: {str(e)}")

    async def get_project(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> ProjectWithTracks:
        """
        Get a project by ID with all its tracks

        Args:
            project_id: The ID of the project
            user_id: The ID of the user

        Returns:
            The project with tracks

        Raises:
            NotFoundException: If the project is not found
            ForbiddenException: If the user does not own the project
            ServiceException: If the operation fails
        """
        logger.info(f"Getting project with ID: {project_id} for user ID: {user_id}")
        try:
            # Get the project
            project = await self.project_repository.get_by_id(project_id)
            if not project:
                logger.error(f"Project with ID {project_id} not found")
                raise NotFoundException("Project", str(project_id))

            # Verify project ownership
            if project.user_id != user_id:
                logger.error(f"User {user_id} does not own project {project_id}")
                raise ForbiddenException(
                    "You do not have permission to access this project"
                )

            # Get all tracks with their project-specific settings (relationships pre-loaded)
            project_tracks = (
                await self.project_track_repository.get_track_with_settings(project_id)
            )
            logger.info(f"Found {len(project_tracks)} project tracks")
            
            # Create CombinedTrack objects from SQLModel objects
            combined_tracks = []
            for project_track in project_tracks:
                # Handle instance_metadata - ensure it's a list
                instance_metadata = project_track.instance_metadata
                if instance_metadata is None or not isinstance(instance_metadata, list):
                    instance_metadata = []
                
                # Create default instance if none exist (for backwards compatibility)
                if not instance_metadata or len(instance_metadata) == 0:
                    # Create default instance based on track position data
                    instance_metadata = [{
                        "id": f"{project_track.track_id}_instance_1",
                        "x_position": 0,
                        "y_position": 0,
                        "trim_start_ticks": 0,
                        "trim_end_ticks": project_track.duration_ticks
                    }]
                    logger.info(f"Created default instance for track {project_track.track_id}: {instance_metadata}")
                
                # Convert SQLModel track to read model
                track_read = None
                track_type = project_track.track_type
                
                if track_type == TrackType.AUDIO and project_track.audio_track:
                    from app2.models.track_models.audio_track import AudioTrackRead
                    track_read = AudioTrackRead.model_validate(project_track.audio_track)
                elif track_type == TrackType.MIDI and project_track.midi_track:
                    from app2.models.track_models.midi_track import MidiTrackRead
                    track_read = MidiTrackRead.model_validate(project_track.midi_track)
                elif track_type == TrackType.SAMPLER and project_track.sampler_track:
                    from app2.models.track_models.sampler_track import SamplerTrackRead
                    track_read = SamplerTrackRead.model_validate(project_track.sampler_track)
                elif track_type == TrackType.DRUM and project_track.drum_track:
                    from app2.models.track_models.drum_track import DrumTrackRead
                    # Convert sampler tracks to read models
                    sampler_tracks_read = []
                    for sampler_track in project_track.drum_track.sampler_tracks:
                        from app2.models.track_models.sampler_track import SamplerTrackRead
                        sampler_tracks_read.append(SamplerTrackRead.model_validate(sampler_track))
                    
                    # Create DrumTrackRead with proper data
                    drum_track_dict = project_track.drum_track.model_dump()
                    drum_track_dict['sampler_tracks'] = sampler_tracks_read
                    drum_track_dict['sampler_track_ids'] = [st.id for st in sampler_tracks_read]
                    track_read = DrumTrackRead.model_validate(drum_track_dict)
                
                if track_read:
                    # Create a combined track with all data
                    combined_track = CombinedTrack(
                        id=project_track.track_id,
                        name=project_track.name,
                        track_type=project_track.track_type,
                        # Project-specific track properties
                        volume=project_track.volume,
                        pan=project_track.pan,
                        mute=project_track.mute,
                        duration_ticks=project_track.duration_ticks,
                        track_number=project_track.track_number,
                        instance_metadata=instance_metadata,
                        # Specialized track data (now as read model)
                        track=track_read,
                    )
                    combined_tracks.append(combined_track)

            # Create the ProjectWithTracks response model
            result = ProjectWithTracks(
                id=project.id,
                name=project.name,
                bpm=project.bpm,
                time_signature_numerator=project.time_signature_numerator,
                time_signature_denominator=project.time_signature_denominator,
                key_signature=project.key_signature,
                user_id=project.user_id,
                tracks=combined_tracks,
            )

            logger.info(
                f"Found project with ID: {project_id} with {len(combined_tracks)} tracks"
            )
            return result
        except Exception as e:
            if isinstance(e, (NotFoundException, ForbiddenException)):
                raise
            logger.error(f"Error getting project: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to get project: {str(e)}")

    async def create_project(
        self, user_id: uuid.UUID, project_data: Dict[str, Any]
    ) -> ProjectWithTracks:
        """
        Create a new project

        Args:
            user_id: The ID of the user
            project_data: The project data including tracks

        Returns:
            The created project with all its tracks

        Raises:
            ServiceException: If the operation fails
        """
        logger.info(f"Creating project for user ID: {user_id}")
        try:
            # Add user ID to project data
            project_data["user_id"] = user_id

            # Extract tracks data if present
            project_data.pop("tracks", None)

            # Create the project
            project = await self.project_repository.create(project_data)
            logger.info(f"Created project with ID: {project.id} for user ID: {user_id}")

            # Get the project with its tracks
            project_with_tracks = await self.get_project(project.id, user_id)
            return project_with_tracks
        except Exception as e:
            logger.error(f"Error creating project: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to create project: {str(e)}")

    async def update_project(
        self, project_id: uuid.UUID, user_id: uuid.UUID, project_data: Dict[str, Any]
    ) -> ProjectWithTracks:
        """
        Update a project

        Args:
            project_id: The ID of the project
            user_id: The ID of the user
            project_data: The updated project data

        Returns:
            The updated project with tracks

        Raises:
            NotFoundException: If the project is not found
            ForbiddenException: If the user does not own the project
            ServiceException: If the operation fails
        """
        logger.info(f"Updating project with ID: {project_id} for user ID: {user_id}")

        try:
            # First get the project to verify ownership
            project = await self.project_repository.get_by_id(project_id)
            if not project:
                logger.error(f"Project with ID {project_id} not found")
                raise NotFoundException("Project", str(project_id))

            # Verify project ownership
            if project.user_id != user_id:
                logger.error(f"User {user_id} does not own project {project_id}")
                raise ForbiddenException(
                    "You do not have permission to access this project"
                )

            # Extract tracks data if present
            tracks_data = project_data.pop("tracks", None)

            if tracks_data:
                logger.info(f"Received {len(tracks_data)} tracks for update")
                for idx, track in enumerate(tracks_data):
                    logger.info(f"Track {idx}: id={track.get('id')}, instance_metadata={track.get('instance_metadata')}")
            else:
                logger.info("No tracks data in update request")

            # Filter out fields that cannot be updated
            safe_data = {
                k: v
                for k, v in project_data.items()
                if k not in ["id", "user_id", "created_at"]
            }

            # Add updated timestamp
            safe_data["updated_at"] = datetime.now(timezone.utc)

            # Update the project
            await self.project_repository.update(project_id, safe_data)

            # Update tracks if provided - this now uses proper transaction management
            if tracks_data is not None:
                logger.info(f"Updating tracks for project with ID: {project_id}")
                await self.update_project_tracks(project_id, user_id, tracks_data)

            # Get the updated project with tracks
            project_with_tracks = await self.get_project(project_id, user_id)
            logger.info(f"Updated project with ID: {project_id}")

            return project_with_tracks
        except Exception as e:
            if isinstance(e, (NotFoundException, ForbiddenException)):
                raise
            logger.error(f"Error updating project: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to update project: {str(e)}")

    async def update_project_tracks(
        self,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        tracks_data: List[Dict[str, Any]],
    ) -> None:
        """
        Update the tracks of a project using atomic upsert pattern

        Args:
            project_id: The ID of the project
            user_id: The ID of the user
            tracks_data: List of track data dictionaries

        Raises:
            ServiceException: If the operation fails
        """
        logger.info(
            f"Updating tracks for project with ID: {project_id}, {len(tracks_data)} tracks"
        )
        
        try:
            # Get existing tracks to identify what to remove
            existing_tracks = await self.project_track_repository.get_by_project_id(project_id)
            existing_track_ids = {str(track.track_id) for track in existing_tracks}
            logger.info(f"Existing tracks in project: {existing_track_ids}")
            
            # Track IDs that will be in the updated project
            new_track_ids = set()
            
            # Use existing repositories that already share the same session
            midi_repo = self.track_service.midi_repository
            audio_repo = self.track_service.audio_repository
            sampler_repo = self.track_service.sampler_repository
            drum_repo = self.track_service.drum_repository
            
            # Process each track using upsert pattern
            for track_idx, track_data in enumerate(tracks_data):
                logger.info(f"Processing track {track_idx}: {track_data}")
                
                if not isinstance(track_data, dict) or "id" not in track_data:
                    logger.warning(f"Invalid track data format: {track_data}")
                    continue
                
                # Support both 'type' and 'track_type' fields
                type_field = track_data.get("track_type") or track_data.get("type")
                if not type_field:
                    logger.warning(f"No track type found in track data: {track_data}")
                    continue
                
                track_type = TrackType(type_field)
                track_id = uuid.UUID(track_data["id"])
                new_track_ids.add(str(track_id))
                
                logger.info(f"Processing {track_type.value} track with ID: {track_id}")
                
                # Log instance_metadata for debugging
                instance_metadata = track_data.get("instance_metadata")
                logger.info(f"Track {track_id} instance_metadata: {instance_metadata}")
                
                # Prepare project-track settings
                project_track_settings = {
                    "project_id": project_id,
                    "track_id": track_id,
                    "track_type": track_type,
                    "name": track_data.get("name", "Unnamed Track"),
                    "volume": track_data.get("volume", 1.0),
                    "pan": track_data.get("pan", 0.0),
                    "mute": track_data.get("mute", False),
                    "duration_ticks": track_data.get("duration_ticks", 0),
                    "track_number": track_data.get("track_number", track_idx),
                    "instance_metadata": instance_metadata,
                }
                
                logger.info(f"About to upsert project-track settings: {project_track_settings}")
                
                # Use upsert to safely create or update the project-track association
                try:
                    upserted_track = await self.project_track_repository.upsert(project_track_settings)
                    logger.info(f"Successfully upserted track {track_id} to project {project_id}, result: {upserted_track}")
                except Exception as upsert_error:
                    logger.error(f"FAILED to upsert track {track_id}: {str(upsert_error)}")
                    logger.error(traceback.format_exc())
                    raise
                
                # Separate track-specific data from project-track settings
                project_track_fields = [
                    "name", "volume", "pan", "mute", "x_position", "y_position",
                    "trim_start_ticks", "trim_end_ticks", "duration_ticks", 
                    "track_number", "instance_metadata", "project_id"
                ]
                
                # Extract track-specific data (everything except project-track fields)
                track_specific_data = {
                    k: v for k, v in track_data.items() 
                    if k not in project_track_fields and k not in ["id", "track_type", "type"]
                }
                
                # Update the actual track data if there's track-specific data
                if track_specific_data:
                    logger.info(f"Updating track {track_id} with specific data: {list(track_specific_data.keys())}")
                    try:
                        # Update track data using the same session repositories
                        if track_type == TrackType.MIDI:
                            # Remove any stale 'notes' field if it exists, only use midi_notes_json
                            midi_data = track_specific_data.copy()
                            if 'notes' in midi_data:
                                logger.info("Removing stale 'notes' field, using only 'midi_notes_json'")
                                midi_data.pop('notes')
                            await midi_repo.update(track_id, midi_data)
                        elif track_type == TrackType.AUDIO:
                            await audio_repo.update(track_id, track_specific_data)
                        elif track_type == TrackType.SAMPLER:
                            await sampler_repo.update(track_id, track_specific_data)
                        elif track_type == TrackType.DRUM:
                            await drum_repo.update(track_id, track_specific_data)
                        
                        logger.info(f"Successfully updated track {track_id} data")
                    except Exception as track_update_error:
                        logger.error(f"Failed to update track {track_id} data: {str(track_update_error)}")
                        logger.error(traceback.format_exc())
                        # Don't re-raise here as we want to continue with other tracks
            
            logger.info(f"Completed upserting all tracks. New track IDs: {new_track_ids}")
            
            # Verify the tracks were actually saved
            verification_tracks = await self.project_track_repository.get_by_project_id(project_id)
            verification_track_ids = {str(track.track_id) for track in verification_tracks}
            logger.info(f"Verification: tracks now in project: {verification_track_ids}")
            
            # # Remove tracks that are no longer in the project
            # tracks_to_remove = existing_track_ids - new_track_ids
            # if tracks_to_remove:
            #     track_ids_to_remove = [uuid.UUID(track_id) for track_id in tracks_to_remove]
            #     deleted_count = await self.project_track_repository.delete_by_track_ids(
            #         project_id, track_ids_to_remove
            #     )
            #     logger.info(f"Removed {deleted_count} tracks from project {project_id}")
                    
        except Exception as e:
            logger.error(f"Error updating project tracks: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to update project tracks: {str(e)}")

    async def delete_project(self, project_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        """
        Delete a project

        Args:
            project_id: The ID of the project
            user_id: The ID of the user

        Returns:
            True if the project was deleted

        Raises:
            NotFoundException: If the project is not found
            ForbiddenException: If the user does not own the project
            ServiceException: If the operation fails
        """
        logger.info(f"Deleting project with ID: {project_id} for user ID: {user_id}")
        try:
            # First get the project to verify ownership
            project = await self.project_repository.get_by_id(project_id)
            if not project:
                logger.error(f"Project with ID {project_id} not found")
                raise NotFoundException("Project", str(project_id))

            # Verify project ownership
            if project.user_id != user_id:
                logger.error(f"User {user_id} does not own project {project_id}")
                raise ForbiddenException(
                    "You do not have permission to access this project"
                )

            # Delete all project-track associations
            await self.project_track_repository.delete_by_project_id(project_id)

            # Delete the project
            result = await self.project_repository.delete(project_id)

            logger.info(f"Deleted project with ID: {project_id}")
            return result
        except Exception as e:
            if isinstance(e, (NotFoundException, ForbiddenException)):
                raise
            logger.error(f"Error deleting project: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to delete project: {str(e)}")

    async def add_track(
        self, project_id: uuid.UUID, user_id: uuid.UUID, track_data: Dict[str, Any]
    ) -> ProjectWithTracks:
        """
        Add a track to a project

        Args:
            project_id: The ID of the project
            user_id: The ID of the user
            track_data: The track data with type and track-specific properties

        Returns:
            The updated project with tracks

        Raises:
            NotFoundException: If the project is not found
            ForbiddenException: If the user does not own the project
            ServiceException: If the operation fails
        """
        logger.info(
            f"Adding track to project with ID: {project_id} for user ID: {user_id}"
        )
        try:
            # First get the project to verify ownership
            project = await self.project_repository.get_by_id(project_id)
            if not project:
                logger.error(f"Project with ID {project_id} not found")
                raise NotFoundException("Project", str(project_id))

            # Verify project ownership
            if project.user_id != user_id:
                logger.error(f"User {user_id} does not own project {project_id}")
                raise ForbiddenException(
                    "You do not have permission to access this project"
                )

            # Validate track data
            if "type" not in track_data:
                raise ValueError("Track data must include 'type' field")

            # Get track type
            track_type = TrackType(track_data["type"])

            # Extract project-track settings
            project_track_settings = {
                "name": track_data.get("name"),
                "track_id": track_data.get("id"),
                "volume": track_data.get("volume"),
                "pan": track_data.get("pan"),
                "mute": track_data.get("mute"),
                "x_position": track_data.get("x_position"),
                "y_position": track_data.get("y_position"),
                "trim_start_ticks": track_data.get("trim_start_ticks"),
                "trim_end_ticks": track_data.get("trim_end_ticks"),
                "duration_ticks": track_data.get("duration_ticks"),
                "track_number": track_data.get("track_number"),
            }

            logger.info(f"Project track settings: {project_track_settings}")

            # Extract track-specific data
            track_specific_data = {
                k: v
                for k, v in track_data.items()
                if k not in project_track_settings.keys() and k != "type"
            }
            track_specific_data["id"] = track_data.get("id")

            # Create track based on type
            created_track = None
            if track_type == TrackType.AUDIO:
                created_track = await self.track_service.create_audio_track(
                    user_id, track_specific_data
                )
            elif track_type == TrackType.MIDI:
                created_track = await self.track_service.create_midi_track(
                    user_id, track_specific_data
                )
            elif track_type == TrackType.SAMPLER:
                created_track = await self.track_service.create_sampler_track(
                    user_id, track_specific_data
                )
            elif track_type == TrackType.DRUM:
                created_track = await self.track_service.create_drum_track(
                    user_id, track_specific_data
                )

            # Add track to project
            await self.track_service.add_track_to_project(
                project_id=project_id,
                track_type=track_type,
                track_id=created_track.id,
                user_id=user_id,
                settings=project_track_settings,
            )

            # Get the updated project with tracks
            updated_project = await self.get_project(project_id, user_id)
            logger.info(
                f"Added track with ID: {created_track.id} to project with ID: {project_id}"
            )

            return updated_project
        except Exception as e:
            if isinstance(e, (NotFoundException, ForbiddenException)):
                raise
            logger.error(f"Error adding track to project: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to add track to project: {str(e)}")

    async def update_track(
        self,
        project_id: uuid.UUID,
        track_id: uuid.UUID,
        track_type: TrackType,
        user_id: uuid.UUID,
        track_data: Dict[str, Any],
    ) -> ProjectWithTracks:
        """
        Update a track in a project

        Args:
            project_id: The ID of the project
            track_id: The ID of the track
            track_type: The type of the track
            user_id: The ID of the user
            track_data: The updated track data

        Returns:
            The updated project with tracks

        Raises:
            NotFoundException: If the project or track is not found
            ForbiddenException: If the user does not own the project
            ServiceException: If the operation fails
        """
        logger.info(
            f"Updating {track_type.value} track with ID: {track_id} in project with ID: {project_id}"
        )
        try:
            # Get the project to verify ownership
            project = await self.project_repository.get(project_id)
            if not project:
                logger.error(f"Project with ID {project_id} not found")
                raise NotFoundException("Project", str(project_id))

            # Verify project ownership
            if project.user_id != user_id:
                logger.error(f"User {user_id} does not own project {project_id}")
                raise ForbiddenException(
                    "You do not have permission to access this project"
                )

            # Check if the track is in the project
            project_track = (
                await self.project_track_repository.get_by_project_and_track(
                    project_id, track_type, track_id
                )
            )
            if not project_track:
                logger.error(f"Track {track_id} not found in project {project_id}")
                raise NotFoundException("Track in project", f"{project_id}/{track_id}")

            # Separate track-specific data from project-track settings
            project_track_fields = [
                "name",
                "volume",
                "pan",
                "mute",
                "x_position",
                "y_position",
                "trim_start_ticks",
                "trim_end_ticks",
                "duration_ticks",
                "track_number",
            ]

            project_track_data = {
                k: v for k, v in track_data.items() if k in project_track_fields
            }
            track_specific_data = {
                k: v for k, v in track_data.items() if k not in project_track_fields
            }

            # Update project-track settings if provided
            if project_track_data:
                await self.track_service.update_track_project_settings(
                    project_id=project_id,
                    track_type=track_type,
                    track_id=track_id,
                    user_id=user_id,
                    settings=project_track_data,
                )

            # Update track-specific data if provided
            if track_specific_data:
                await self.track_service.update_track(
                    track_id=track_id,
                    track_type=track_type,
                    user_id=user_id,
                    track_data=track_specific_data,
                )

            # Get the updated project with tracks
            updated_project = await self.get_project(project_id, user_id)
            logger.info(
                f"Updated {track_type.value} track with ID: {track_id} in project with ID: {project_id}"
            )

            return updated_project
        except Exception as e:
            if isinstance(e, (NotFoundException, ForbiddenException)):
                raise
            logger.error(f"Error updating track in project: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to update track in project: {str(e)}")

    async def remove_track(
        self,
        project_id: uuid.UUID,
        track_id: uuid.UUID,
        track_type: TrackType,
        user_id: uuid.UUID,
    ) -> ProjectWithTracks:
        """
        Remove a track from a project

        Args:
            project_id: The ID of the project
            track_id: The ID of the track
            track_type: The type of the track
            user_id: The ID of the user

        Returns:
            The updated project with tracks

        Raises:
            NotFoundException: If the project or track is not found
            ForbiddenException: If the user does not own the project
            ServiceException: If the operation fails
        """
        logger.info(
            f"Removing {track_type.value} track with ID: {track_id} from project with ID: {project_id}"
        )
        try:
            # Get the project to verify ownership
            project = await self.project_repository.get(project_id)
            if not project:
                logger.error(f"Project with ID {project_id} not found")
                raise NotFoundException("Project", str(project_id))

            # Verify project ownership
            if project.user_id != user_id:
                logger.error(f"User {user_id} does not own project {project_id}")
                raise ForbiddenException(
                    "You do not have permission to access this project"
                )

            # Check if the track is in the project
            project_track = (
                await self.project_track_repository.get_by_project_and_track(
                    project_id, track_type, track_id
                )
            )
            if not project_track:
                logger.error(f"Track {track_id} not found in project {project_id}")
                raise NotFoundException("Track in project", f"{project_id}/{track_id}")

            # Remove the track from the project
            await self.track_service.remove_track_from_project(
                project_id=project_id,
                track_type=track_type,
                track_id=track_id,
                user_id=user_id,
            )

            # Get the updated project with tracks
            updated_project = await self.get_project(project_id, user_id)
            logger.info(
                f"Removed {track_type.value} track with ID: {track_id} from project with ID: {project_id}"
            )

            return updated_project
        except Exception as e:
            if isinstance(e, (NotFoundException, ForbiddenException)):
                raise
            logger.error(f"Error removing track from project: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to remove track from project: {str(e)}")
