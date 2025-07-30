"""
Redis client for distributed SSE events
"""
import os
import ssl
import redis.asyncio as redis
import logging

logger = logging.getLogger("beatgen.redis_client")

class RedisClient:
    """Singleton Redis client for pub/sub operations"""
    
    _instance = None
    _redis_client = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(RedisClient, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._redis_client is None:
            self._connect()
    
    def _connect(self):
        """Connect to Redis"""
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        
        try:
            # For Redis Cloud, convert to rediss:// and use from_url
            if "redis-cloud" in redis_url:
                # Convert redis:// to rediss:// for SSL
                # if redis_url.startswith("redis://"):
                #     redis_url = redis_url.replace("redis://", "rediss://")
                
                self._redis_client = redis.from_url(
                    redis_url,
                    decode_responses=True,
                    socket_connect_timeout=10,
                    socket_timeout=60,  # Longer socket timeout for pub/sub
                    socket_keepalive=True,
                    socket_keepalive_options={},
                    health_check_interval=30,  # Check connection health every 30 seconds
                    retry_on_timeout=True,
                    retry_on_error=[redis.ConnectionError, redis.TimeoutError],
                    max_connections=20  # Connection pool size
                )
                logger.info(f"Connected to Redis Cloud with SSL")
            else:
                # Use from_url for local/other Redis
                self._redis_client = redis.from_url(
                    redis_url,
                    decode_responses=True,
                    socket_connect_timeout=10,
                    socket_timeout=60,  # Longer socket timeout for pub/sub
                    socket_keepalive=True,
                    socket_keepalive_options={},
                    health_check_interval=30,  # Check connection health every 30 seconds
                    retry_on_timeout=True,
                    retry_on_error=[redis.ConnectionError, redis.TimeoutError],
                    max_connections=20  # Connection pool size
                )
                logger.info(f"Connected to Redis at {redis_url[:30]}...")
                
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {str(e)}")
            raise
    
    def get_client(self) -> redis.Redis:
        """Get Redis client instance"""
        return self._redis_client


# Singleton instance
redis_client = RedisClient()