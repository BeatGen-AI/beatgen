"""
Service for managing assistant messages and chat history
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
import uuid

from app2.repositories.assistant_message_repository import AssistantMessageRepository
from app2.models.assistant_message import AssistantMessage, AssistantMessageRead
from app2.core.logging import get_service_logger


class AssistantMessageService:
    """Service for managing assistant chat messages"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = AssistantMessageRepository(session)
        self.logger = get_service_logger("AssistantMessageService")
    
    async def save_user_message(
        self, 
        project_id: uuid.UUID, 
        content: str, 
        mode: str, 
        metadata: Optional[Dict[str, Any]] = None
    ) -> AssistantMessage:
        """
        Save a user message to the database
        
        Args:
            project_id: Project UUID this message belongs to
            content: User's message content
            mode: Mode when message was sent ('generate', 'edit', etc.)
            metadata: Additional metadata (selected_track, model, etc.)
            
        Returns:
            Created AssistantMessage
        """
        self.logger.info(f"Saving user message for project {project_id}")
        
        try:
            message_data = {
                'project_id': project_id,
                'role': 'user',
                'content': content,
                'mode': mode,
                'message_metadata': metadata or {},
                'completed_at': datetime.now(timezone.utc)  # User messages are immediately complete
            }
            
            message = await self.repo.create(message_data)
            self.logger.info(f"Saved user message {message.id} for project {project_id}")
            
            return message
            
        except Exception as e:
            self.logger.error(f"Error saving user message for project {project_id}: {str(e)}")
            raise
    
    async def save_assistant_message(
        self, 
        project_id: uuid.UUID, 
        request_id: str, 
        content: str, 
        mode: Optional[str] = None,
        step: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> AssistantMessage:
        """
        Save an assistant response message to the database
        
        Args:
            project_id: Project UUID this message belongs to
            request_id: Request ID from request manager
            content: Assistant's response content
            mode: Mode when message was sent ('generate', 'edit', 'chat', etc.)
            step: Generation step (for generate mode messages)
            metadata: Additional metadata (model, processing_time, actions, etc.)
            
        Returns:
            Created AssistantMessage
        """
        self.logger.info(f"🔍 SERVICE: Saving assistant message for project {project_id}, request {request_id}")
        self.logger.info(f"🔍 SERVICE: Mode: {mode}, Step: {step}")
        self.logger.info(f"🔍 SERVICE: Content preview: {content[:100] if content else 'None'}...")
        
        try:
            message_data = {
                'project_id': project_id,
                'request_id': request_id,
                'role': 'assistant',
                'content': content,
                'mode': mode,
                'step': step,
                'message_metadata': metadata or {},
                'completed_at': datetime.now(timezone.utc)
            }
            
            message = await self.repo.create(message_data)
            self.logger.info(f"💾 SERVICE: Successfully created assistant message {message.id}")
            self.logger.info(f"💾 SERVICE: Created for project_id: {message.project_id}")
            self.logger.info(f"💾 SERVICE: With mode: {message.mode}, step: {message.step}")
            
            return message
            
        except Exception as e:
            self.logger.error(f"Error saving assistant message for project {project_id}: {str(e)}")
            raise
    
    async def get_project_history(
        self, 
        project_id: uuid.UUID, 
        limit: int = 50
    ) -> List[AssistantMessage]:
        """
        Get conversation history for a project
        
        Args:
            project_id: Project UUID to get history for
            limit: Maximum number of messages to return
            
        Returns:
            List of messages ordered by creation time
        """
        self.logger.info(f"Getting conversation history for project {project_id}")
        
        try:
            messages = await self.repo.find_by_project_id(project_id, limit)
            self.logger.info(f"Retrieved {len(messages)} messages for project {project_id}")
            
            return messages
            
        except Exception as e:
            self.logger.error(f"Error getting history for project {project_id}: {str(e)}")
            raise
    
    async def get_recent_activity(
        self, 
        project_id: uuid.UUID, 
        hours: int = 24
    ) -> List[AssistantMessage]:
        """
        Get recent conversation activity for a project
        
        Args:
            project_id: Project UUID
            hours: Number of hours to look back
            
        Returns:
            List of recent messages
        """
        self.logger.info(f"Getting recent activity for project {project_id} ({hours}h window)")
        
        try:
            messages = await self.repo.get_recent_messages(project_id, hours)
            self.logger.info(f"Retrieved {len(messages)} recent messages for project {project_id}")
            
            return messages
            
        except Exception as e:
            self.logger.error(f"Error getting recent activity for project {project_id}: {str(e)}")
            raise
    
    async def find_by_request_id(self, request_id: str) -> Optional[AssistantMessage]:
        """
        Find assistant message by request ID
        
        Args:
            request_id: Request ID to search for
            
        Returns:
            Assistant message if found, None otherwise
        """
        self.logger.info(f"Finding message by request ID: {request_id}")
        
        try:
            message = await self.repo.find_by_request_id(request_id)
            
            if message:
                self.logger.info(f"Found message {message.id} for request {request_id}")
            else:
                self.logger.info(f"No message found for request {request_id}")
            
            return message
            
        except Exception as e:
            self.logger.error(f"Error finding message by request ID {request_id}: {str(e)}")
            raise
    
    async def update_assistant_message_metadata(
        self, 
        request_id: str, 
        additional_metadata: Dict[str, Any]
    ) -> Optional[AssistantMessage]:
        """
        Update metadata for an assistant message (useful for adding final processing info)
        
        Args:
            request_id: Request ID of the message to update
            additional_metadata: Additional metadata to merge
            
        Returns:
            Updated message if found, None otherwise
        """
        self.logger.info(f"Updating metadata for request {request_id}")
        
        try:
            message = await self.repo.find_by_request_id(request_id)
            if not message:
                self.logger.warning(f"No message found for request {request_id}")
                return None
            
            # Merge additional metadata
            updated_metadata = {**message.message_metadata, **additional_metadata}
            
            updated_message = await self.repo.update(str(message.id), {
                'message_metadata': updated_metadata,
                'completed_at': datetime.now(timezone.utc)
            })
            
            self.logger.info(f"Updated metadata for message {message.id}")
            return updated_message
            
        except Exception as e:
            self.logger.error(f"Error updating metadata for request {request_id}: {str(e)}")
            raise