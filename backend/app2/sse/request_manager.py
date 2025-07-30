"""
Request Manager for handling AI assistant request IDs and tracking active requests.
Provides request ID generation, storage, and validation services.
"""

import uuid
import time
import logging
import asyncio
import os
import json
from enum import Enum
from typing import Dict, Any, Optional, Set
from pydantic import BaseModel
from app2.sse.sse_queue_manager import SSEQueueManager

# Set up logger
logger = logging.getLogger("beatgen.request_manager")


class RequestStatus(str, Enum):
    """Status of an assistant request"""

    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    TIMED_OUT = "TIMED_OUT"


class RequestContext(BaseModel):
    """Context data for an assistant request"""

    request_id: str
    user_id: str
    timestamp: float
    status: RequestStatus
    mode: str
    prompt: str
    model: str
    track_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
    task_ref: Optional[Any] = None
    sse_queue: Optional[SSEQueueManager] = None  # Changed from queue to sse_queue
    chat_session: Optional[Any] = None # Added to hold a reference to ChatSession

    class Config:
        arbitrary_types_allowed = True


class RequestManager:
    """
    Manager for assistant request IDs and tracking active requests.
    Can use either in-memory storage or distributed database storage based on configuration.
    """

    # Singleton instance
    _instance = None

    # Class constants
    MAX_REQUESTS_PER_USER = 5
    REQUEST_TIMEOUT_SECONDS = 300  # 5 minutes
    CLEANUP_INTERVAL_SECONDS = 60  # 1 minute
    
    # Global limits to prevent memory exhaustion
    MAX_TOTAL_REQUESTS = 1000
    FORCE_CLEANUP_THRESHOLD = 800

    def __new__(cls):
        """Singleton pattern to ensure only one request manager exists"""
        if cls._instance is None:
            cls._instance = super(RequestManager, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        """Initialize the request manager"""
        # Skip initialization if already done
        if self._initialized:
            return

        # Check if we should use distributed storage
        self._use_distributed = os.getenv("USE_DISTRIBUTED_REQUESTS", "false").lower() == "true"
        
        # Always initialize local storage for request management
        # Active requests by request_id
        self._requests: Dict[str, RequestContext] = {}

        # Set of request IDs per user
        self._user_requests: Dict[str, Set[str]] = {}

        # Initialize cleanup task as None - will be started when needed
        self._cleanup_task = None
        
        if self._use_distributed:
            # Import Redis client for storing request data
            from app2.infrastructure.redis_client import redis_client
            self._redis = redis_client.get_client()
            logger.info("Request manager initialized with Redis storage + Redis pub/sub")
        else:
            # Traditional in-memory storage only
            logger.info("Request manager initialized with in-memory storage only")

        self._initialized = True

    async def _cleanup_loop(self):
        """Background task to clean up expired requests"""
        while True:
            try:
                await asyncio.sleep(self.CLEANUP_INTERVAL_SECONDS)
                self._cleanup_expired_requests()
            except asyncio.CancelledError:
                logger.info("Cleanup task cancelled")
                break
            except Exception as e:
                logger.error(f"Error in cleanup loop: {str(e)}")

    def _ensure_cleanup_task(self):
        """Ensure cleanup task is running"""
        if self._cleanup_task is None or self._cleanup_task.done():
            try:
                self._cleanup_task = asyncio.create_task(self._cleanup_loop())
            except RuntimeError:
                # No event loop running, cleanup task will be started later
                pass

    def _cleanup_expired_requests(self):
        """Clean up expired requests with forced cleanup if needed"""
        current_time = time.time()
        expired_requests = []
        total_requests = len(self._requests)

        # Find expired requests
        for request_id, context in self._requests.items():
            if (current_time - context.timestamp) > self.REQUEST_TIMEOUT_SECONDS:
                expired_requests.append(request_id)

        # Force cleanup if we're approaching memory limits
        if total_requests >= self.FORCE_CLEANUP_THRESHOLD:
            logger.warning(f"Force cleanup triggered: {total_requests} active requests")
            # Remove oldest 20% of requests regardless of timeout
            oldest_requests = sorted(
                self._requests.items(), 
                key=lambda x: x[1].timestamp
            )[:int(total_requests * 0.2)]
            
            for request_id, _ in oldest_requests:
                if request_id not in expired_requests:
                    expired_requests.append(request_id)
                    logger.warning(f"Force removing request {request_id} due to memory pressure")

        # Remove expired requests
        for request_id in expired_requests:
            self.remove_request(request_id, RequestStatus.TIMED_OUT)

        if expired_requests:
            logger.info(f"Cleaned up {len(expired_requests)} expired requests")

    def generate_request_id(self) -> str:
        """Generate a unique request ID with timestamp"""
        # Format: timestamp-uuid
        timestamp = int(time.time())
        unique_id = str(uuid.uuid4())
        request_id = f"{timestamp}-{unique_id}"
        return request_id

    async def can_create_request(self, user_id: str) -> bool:
        """Check if a user can create a new request (rate limiting)"""
        if self._use_distributed:
            # Get user's active requests from Redis
            user_requests_key = f"user_requests:{user_id}"
            user_request_count = await self._redis.scard(user_requests_key)
            return user_request_count < self.MAX_REQUESTS_PER_USER
        else:
            user_requests = self._user_requests.get(user_id, set())
            return len(user_requests) < self.MAX_REQUESTS_PER_USER

    async def create_request(
        self,
        user_id: str,
        mode: str,
        prompt: str,
        model: str,
        track_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        logger.info(
            f"🔵 REQUEST_MANAGER - Creating request for user: {user_id}, mode: {mode}"
        )
        """
        Create a new request and store its context
        
        Args:
            user_id: User ID making the request
            mode: Request mode (generate, edit, chat)
            prompt: User prompt text
            track_id: Optional track ID (for edit mode)
            context: Optional additional context
            
        Returns:
            Generated request ID
            
        Raises:
            ValueError: If user has too many active requests
        """
        
        if self._use_distributed:
            # Store request data in Redis
            # Check rate limiting first
            if not await self.can_create_request(user_id):
                raise ValueError(
                    f"User {user_id} has reached the maximum number of active requests"
                )

            # Generate request ID
            request_id = self.generate_request_id()

            # Store request data in Redis
            request_data = {
                "request_id": request_id,
                "user_id": user_id,
                "status": RequestStatus.PENDING.value,
                "mode": mode,
                "prompt": prompt,
                "model": model,
                "track_id": track_id or "",
                "context": json.dumps(context) if context else "{}",
                "timestamp": time.time()
            }

            # Store in Redis with expiration (5 minutes)
            request_key = f"request:{request_id}"
            await self._redis.hset(request_key, mapping=request_data)
            await self._redis.expire(request_key, self.REQUEST_TIMEOUT_SECONDS)

            # Add to user's request set
            user_requests_key = f"user_requests:{user_id}"
            await self._redis.sadd(user_requests_key, request_id)
            await self._redis.expire(user_requests_key, self.REQUEST_TIMEOUT_SECONDS)

            logger.info(f"🔵 REQUEST_MANAGER - Created Redis request {request_id} for user {user_id}, mode: {mode}")
            return request_id
        else:
            # Use local storage - check rate limiting
            if not await self.can_create_request(user_id):
                raise ValueError(
                    f"User {user_id} has reached the maximum number of active requests"
                )
        
        # Check global limits
        if len(self._requests) >= self.MAX_TOTAL_REQUESTS:
            logger.error(f"Global request limit reached: {len(self._requests)} requests")
            # Force immediate cleanup
            self._cleanup_expired_requests()
            if len(self._requests) >= self.MAX_TOTAL_REQUESTS:
                raise ValueError("System is at capacity, please try again later")

        # Generate request ID
        request_id = self.generate_request_id()

        # Create SSE event queue for this request
        sse_queue = SSEQueueManager(request_id)

        # Create request context
        request_context = RequestContext(
            request_id=request_id,
            user_id=user_id,
            timestamp=time.time(),
            status=RequestStatus.PENDING,
            mode=mode,
            model=model,
            prompt=prompt,
            track_id=track_id,
            context=context,
            sse_queue=sse_queue,
        )

        # Store request
        self._requests[request_id] = request_context

        # Add to user requests
        if user_id not in self._user_requests:
            self._user_requests[user_id] = set()
        
        # Ensure cleanup task is running
        self._ensure_cleanup_task()
        
        self._user_requests[user_id].add(request_id)
        logger.info(
            f"🔵 REQUEST_MANAGER - Created new user_requests entry for user: {user_id}"
        )

        logger.info(
            f"🔵 REQUEST_MANAGER (Instance: {id(self)}) - Created request {request_id} for user {user_id}, mode: {mode}"
        )
        logger.info(
            f"🔵 REQUEST_MANAGER - Active requests for user {user_id}: {self._user_requests[user_id]}"
        )
        return request_id

    async def get_request(self, request_id: str) -> Optional[RequestContext]:
        """Get request context by ID"""
        if self._use_distributed:
            # Get request data from Redis
            request_key = f"request:{request_id}"
            request_data = await self._redis.hgetall(request_key)
            
            if not request_data:
                return None
                
            # Parse context JSON
            try:
                context = json.loads(request_data.get('context', '{}'))
            except:
                context = {}
                
            # Convert to RequestContext for compatibility
            return RequestContext(
                request_id=request_data["request_id"],
                user_id=request_data["user_id"],
                timestamp=float(request_data.get("timestamp", time.time())),
                status=RequestStatus(request_data["status"]),
                mode=request_data["mode"],
                prompt=request_data["prompt"],
                model=request_data["model"],
                track_id=request_data.get("track_id") if request_data.get("track_id") else None,
                context=context,
                sse_queue=None,  # Will be handled separately for distributed mode
                task_ref=None,
                chat_session=None
            )
        else:
            return self._requests.get(request_id)

    async def update_request_status(self, request_id: str, status: RequestStatus) -> bool:
        """Update request status"""
        if self._use_distributed:
            # Update status in Redis
            request_key = f"request:{request_id}"
            result = await self._redis.hset(request_key, "status", status.value)
            return result is not None
        else:
            request = self._requests.get(request_id)
            if not request:
                return False

            request.status = status
            return True

    def set_task_reference(self, request_id: str, task_ref: Any) -> bool:
        """Set task reference for a request"""
        if self._use_distributed:
            # In distributed mode, task references are not stored in Redis
            # They are handled locally by each server instance
            logger.info(f"Task reference set locally for distributed request {request_id}")
            return True
        else:
            request = self._requests.get(request_id)
            if not request:
                return False

            request.task_ref = task_ref
            return True

    def set_chat_session(self, request_id: str, chat_session: Any) -> bool:
        """Set ChatSession reference for a request"""
        if self._use_distributed:
            # In distributed mode, chat sessions are not stored in Redis
            # They are handled locally by each server instance
            logger.info(f"Chat session set locally for distributed request {request_id}")
            return True
        else:
            request = self._requests.get(request_id)
            if not request:
                logger.warning(f"Attempted to set chat session for non-existent request: {request_id}")
                return False
            
            request.chat_session = chat_session
            logger.info(f"Chat session set for request {request_id}")
            return True

    async def get_queue(self, request_id: str) -> Optional[asyncio.Queue]:
        """Get the queue for a request"""
        if self._use_distributed:
            # In distributed mode, create a Redis-based queue that subscribes to events
            from app2.sse.redis_sse_queue import RedisSSEQueue
            redis_queue = RedisSSEQueue(request_id)
            return await redis_queue.create_queue_from_subscription()
        else:
            request = self._requests.get(request_id)
            if not request or not request.sse_queue:
                return None

            return request.sse_queue.get_queue()

    async def get_sse_queue(self, request_id: str) -> Optional[SSEQueueManager]:
        """Get the SSE event queue for a request"""
        if self._use_distributed:
            # In distributed mode, create a new SSE queue for this request
            # This will be used for sending new events to the distributed storage
            return SSEQueueManager(request_id)
        else:
            request = self._requests.get(request_id)
            if not request:
                return None

            return request.sse_queue

    async def remove_request(
        self, request_id: str, status: RequestStatus = RequestStatus.COMPLETED
    ) -> bool:
        """Remove a request and update its status"""
        if self._use_distributed:
            # Get request data from Redis first
            request_key = f"request:{request_id}"
            request_data = await self._redis.hgetall(request_key)
            
            if not request_data:
                return False

            user_id = request_data.get("user_id")
            
            # Update status first
            await self._redis.hset(request_key, "status", status.value)
            
            # Remove from user's request set
            if user_id:
                user_requests_key = f"user_requests:{user_id}"
                await self._redis.srem(user_requests_key, request_id)
            
            # Remove the request data from Redis
            await self._redis.delete(request_key)
            
            logger.info(f"Removed Redis request {request_id} with status {status}")
            return True
        else:
            request = self._requests.get(request_id)
            if not request:
                return False

            # Update status
            request.status = status

            # Remove from user requests
            user_id = request.user_id
            if user_id in self._user_requests:
                self._user_requests[user_id].discard(request_id)
                if not self._user_requests[user_id]:
                    del self._user_requests[user_id]

            # Cancel task if it exists
            if request.task_ref and not request.task_ref.done():
                request.task_ref.cancel()

            # Cancel chat session if it exists and status is CANCELLED
            if status == RequestStatus.CANCELLED and request.chat_session:
                if hasattr(request.chat_session, 'cancel') and callable(request.chat_session.cancel):
                    try:
                        logger.info(f"Calling .cancel() on chat session for request {request_id}")
                        request.chat_session.cancel()
                    except Exception as e:
                        logger.error(f"Error calling .cancel() on chat session for {request_id}: {e}")
                else:
                    logger.warning(f"chat_session for request {request_id} does not have a callable 'cancel' method.")

            # Remove from requests
            del self._requests[request_id]

            logger.info(f"Removed request {request_id} with status {status}")
            return True

    async def validate_request_id(
        self, request_id: str, user_id: Optional[str] = None
    ) -> bool:
        """
        Validate a request ID

        Args:
            request_id: Request ID to validate
            user_id: If provided, also validates that the request belongs to this user

        Returns:
            True if valid, False otherwise
        """
        if self._use_distributed:
            # Check if request exists in Redis
            request_key = f"request:{request_id}"
            request_data = await self._redis.hgetall(request_key)
            
            if not request_data:
                logger.error(f"Request {request_id} not found in Redis")
                return False

            # Check user if provided
            if user_id and request_data.get("user_id") != user_id:
                logger.error(f"Request {request_id} not found for user {user_id} in Redis")
                return False

            return True
        else:
            # Check if request exists
            request = self._requests.get(request_id)
            if not request:
                logger.error(f"Request {request_id} not found in RequestManager (Instance: {id(self)})")
                return False

            # Check user if provided
            if user_id and request.user_id != user_id:
                logger.error(f"Request {request_id} not found for user {user_id} in RequestManager (Instance: {id(self)})")
                return False

            return True

    async def get_active_requests_count(self, user_id: Optional[str] = None) -> int:
        """Get count of active requests, optionally filtered by user"""
        if self._use_distributed:
            if user_id:
                # Get user's active requests from Redis
                user_requests_key = f"user_requests:{user_id}"
                return await self._redis.scard(user_requests_key)
            else:
                # Count all request keys in Redis
                request_keys = await self._redis.keys("request:*")
                return len(request_keys)
        else:
            if user_id:
                return len(self._user_requests.get(user_id, set()))
            else:
                return len(self._requests)

    async def shutdown(self):
        """Clean up resources on shutdown"""
        if hasattr(self, "_cleanup_task"):
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

        # Clear all requests
        self._requests.clear()
        self._user_requests.clear()
        logger.info("Request manager shut down")


# Singleton instance
request_manager = RequestManager()
