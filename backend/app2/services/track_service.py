"""
Service for track operations with specialized track models
"""

from typing import Dict, Any, List, Union, Type
import traceback
import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from app2.core.logging import get_service_logger
from app2.core.exceptions import (
    ServiceException,
    NotFoundException,
    ForbiddenException,
)
from app2.repositories.audio_track_repository import AudioTrackRepository
from app2.repositories.midi_track_repository import MidiTrackRepository
from app2.repositories.sampler_track_repository import SamplerTrackRepository
from app2.repositories.drum_track_repository import DrumTrackRepository
from app2.repositories.file_repository import FileRepository
from app2.repositories.project_track_repository import ProjectTrackRepository

from app2.types.track_types import TrackType
from app2.types.file_types import FileType

from app2.models.track_models.audio_track import (
    AudioTrackRead,
)
from app2.models.track_models.midi_track import (
    MidiTrackRead,
    MidiTrackCreate,
)
from app2.models.track_models.sampler_track import (
    SamplerTrackRead,
    SamplerTrackCreate,
)
from app2.models.track_models.drum_track import (
    DrumTrackRead,
    DrumTrackCreate,
)
from app2.dto.projects_dto import Page, PageParams
from app2.infrastructure.database.sqlmodel_client import get_async_session

logger = get_service_logger("track")

# Type for all track read models
AnyTrackRead = Union[AudioTrackRead, MidiTrackRead, SamplerTrackRead, DrumTrackRead]


