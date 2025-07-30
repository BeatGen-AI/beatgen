"""
Redis-based SSE Queue Manager for distributed real-time events
"""
import asyncio
import json
import logging
from datetime import datetime
from typing import AsyncGenerator, Dict, Any, Optional
from uuid import UUID

from app2.infrastructure.redis_client import redis_client

logger = logging.getLogger("beatgen.redis_sse_queue")


class DateTimeJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles datetime and UUID objects"""
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, UUID):
            return str(obj)
        return super().default(obj)


class RedisSSEQueue:
    """
    SSE Queue that uses Redis pub/sub for real-time event delivery
    across multiple servers
    """
    
    def __init__(self, request_id: str):
        self.request_id = request_id
        self.channel = f"request_events:{request_id}"
        self.redis = redis_client.get_client()
        
    async def publish_event(self, event_type: str, event_data: Optional[Dict[str, Any]] = None):
        """Publish an event to Redis channel"""
        try:
            message = {
                "event_type": event_type,
                "event_data": event_data,
                "request_id": self.request_id
            }
            
            result = await self.redis.publish(self.channel, json.dumps(message, cls=DateTimeJSONEncoder))
            logger.info(f"Published {event_type} event to channel {self.channel} - {result} subscribers")
            
        except Exception as e:
            logger.error(f"Failed to publish event to Redis: {str(e)}")
            raise
    
    async def subscribe_to_events(self) -> AsyncGenerator[tuple, None]:
        """
        Subscribe to Redis channel and yield events as they arrive
        """
        pubsub = self.redis.pubsub()
        
        try:
            # Subscribe to the channel
            await pubsub.subscribe(self.channel)
            logger.info(f"Subscribed to Redis channel: {self.channel}")
            
            # Listen for messages
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        # Parse the message
                        data = json.loads(message["data"])
                        event_type = data["event_type"]
                        event_data = data["event_data"]
                        
                        yield (event_type, event_data)
                        
                    except Exception as e:
                        logger.error(f"Error parsing Redis message: {str(e)}")
                        continue
                        
        except Exception as e:
            error_msg = str(e)
            # Timeout errors are expected when SSE connections are idle
            if "timeout" in error_msg.lower() or "reading from redis" in error_msg.lower():
                logger.info(f"Redis subscription timeout (normal cleanup): {error_msg}")
            else:
                logger.error(f"Error in Redis subscription: {error_msg}")
                raise
        finally:
            await pubsub.unsubscribe(self.channel)
            await pubsub.close()
            logger.info(f"Unsubscribed from Redis channel: {self.channel}")
    
    async def create_queue_from_subscription(self) -> asyncio.Queue:
        """
        Create an asyncio Queue that receives events from Redis subscription
        with automatic reconnection on timeout
        """
        queue = asyncio.Queue()
        subscription_ready = asyncio.Event()
        keep_running = True
        
        # Start background task to subscribe and feed events into queue
        async def subscription_task():
            nonlocal keep_running
            retry_count = 0
            max_retries = 3
            base_delay = 1
            
            while keep_running and retry_count < max_retries:
                pubsub = None
                try:
                    pubsub = self.redis.pubsub()
                    await pubsub.subscribe(self.channel)
                    logger.info(f"Subscribed to Redis channel: {self.channel} (attempt {retry_count + 1})")
                    
                    # Signal that subscription is ready on first successful connection
                    if not subscription_ready.is_set():
                        subscription_ready.set()
                    
                    # Reset retry count on successful connection
                    retry_count = 0
                    
                    # Listen for messages with timeout handling
                    try:
                        async for message in pubsub.listen():
                            if not keep_running:
                                break
                                
                            if message["type"] == "message":
                                try:
                                    # Parse the message
                                    data = json.loads(message["data"])
                                    event_type = data["event_type"]
                                    event_data = data["event_data"]
                                    
                                    await queue.put((event_type, event_data))
                                    
                                except Exception as e:
                                    logger.error(f"Error parsing Redis message: {str(e)}")
                                    continue
                    except Exception as listen_error:
                        error_msg = str(listen_error)
                        if "timeout" in error_msg.lower() or "reading from redis" in error_msg.lower():
                            logger.info(f"Redis subscription timeout, will reconnect: {error_msg}")
                            # Don't increment retry count for timeouts - just reconnect
                            continue
                        else:
                            raise listen_error
                            
                except Exception as e:
                    error_msg = str(e)
                    retry_count += 1
                    
                    if "timeout" in error_msg.lower() or "reading from redis" in error_msg.lower():
                        logger.info(f"Redis connection timeout, reconnecting in {base_delay * retry_count}s: {error_msg}")
                    else:
                        logger.error(f"Error in subscription task (attempt {retry_count}): {error_msg}")
                    
                    # Signal ready even on error if not already set
                    if not subscription_ready.is_set():
                        subscription_ready.set()
                    
                    # Wait before retrying with exponential backoff
                    if retry_count < max_retries:
                        await asyncio.sleep(base_delay * retry_count)
                    
                finally:
                    if pubsub:
                        try:
                            await pubsub.unsubscribe(self.channel)
                            await pubsub.close()
                        except:
                            pass
            
            # If we exit the retry loop, put a final error event
            if retry_count >= max_retries:
                logger.error(f"Failed to maintain Redis subscription after {max_retries} attempts")
                await queue.put(("error", {"message": "Redis connection failed after multiple retries"}))
            
            logger.info(f"Subscription task ended for channel: {self.channel}")
        
        # Start the subscription task
        task = asyncio.create_task(subscription_task())
        
        # Store task reference so we can cancel it if needed
        def stop_subscription():
            nonlocal keep_running
            keep_running = False
            task.cancel()
        
        queue._subscription_task = task
        queue._stop_subscription = stop_subscription
        
        # Wait for subscription to be established
        await subscription_ready.wait()
        logger.info(f"Redis subscription ready for channel: {self.channel}")
        
        return queue