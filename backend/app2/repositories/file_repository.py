"""
Unified File Repository for database operations using SQLModel - Stateless implementation
Handles all file types (audio, MIDI, instrument) consistently
"""

from typing import Dict, Any, List, Optional, Type
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
import traceback
import uuid

from app2.core.exceptions import DatabaseException, NotFoundException, StorageException
from app2.core.logging import get_repository_logger
from app2.types.file_types import FileType
from app2.models.public_models.instrument_file import InstrumentFile
from app2.infrastructure.storage.supabase_storage import SupabaseStorage

# Generic type for file models
FileModel = InstrumentFile

logger = get_repository_logger("file")


class FileRepository:
    """Stateless repository for operations on all file types (audio, MIDI, instrument)"""

    # Map file types to their model classes
    _file_models = {FileType.INSTRUMENT: InstrumentFile}

    # Map file types to storage buckets
    _storage_buckets = {
        FileType.AUDIO: "tracks/audio",
        FileType.INSTRUMENT: "instruments",
    }

    @staticmethod
    def _get_model_class(file_type: FileType) -> Type:
        """Get the model class for a file type"""
        model_class = FileRepository._file_models.get(file_type)
        if not model_class:
            raise ValueError(f"Unsupported file type: {file_type}")
        return model_class

    @staticmethod
    def _get_storage_client(file_type: FileType) -> SupabaseStorage:
        """Get the storage client for a file type"""
        bucket = FileRepository._storage_buckets.get(file_type)
        if not bucket:
            raise ValueError(f"Unsupported file type for storage: {file_type}")
        return SupabaseStorage(bucket)

    @staticmethod
    async def get_by_id(session: AsyncSession, file_id: uuid.UUID, file_type: FileType) -> Any:
        """
        Get a file by ID and type

        Args:
            session: The database session
            file_id: The ID of the file
            file_type: The type of file

        Returns:
            The file model if found

        Raises:
            NotFoundException: If the file is not found
            DatabaseException: If there's a database error
        """
        logger.info(f"Getting {file_type.value} file with ID {file_id}")
        try:
            model_class = FileRepository._get_model_class(file_type)

            statement = select(model_class).where(model_class.id == file_id)
            result_exec = await session.execute(statement)
            result = result_exec.scalars().first()

            if result is None:
                logger.error(
                    f"{file_type.value.capitalize()} file with ID {file_id} not found"
                )
                raise NotFoundException(f"{file_type.value.capitalize()} file", str(file_id))

            logger.info(f"Found {file_type.value} file with ID {file_id}")
            return result
        except Exception as e:
            if isinstance(e, NotFoundException):
                raise
            logger.error(f"Error getting {file_type.value} file by ID: {str(e)}")
            logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to get {file_type.value} file: {str(e)}")

    @staticmethod
    async def get_all(session: AsyncSession, file_type: FileType, **filters) -> List[Any]:
        """
        Get all files of a specific type with optional filters

        Args:
            session: The database session
            file_type: The type of file
            **filters: Optional filter criteria (e.g., user_id=uuid, is_public=True)

        Returns:
            List of file models matching the criteria

        Raises:
            DatabaseException: If there's a database error
        """
        filter_str = ", ".join(f"{k}={v}" for k, v in filters.items())
        logger.info(
            f"Getting all {file_type.value} files with filters: {filter_str}"
        )
        try:
            model_class = FileRepository._get_model_class(file_type)

            # Build query with filters
            query = select(model_class)
            for key, value in filters.items():
                if hasattr(model_class, key):
                    query = query.where(getattr(model_class, key) == value)

            # Execute query
            result_exec = await session.execute(query)
            results = result_exec.scalars().all()

            logger.info(f"Found {len(results)} {file_type.value} files")
            return results
        except Exception as e:
            logger.error(f"Error getting {file_type.value} files: {str(e)}")
            logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to get {file_type.value} files: {str(e)}")

    @staticmethod
    async def get_by_user_id(
        session: AsyncSession, user_id: uuid.UUID, file_type: FileType
    ) -> List[Any]:
        """
        Get all files of a specific type for a user

        Args:
            session: The database session
            user_id: The ID of the user
            file_type: The type of file

        Returns:
            List of file models owned by the user

        Raises:
            DatabaseException: If there's a database error
        """
        logger.info(f"Getting {file_type.value} files for user {user_id}")
        try:
            model_class = FileRepository._get_model_class(file_type)

            # Check if model has user_id field
            if not hasattr(model_class, "user_id"):
                logger.warning(
                    f"{file_type.value.capitalize()} model doesn't have user_id field"
                )
                return []

            return await FileRepository.get_all(session, file_type, user_id=user_id)
        except Exception as e:
            logger.error(
                f"Error getting {file_type.value} files for user: {str(e)}"
            )
            logger.error(traceback.format_exc())
            raise DatabaseException(
                f"Failed to get {file_type.value} files for user: {str(e)}"
            )

    @staticmethod
    async def create(session: AsyncSession, file_data: Dict[str, Any], file_type: FileType) -> Any:
        """
        Create a new file

        Args:
            session: The database session
            file_data: The data for the new file
            file_type: The type of file

        Returns:
            The created file model

        Raises:
            DatabaseException: If there's a database error
        """
        logger.info(f"Creating new {file_type.value} file")
        try:
            model_class = FileRepository._get_model_class(file_type)

            # Create model instance
            file_instance = model_class(**file_data)

            # Add to session and flush
            session.add(file_instance)
            await session.flush()

            logger.info(
                f"Created {file_type.value} file with ID {file_instance.id}"
            )
            return file_instance
        except Exception as e:
            logger.error(f"Error creating {file_type.value} file: {str(e)}")
            logger.error(traceback.format_exc())
            raise DatabaseException(
                f"Failed to create {file_type.value} file: {str(e)}"
            )

    @staticmethod
    async def update(
        session: AsyncSession, file_id: uuid.UUID, file_data: Dict[str, Any], file_type: FileType
    ) -> Any:
        """
        Update an existing file

        Args:
            session: The database session
            file_id: The ID of the file to update
            file_data: The updated data
            file_type: The type of file

        Returns:
            The updated file model

        Raises:
            NotFoundException: If the file is not found
            DatabaseException: If there's a database error
        """
        logger.info(f"Updating {file_type.value} file with ID {file_id}")
        try:
            # First check if file exists
            file_instance = await FileRepository.get_by_id(session, file_id, file_type)

            # Update fields
            for key, value in file_data.items():
                if hasattr(file_instance, key):
                    setattr(file_instance, key, value)

            # Flush changes
            await session.flush()

            logger.info(f"Updated {file_type.value} file with ID {file_id}")
            return file_instance
        except Exception as e:
            if isinstance(e, NotFoundException):
                raise
            logger.error(f"Error updating {file_type.value} file: {str(e)}")
            logger.error(traceback.format_exc())
            raise DatabaseException(
                f"Failed to update {file_type.value} file: {str(e)}"
            )

    @staticmethod
    async def delete(session: AsyncSession, file_id: uuid.UUID, file_type: FileType) -> bool:
        """
        Delete a file

        Args:
            session: The database session
            file_id: The ID of the file to delete
            file_type: The type of file

        Returns:
            True if the file was deleted successfully

        Raises:
            NotFoundException: If the file is not found
            DatabaseException: If there's a database error
        """
        logger.info(f"Deleting {file_type.value} file with ID {file_id}")
        try:
            # First check if file exists
            file_instance = await FileRepository.get_by_id(session, file_id, file_type)

            # Delete from database
            await session.delete(file_instance)
            await session.flush()

            logger.info(f"Deleted {file_type.value} file with ID {file_id}")
            return True
        except Exception as e:
            if isinstance(e, NotFoundException):
                raise
            logger.error(f"Error deleting {file_type.value} file: {str(e)}")
            logger.error(traceback.format_exc())
            raise DatabaseException(
                f"Failed to delete {file_type.value} file: {str(e)}"
            )

    @staticmethod
    async def find_by_name(session: AsyncSession, name: str, file_type: FileType) -> Optional[Any]:
        """
        Find a file by name

        Args:
            session: The database session
            name: The name to search for
            file_type: The type of file

        Returns:
            The file model if found, None otherwise

        Raises:
            DatabaseException: If there's a database error
        """
        logger.info(f"Finding {file_type.value} file with name: {name}")
        try:
            results = await FileRepository.get_all(session, file_type, name=name)

            if results:
                logger.info(f"Found {file_type.value} file with name: {name}")
                return results[0]
            else:
                logger.info(f"No {file_type.value} file found with name: {name}")
                return None
        except Exception as e:
            logger.error(f"Error finding {file_type.value} file by name: {str(e)}")
            logger.error(traceback.format_exc())
            raise DatabaseException(
                f"Failed to find {file_type.value} file by name: {str(e)}"
            )

    @staticmethod
    async def create_upload_url(
        file_name: str,
        file_id: uuid.UUID,
        user_id: uuid.UUID,
        file_type: FileType,
    ) -> Dict[str, str]:
        """
        Create a signed upload URL for a file
        Note: This doesn't need a session as it only interacts with storage

        Args:
            file_name: The name of the file
            file_id: The ID of the file record
            user_id: The ID of the user
            file_type: The type of file

        Returns:
            Dict containing upload URL and storage path

        Raises:
            StorageException: If there's an error creating the upload URL
        """
        logger.info(f"Creating upload URL for {file_type.value} file: {file_name}")
        try:
            # Get storage client
            storage = FileRepository._get_storage_client(file_type)

            # Create storage path
            file_extension = file_name.split(".")[-1] if "." in file_name else ""
            storage_key = f"{file_type.value}/{user_id}/{file_id}.{file_extension}"

            # Create upload URL
            result = storage.create_signed_upload_url(storage_key)

            # Add file ID to result
            result["id"] = str(file_id)

            logger.info(
                f"Created upload URL for {file_type.value} file: {file_name}"
            )
            return result
        except Exception as e:
            logger.error(f"Error creating upload URL: {str(e)}")
            logger.error(traceback.format_exc())
            raise StorageException(f"Failed to create upload URL: {str(e)}")