"""
Repository for assistant message database operations
"""

from typing import List
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app2.repositories.base_repository import BaseRepository
from app2.models.assistant_message import AssistantMessage


class AssistantMessageRepository(BaseRepository[AssistantMessage]):
    """Repository for managing assistant messages in the database"""
    
    def __init__(self, session: AsyncSession):
        super().__init__(AssistantMessage, session)
    
    async def find_by_project_id(self, project_id: uuid.UUID, limit: int = 50) -> List[AssistantMessage]:
        """
        Get all messages for a specific project, ordered by creation time
        
        Args:
            project_id: Project UUID to get messages for
            limit: Maximum number of messages to return (default 50)
            
        Returns:
            List of assistant messages for the project
        """
        self.logger.info(f"Finding assistant messages for project {project_id}")
        
        try:
            statement = (
                select(AssistantMessage)
                .where(AssistantMessage.project_id == project_id)
                .order_by(AssistantMessage.created_at)
                .limit(limit)
            )
            
            result = await self.session.execute(statement)
            messages = result.scalars().all()
            
            self.logger.info(f"Found {len(messages)} messages for project {project_id}")
            return messages
            
        except Exception as e:
            self.logger.error(f"Error finding messages for project {project_id}: {str(e)}")
            raise
    
    async def find_by_request_id(self, request_id: str) -> AssistantMessage | None:
        """
        Find assistant message by request ID
        
        Args:
            request_id: Request ID to search for
            
        Returns:
            Assistant message if found, None otherwise
        """
        self.logger.info(f"Finding assistant message for request {request_id}")
        
        try:
            statement = select(AssistantMessage).where(
                AssistantMessage.request_id == request_id
            )
            
            result = await self.session.execute(statement)
            message = result.scalars().first()
            
            if message:
                self.logger.info(f"Found message for request {request_id}")
            else:
                self.logger.info(f"No message found for request {request_id}")
            
            return message
            
        except Exception as e:
            self.logger.error(f"Error finding message for request {request_id}: {str(e)}")
            raise
    
    async def get_recent_messages(self, project_id: uuid.UUID, hours: int = 24) -> List[AssistantMessage]:
        """
        Get recent messages for a project within the specified time window
        
        Args:
            project_id: Project UUID
            hours: Number of hours to look back (default 24)
            
        Returns:
            List of recent assistant messages
        """
        from datetime import datetime, timezone, timedelta
        
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        self.logger.info(f"Finding recent messages for project {project_id} since {cutoff_time}")
        
        try:
            statement = (
                select(AssistantMessage)
                .where(
                    AssistantMessage.project_id == project_id,
                    AssistantMessage.created_at >= cutoff_time
                )
                .order_by(AssistantMessage.created_at)
            )
            
            result = await self.session.execute(statement)
            messages = result.scalars().all()
            
            self.logger.info(f"Found {len(messages)} recent messages for project {project_id}")
            return messages
            
        except Exception as e:
            self.logger.error(f"Error finding recent messages for project {project_id}: {str(e)}")
            raise