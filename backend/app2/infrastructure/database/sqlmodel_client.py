"""
SQLModel database client for the application
"""

from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app2.core.config import settings
from app2.core.logging import get_logger

# Import all models to ensure they're registered with SQLModel metadata
# This is necessary for create_all to create all tables

logger = get_logger("beatgen.database.sqlmodel")

# Create async SQLAlchemy engine
from sqlalchemy import pool

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

# Supabase uses Supavisor connection pooler (not pgbouncer)
logger.info(f"ASYNC_DATABASE_URL: {ASYNC_DATABASE_URL}")
# Detect connection type
is_direct_connection = ".supabase.co:5432" in ASYNC_DATABASE_URL
is_session_mode = ".pooler.supabase.com:5432" in ASYNC_DATABASE_URL
is_transaction_mode = ".pooler.supabase.com:6543" in ASYNC_DATABASE_URL

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

engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False,
    
    # Optimized settings based on connection type
    pool_pre_ping=True,
    pool_recycle=300,
    # Direct connection can handle more connections efficiently
    pool_size=20 if is_direct_connection else 15,
    max_overflow=10 if is_direct_connection else 5,
    pool_timeout=30,
    
    # Connection-specific settings
    connect_args={
        # Connection timeout
        "command_timeout": 30,
        "server_settings": {
            "application_name": "beatgen",
            "statement_timeout": "30s"
        },
        "ssl": "require",
        # Prepared statements: enabled for direct/session, disabled for transaction
        "statement_cache_size": 0 if is_transaction_mode else 100,
        # Additional asyncpg setting to ensure no prepared statements in transaction mode
        "prepared_statement_cache_size": 0 if is_transaction_mode else 100,
    },
    
    # Additional engine-level query timeout
    execution_options={
        "postgresql_readonly": False,
        "postgresql_deferrable": False,
        "isolation_level": "READ_COMMITTED",
        "statement_timeout": 30000,  # 30 second timeout for queries
    }
)

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
    async with async_session_factory() as session:
        try:
            yield session
        except Exception as e:
            logger.error(f"Session error: {str(e)}")
            await session.rollback()
            raise
        finally:
            await session.close()


from contextlib import asynccontextmanager

@asynccontextmanager
async def get_async_session():
    """Get an async database session context manager - use in service methods"""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            logger.error(f"Session error: {str(e)}")
            await session.rollback()
            raise
        finally:
            await session.close()
