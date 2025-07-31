from fastapi import APIRouter, Depends, status, HTTPException, Request
from typing import Any, List, Dict
from uuid import UUID

from app2.api.dependencies import (
    get_current_user,
    get_project_service,
)
from app2.services.project_service import ProjectService
from app2.core.exceptions import NotFoundException, ForbiddenException
from app2.core.logging import get_api_logger
from app2.models.project import (
    ProjectRead,
    ProjectWithTracks,
)
from app2.types.track_types import TrackType
from app2.dto.projects_dto import Page, PageParams

router = APIRouter()
logger = get_api_logger("projects")

# Track active requests to detect concurrent calls
_active_requests = {}
_request_lock = None


@router.get("", response_model=Page[ProjectRead])
@router.get("/", response_model=Page[ProjectRead])
async def get_projects(
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user),
    project_service: ProjectService = Depends(get_project_service),
    page_params: PageParams = Depends(),
) -> Page[ProjectRead]:
    """
    Get all projects for the current user
    """
    import time
    import threading
    import asyncio
    
    # Create unique request ID
    request_id = f"{current_user['id']}_{page_params.page}_{page_params.size}_{int(time.time() * 1000)}"
    user_key = f"{current_user['id']}_{page_params.page}_{page_params.size}"
    
    # Log request with client info
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    
    # Check for concurrent requests
    if user_key in _active_requests:
        active_since = time.time() - _active_requests[user_key]
        logger.warning(f"⚠️ CONCURRENT REQUEST DETECTED [{request_id}] - Same user/page already processing for {active_since:.2f}s")
    else:
        _active_requests[user_key] = time.time()
    
    logger.info(f"🔍 GET /projects REQUEST [{request_id}] - User: {current_user['id']}, Page: {page_params.page}, Size: {page_params.size}")
    logger.info(f"🔍 CLIENT INFO [{request_id}] - IP: {client_ip}, User-Agent: {user_agent[:100]}...")
    logger.info(f"🔍 THREAD INFO [{request_id}] - Thread: {threading.current_thread().name}")
    logger.info(f"🔍 ACTIVE REQUESTS: {len(_active_requests)} concurrent GET /projects calls")
    
    try:
        start_time = time.time()
        result = await project_service.get_user_projects(
            UUID(current_user["id"]),
            page_params
        )
        total_time = time.time() - start_time
        
        logger.info(f"✅ GET /projects SUCCESS [{request_id}] - Total time: {total_time * 1000:.2f}ms, Projects: {len(result.items)}")
        return result
    except Exception as e:
        logger.error(f"❌ GET /projects ERROR [{request_id}] - {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get projects: {str(e)}",
        )
    finally:
        # Clean up tracking
        _active_requests.pop(user_key, None)


@router.post("", response_model=ProjectWithTracks, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ProjectWithTracks, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(get_current_user),
    project_service: ProjectService = Depends(get_project_service),
) -> ProjectWithTracks:
    """
    Create a new project with all associated tracks

    This endpoint handles creating a complete project structure in one request:
    - The project itself
    - Multiple tracks of different types (audio, MIDI, sampler, drum)
    - Track-specific settings (volume, pan, position, etc.)
    """
    logger.info(f"Creating project for user ID: {current_user['id']}")
    logger.info(f"Project data: {project_data}")
    try:
        return await project_service.create_project(
            UUID(current_user["id"]), project_data
        )
    except Exception as e:
        logger.error(f"Error creating project: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create project: {str(e)}",
        )


