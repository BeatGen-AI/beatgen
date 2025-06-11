"""
Service layer for track instance operations
Handles business logic for copy/paste and instance management
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid
import json

from app2.core.exceptions import NotFoundException, ValidationException
from app2.core.logging import get_service_logger
from app2.repositories.project_track_repository import ProjectTrackRepository
from app2.dto.track_instances_dto import (
    TrackInstanceCreate,
    TrackInstanceUpdate,
    TrackInstanceRead,
    CopyTrackInstancesRequest,
    PasteTrackInstancesRequest,
    DuplicateTrackInstancesRequest,
    TrackInstanceOperationResponse
)


class TrackInstanceService:
    """Service for track instance operations"""

    def __init__(self, project_track_repository: ProjectTrackRepository):
        """
        Initialize the service with required repositories
        
        Args:
            project_track_repository: Repository for project-track operations
        """
        self.project_track_repository = project_track_repository
        self.logger = get_service_logger("track_instance")

    async def add_instance(
        self,
        project_id: uuid.UUID,
        track_id: uuid.UUID,
        instance_data: TrackInstanceCreate,
        user_id: uuid.UUID
    ) -> TrackInstanceRead:
        """
        Add a new instance to an existing track
        
        Args:
            project_id: The ID of the project
            track_id: The ID of the track
            instance_data: The instance data to add
            user_id: The ID of the user making the request
            
        Returns:
            The created track instance
            
        Raises:
            NotFoundException: If the project-track is not found
            ValidationException: If the instance data is invalid
        """
        self.logger.info(
            f"User {user_id} adding instance to track {track_id} in project {project_id}"
        )
        
        try:
            # Validate position bounds
            self._validate_instance_position(instance_data.x_position, instance_data.y_position)
            
            # Add instance via repository
            instance = await self.project_track_repository.add_track_instance(
                project_id, track_id, instance_data
            )
            
            self.logger.info(
                f"Successfully added instance {instance.id} to track {track_id}"
            )
            return instance
            
        except NotFoundException:
            raise
        except Exception as e:
            self.logger.error(f"Error adding track instance: {str(e)}")
            raise ValidationException(f"Failed to add track instance: {str(e)}")

    async def update_instance(
        self,
        project_id: uuid.UUID,
        track_id: uuid.UUID,
        instance_id: int,
        updates: TrackInstanceUpdate,
        user_id: uuid.UUID
    ) -> TrackInstanceRead:
        """
        Update a specific track instance
        
        Args:
            project_id: The ID of the project
            track_id: The ID of the track
            instance_id: The ID of the instance to update
            updates: The updates to apply
            user_id: The ID of the user making the request
            
        Returns:
            The updated track instance
        """
        self.logger.info(
            f"User {user_id} updating instance {instance_id} of track {track_id}"
        )
        
        try:
            # Validate position if being updated
            if updates.x_position is not None or updates.y_position is not None:
                x_pos = updates.x_position if updates.x_position is not None else 0
                y_pos = updates.y_position if updates.y_position is not None else 0
                self._validate_instance_position(x_pos, y_pos)
            
            # Update instance via repository
            instance = await self.project_track_repository.update_track_instance(
                project_id, track_id, instance_id, updates
            )
            
            self.logger.info(
                f"Successfully updated instance {instance_id} of track {track_id}"
            )
            return instance
            
        except NotFoundException:
            raise
        except Exception as e:
            self.logger.error(f"Error updating track instance: {str(e)}")
            raise ValidationException(f"Failed to update track instance: {str(e)}")

    async def remove_instance(
        self,
        project_id: uuid.UUID,
        track_id: uuid.UUID,
        instance_id: int,
        user_id: uuid.UUID
    ) -> bool:
        """
        Remove a specific track instance
        
        Args:
            project_id: The ID of the project
            track_id: The ID of the track
            instance_id: The ID of the instance to remove
            user_id: The ID of the user making the request
            
        Returns:
            True if successful, False if instance not found
        """
        self.logger.info(
            f"User {user_id} removing instance {instance_id} of track {track_id}"
        )
        
        try:
            success = await self.project_track_repository.remove_track_instance(
                project_id, track_id, instance_id
            )
            
            if success:
                self.logger.info(
                    f"Successfully removed instance {instance_id} of track {track_id}"
                )
            else:
                self.logger.info(
                    f"Instance {instance_id} not found in track {track_id}"
                )
            
            return success
            
        except Exception as e:
            self.logger.error(f"Error removing track instance: {str(e)}")
            raise ValidationException(f"Failed to remove track instance: {str(e)}")

    async def get_instances(
        self,
        project_id: uuid.UUID,
        track_id: uuid.UUID,
        user_id: uuid.UUID
    ) -> List[TrackInstanceRead]:
        """
        Get all instances for a track
        
        Args:
            project_id: The ID of the project
            track_id: The ID of the track
            user_id: The ID of the user making the request
            
        Returns:
            List of track instances
        """
        self.logger.info(
            f"User {user_id} getting instances for track {track_id}"
        )
        
        try:
            instances = await self.project_track_repository.get_track_instances(
                project_id, track_id
            )
            
            self.logger.info(
                f"Found {len(instances)} instances for track {track_id}"
            )
            return instances
            
        except Exception as e:
            self.logger.error(f"Error getting track instances: {str(e)}")
            raise ValidationException(f"Failed to get track instances: {str(e)}")

    async def copy_instances(
        self,
        project_id: uuid.UUID,
        request: CopyTrackInstancesRequest,
        user_id: uuid.UUID
    ) -> Dict[str, Any]:
        """
        Copy specific track instances for clipboard
        
        Args:
            project_id: The ID of the project
            request: The copy request with track_id and instance_ids
            user_id: The ID of the user making the request
            
        Returns:
            Clipboard data for the copied instances
        """
        self.logger.info(
            f"User {user_id} copying {len(request.instance_ids)} instances from track {request.track_id}"
        )
        
        try:
            # Get all instances for the track
            all_instances = await self.project_track_repository.get_track_instances(
                project_id, request.track_id
            )
            
            # Filter to requested instances
            instances_to_copy = []
            for instance in all_instances:
                if instance.id in request.instance_ids:
                    instances_to_copy.append(instance)
            
            if len(instances_to_copy) != len(request.instance_ids):
                missing_ids = set(request.instance_ids) - {inst.id for inst in instances_to_copy}
                raise NotFoundException(
                    "TrackInstance",
                    f"Instance IDs not found: {list(missing_ids)}"
                )
            
            # Calculate relative positions for paste operations
            if instances_to_copy:
                min_x = min(inst.x_position for inst in instances_to_copy)
                min_y = min(inst.y_position for inst in instances_to_copy)
                max_x = max(inst.x_position for inst in instances_to_copy)
                max_y = max(inst.y_position for inst in instances_to_copy)
                
                relative_positions = []
                for instance in instances_to_copy:
                    relative_positions.append({
                        "x": instance.x_position - min_x,
                        "y": instance.y_position - min_y
                    })
            else:
                min_x = max_x = min_y = max_y = 0
                relative_positions = []
            
            # Create clipboard data
            clipboard_data = {
                "track_id": str(request.track_id),
                "project_id": str(project_id),
                "instances": [inst.model_dump() for inst in instances_to_copy],
                "metadata": {
                    "copy_time": datetime.utcnow().isoformat(),
                    "relative_positions": relative_positions,
                    "bounding_box": {
                        "min_x": min_x,
                        "min_y": min_y,
                        "max_x": max_x,
                        "max_y": max_y
                    },
                    "user_id": str(user_id)
                }
            }
            
            self.logger.info(
                f"Successfully copied {len(instances_to_copy)} instances from track {request.track_id}"
            )
            return clipboard_data
            
        except NotFoundException:
            raise
        except Exception as e:
            self.logger.error(f"Error copying track instances: {str(e)}")
            raise ValidationException(f"Failed to copy track instances: {str(e)}")

    async def paste_instances(
        self,
        project_id: uuid.UUID,
        request: PasteTrackInstancesRequest,
        user_id: uuid.UUID
    ) -> List[TrackInstanceRead]:
        """
        Paste copied track instances to a project
        
        Args:
            project_id: The ID of the target project
            request: The paste request with clipboard data and position offset
            user_id: The ID of the user making the request
            
        Returns:
            List of newly created track instances
        """
        self.logger.info(
            f"User {user_id} pasting instances to project {project_id}"
        )
        
        try:
            clipboard_data = request.clipboard_data
            
            # Validate clipboard data structure
            if not all(key in clipboard_data for key in ["track_id", "instances", "metadata"]):
                raise ValidationException("Invalid clipboard data structure")
            
            source_track_id = uuid.UUID(clipboard_data["track_id"])
            instances_data = clipboard_data["instances"]
            metadata = clipboard_data["metadata"]
            relative_positions = metadata.get("relative_positions", [])
            
            if len(instances_data) != len(relative_positions):
                raise ValidationException("Mismatch between instances and relative positions")
            
            # Create new instances with position offset
            new_instances = []
            for i, instance_data in enumerate(instances_data):
                relative_pos = relative_positions[i]
                
                # Calculate new position
                new_x = request.position_offset.get("x", 0) + relative_pos["x"]
                new_y = request.position_offset.get("y", 0) + relative_pos["y"]
                
                # Validate new position
                self._validate_instance_position(new_x, new_y)
                
                # Create instance data
                instance_create = TrackInstanceCreate(
                    x_position=new_x,
                    y_position=new_y,
                    trim_start_ticks=instance_data.get("trim_start_ticks", 0),
                    trim_end_ticks=instance_data.get("trim_end_ticks"),
                    volume=instance_data.get("volume", 1.0),
                    pan=instance_data.get("pan", 0.0),
                    mute=instance_data.get("mute", False)
                )
                
                # Add instance to track
                new_instance = await self.project_track_repository.add_track_instance(
                    project_id, source_track_id, instance_create
                )
                new_instances.append(new_instance)
            
            self.logger.info(
                f"Successfully pasted {len(new_instances)} instances to track {source_track_id}"
            )
            return new_instances
            
        except ValidationException:
            raise
        except NotFoundException:
            raise
        except Exception as e:
            self.logger.error(f"Error pasting track instances: {str(e)}")
            raise ValidationException(f"Failed to paste track instances: {str(e)}")

    async def duplicate_instances(
        self,
        project_id: uuid.UUID,
        track_id: uuid.UUID,
        request: DuplicateTrackInstancesRequest,
        user_id: uuid.UUID
    ) -> List[TrackInstanceRead]:
        """
        Duplicate track instances within the same project
        
        Args:
            project_id: The ID of the project
            track_id: The ID of the track
            request: The duplicate request with instance_ids and position_offset
            user_id: The ID of the user making the request
            
        Returns:
            List of newly created track instances
        """
        self.logger.info(
            f"User {user_id} duplicating {len(request.instance_ids)} instances in track {track_id}"
        )
        
        try:
            # Get source instances
            all_instances = await self.project_track_repository.get_track_instances(
                project_id, track_id
            )
            
            # Filter to requested instances
            instances_to_duplicate = []
            for instance in all_instances:
                if instance.id in request.instance_ids:
                    instances_to_duplicate.append(instance)
            
            if len(instances_to_duplicate) != len(request.instance_ids):
                missing_ids = set(request.instance_ids) - {inst.id for inst in instances_to_duplicate}
                raise NotFoundException(
                    "TrackInstance",
                    f"Instance IDs not found: {list(missing_ids)}"
                )
            
            # Create duplicates with position offset
            new_instances = []
            for instance in instances_to_duplicate:
                # Calculate new position
                new_x = instance.x_position + request.position_offset.get("x", 4800)
                new_y = instance.y_position + request.position_offset.get("y", 0)
                
                # Validate new position
                self._validate_instance_position(new_x, new_y)
                
                # Create duplicate instance data
                instance_create = TrackInstanceCreate(
                    x_position=new_x,
                    y_position=new_y,
                    trim_start_ticks=instance.trim_start_ticks,
                    trim_end_ticks=instance.trim_end_ticks,
                    volume=instance.volume,
                    pan=instance.pan,
                    mute=instance.mute
                )
                
                # Add duplicate instance
                new_instance = await self.project_track_repository.add_track_instance(
                    project_id, track_id, instance_create
                )
                new_instances.append(new_instance)
            
            self.logger.info(
                f"Successfully duplicated {len(new_instances)} instances in track {track_id}"
            )
            return new_instances
            
        except NotFoundException:
            raise
        except ValidationException:
            raise
        except Exception as e:
            self.logger.error(f"Error duplicating track instances: {str(e)}")
            raise ValidationException(f"Failed to duplicate track instances: {str(e)}")

    async def batch_update_instances(
        self,
        project_id: uuid.UUID,
        updates: List[Dict[str, Any]],
        user_id: uuid.UUID
    ) -> List[TrackInstanceRead]:
        """
        Batch update multiple track instances
        
        Args:
            project_id: The ID of the project
            updates: List of update dictionaries
            user_id: The ID of the user making the request
            
        Returns:
            List of updated track instances
        """
        self.logger.info(
            f"User {user_id} batch updating {len(updates)} track instances"
        )
        
        try:
            # Validate all updates first
            for update in updates:
                if "track_id" not in update or "instance_id" not in update or "updates" not in update:
                    raise ValidationException("Each update must have track_id, instance_id, and updates")
                
                # Validate position if being updated
                instance_updates = update["updates"]
                if isinstance(instance_updates, dict):
                    if "x_position" in instance_updates or "y_position" in instance_updates:
                        x_pos = instance_updates.get("x_position", 0)
                        y_pos = instance_updates.get("y_position", 0)
                        self._validate_instance_position(x_pos, y_pos)
            
            # Perform batch update via repository
            updated_instances = await self.project_track_repository.batch_update_instances(
                project_id, updates
            )
            
            self.logger.info(
                f"Successfully batch updated {len(updated_instances)} track instances"
            )
            return updated_instances
            
        except ValidationException:
            raise
        except Exception as e:
            self.logger.error(f"Error in batch update: {str(e)}")
            raise ValidationException(f"Failed to batch update track instances: {str(e)}")

    def _validate_instance_position(self, x_position: float, y_position: float) -> None:
        """
        Validate instance position bounds
        
        Args:
            x_position: The X position to validate
            y_position: The Y position to validate
            
        Raises:
            ValidationException: If position is invalid
        """
        if x_position < 0:
            raise ValidationException("x_position cannot be negative")
        
        if y_position < 0:
            raise ValidationException("y_position cannot be negative")
        
        # Additional bounds checking could be added here
        # e.g., maximum project duration, maximum tracks, etc.
        MAX_X_POSITION = 10_000_000  # ~100 minutes at 120 BPM
        MAX_Y_POSITION = 10_000      # ~100 tracks
        
        if x_position > MAX_X_POSITION:
            raise ValidationException(f"x_position exceeds maximum ({MAX_X_POSITION})")
        
        if y_position > MAX_Y_POSITION:
            raise ValidationException(f"y_position exceeds maximum ({MAX_Y_POSITION})")

    def _calculate_smart_paste_position(
        self,
        project_id: uuid.UUID,
        base_position: Dict[str, float],
        instances_to_paste: List[Dict[str, Any]]
    ) -> Dict[str, float]:
        """
        Calculate smart paste position to avoid collisions
        
        Args:
            project_id: The ID of the project
            base_position: The base position for pasting
            instances_to_paste: The instances that will be pasted
            
        Returns:
            Adjusted position dictionary
        """
        # This could be enhanced to check for collisions with existing instances
        # and automatically offset to avoid overlaps
        return base_position