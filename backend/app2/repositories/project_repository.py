"""
Project repository for database operations using SQLModel
Handles basic CRUD operations for project entities
"""

from typing import Dict, Any, List
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import func
import asyncio
import traceback
from datetime import datetime, timezone
import uuid

from app2.core.exceptions import DatabaseException, NotFoundException
from app2.core.logging import get_repository_logger
from app2.models.project import Project


class ProjectRepository:
    """Repository for project operations"""

    def __init__(self, session: AsyncSession):
        """
        Initialize the repository with database session

        Args:
            session: The async SQLModel session for database operations
        """
        self.session = session
        self.logger = get_repository_logger("project")

    async def get_by_id(self, project_id: uuid.UUID) -> Project:
        """
        Get a project by ID

        Args:
            project_id: The ID of the project

        Returns:
            The project

        Raises:
            NotFoundException: If the project is not found
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Getting project with ID: {project_id}")
        try:
            statement = (
                select(Project)
                .options(selectinload(Project.project_tracks))
                .where(Project.id == project_id)
            )
            result = await self.session.execute(statement)
            project = result.scalars().first()

            if not project:
                self.logger.error(f"Project with ID {project_id} not found")
                raise NotFoundException("Project", project_id)

            self.logger.info(f"Found project with ID: {project_id}")
            return project
        except Exception as e:
            if isinstance(e, NotFoundException):
                raise
            self.logger.error(f"Error getting project: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to get project: {str(e)}")

    async def get_with_tracks(self, project_id: uuid.UUID) -> Project:
        """
        Get a project by ID with its tracks and associated files loaded

        Args:
            project_id: The ID of the project

        Returns:
            The project with tracks and files loaded

        Raises:
            NotFoundException: If the project is not found
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Getting project with ID: {project_id} with tracks and files")
        try:
            # We need a query with multiple selectinload calls to eagerly load project tracks and related track files
            from app2.models.project_track import ProjectTrack

            statement = (
                select(Project)
                .options(
                    selectinload(Project.project_tracks).options(
                        selectinload(ProjectTrack.audio_track).options(
                            selectinload(ProjectTrack.audio_track.audio_file)
                        ),
                        selectinload(ProjectTrack.midi_track).options(
                            selectinload(ProjectTrack.midi_track.midi_file),
                            selectinload(ProjectTrack.midi_track.instrument_file)
                        ),
                        selectinload(ProjectTrack.sampler_track).options(
                            selectinload(ProjectTrack.sampler_track.drum_track)
                        ),
                        selectinload(ProjectTrack.drum_track).options(
                            selectinload(ProjectTrack.drum_track.sampler_tracks)
                        )
                    )
                )
                .where(Project.id == project_id)
            )

            result = await self.session.execute(statement)
            project = result.scalars().first()

            if not project:
                self.logger.error(f"Project with ID {project_id} not found")
                raise NotFoundException("Project", project_id)

            track_count = len(project.project_tracks) if project.project_tracks else 0
            self.logger.info(
                f"Found project with ID: {project_id} with {track_count} tracks"
            )

            # Log file counts for debugging
            audio_file_count = sum(
                1
                for pt in project.project_tracks
                if pt.audio_track and hasattr(pt.audio_track, "audio_file") and pt.audio_track.audio_file is not None
            )
            midi_file_count = sum(
                1
                for pt in project.project_tracks
                if pt.midi_track and hasattr(pt.midi_track, "midi_file") and pt.midi_track.midi_file is not None
            )
            instrument_file_count = sum(
                1
                for pt in project.project_tracks
                if pt.midi_track and hasattr(pt.midi_track, "instrument_file") and pt.midi_track.instrument_file is not None
            )

            self.logger.info(
                f"Loaded {audio_file_count} audio files, {midi_file_count} MIDI files, and {instrument_file_count} instrument files"
            )

            return project
        except Exception as e:
            if isinstance(e, NotFoundException):
                raise
            self.logger.error(f"Error getting project with tracks: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to get project with tracks: {str(e)}")

    async def get_all(self, **filters) -> List[Project]:
        """
        Get all projects with optional filters

        Args:
            **filters: Optional filter criteria (e.g., user_id=uuid)

        Returns:
            List of projects

        Raises:
            DatabaseException: If there's a database error
        """
        filter_str = ", ".join(f"{k}={v}" for k, v in filters.items())
        self.logger.info(f"Getting projects with filters: {filter_str}")
        try:
            # Build query with filters
            query = (
                select(Project)
                .options(selectinload(Project.project_tracks))
            )
            for key, value in filters.items():
                if hasattr(Project, key):
                    query = query.where(getattr(Project, key) == value)

            # Execute query
            result = await self.session.execute(query)
            results = result.scalars().all()

            self.logger.info(f"Found {len(results)} projects")
            return results
        except Exception as e:
            self.logger.error(f"Error getting projects: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to get projects: {str(e)}")

    async def get_by_user_id(self, user_id: uuid.UUID) -> List[Project]:
        """
        Get all projects for a user

        Args:
            user_id: The ID of the user

        Returns:
            List of projects

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Getting projects for user: {user_id}")
        try:
            return await self.get_all(user_id=user_id)
        except Exception as e:
            self.logger.error(f"Error getting projects for user: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to get projects for user: {str(e)}")

    async def get_by_user_id_paginated(
        self, user_id: uuid.UUID, page: int, size: int
    ) -> tuple[List[Project], int]:
        """
        Get projects for a user with pagination.

        Args:
            user_id: The ID of the user.
            page: The page number (1-indexed).
            size: The number of items per page.

        Returns:
            A tuple containing the list of projects and the total number of projects.

        Raises:
            DatabaseException: If there's a database error.
        """
        self.logger.info(
            f"Getting projects for user: {user_id}, page: {page}, size: {size}"
        )
        try:
            offset = (page - 1) * size

            # Query for items on the current page
            items_statement = (
                select(Project)
                .where(Project.user_id == user_id)
                .offset(offset)
                .limit(size)
                .order_by(Project.created_at.desc())
            )
            items_result_exec = await self.session.execute(items_statement)
            items_result = items_result_exec.scalars().all()

            # Query for total count
            count_statement = (
                select(func.count())
                .select_from(Project)
                .where(Project.user_id == user_id)
            )
            total_items_result_exec = await self.session.execute(count_statement)
            total_items_result = total_items_result_exec.scalar()

            self.logger.info(
                f"Found {len(items_result)} projects (total: {total_items_result}) for user: {user_id}"
            )
            return items_result, total_items_result
        except Exception as e:
            self.logger.error(f"Error getting paginated projects for user: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(
                f"Failed to get paginated projects for user: {str(e)}"
            )

    async def get_by_user_id_with_tracks(self, user_id: uuid.UUID) -> List[Project]:
        """
        Get all projects for a user with tracks loaded

        Args:
            user_id: The ID of the user

        Returns:
            List of projects with tracks loaded

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Getting projects for user: {user_id} with tracks")
        try:
            from app2.models.project_track import ProjectTrack

            statement = (
                select(Project)
                .options(
                    selectinload(Project.project_tracks).options(
                        selectinload(ProjectTrack.audio_track),
                        selectinload(ProjectTrack.midi_track),
                        selectinload(ProjectTrack.sampler_track),
                        selectinload(ProjectTrack.drum_track)
                    )
                )
                .where(Project.user_id == user_id)
            )

            result = await self.session.execute(statement)
            projects = result.scalars().all()

            self.logger.info(f"Found {len(projects)} projects for user: {user_id}")
            return projects
        except Exception as e:
            self.logger.error(f"Error getting projects with tracks: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to get projects with tracks: {str(e)}")

    async def create(self, project_data: Dict[str, Any]) -> Project:
        """
        Create a new project

        Args:
            project_data: The project data

        Returns:
            The created project

        Raises:
            DatabaseException: If there's a database error
        """
        self.logger.info("Creating new project")
        try:
            # Create project instance
            project = Project(**project_data)

            # Ensure ID is set
            if not getattr(project, "id", None):
                project.id = uuid.uuid4()

            self.logger.info(
                f"Creating project with data: {project_data}, ID: {project.id}"
            )

            # Add to session and commit
            self.session.add(project)
            await self.session.commit()
            await self.session.refresh(project)

            self.logger.info(f"Created project with ID: {project.id}")
            return project
        except Exception as e:
            await self.session.rollback()
            self.logger.error(f"Error creating project: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to create project: {str(e)}")

    async def update(
        self, project_id: uuid.UUID, project_data: Dict[str, Any]
    ) -> Project:
        """
        Update a project with optimistic locking

        Args:
            project_id: The ID of the project
            project_data: The updated data (may include 'expected_version' for optimistic locking)

        Returns:
            The updated project

        Raises:
            NotFoundException: If the project is not found
            DatabaseException: If there's a database error or version conflict
        """
        self.logger.info(f"Updating project with ID: {project_id}")
        try:
            # First check if project exists
            project = await self.get_by_id(project_id)

            # Check for version conflict (optimistic locking)
            expected_version = project_data.get('expected_version')
            if expected_version is not None and hasattr(project, 'version'):
                if project.version != expected_version:
                    self.logger.warning(
                        f"Version conflict: expected {expected_version}, got {project.version}"
                    )
                    raise DatabaseException(
                        f"Project has been modified by another user. "
                        f"Expected version {expected_version}, current version is {project.version}. "
                        f"Please refresh and try again."
                    )

            # Update fields (excluding expected_version which is not a model field)
            for key, value in project_data.items():
                if key != 'expected_version' and hasattr(project, key):
                    setattr(project, key, value)

            # Increment version for optimistic locking
            if hasattr(project, 'version'):
                project.version += 1

            # Update timestamp if it exists
            if hasattr(project, "updated_at"):
                project.updated_at = datetime.now(timezone.utc)

            # Commit changes
            self.session.add(project)
            await self.session.commit()
            await self.session.refresh(project)

            self.logger.info(f"Updated project with ID: {project_id}, new version: {project.version}")
            return project
        except Exception as e:
            await self.session.rollback()
            if isinstance(e, NotFoundException):
                raise
            self.logger.error(f"Error updating project: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to update project: {str(e)}")

    async def delete(self, project_id: uuid.UUID) -> bool:
        """
        Delete a project

        Args:
            project_id: The ID of the project

        Returns:
            True if successful

        Raises:
            NotFoundException: If the project is not found
            DatabaseException: If there's a database error
        """
        self.logger.info(f"Deleting project with ID: {project_id}")
        try:
            # First check if project exists
            project = await self.get_by_id(project_id)

            # Delete the project (associated ProjectTrack entries should be deleted
            # by the service layer before calling this method)
            self.session.delete(project)
            await self.session.commit()

            self.logger.info(f"Deleted project with ID: {project_id}")
            return True
        except Exception as e:
            await self.session.rollback()
            if isinstance(e, NotFoundException):
                raise
            self.logger.error(f"Error deleting project: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise DatabaseException(f"Failed to delete project: {str(e)}")