@router.get("/{project_id}", response_model=ProjectWithTracks)
async def get_project(
    project_id: UUID,
    current_user: Dict[str, Any] = Depends(get_current_user),
    project_service: ProjectService = Depends(get_project_service),
) -> ProjectWithTracks:
    """
    Get a specific project by ID
    """
    logger.info(f"Getting project with ID: {project_id} for user: {current_user['id']}")
    try:
        return await project_service.get_project(project_id, UUID(current_user["id"]))
    except NotFoundException as e:
        logger.error(f"Project not found: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    except ForbiddenException as e:
        logger.error(f"Forbidden: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this project",
        )
    except Exception as e:
        logger.error(f"Error getting project: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get project: {str(e)}",
        )


@router.patch("/{project_id}", response_model=ProjectWithTracks)
async def update_project(
    project_id: UUID,
    project_data: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(get_current_user),
    project_service: ProjectService = Depends(get_project_service),
) -> ProjectWithTracks:
    """
    Update a project
    """
    logger.info(
        f"Updating project with ID: {project_id} for user: {current_user['id']}"
    )
    logger.info(f"Project update data: {project_data}")
    try:
        return await project_service.update_project(
            project_id, UUID(current_user["id"]), project_data
        )
    except NotFoundException as e:
        logger.error(f"Project not found: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    except ForbiddenException as e:
        logger.error(f"Forbidden: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to update this project",
        )
    except Exception as e:
        logger.error(f"Error updating project: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update project: {str(e)}",
        )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    current_user: Dict[str, Any] = Depends(get_current_user),
    project_service: ProjectService = Depends(get_project_service),
) -> None:
    """
    Delete a project
    """
    logger.info(
        f"Deleting project with ID: {project_id} for user: {current_user['id']}"
    )
    try:
        await project_service.delete_project(project_id, UUID(current_user["id"]))
        return None
    except NotFoundException as e:
        logger.error(f"Project not found: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    except ForbiddenException as e:
        logger.error(f"Forbidden: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this project",
        )
    except Exception as e:
        logger.error(f"Error deleting project: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete project: {str(e)}",
        )


@router.post("/{project_id}/tracks", response_model=ProjectWithTracks)
async def add_track(
    project_id: UUID,
    track_data: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(get_current_user),
    project_service: ProjectService = Depends(get_project_service),
) -> ProjectWithTracks:
    """
    Add a track to a project

    The track_data must include:
    - type: The track type (audio, midi, sampler, drum)
    - name: The track name
    - Other type-specific properties

    Project-specific settings can also be included:
    - volume, pan, mute, position, etc.
    """
    logger.info(
        f"Adding track to project with ID: {project_id} for user: {current_user['id']}"
    )
    try:
        if "type" not in track_data:
            raise ValueError("Track data must include 'type' field")

        return await project_service.add_track(
            project_id, UUID(current_user["id"]), track_data
        )
    except NotFoundException as e:
        logger.error(f"Not found: {str(e)}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ForbiddenException as e:
        logger.error(f"Forbidden: {str(e)}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        logger.error(f"Invalid track data: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error adding track to project: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add track to project: {str(e)}",
        )


@router.patch("/{project_id}/tracks/{track_id}", response_model=ProjectWithTracks)
async def update_track(
    project_id: UUID,
    track_id: UUID,
    track_data: Dict[str, Any],
    track_type: TrackType,
    current_user: Dict[str, Any] = Depends(get_current_user),
    project_service: ProjectService = Depends(get_project_service),
) -> ProjectWithTracks:
    """
    Update a track in a project

    Requires specifying the track type to identify which specialized track to update
    """
    logger.info(
        f"Updating {track_type.value} track with ID: {track_id} in project with ID: {project_id}"
    )
    try:
        return await project_service.update_track(
            project_id, track_id, track_type, UUID(current_user["id"]), track_data
        )
    except NotFoundException as e:
        logger.error(f"Not found: {str(e)}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ForbiddenException as e:
        logger.error(f"Forbidden: {str(e)}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating track: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update track: {str(e)}",
        )


@router.delete("/{project_id}/tracks/{track_id}", response_model=ProjectWithTracks)
async def remove_track(
    project_id: UUID,
    track_id: UUID,
    track_type: TrackType,
    current_user: Dict[str, Any] = Depends(get_current_user),
    project_service: ProjectService = Depends(get_project_service),
) -> ProjectWithTracks:
    """
    Remove a track from a project

    Requires specifying the track type to identify which specialized track to remove
    """
    logger.info(
        f"Removing {track_type.value} track with ID: {track_id} from project with ID: {project_id}"
    )
    try:
        return await project_service.remove_track(
            project_id, track_id, track_type, UUID(current_user["id"])
        )
    except NotFoundException as e:
        logger.error(f"Not found: {str(e)}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ForbiddenException as e:
        logger.error(f"Forbidden: {str(e)}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        logger.error(f"Error removing track: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove track: {str(e)}",
        )
