"""
SQLModel database client for the application
"""

from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import pool, text
from sqlalchemy.pool import NullPool
from uuid import uuid4
from app2.core.config import settings
from app2.core.logging import get_logger
import asyncio
import time

# Import all models to ensure they're registered with SQLModel metadata
# This is necessary for create_all to create all tables
import app2.models  # This imports all models from __init__.py

logger = get_logger("beatgen.database.sqlmodel")

# Get the database URL and convert to async
DATABASE_URL = settings.db.URL
# Remove SSL and application_name from URL and convert to async (we'll handle these in connect_args)
ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
# Remove query parameters that are incompatible with asyncpg
if "?" in ASYNC_DATABASE_URL:
    base_url, query_params = ASYNC_DATABASE_URL.split("?", 1)
    # Remove sslmode and application_name from query params
    clean_params = []
    for param in query_params.split("&"):
        if not param.startswith("sslmode=") and not param.startswith("application_name="):
            clean_params.append(param)
    
    if clean_params:
        ASYNC_DATABASE_URL = base_url + "?" + "&".join(clean_params)
    else:
        ASYNC_DATABASE_URL = base_url

# Detect connection type BEFORE modifying URL
is_direct_connection = ".supabase.co:5432" in ASYNC_DATABASE_URL
is_session_mode = ".pooler.supabase.com:5432" in ASYNC_DATABASE_URL
is_transaction_mode = ".pooler.supabase.com:6543" in ASYNC_DATABASE_URL

# statement_cache_size will be handled via connect_args for better type safety

# Supabase uses Supavisor connection pooler (not pgbouncer)
logger.info(f"ASYNC_DATABASE_URL: {ASYNC_DATABASE_URL}")

if is_direct_connection:
    connection_mode = "Direct Connection"
    logger.info("✅ Using Direct Connection - optimal for persistent servers")
elif is_session_mode:
    connection_mode = "Session Mode Pooler"
    logger.info("✅ Using Session Mode Pooler - supports prepared statements")
elif is_transaction_mode:
    connection_mode = "Transaction Mode Pooler"
    logger.info("⚠️ Using Transaction Mode Pooler - limited prepared statement support")
else:
    connection_mode = "Unknown"
    logger.warning("⚠️ Unknown connection type")

logger.info(f"Supabase connection mode: {connection_mode}")

# Configure connection args based on pooling mode
statement_cache_size = 0 if is_transaction_mode else 100
logger.info(f"Setting statement_cache_size to: {statement_cache_size}")

def get_connect_args():
    """Get connection args optimized for Supabase pooling mode"""
    if is_transaction_mode:
        # Transaction mode: use unique prepared statement names to avoid conflicts
        args = {
            "statement_cache_size": 0,  # CRITICAL: No prepared statements in transaction mode
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",  # Unique names
            "command_timeout": 30,
            "server_settings": {
                "application_name": "beatgen",
                "statement_timeout": "30s"
            },
            "ssl": "require",
        }
        logger.info("Using transaction mode settings: statement_cache_size=0, unique prepared statement names, NullPool")
    else:
        # Session/direct mode: disable prepared statements to avoid idle in transaction
        args = {
            "statement_cache_size": 0,  # CRITICAL: No prepared statements to avoid pooler conflicts
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",  # Unique names if any are created
            "command_timeout": 30,
            "server_settings": {
                "application_name": "beatgen",
                "statement_timeout": "30s"
            },
            "ssl": "require",
        }
        logger.info("Using session/direct mode settings with statement caching")
    
    return args

# Configure engine based on connection type
if is_transaction_mode:
    # Transaction mode: Use NullPool, let Supabase handle all pooling
    engine = create_async_engine(
        ASYNC_DATABASE_URL,
        echo=True,
        poolclass=NullPool,  # CRITICAL: No SQLAlchemy pooling in transaction mode
        connect_args=get_connect_args(),
        pool_pre_ping=True,  # Still useful for connection health checks
    )
else:
    # Session/direct mode: Use SQLAlchemy pooling to reuse Supavisor connections
    engine = create_async_engine(
        ASYNC_DATABASE_URL,
        echo=True,
        pool_size=10,
        max_overflow=10,
        pool_recycle=1800,
        pool_timeout=10,
        pool_pre_ping=True,
        connect_args={
            "ssl": "require",
            # Prepared statements work fine in session mode
            "statement_cache_size": 100,  # Default is fine
            "command_timeout": 60,
        },
    )

# Note: Event listeners for async engines are not supported in SQLAlchemy
# We rely on the connect_args to properly configure the asyncpg connection

# Create async session factory
async_session_factory = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def create_db_and_tables():
    """Create database tables from SQLModel models"""
    try:
        logger.info("Creating database tables...")
        async with engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Error creating database tables: {str(e)}")
        raise


async def get_session():
    """Get an async database session - use as a dependency in FastAPI routes"""
    session_id = f"session_{id(object())}"
    logger.debug(f"Creating session: {session_id}")
    
    async with async_session_factory() as session:
        try:
            yield session
        except Exception as e:
            logger.error(f"Session {session_id} error: {str(e)}")
            await session.rollback()
            raise
        finally:
            logger.debug(f"Closing session: {session_id}")
            await session.close()


from contextlib import asynccontextmanager

@asynccontextmanager
async def get_async_session():
    """Get an async database session context manager - use in service methods"""
    session_id = f"async_session_{id(object())}"
    logger.debug(f"Creating async session: {session_id}")
    
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
            logger.debug(f"Committed async session: {session_id}")
        except Exception as e:
            logger.error(f"Async session {session_id} error: {str(e)}")
            await session.rollback()
            raise
        finally:
            logger.debug(f"Closing async session: {session_id}")
            await session.close()


async def get_connection_stats():
    """Get current database connection statistics"""
    try:
        async with engine.begin() as conn:
            result = await conn.execute(text("""
                SELECT count(*), state, application_name 
                FROM pg_stat_activity 
                WHERE datname = current_database()
                GROUP BY state, application_name
                ORDER BY count(*) DESC
            """))
            stats = result.fetchall()
            logger.info("Database connection stats:")
            for count, state, app_name in stats:
                logger.info(f"  {count} connections - {state} - {app_name}")
            return stats
    except Exception as e:
        logger.error(f"Failed to get connection stats: {e}")
        return []


async def monitor_connections():
    """Periodic connection monitoring task"""
    while True:
        try:
            await get_connection_stats()
            await asyncio.sleep(60)  # Check every minute
        except Exception as e:
            logger.error(f"Connection monitoring error: {e}")
            await asyncio.sleep(60)
