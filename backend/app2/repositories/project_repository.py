"""
Project repository for database operations using SQLModel - Stateless implementation
Handles basic CRUD operations for project entities
"""

from typing import Dict, Any, List, Optional
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import func
import traceback
from datetime import datetime, timezone
import uuid

from app2.core.exceptions import DatabaseException, NotFoundException
from app2.core.logging import get_repository_logger
from app2.models.project import Project

logger = get_repository_logger("project")


class ProjectRepository:
    """Stateless repository for project operations"""

    @staticmethod
    async def create(session: AsyncSession, project_data: Dict[str, Any]) -> Project:
        """Create a new project"""
        try:
            # Ensure timestamps are set
            now = datetime.now(timezone.utc)
            project_data.setdefault("created_at", now)
            project_data.setdefault("updated_at", now)
            
            project = Project(**project_data)
            session.add(project)
            await session.flush()
            
            logger.info(f"Created project with ID: {project.id}")
            return project
        except Exception as e:
            logger.error(f"Error creating project: {str(e)}")
            raise DatabaseException(f"Failed to create project: {str(e)}")

    @staticmethod
    async def get_by_id(session: AsyncSession, project_id: uuid.UUID) -> Optional[Project]:
        """Get a project by ID"""
        try:
            statement = select(Project).where(Project.id == project_id)
            result = await session.execute(statement)
            project = result.scalars().first()
            
            if not project:
                logger.error(f"Project with ID {project_id} not found")
                raise NotFoundException("Project", str(project_id))
            
            logger.info(f"Found project with ID: {project_id}")
            return project
        except NotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error getting project by ID: {str(e)}")
            raise DatabaseException(f"Failed to get project: {str(e)}")

    @staticmethod
    async def get_with_tracks(session: AsyncSession, project_id: uuid.UUID) -> Optional[Project]:
        """Get a project with its tracks relationship loaded"""
        try:
            statement = (
                select(Project)
                .options(selectinload(Project.project_tracks))
                .where(Project.id == project_id)
            )
            result = await session.execute(statement)
            project = result.scalars().first()
            
            if not project:
                logger.error(f"Project with ID {project_id} not found")
                raise NotFoundException("Project", str(project_id))
            
            logger.info(f"Found project with ID: {project_id} with tracks")
            return project
        except NotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error getting project with tracks: {str(e)}")
            raise DatabaseException(f"Failed to get project with tracks: {str(e)}")

    @staticmethod
    async def get_by_user_id(session: AsyncSession, user_id: uuid.UUID) -> List[Project]:
        """Get all projects for a user"""
        try:
            statement = (
                select(Project)
                .where(Project.user_id == user_id)
                .order_by(Project.created_at.desc())
            )
            result = await session.execute(statement)
            projects = result.scalars().all()
            
            logger.info(f"Found {len(projects)} projects for user {user_id}")
            return projects
        except Exception as e:
            logger.error(f"Error getting projects by user ID: {str(e)}")
            raise DatabaseException(f"Failed to get user projects: {str(e)}")

    @staticmethod
    async def get_by_user_id_paginated(
        session: AsyncSession, 
        user_id: uuid.UUID, 
        page: int = 1, 
        size: int = 10
    ) -> tuple[List[Project], int]:
        """Get paginated projects for a user"""
        try:
            offset = (page - 1) * size
            
            # Query for items on the current page with project_tracks
            items_statement = (
                select(Project)
                .options(selectinload(Project.project_tracks))
                .where(Project.user_id == user_id)
                .offset(offset)
                .limit(size)
                .order_by(Project.created_at.desc())
            )
            items_result = await session.execute(items_statement)
            projects = items_result.scalars().all()
            
            # Query for total count
            count_statement = (
                select(func.count(Project.id))
                .where(Project.user_id == user_id)
            )
            count_result = await session.execute(count_statement)
            total_count = count_result.scalar() or 0
            
            logger.info(f"Found {len(projects)} projects (page {page}) for user {user_id}, total: {total_count}")
            return projects, total_count
        except Exception as e:
            logger.error(f"Error getting paginated projects: {str(e)}")
            raise DatabaseException(f"Failed to get paginated projects: {str(e)}")

    @staticmethod
    async def get_by_user_id_with_tracks(session: AsyncSession, user_id: uuid.UUID) -> List[Project]:
        """Get all projects for a user with tracks loaded"""
        try:
            statement = (
                select(Project)
                .options(selectinload(Project.project_tracks))
                .where(Project.user_id == user_id)
                .order_by(Project.created_at.desc())
            )
            result = await session.execute(statement)
            projects = result.scalars().all()
            
            logger.info(f"Found {len(projects)} projects with tracks for user {user_id}")
            return projects
        except Exception as e:
            logger.error(f"Error getting projects with tracks: {str(e)}")
            raise DatabaseException(f"Failed to get user projects with tracks: {str(e)}")

    @staticmethod
    async def update(
        session: AsyncSession,
        project_id: uuid.UUID,
        update_data: Dict[str, Any]
    ) -> Optional[Project]:
        """Update a project"""
        try:
            # Get the project
            project = await ProjectRepository.get_by_id(session, project_id)
            
            # Update fields
            update_data["updated_at"] = datetime.now(timezone.utc)
            for key, value in update_data.items():
                if hasattr(project, key):
                    setattr(project, key, value)
            
            await session.flush()
            
            logger.info(f"Updated project with ID: {project_id}")
            return project
        except NotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error updating project: {str(e)}")
            raise DatabaseException(f"Failed to update project: {str(e)}")

    @staticmethod
    async def delete(session: AsyncSession, project_id: uuid.UUID) -> bool:
        """Delete a project"""
        try:
            project = await ProjectRepository.get_by_id(session, project_id)
            
            await session.delete(project)
            await session.flush()
            
            logger.info(f"Deleted project with ID: {project_id}")
            return True
        except NotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error deleting project: {str(e)}")
            raise DatabaseException(f"Failed to delete project: {str(e)}")

    @staticmethod
    async def get_all(session: AsyncSession, **filters) -> List[Project]:
        """Get all projects with optional filters"""
        try:
            statement = select(Project)
            
            # Apply filters if provided
            for key, value in filters.items():
                if hasattr(Project, key) and value is not None:
                    statement = statement.where(getattr(Project, key) == value)
            
            result = await session.execute(statement)
            projects = result.scalars().all()
            
            logger.info(f"Found {len(projects)} projects with filters: {filters}")
            return projects
        except Exception as e:
            logger.error(f"Error getting all projects: {str(e)}")
            raise DatabaseException(f"Failed to get projects: {str(e)}")