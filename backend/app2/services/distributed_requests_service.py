"""
Service for distributed request management using database storage
"""
import time
import uuid
import logging
import asyncio
from typing import Dict, Any, Optional, Set, List
from datetime import datetime, timezone, timedelta

from app2.core.logging import get_service_logger
from app2.core.exceptions import ServiceException, NotFoundException
from app2.infrastructure.database.supabase_client import supabase
from app2.sse.sse_queue_manager import SSEQueueManager
from app2.sse.request_manager import RequestStatus

logger = get_service_logger("distributed_requests")


class DistributedRequestsService:
    """
    Service for managing distributed requests using database storage.
    This service provides the same interface as the in-memory RequestManager
    but stores data in the database for multi-server compatibility.
    """

    # Class constants
    MAX_REQUESTS_PER_USER = 5
    REQUEST_TIMEOUT_SECONDS = 300  # 5 minutes
    MAX_TOTAL_REQUESTS = 1000

    def __init__(self):
        """Initialize the distributed requests service"""
        logger.info("Distributed requests service initialized")

    def generate_request_id(self) -> str:
        """Generate a unique request ID with timestamp"""
        timestamp = int(time.time())
        unique_id = str(uuid.uuid4())
        request_id = f"{timestamp}-{unique_id}"
        return request_id

    async def can_create_request(self, user_id: str) -> bool:
        """Check if a user can create a new request (rate limiting)"""
        try:
            # Count active requests for this user
            response = supabase.client.table("distributed_requests").select("request_id").eq("user_id", user_id).in_("status", [
                RequestStatus.PENDING.value,
                RequestStatus.PROCESSING.value
            ]).execute()
            
            user_request_count = len(response.data)
            return user_request_count < self.MAX_REQUESTS_PER_USER
        except Exception as e:
            logger.error(f"Error checking if user can create request: {str(e)}")
            raise ServiceException(f"Failed to check request limits: {str(e)}") from e

    async def create_request(
        self,
        user_id: str,
        mode: str,
        prompt: str,
        model: str,
        track_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Create a new request and store it in the database
        
        Args:
            user_id: User ID making the request
            mode: Request mode (generate, edit, chat)
            prompt: User prompt text
            model: Model to use for the request
            track_id: Optional track ID (for edit mode)
            context: Optional additional context
            
        Returns:
            Generated request ID
            
        Raises:
            ValueError: If user has too many active requests or system at capacity
            ServiceException: If the operation fails
        """
        logger.info(f"Creating distributed request for user: {user_id}, mode: {mode}")
        
        try:
            # Check rate limiting
            if not await self.can_create_request(user_id):
                raise ValueError(f"User {user_id} has reached the maximum number of active requests")
            
            # Check global limits
            total_response = supabase.client.table("distributed_requests").select("request_id").in_("status", [
                RequestStatus.PENDING.value,
                RequestStatus.PROCESSING.value
            ]).execute()
            
            if len(total_response.data) >= self.MAX_TOTAL_REQUESTS:
                logger.error(f"Global request limit reached: {len(total_response.data)} requests")
                # Trigger cleanup
                await self._cleanup_expired_requests()
                # Check again after cleanup
                total_response = supabase.client.table("distributed_requests").select("request_id").in_("status", [
                    RequestStatus.PENDING.value,
                    RequestStatus.PROCESSING.value
                ]).execute()
                if len(total_response.data) >= self.MAX_TOTAL_REQUESTS:
                    raise ValueError("System is at capacity, please try again later")

            # Generate request ID
            request_id = self.generate_request_id()

            # Create request data
            request_data = {
                "request_id": request_id,
                "user_id": user_id,
                "status": RequestStatus.PENDING.value,
                "mode": mode,
                "model": model,
                "prompt": prompt,
                "track_id": track_id,
                "context": context,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

            # Insert into database
            response = supabase.client.table("distributed_requests").insert(request_data).execute()
            
            if not response.data:
                raise ServiceException("Failed to create request in database")

            logger.info(f"Created distributed request {request_id} for user {user_id}, mode: {mode}")
            return request_id

        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Error creating distributed request: {str(e)}")
            raise ServiceException(f"Failed to create request: {str(e)}") from e

    async def get_request(self, request_id: str) -> Optional[Dict[str, Any]]:
        """Get request data by ID"""
        try:
            response = supabase.client.table("distributed_requests").select("*").eq("request_id", request_id).execute()
            
            if not response.data:
                return None
                
            request_data = response.data[0]
            # Convert status back to enum
            request_data["status"] = RequestStatus(request_data["status"])
            return request_data

        except Exception as e:
            logger.error(f"Error getting request {request_id}: {str(e)}")
            raise ServiceException(f"Failed to get request: {str(e)}") from e

    async def update_request_status(self, request_id: str, status: RequestStatus) -> bool:
        """Update request status"""
        try:
            response = supabase.client.table("distributed_requests").update({
                "status": status.value
            }).eq("request_id", request_id).execute()
            
            return len(response.data) > 0

        except Exception as e:
            logger.error(f"Error updating request status {request_id}: {str(e)}")
            raise ServiceException(f"Failed to update request status: {str(e)}") from e

    async def validate_request_id(self, request_id: str, user_id: Optional[str] = None) -> bool:
        """
        Validate a request ID
        
        Args:
            request_id: Request ID to validate
            user_id: If provided, also validates that the request belongs to this user
            
        Returns:
            True if valid, False otherwise
        """
        try:
            query = supabase.client.table("distributed_requests").select("user_id").eq("request_id", request_id)
            
            if user_id:
                query = query.eq("user_id", user_id)
            
            response = query.execute()
            
            if not response.data:
                logger.error(f"Request {request_id} not found in distributed storage")
                return False
                
            if user_id and response.data[0]["user_id"] != user_id:
                logger.error(f"Request {request_id} not found for user {user_id}")
                return False
                
            return True

        except Exception as e:
            logger.error(f"Error validating request ID {request_id}: {str(e)}")
            return False

    async def remove_request(self, request_id: str, status: RequestStatus = RequestStatus.COMPLETED) -> bool:
        """Remove a request by updating its status to completed/cancelled"""
        try:
            # Update status first
            await self.update_request_status(request_id, status)
            
            # For now, we keep the record but mark it as completed/cancelled
            # Could implement actual deletion with a cleanup job later
            logger.info(f"Marked request {request_id} as {status.value}")
            return True

        except Exception as e:
            logger.error(f"Error removing request {request_id}: {str(e)}")
            return False

    async def get_active_requests_count(self, user_id: Optional[str] = None) -> int:
        """Get count of active requests, optionally filtered by user"""
        try:
            query = supabase.client.table("distributed_requests").select("request_id").in_("status", [
                RequestStatus.PENDING.value,
                RequestStatus.PROCESSING.value
            ])
            
            if user_id:
                query = query.eq("user_id", user_id)
            
            response = query.execute()
            return len(response.data)

        except Exception as e:
            logger.error(f"Error getting active requests count: {str(e)}")
            return 0

    async def _cleanup_expired_requests(self):
        """Clean up expired requests"""
        try:
            # Calculate timeout timestamp
            timeout_timestamp = datetime.now(timezone.utc) - timedelta(seconds=self.REQUEST_TIMEOUT_SECONDS)
            
            # Find expired requests
            response = supabase.client.table("distributed_requests").select("request_id").lt(
                "created_at", timeout_timestamp.isoformat()
            ).in_("status", [
                RequestStatus.PENDING.value,
                RequestStatus.PROCESSING.value
            ]).execute()
            
            expired_request_ids = [req["request_id"] for req in response.data]
            
            if expired_request_ids:
                # Mark as timed out
                supabase.client.table("distributed_requests").update({
                    "status": RequestStatus.TIMED_OUT.value
                }).in_("request_id", expired_request_ids).execute()
                
                logger.info(f"Cleaned up {len(expired_request_ids)} expired requests")

        except Exception as e:
            logger.error(f"Error cleaning up expired requests: {str(e)}")

    async def add_queue_event(self, request_id: str, event_type: str, event_data: Optional[Dict[str, Any]] = None):
        """Add an event to the request queue and notify listeners"""
        try:
            queue_data = {
                "request_id": request_id,
                "event_type": event_type,
                "event_data": event_data,
                "processed": False
            }
            
            response = supabase.client.table("distributed_request_queues").insert(queue_data).execute()
            
            if not response.data:
                raise ServiceException("Failed to add queue event")
            
            # Send PostgreSQL NOTIFY to wake up listeners
            try:
                # Use Supabase RPC to send NOTIFY
                supabase.client.rpc('notify_request_event', {
                    'request_id': request_id,
                    'event_type': event_type
                }).execute()
            except Exception as notify_error:
                logger.warning(f"Failed to send NOTIFY for {request_id}: {str(notify_error)}")
                # Continue - the event is still stored in database
                
            logger.debug(f"Added queue event {event_type} for request {request_id}")

        except Exception as e:
            logger.error(f"Error adding queue event: {str(e)}")
            raise ServiceException(f"Failed to add queue event: {str(e)}") from e

    async def get_queue_events(self, request_id: str, mark_processed: bool = True) -> List[Dict[str, Any]]:
        """Get unprocessed queue events for a request"""
        try:
            response = supabase.client.table("distributed_request_queues").select("*").eq(
                "request_id", request_id
            ).eq("processed", False).order("created_at").execute()
            
            events = response.data
            
            if mark_processed and events:
                # Mark events as processed
                event_ids = [event["id"] for event in events]
                supabase.client.table("distributed_request_queues").update({
                    "processed": True
                }).in_("id", event_ids).execute()
            
            return events

        except Exception as e:
            logger.error(f"Error getting queue events for {request_id}: {str(e)}")
            return []