class TrackService:
    """Service for track operations with request-scoped session management"""

    def __init__(self, session: AsyncSession):
        """
        Initialize the service with a database session

        Args:
            session: The async database session for this request
        """
        self.session = session
        # Note: Repositories are now stateless and don't need initialization
        # They will be called directly with the session parameter

    async def get_user_tracks(
        self, user_id: uuid.UUID, requested_track_type: TrackType = None
    ) -> Dict[str, List[AnyTrackRead]]:
        """
        Get all tracks for a user, organized by track type.
        If a specific track type is provided, only tracks of that type are returned.

        Args:
            user_id: The ID of the user
            requested_track_type: Optional. The specific type of tracks to retrieve.

        Returns:
            A dictionary with track types as keys and lists of tracks as values

        Raises:
            ServiceException: If the operation fails
        """
        logger.info(f"Getting tracks for user ID: {user_id}{f' of type {requested_track_type.value}' if requested_track_type else ''}")
        try:
            result: Dict[str, List[AnyTrackRead]] = {}

            # Map TrackType to its repository class and Pydantic read model
            track_config = {
                TrackType.AUDIO: (AudioTrackRepository, AudioTrackRead),
                TrackType.MIDI: (MidiTrackRepository, MidiTrackRead),
                TrackType.SAMPLER: (SamplerTrackRepository, SamplerTrackRead),
                TrackType.DRUM: (DrumTrackRepository, DrumTrackRead),
            }

            async def fetch_and_store_tracks(
                track_type_enum: TrackType,
                repository_class: type,
                read_model: Union[Type[AudioTrackRead], Type[MidiTrackRead], Type[SamplerTrackRead], Type[DrumTrackRead]]
            ):
                # Call the repository's static method with session
                tracks = await repository_class.get_by_user_id(self.session, user_id)
                validated_tracks = [read_model.model_validate(track) for track in tracks]
                result[track_type_enum.value] = validated_tracks
                return len(validated_tracks)

            if requested_track_type is not None:  # Specific track type requested
                if requested_track_type not in track_config:
                    logger.error(f"Unsupported track type requested: {requested_track_type}")
                    raise ServiceException(f"Unsupported track type: {requested_track_type.value}")
                
                repo, model = track_config[requested_track_type]
                count = await fetch_and_store_tracks(requested_track_type, repo, model)
                logger.info(f"Found {count} {requested_track_type.value} tracks for user ID: {user_id}")
                return result
            else:  # No specific type, fetch all track types
                total_tracks = 0
                for t_type, (repo, model) in track_config.items():
                    total_tracks += await fetch_and_store_tracks(t_type, repo, model)
                
                logger.info(f"Found {total_tracks} tracks for user ID: {user_id}")
                return result

        except Exception as e:
            logger.error(f"Error getting user tracks: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to get user tracks: {str(e)}")

    async def get_user_audio_tracks_paginated(
        self, user_id: uuid.UUID, page_params: PageParams
    ) -> Page[AudioTrackRead]:
        """Get paginated Audio tracks for a specific user."""
        logger.info(
            f"Getting paginated Audio tracks for user ID: {user_id} "
            f"with params: page={page_params.page}, size={page_params.size}"
        )
        try:
            skip = (page_params.page - 1) * page_params.size
            limit = page_params.size

            audio_tracks_orm, total_items_count = (
                await AudioTrackRepository.get_by_user_id_paginated(self.session,
                    user_id, skip=skip, limit=limit
                )
            )

            audio_tracks_read = [
                AudioTrackRead.model_validate(track) for track in audio_tracks_orm
            ]

            return Page.create(
                items=audio_tracks_read,
                total_items=total_items_count,
                params=page_params,
            )
        except Exception as e:
            logger.error(f"Error getting paginated Audio tracks: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to get paginated Audio tracks: {str(e)}")

    async def get_user_midi_tracks_paginated(
        self, user_id: uuid.UUID, page_params: PageParams
    ) -> Page[MidiTrackRead]:
        """Get paginated MIDI tracks for a specific user."""
        logger.info(
            f"Getting paginated MIDI tracks for user ID: {user_id} "
            f"with params: page={page_params.page}, size={page_params.size}"
        )
        try:
            skip = (page_params.page - 1) * page_params.size
            limit = page_params.size

            midi_tracks_orm, total_items_count = (
                await MidiTrackRepository.get_by_user_id_paginated(self.session,
                    user_id, skip=skip, limit=limit
                )
            )

            midi_tracks_read = [
                MidiTrackRead.model_validate(track) for track in midi_tracks_orm
            ]

            return Page.create(
                items=midi_tracks_read,
                total_items=total_items_count,
                params=page_params,
            )
        except Exception as e:
            logger.error(f"Error getting paginated MIDI tracks: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to get paginated MIDI tracks: {str(e)}")

    async def get_user_sampler_tracks_paginated(
        self, user_id: uuid.UUID, page_params: PageParams
    ) -> Page[SamplerTrackRead]:
        """Get paginated Sampler tracks for a specific user."""
        logger.info(
            f"Getting paginated Sampler tracks for user ID: {user_id} "
            f"with params: page={page_params.page}, size={page_params.size}"
        )
        try:
            skip = (page_params.page - 1) * page_params.size
            limit = page_params.size

            sampler_tracks_orm, total_items_count = (
                await SamplerTrackRepository.get_by_user_id_paginated(self.session,
                    user_id, skip=skip, limit=limit
                )
            )

            sampler_tracks_read = [
                SamplerTrackRead.model_validate(track) for track in sampler_tracks_orm
            ]

            return Page.create(
                items=sampler_tracks_read,
                total_items=total_items_count,
                params=page_params,
            )
        except Exception as e:
            logger.error(f"Error getting paginated Sampler tracks: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to get paginated Sampler tracks: {str(e)}")

    async def get_user_drum_tracks_paginated(
        self, user_id: uuid.UUID, page_params: PageParams
    ) -> Page[DrumTrackRead]:
        """Get paginated Drum tracks for a specific user."""
        logger.info(
            f"Getting paginated Drum tracks for user ID: {user_id} "
            f"with params: page={page_params.page}, size={page_params.size}"
        )
        try:
            skip = (page_params.page - 1) * page_params.size
            limit = page_params.size

            drum_tracks_orm, total_items_count = (
                await DrumTrackRepository.get_by_user_id_paginated(self.session,
                    user_id, skip=skip, limit=limit
                )
            )

            drum_tracks_read = [
                DrumTrackRead.model_validate(track) for track in drum_tracks_orm
            ]

            return Page.create(
                items=drum_tracks_read,
                total_items=total_items_count,
                params=page_params,
            )
        except Exception as e:
            logger.error(f"Error getting paginated Drum tracks: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to get paginated Drum tracks: {str(e)}")

    async def get_track(
        self, track_id: uuid.UUID, track_type: TrackType, user_id: uuid.UUID
    ) -> AnyTrackRead:
        """
        Get a track by ID and type

        Args:
            track_id: The ID of the track
            track_type: The type of the track
            user_id: The ID of the user (for permission check)

        Returns:
            The track

        Raises:
            NotFoundException: If the track is not found
            ForbiddenException: If the user does not own the track
            ServiceException: If the operation fails
        """
        logger.info(
            f"Getting {track_type.value} track with ID: {track_id} for user ID: {user_id}"
        )
        try:
            # Get the track based on type
            track = None

            if track_type == TrackType.AUDIO:
                track = await AudioTrackRepository.get(self.session, track_id)
                if track:
                    track_read = AudioTrackRead.model_validate(track)
            elif track_type == TrackType.MIDI:
                track = await MidiTrackRepository.get(self.session, track_id)
                if track:
                    track_read = MidiTrackRead.model_validate(track)
            elif track_type == TrackType.SAMPLER:
                track = await SamplerTrackRepository.get(self.session, track_id)
                if track:
                    track_read = SamplerTrackRead.model_validate(track)
            elif track_type == TrackType.DRUM:
                track = await DrumTrackRepository.get(self.session, track_id)
                if track:
                    track_read = DrumTrackRead.model_validate(track)
            else:
                raise ValueError(f"Invalid track type: {track_type}")

            # Check if track exists
            if not track:
                logger.error(f"{track_type.value} track with ID {track_id} not found")
                raise NotFoundException(f"{track_type.value} track", str(track_id))

            # Verify track ownership
            if track.user_id != user_id:
                logger.error(
                    f"User {user_id} does not own {track_type.value} track {track_id}"
                )
                raise ForbiddenException(
                    f"You do not have permission to access this {track_type.value} track"
                )

            logger.info(
                f"Found {track_type.value} track with ID: {track_id} for user ID: {user_id}"
            )
            return track_read
        except Exception as e:
            if isinstance(e, (NotFoundException, ForbiddenException)):
                raise
            logger.error(f"Error getting {track_type.value} track: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to get {track_type.value} track: {str(e)}")

    @staticmethod
    async def create_audio_track(
        user_id: uuid.UUID, track_data: Dict[str, Any]
    ) -> AudioTrackRead:
        """
        Create a new audio track with self-managed session

        Args:
            user_id: The ID of the user
            track_data: The track data

        Returns:
            The created audio track

        Raises:
            ServiceException: If the operation fails
        """
        logger.info(f"Creating audio track for user ID: {user_id}")
        
        async with get_async_session() as session:
            try:
                # Add user ID and type
                track_data["user_id"] = user_id
                track_data["type"] = TrackType.AUDIO

                # Create the track using the stateless repository
                try:
                    track = await AudioTrackRepository.create(session, track_data)
                    # Session will auto-commit when context exits
                    logger.info(
                        f"Created audio track with ID: {track.id} for user ID: {user_id}"
                    )
                except Exception as e:
                    # Check if it's specifically a duplicate key error
                    if "duplicate key" in str(e) or "UniqueViolation" in str(e):
                        logger.info(
                            f"Audio track with ID: {track_data.get('id')} already exists. Updating track."
                        )
                        track = await AudioTrackRepository.update(session, track_data["id"], track_data)
                        logger.info(
                            f"Updated existing audio track with ID: {track.id} for user ID: {user_id}"
                        )
                    else:
                        # Re-raise other types of errors
                        logger.error(f"Error creating audio track: {str(e)}")
                        raise

                return AudioTrackRead.model_validate(track)
                
            except Exception as e:
                logger.error(f"Error creating audio track: {str(e)}")
                logger.error(traceback.format_exc())
                raise ServiceException(f"Failed to create audio track: {str(e)}")

    @staticmethod
    async def create_midi_track(
        user_id: uuid.UUID, midi_track_data: Dict[str, Any]
    ) -> MidiTrackRead:
        """
        Create a new MIDI track with self-managed session

        Args:
            user_id: The ID of the user
            midi_track_data: The track data

        Returns:
            The created MIDI track

        Raises:
            ServiceException: If the operation fails
        """
        logger.info(f"Creating MIDI track for user ID: {user_id}")
        
        async with get_async_session() as session:
            try:
                # Add user ID and type
                midi_track_data["user_id"] = user_id
                midi_track_data["type"] = TrackType.MIDI

                # Validate required fields
                if "instrument_id" not in midi_track_data:
                    raise ValueError("MIDI tracks require an instrument_id")

                # Create the track
                logger.info(f"Creating MIDI track with data: {midi_track_data}")
                try:
                    track = await MidiTrackRepository.create(session, midi_track_data)
                    logger.info(f"✅ Created new MIDI track with ID: {track.id}")
                except Exception as e:
                    # Check if it's specifically a duplicate key error
                    if "duplicate key" in str(e) or "UniqueViolation" in str(e):
                        logger.info(
                            f"🔄 MIDI track with ID: {midi_track_data.get('id')} already exists. Updating instead."
                        )
                        track = await MidiTrackRepository.update(session,
                            midi_track_data["id"], midi_track_data
                        )
                        logger.info(f"✅ Updated existing MIDI track with ID: {track.id}")
                    else:
                        # Re-raise other types of errors
                        logger.error(f"❌ Error creating MIDI track: {str(e)}")
                        raise

                logger.info(
                    f"Created MIDI track with ID: {track.id} for user ID: {user_id}"
                )
                return MidiTrackRead.model_validate(track)
                
            except Exception as e:
                logger.error(f"Error creating MIDI track: {str(e)}")
                logger.error(traceback.format_exc())
                raise ServiceException(f"Failed to create MIDI track: {str(e)}")

    @staticmethod
    async def create_sampler_track(
        user_id: uuid.UUID, track_data: Dict[str, Any]
    ) -> SamplerTrackRead:
        """
        Create a new sampler track with self-managed session

        Args:
            user_id: The ID of the user
            track_data: The track data

        Returns:
            The created sampler track

        Raises:
            ServiceException: If the operation fails
        """
        logger.info(f"Creating sampler track for user ID: {user_id}")
        
        async with get_async_session() as session:
            try:
                # Add user ID and type
                track_data["user_id"] = user_id
                track_data["type"] = TrackType.SAMPLER

                # Validate required fields
                if "audio_storage_key" not in track_data:
                    raise ValueError("Sampler tracks require audio_storage_key")

                # Create the track
                try:
                    track = await SamplerTrackRepository.create(session, track_data)
                except Exception as e:
                    # Check if it's specifically a duplicate key error
                    if "duplicate key" in str(e) or "UniqueViolation" in str(e):
                        logger.info(
                            f"Sampler track already with ID: {track_data.get('id')} exists. Updating track."
                        )
                        track = await SamplerTrackRepository.update(session,
                            track_data["id"], track_data
                        )
                    else:
                        # Re-raise other types of errors
                        logger.error(f"Error creating sampler track: {str(e)}")
                        raise

                logger.info(
                    f"Created sampler track with ID: {track.id} for user ID: {user_id}"
                )
                return SamplerTrackRead.model_validate(track)
                
            except Exception as e:
                logger.error(f"Error creating sampler track: {str(e)}")
                logger.error(traceback.format_exc())
                raise ServiceException(f"Failed to create sampler track: {str(e)}")

    @staticmethod
    async def create_drum_track(
        user_id: uuid.UUID, track_data: Dict[str, Any]
    ) -> DrumTrackRead:
        """
        Create a new drum track with self-managed session

        Args:
            user_id: The ID of the user
            track_data: The track data

        Returns:
            The created drum track

        Raises:
            ServiceException: If the operation fails
        """
        logger.info(f"Creating drum track for user ID: {user_id}")
        
        async with get_async_session() as session:
            try:
                # Add user ID and type
                track_data["user_id"] = user_id
                track_data["type"] = TrackType.DRUM

                # Create the track
                try:
                    track = await DrumTrackRepository.create(session, track_data)
                except Exception as e:
                    # Check if it's specifically a duplicate key error
                    if "duplicate key" in str(e) or "UniqueViolation" in str(e):
                        logger.info(
                            f"Drum track already with ID: {track_data.get('id')} exists. Updating track."
                        )
                        track = await DrumTrackRepository.update(session,
                            track_data["id"], track_data
                        )
                    else:
                        # Re-raise other types of errors
                        logger.error(f"Error creating drum track: {str(e)}")
                        raise

                logger.info(
                    f"Created drum track with ID: {track.id} for user ID: {user_id}"
                )
                # Track is already loaded with relationships from create method
                return DrumTrackRead.model_validate(track)
                
            except Exception as e:
                logger.error(f"Error creating drum track: {str(e)}")
                logger.error(traceback.format_exc())
                raise ServiceException(f"Failed to create drum track: {str(e)}")

    async def update_track(
        self,
        track_id: uuid.UUID,
        track_type: TrackType,
        user_id: uuid.UUID,
        track_data: Dict[str, Any],
    ) -> AnyTrackRead:
        """
        Update a track

        Args:
            track_id: The ID of the track
            track_type: The type of the track
            user_id: The ID of the user
            track_data: The updated track data

        Returns:
            The updated track

        Raises:
            NotFoundException: If the track is not found
            ForbiddenException: If the user does not own the track
            ServiceException: If the operation fails
        """
        logger.info(
            f"Updating {track_type.value} track with ID: {track_id} for user ID: {user_id}"
        )
        try:
            # First get the track (ensures it exists and user has access)
            await self.get_track(track_id, track_type, user_id)

            # Update the track based on type
            updated_track = None

            if track_type == TrackType.AUDIO:
                updated_track = await AudioTrackRepository.update(self.session, track_id, track_data)
                track_read = AudioTrackRead.model_validate(updated_track)
            elif track_type == TrackType.MIDI:
                # Remove any stale 'notes' field if it exists, only use midi_notes_json
                midi_data = track_data.copy()
                if 'notes' in midi_data:
                    logger.info("Removing stale 'notes' field, using only 'midi_notes_json'")
                    midi_data.pop('notes')
                
                updated_track = await MidiTrackRepository.update(self.session, track_id, midi_data)
                track_read = MidiTrackRead.model_validate(updated_track)
            elif track_type == TrackType.SAMPLER:
                updated_track = await SamplerTrackRepository.update(self.session,
                    track_id, track_data
                )
                track_read = SamplerTrackRead.model_validate(updated_track)
            elif track_type == TrackType.DRUM:
                updated_track = await DrumTrackRepository.update(self.session, track_id, track_data)
                track_read = DrumTrackRead.model_validate(updated_track)
            else:
                raise ValueError(f"Invalid track type: {track_type}")

            logger.info(
                f"Updated {track_type.value} track with ID: {track_id} for user ID: {user_id}"
            )
            return track_read
        except Exception as e:
            if isinstance(e, (NotFoundException, ForbiddenException)):
                raise
            logger.error(f"Error updating {track_type.value} track: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(
                f"Failed to update {track_type.value} track: {str(e)}"
            )

    async def delete_track(
        self, track_id: uuid.UUID, track_type: TrackType, user_id: uuid.UUID
    ) -> bool:
        """
        Delete a track

        Args:
            track_id: The ID of the track
            track_type: The type of the track
            user_id: The ID of the user

        Returns:
            True if the track was deleted

        Raises:
            NotFoundException: If the track is not found
            ForbiddenException: If the user does not own the track
            ServiceException: If the operation fails
        """
        logger.info(
            f"Deleting {track_type.value} track with ID: {track_id} for user ID: {user_id}"
        )
        try:
            # First get the track (ensures it exists and user has access)
            await self.get_track(track_id, track_type, user_id)

            # Delete all project associations for this track
            await ProjectTrackRepository.delete_by_track(self.session, track_type, track_id)

            # Delete the track based on type
            result = False

            if track_type == TrackType.AUDIO:
                result = await AudioTrackRepository.delete(self.session, track_id)
            elif track_type == TrackType.MIDI:
                result = await MidiTrackRepository.delete(self.session, track_id)
            elif track_type == TrackType.SAMPLER:
                result = await SamplerTrackRepository.delete(self.session, track_id)
            elif track_type == TrackType.DRUM:
                result = await DrumTrackRepository.delete(self.session, track_id)
            else:
                raise ValueError(f"Invalid track type: {track_type}")

            logger.info(
                f"Deleted {track_type.value} track with ID: {track_id} for user ID: {user_id}"
            )
            return result
        except Exception as e:
            if isinstance(e, (NotFoundException, ForbiddenException)):
                raise
            logger.error(f"Error deleting {track_type.value} track: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(
                f"Failed to delete {track_type.value} track: {str(e)}"
            )

    async def create_upload_url(
        self,
        file_name: str,
        file_id: uuid.UUID,
        user_id: uuid.UUID,
        file_type: FileType,
    ) -> Dict[str, str]:
        """
        Create a signed URL for uploading a file

        Args:
            file_name: The name of the file to upload
            file_id: The ID of the file
            user_id: The ID of the user
            file_type: The type of file

        Returns:
            A dictionary with the upload URL and storage key

        Raises:
            ServiceException: If the operation fails
        """
        logger.info(
            f"Creating upload URL for {file_type.value} file {file_name} for user ID: {user_id}"
        )
        try:
            # Note: create_upload_url doesn't need a session
            result = await FileRepository.create_upload_url(
                file_name, file_id, user_id, file_type
            )

            logger.info(
                f"Created upload URL for {file_type.value} file {file_name} for user ID: {user_id}"
            )
            return result
        except Exception as e:
            logger.error(f"Error creating upload URL: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to create upload URL: {str(e)}")

    async def add_track_to_project(
        self,
        project_id: uuid.UUID,
        track_type: TrackType,
        track_id: uuid.UUID,
        user_id: uuid.UUID,
        settings: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Add a track to a project

        Args:
            project_id: The ID of the project
            track_type: The type of the track
            track_id: The ID of the track
            user_id: The ID of the user
            settings: Project-track settings (volume, pan, position, etc.)

        Returns:
            The project-track association data

        Raises:
            NotFoundException: If the track or project is not found
            ForbiddenException: If the user does not own the track or project
            ServiceException: If the operation fails
        """
        logger.info(
            f"Adding {track_type.value} track {track_id} to project {project_id} for user {user_id}"
        )
        try:
            # First verify track access
            track = await self.get_track(track_id, track_type, user_id)

            # Create project-track association data
            project_track_data = {
                "project_id": project_id,
                "track_type": track_type,
                **settings,
            }

            # Set track_id directly (not using type-specific foreign keys)
            project_track_data["track_id"] = track_id

            # Create the association with duplicate handling
            try:
                project_track = await ProjectTrackRepository.create(
                    self.session, project_track_data
                )
            except Exception as e:
                # If create fails due to duplicate, try upsert
                logger.info(f"ProjectTrack create failed, trying upsert: {str(e)}")
                project_track = await ProjectTrackRepository.upsert(
                    self.session, project_track_data
                )

            # Get track data with settings
            # Note: ProjectTrack uses a composite primary key (project_id, track_id), not a single id field
            result = {
                "project_id": project_id,
                "track_type": track_type,
                "track_id": track_id,
                "track": track,
                **{k: getattr(project_track, k) for k in settings.keys()},
            }

            logger.info(
                f"Added {track_type.value} track {track_id} to project {project_id}"
            )
            return result
        except Exception as e:
            if isinstance(e, (NotFoundException, ForbiddenException)):
                raise
            logger.error(f"Error adding track to project: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to add track to project: {str(e)}")

    async def remove_track_from_project(
        self,
        project_id: uuid.UUID,
        track_type: TrackType,
        track_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> bool:
        """
        Remove a track from a project

        Args:
            project_id: The ID of the project
            track_type: The type of the track
            track_id: The ID of the track
            user_id: The ID of the user

        Returns:
            True if the track was removed from the project

        Raises:
            NotFoundException: If the track or project is not found
            ForbiddenException: If the user does not own the track or project
            ServiceException: If the operation fails
        """
        logger.info(
            f"Removing {track_type.value} track {track_id} from project {project_id} for user {user_id}"
        )
        try:
            # First verify track access
            await self.get_track(track_id, track_type, user_id)

            # Delete the association
            result = await ProjectTrackRepository.delete(
                self.session, project_id, track_type, track_id
            )

            logger.info(
                f"Removed {track_type.value} track {track_id} from project {project_id}"
            )
            return result
        except Exception as e:
            if isinstance(e, (NotFoundException, ForbiddenException)):
                raise
            logger.error(f"Error removing track from project: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to remove track from project: {str(e)}")

    async def update_track_project_settings(
        self,
        project_id: uuid.UUID,
        track_type: TrackType,
        track_id: uuid.UUID,
        user_id: uuid.UUID,
        settings: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Update project-specific settings for a track

        Args:
            project_id: The ID of the project
            track_type: The type of the track
            track_id: The ID of the track
            user_id: The ID of the user
            settings: Updated project-track settings (volume, pan, position, etc.)

        Returns:
            The updated project-track association data

        Raises:
            NotFoundException: If the track or project is not found
            ForbiddenException: If the user does not own the track or project
            ServiceException: If the operation fails
        """
        logger.info(
            f"Updating settings for {track_type.value} track {track_id} in project {project_id}"
        )
        try:
            # First verify track access
            track = await self.get_track(track_id, track_type, user_id)

            # Update the association
            project_track = await ProjectTrackRepository.update(
                self.session, project_id, track_type, track_id, settings
            )

            # Get track data with updated settings
            # Note: ProjectTrack uses a composite primary key (project_id, track_id), not a single id field
            result = {
                "project_id": project_id,
                "track_type": track_type,
                "track_id": track_id,
                "track": track,
                **{k: getattr(project_track, k) for k in settings.keys()},
            }

            logger.info(
                f"Updated settings for {track_type.value} track {track_id} in project {project_id}"
            )
            return result
        except Exception as e:
            if isinstance(e, (NotFoundException, ForbiddenException)):
                raise
            logger.error(f"Error updating track project settings: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to update track project settings: {str(e)}")
