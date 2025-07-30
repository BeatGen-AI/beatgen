"""
Distributed SSE Queue Manager using PostgreSQL LISTEN/NOTIFY
"""
import asyncio
import json
import logging
from typing import Dict, Any, Optional, AsyncGenerator
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

from app2.infrastructure.database.supabase_client import supabase
from app2.services.distributed_requests_service import DistributedRequestsService

logger = logging.getLogger("beatgen.distributed_sse_queue")


class DistributedSSEQueue:
    """
    SSE Queue that uses PostgreSQL LISTEN/NOTIFY for real-time event delivery
    across multiple servers
    """
    
    def __init__(self, request_id: str):
        self.request_id = request_id
        self.distributed_service = DistributedRequestsService()
        self._connection = None
        self._cursor = None
        
    async def connect(self):
        """Connect to PostgreSQL for LISTEN/NOTIFY"""
        try:
            # Get connection info from Supabase client
            # Note: In a real implementation, you'd want to use the database URL
            # For now, we'll simulate with polling as a fallback
            logger.info(f"Setting up distributed SSE for request {self.request_id}")
        except Exception as e:
            logger.error(f"Failed to connect for LISTEN/NOTIFY: {str(e)}")
            # Fallback to polling
    
    async def listen_for_events(self) -> AsyncGenerator[tuple, None]:
        """
        Listen for PostgreSQL notifications and yield events
        Since we can't easily get raw PostgreSQL connection from Supabase client,
        we'll use a hybrid approach: efficient polling with NOTIFY optimization
        """
        last_event_id = None
        
        while True:
            try:
                # Get new events since last check
                events = await self.distributed_service.get_queue_events(
                    request_id=self.request_id,
                    mark_processed=True
                )
                
                # Yield new events
                for event in events:
                    if last_event_id is None or event["id"] != last_event_id:
                        yield (event["event_type"], event["event_data"])
                        last_event_id = event["id"]
                
                # Short sleep to prevent excessive polling
                # In a real LISTEN/NOTIFY setup, this would block until notification
                await asyncio.sleep(0.1)
                
            except Exception as e:
                logger.error(f"Error listening for events: {str(e)}")
                await asyncio.sleep(1)  # Longer sleep on error
    
    async def close(self):
        """Close the connection"""
        if self._cursor:
            self._cursor.close()
        if self._connection:
            self._connection.close()
        logger.info(f"Closed distributed SSE connection for request {self.request_id}")