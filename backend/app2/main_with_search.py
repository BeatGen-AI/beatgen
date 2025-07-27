"""
Main entry point for BeatGen Backend API with Search and DAW Integration.

This is a staging/development version that includes the new search and DAW integration
endpoints. It's a copy of main.py with additional routes for testing purposes.
"""

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import traceback

from app2.core.config import settings
from app2.core.logging import get_logger
from app2.core.exceptions import AppException
from app2.api.routes import auth, users, projects, sounds, soundfonts
from app2.infrastructure.database.sqlmodel_client import create_db_and_tables
from app2.api.routes import assistant_streaming
from app2.api.routes import drum_samples
from app2.api.routes import subscriptions, stripe_webhooks, credits

# New imports for search and DAW integration
from app2.api.routes import search, daw_integration

# Configure logging
logger = get_logger("beatgen.main_with_search")

# Create FastAPI app
app = FastAPI(
    title=settings.app.PROJECT_NAME + " (With Search & DAW Integration)",
    description="Backend API for BeatGen DAW - Development version with search capabilities",
    version="0.3.0-dev",
)

# Disable automatic redirection of trailing slashes
app.router.redirect_slashes = False

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors.ORIGINS,
    allow_credentials=settings.cors.ALLOW_CREDENTIALS,
    allow_methods=settings.cors.ALLOW_METHODS,
    allow_headers=settings.cors.ALLOW_HEADERS,
)


# Initialize SQLModel tables on startup
@app.on_event("startup")
def init_db():
    """Initialize the database and create tables"""
    logger.info("Initializing database and creating tables...")
    try:
        create_db_and_tables()
        logger.info("Database initialization complete")
    except Exception as e:
        logger.error(f"Database initialization failed: {str(e)}")
        logger.error(traceback.format_exc())
        # Continue running even if database initialization fails
        # This allows the app to start and potentially use other features


# Global exception handler for AppExceptions
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    logger.error(f"AppException: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "path": request.url.path,
        },
    )


# Global exception handler for unhandled exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_detail = str(exc)
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR

    # Log the full exception with traceback
    logger.error(f"Unhandled exception: {error_detail}")
    logger.error(f"Request path: {request.url.path}")
    logger.error(traceback.format_exc())

    return JSONResponse(
        status_code=status_code,
        content={
            "detail": "An internal server error occurred",
            "error": error_detail,
            "path": request.url.path,
        },
    )


# Include existing production routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(
    users.router, prefix="/users", tags=["users"]
)
app.include_router(
    projects.router, prefix="/projects", tags=["projects"]
)
app.include_router(
    sounds.router, prefix="/sounds", tags=["sounds"]
)
app.include_router(
    soundfonts.router,
    prefix="/soundfonts",
    tags=["soundfonts"],
)
app.include_router(
    drum_samples.router,
    prefix="/drum-samples",
    tags=["drum_samples"],
)
app.include_router(
    assistant_streaming.router,
    prefix="/assistant",
    tags=["assistant"],
)
app.include_router(
    subscriptions.router,
    prefix="/subscriptions",
    tags=["subscriptions"],
)
app.include_router(
    stripe_webhooks.router,
    prefix="/webhooks",
    tags=["webhooks"],
)
app.include_router(
    credits.router,
    prefix="/credits",
    tags=["credits"],
)

# Include NEW search and DAW integration routers
app.include_router(
    search.router,
    prefix="/search",
    tags=["search"],
)
app.include_router(
    daw_integration.router,
    prefix="/daw",
    tags=["daw_integration"],
)

# Optionally mount the audio descriptions router (currently not in production)
# from app2.api.routes import audio_descriptions
# app.include_router(
#     audio_descriptions.router,
#     prefix="/audio-descriptions",
#     tags=["audio_descriptions"],
# )


# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "Welcome to BeatGen API v2 (Development - With Search & DAW Integration)",
        "features": {
            "production": True,
            "search": True,
            "daw_integration": True
        }
    }


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": "2.0.0-dev",
        "features": ["search", "daw_integration"]
    }


# Search-specific health check
@app.get("/health/search")
async def search_health_check():
    """Health check for search functionality"""
    try:
        from app2.services.search_service import SearchService
        search_service = SearchService()
        stats = await search_service.get_search_statistics()
        
        return {
            "status": "healthy",
            "search_index": {
                "instruments": stats.get("total_instruments", 0),
                "drum_samples": stats.get("drum_samples", {}).get("total", 0)
            }
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }