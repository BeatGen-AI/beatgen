from fastapi import APIRouter, Depends, status, HTTPException
from typing import Any, List, Dict
from uuid import UUID

from app2.api.dependencies import (
    get_current_user,
    get_project_service,
    get_track_instance_service,
)
from app2.services.project_service import ProjectService
from app2.services.track_instance_service import TrackInstanceService
from app2.core.exceptions import NotFoundException, ForbiddenException, ValidationException
from app2.core.logging import get_api_logger
from app2.models.project import (
    ProjectRead,
    ProjectWithTracks,
)
from app2.types.track_types import TrackType
from app2.dto.projects_dto import Page, PageParams
from app2.dto.track_instances_dto import (
    TrackInstanceCreate,
    TrackInstanceUpdate,
    TrackInstanceRead,
    CopyTrackInstancesRequest,
    PasteTrackInstancesRequest,
    DuplicateTrackInstancesRequest,
    TrackInstanceOperationResponse
)

router = APIRouter()
logger = get_api_logger("projects")


@router.get("", response_model=Page[ProjectRead])
@router.get("/", response_model=Page[ProjectRead])
async def get_projects(
    current_user: Dict[str, Any] = Depends(get_current_user),
    project_service: ProjectService = Depends(get_project_service),
    page_params: PageParams = Depends(),
) -> Page[ProjectRead]:
    """
    Get all projects for the current user
    """
    logger.info(f"Getting projects for user ID: {current_user['id']}")
    try:
        return await project_service.get_user_projects(
            UUID(current_user["id"]),
            page_params
        )
    except Exception as e:
        logger.error(f"Error getting projects: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get projects: {str(e)}",
        )


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


# ========== TRACK INSTANCE ENDPOINTS ==========

@router.post("/{project_id}/tracks/{track_id}/instances", response_model=TrackInstanceRead, status_code=status.HTTP_201_CREATED)
async def add_track_instance(
    project_id: UUID,
    track_id: UUID,
    instance_data: TrackInstanceCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    track_instance_service: TrackInstanceService = Depends(get_track_instance_service),
) -> TrackInstanceRead:
    """
    Add a new instance of an existing track
    """
    logger.info(f"Adding instance to track {track_id} in project {project_id}")
    try:
        return await track_instance_service.add_instance(
            project_id, track_id, instance_data, UUID(current_user["id"])
        )
    except NotFoundException as e:
        logger.error(f"Not found: {str(e)}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationException as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error adding track instance: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add track instance: {str(e)}",
        )


@router.patch("/{project_id}/tracks/{track_id}/instances/{instance_id}", response_model=TrackInstanceRead)
async def update_track_instance(
    project_id: UUID,
    track_id: UUID,
    instance_id: int,
    updates: TrackInstanceUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    track_instance_service: TrackInstanceService = Depends(get_track_instance_service),
) -> TrackInstanceRead:
    """
    Update a specific track instance
    """
    logger.info(f"Updating instance {instance_id} of track {track_id}")
    try:
        return await track_instance_service.update_instance(
            project_id, track_id, instance_id, updates, UUID(current_user["id"])
        )
    except NotFoundException as e:
        logger.error(f"Not found: {str(e)}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationException as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating track instance: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update track instance: {str(e)}",
        )


@router.delete("/{project_id}/tracks/{track_id}/instances/{instance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_track_instance(
    project_id: UUID,
    track_id: UUID,
    instance_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
    track_instance_service: TrackInstanceService = Depends(get_track_instance_service),
) -> None:
    """
    Remove a specific track instance
    """
    logger.info(f"Removing instance {instance_id} of track {track_id}")
    try:
        success = await track_instance_service.remove_instance(
            project_id, track_id, instance_id, UUID(current_user["id"])
        )
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Track instance not found"
            )
    except NotFoundException as e:
        logger.error(f"Not found: {str(e)}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationException as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error removing track instance: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove track instance: {str(e)}",
        )


@router.get("/{project_id}/tracks/{track_id}/instances", response_model=List[TrackInstanceRead])
async def get_track_instances(
    project_id: UUID,
    track_id: UUID,
    current_user: Dict[str, Any] = Depends(get_current_user),
    track_instance_service: TrackInstanceService = Depends(get_track_instance_service),
) -> List[TrackInstanceRead]:
    """
    Get all instances for a track
    """
    logger.info(f"Getting instances for track {track_id}")
    try:
        return await track_instance_service.get_instances(
            project_id, track_id, UUID(current_user["id"])
        )
    except NotFoundException as e:
        logger.error(f"Not found: {str(e)}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting track instances: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get track instances: {str(e)}",
        )


@router.post("/{project_id}/tracks/copy-instances", response_model=Dict[str, Any])
async def copy_track_instances(
    project_id: UUID,
    request: CopyTrackInstancesRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    track_instance_service: TrackInstanceService = Depends(get_track_instance_service),
) -> Dict[str, Any]:
    """
    Copy track instances for clipboard
    """
    logger.info(f"Copying {len(request.instance_ids)} instances from track {request.track_id}")
    try:
        return await track_instance_service.copy_instances(
            project_id, request, UUID(current_user["id"])
        )
    except NotFoundException as e:
        logger.error(f"Not found: {str(e)}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationException as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error copying track instances: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to copy track instances: {str(e)}",
        )


@router.post("/{project_id}/tracks/paste-instances", response_model=List[TrackInstanceRead])
async def paste_track_instances(
    project_id: UUID,
    request: PasteTrackInstancesRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    track_instance_service: TrackInstanceService = Depends(get_track_instance_service),
) -> List[TrackInstanceRead]:
    """
    Paste track instances from clipboard
    """
    logger.info(f"Pasting instances to project {project_id}")
    try:
        return await track_instance_service.paste_instances(
            project_id, request, UUID(current_user["id"])
        )
    except NotFoundException as e:
        logger.error(f"Not found: {str(e)}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationException as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error pasting track instances: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to paste track instances: {str(e)}",
        )


@router.post("/{project_id}/tracks/{track_id}/duplicate-instances", response_model=List[TrackInstanceRead])
async def duplicate_track_instances(
    project_id: UUID,
    track_id: UUID,
    request: DuplicateTrackInstancesRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    track_instance_service: TrackInstanceService = Depends(get_track_instance_service),
) -> List[TrackInstanceRead]:
    """
    Duplicate track instances within the same project
    """
    logger.info(f"Duplicating {len(request.instance_ids)} instances in track {track_id}")
    try:
        return await track_instance_service.duplicate_instances(
            project_id, track_id, request, UUID(current_user["id"])
        )
    except NotFoundException as e:
        logger.error(f"Not found: {str(e)}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationException as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error duplicating track instances: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to duplicate track instances: {str(e)}",
        )


@router.patch("/{project_id}/tracks/instances/batch", response_model=List[TrackInstanceRead])
async def batch_update_track_instances(
    project_id: UUID,
    updates: List[Dict[str, Any]],
    current_user: Dict[str, Any] = Depends(get_current_user),
    track_instance_service: TrackInstanceService = Depends(get_track_instance_service),
) -> List[TrackInstanceRead]:
    """
    Batch update multiple track instances
    """
    logger.info(f"Batch updating {len(updates)} track instances")
    try:
        return await track_instance_service.batch_update_instances(
            project_id, updates, UUID(current_user["id"])
        )
    except ValidationException as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error in batch update: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to batch update track instances: {str(e)}",
        )
