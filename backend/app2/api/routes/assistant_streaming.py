"""
Enhanced AI Assistant API with two-step request handling:
1. POST request to get a request ID
2. SSE connection to receive streaming updates

This implementation uses a request manager to track active requests and
provides streaming responses with proper resource management.
"""

from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Path,
    status,
)
from fastapi.responses import JSONResponse, StreamingResponse
import asyncio
import json
import time
from typing import Dict, Any, Optional, Literal
import traceback

from app2.api.dependencies import get_current_user
from app2.models.user import User
from app2.models.assistant import (
    AssistantRequest,
    AssistantResponse,
    GenerateResponse,
    EditResponse,
    AssistantAction,
    TrackData,
)
from app2.sse.request_manager import request_manager, RequestStatus
from app2.sse.sse import SSEManager
from app2.sse.sse_queue_manager import SSEQueueManager
from app2.core.logging import get_api_logger
from app2.llm.available_models import ModelInfo
from app2.llm import available_models
from app2.llm.agents.music_agent import SongRequest, music_agent
from pydantic import BaseModel
from app2.infrastructure.database.sqlmodel_client import engine
from sqlmodel import Session
from uuid import UUID
from app2.types.assistant_actions import ActionType

# Set up logger
logger = get_api_logger("assistant_streaming")

# Create router
router = APIRouter()

# Initialize SSE manager
sse_manager = SSEManager(heartbeat_interval=20)

load_dotenv()


class ProjectSavingSSEQueue:
    """Wrapper around SSEQueueManager that also saves tracks to a specific project"""
    
    def __init__(self, sse_queue: SSEQueueManager, session: Session, project_id: str):
        self.sse_queue = sse_queue
        self.session = session
        self.project_id = project_id
        self._user_id = None
        
    def __getattr__(self, name):
        """Delegate all other methods to the wrapped queue"""
        return getattr(self.sse_queue, name)
    
    async def action(self, action: AssistantAction):
        """Override action method to save tracks to project"""
        logger.info(f"🎵 ProjectSavingSSEQueue.action called with action_type: {action.action_type}")
        
        try:
            # First send the action via SSE as normal
            await self.sse_queue.action(action)
            
            # Then save to project if it's a track action
            if action.action_type in [ActionType.ADD_TRACK, ActionType.ADD_DRUM_TRACK]:
                logger.info(f"🎵 ProjectSavingSSEQueue - Track action detected, saving to project {self.project_id}")
                await self._save_track_to_project(action)
            else:
                logger.info(f"🎵 ProjectSavingSSEQueue - Non-track action, skipping: {action.action_type}")
                
        except Exception as e:
            logger.error(f"Error in ProjectSavingSSEQueue.action: {str(e)}")
            # Still send the SSE action even if saving fails
            await self.sse_queue.action(action)
    
    async def _save_track_to_project(self, action: AssistantAction):
        """Save track data to the specified project"""
        try:
            from app2.repositories.project_repository import ProjectRepository
            from app2.services.project_service import ProjectService
            from app2.repositories.project_track_repository import ProjectTrackRepository
            from app2.services.track_service import TrackService
            
            logger.info(f"Saving track to project {self.project_id}: {action.action_type}")
            logger.info(f"Action data type: {action.data.type}")
            logger.info(f"Track data: {action.data.track_data}")
            
            # Get user ID from project (we need this for security)
            project_repo = ProjectRepository(self.session)
            project = await project_repo.get_by_id(UUID(self.project_id))
            
            if not project:
                logger.error(f"Project {self.project_id} not found")
                return
                
            user_id = project.user_id
            
            # Create services
            track_repo = ProjectTrackRepository(self.session)
            track_service = TrackService(
                audio_repository=None,
                midi_repository=None, 
                sampler_repository=None,
                drum_repository=None,
                project_track_repository=track_repo,
                file_repository=None
            )
            project_service = ProjectService(project_repo, track_repo, track_service)
            
            # Convert track data to project track format
            track_data = self._convert_action_to_track_data(action)
            logger.info(f"Converted track data: {track_data}")
            
            if track_data:
                logger.info(f"Calling project_service.add_track with project_id={self.project_id}, user_id={user_id}")
                result = await project_service.add_track(
                    UUID(self.project_id),
                    user_id,
                    track_data
                )
                logger.info(f"Successfully saved track to project {self.project_id}, result: {result}")
            else:
                logger.warning("No track data to save - conversion returned None")
            
        except Exception as e:
            logger.error(f"Failed to save track to project: {str(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
    
    def _convert_action_to_track_data(self, action: AssistantAction) -> dict:
        """Convert SSE action to track data format for project service"""
        try:
            # action.data is a TrackData object with type, track_data, project_track_data
            track_data = action.data.track_data
            track_type = action.data.type
            
            if not track_data:
                logger.warning("No track_data in action")
                return None
                
            if track_type == 'midi' and action.action_type == ActionType.ADD_TRACK:
                # track_data is a MidiTrackRead object
                return {
                    'type': 'midi',
                    'name': track_data.name,
                    'instrument_id': str(track_data.instrument_id),
                    'midi_notes_json': track_data.midi_notes_json,
                    'volume': 80,
                    'pan': 0,
                    'mute': False,
                    'position': {'x': 0, 'y': 0}
                }
            elif track_type == 'drum' and action.action_type == ActionType.ADD_DRUM_TRACK:
                # track_data is a DrumTrackRead object
                # Convert sampler_tracks to the format expected by project service
                sampler_tracks_data = []
                if hasattr(track_data, 'sampler_tracks') and track_data.sampler_tracks:
                    for sampler_track in track_data.sampler_tracks:
                        sampler_tracks_data.append({
                            'name': sampler_track.name,
                            'audio_file_name': sampler_track.audio_file_name,
                            'midi_notes_json': sampler_track.midi_notes_json,
                            'base_midi_note': sampler_track.base_midi_note,
                            'grain_size': sampler_track.grain_size,
                            'overlap': sampler_track.overlap,
                            'audio_storage_key': sampler_track.audio_storage_key,
                            'audio_file_format': sampler_track.audio_file_format,
                            'audio_file_size': sampler_track.audio_file_size,
                            'audio_file_duration': sampler_track.audio_file_duration,
                        })
                
                return {
                    'type': 'drum',
                    'name': track_data.name,
                    'sampler_tracks': sampler_tracks_data,
                    'volume': 80,
                    'pan': 0,
                    'mute': False,
                    'position': {'x': 0, 'y': 0}
                }
            else:
                logger.warning(f"Unhandled track type: {track_type} with action: {action.action_type}")
                
        except Exception as e:
            logger.error(f"Error converting action to track data: {str(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
        
        return None

# Request schema for unified assistant endpoint
class AssistantRequestModel(AssistantRequest):
    """Unified request model for all assistant interaction types"""

    mode: Literal["generate", "edit", "chat"]


# Response schema for request creation
class RequestCreationResponse(BaseModel):
    """Response for request creation"""

    request_id: str
    status: str
    mode: str
    estimated_time: Optional[int] = None


@router.post(
    "/request",
    status_code=status.HTTP_201_CREATED,
    response_model=RequestCreationResponse,
)
async def create_assistant_request(
    request: AssistantRequestModel,
    background_tasks: BackgroundTasks,
    user: Dict[str, Any] = Depends(get_current_user),
):
    # Debug logging at the start
    logger.info(
        f"🎤 ASSISTANT API - Received request: mode={request.mode}, user_id={user.get('id') if user else 'None'}"
    )
    logger.info(f"🎤 ASSISTANT API - Context: {request.context}")
    logger.info(f"🎤 ASSISTANT API - Prompt: {request.prompt[:100]}...")
    """
    Create a new assistant request and return a request ID for streaming.
    
    This endpoint accepts requests for all assistant modes (generate, edit, chat)
    and returns a request ID that can be used to establish an SSE connection
    for streaming results.
    """
    try:
        # Check rate limits
        if not request_manager.can_create_request(user.get("id")):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Maximum concurrent requests reached ({request_manager.MAX_REQUESTS_PER_USER})",
            )

        # Create request in manager
        logger.info(
            f"📝 CREATE REQUEST - Creating request with user_id={user.get('id')}"
        )
        request_id = request_manager.create_request(
            user_id=user.get(
                "id"
            ),  # This should match what we use in the stream endpoint
            mode=request.mode,
            model=request.model,
            prompt=request.prompt,
            track_id=request.track_id,
            context=request.context,
        )
        logger.info(f"📝 CREATE REQUEST - Request created with ID: {request_id}")

        # Update request status to processing
        request_manager.update_request_status(request_id, RequestStatus.PROCESSING)

        # Start processing in background
        background_tasks.add_task(process_assistant_request, request_id=request_id)

        # Estimate processing time based on mode
        estimated_time = 30  # Default 30 seconds
        if request.mode == "generate":
            estimated_time = 60  # Generation takes longer

        # Return response with request ID
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content={
                "request_id": request_id,
                "status": "processing",
                "mode": request.mode,
                "estimated_time": estimated_time,
            },
        )

    except ValueError as e:
        # Handle validation errors
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # except Exception as e:
    #     logger.error(f"Error creating assistant request: {str(e)}")
    #     raise HTTPException(
    #         status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    #         detail="Failed to create assistant request"
    #     )

    return RequestCreationResponse(
        request_id=request_id,
        status="processing",
        mode=request.mode,
        estimated_time=estimated_time,
    )


@router.get("/stream/{request_id}")
async def stream_assistant_response(
    request_id: str = Path(..., description="Request ID from create_assistant_request"),
    user: User = Depends(get_current_user),
):
    # Debug logging at the start
    logger.info(f"🔄 STREAM REQUEST - Received stream request: request_id={request_id}")
    logger.info(f"🔄 STREAM REQUEST - User: id={user.get('id') if user else 'None'}")
    """
    Stream assistant response for a specific request ID.
    
    Establishes an SSE connection to receive real-time updates for the
    processing of an assistant request.
    """
    # Validate request ID with detailed logging
    logger.info(
        f"🔄 STREAM REQUEST - Validating request ID: {request_id} for user: {user.get('id')}"
    )
    is_valid = request_manager.validate_request_id(request_id, user.get("id"))
    logger.info(f"🔄 STREAM REQUEST - Validation result: {is_valid}")

    if not is_valid:
        logger.error(
            f"🔄 STREAM REQUEST - Request ID not found or not owned by user: {request_id}, user: {user.get('id')}"
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Request ID not found: {request_id}",
        )

    # Get the queue for this request with detailed logging
    logger.info(f"🔄 STREAM REQUEST - Getting queue for request ID: {request_id}")
    queue = request_manager.get_queue(request_id)
    logger.info(f"🔄 STREAM REQUEST - Queue retrieved: {queue is not None}")

    if not queue:
        logger.error(f"🔄 STREAM REQUEST - Queue not found for request: {request_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Queue not found for request: {request_id}",
        )

    logger.info(f"Establishing SSE stream for request: {request_id}")

    # Return streaming response
    return StreamingResponse(
        sse_manager.event_generator(queue),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/request/{request_id}")
async def cancel_assistant_request(
    request_id: str = Path(..., description="Request ID to cancel"),
    user: User = Depends(get_current_user),
):
    """Cancel an ongoing assistant request"""
    # Validate request ID
    if not request_manager.validate_request_id(request_id, user.get("id")):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Request ID not found: {request_id}",
        )

    # Get the SSE queue
    sse_queue = request_manager.get_sse_queue(request_id)
    if sse_queue:
        # Send cancelled event
        await sse_queue.cancelled()

    # Remove request
    if request_manager.remove_request(request_id, RequestStatus.CANCELLED):
        return JSONResponse(
            content={"message": f"Request {request_id} cancelled successfully"}
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel request",
        )


async def process_assistant_request(request_id: str):
    """
    Background task to process an assistant request.

    Retrieves the request context, processes it according to its mode,
    and sends SSE events through the queue.
    """
    # Get request context
    context = request_manager.get_request(request_id)
    if not context:
        logger.error(f"Request context not found for ID: {request_id}")
        return

    # Get the SSE queue for sending events
    sse_queue = context.sse_queue
    if not sse_queue:
        logger.error(f"SSE queue not found for request: {request_id}")
        return

    # Get a database session for this background task
    # Note: We need a way to get a session outside of a request dependency
    # Option 1: Create a new session context manually (simplest for background task)
    session = None  # Initialize session to None
    try:
        with Session(engine) as session:  # Create a new session for this task
            # Log start of processing
            logger.info(
                f"Processing assistant request: {request_id}, mode: {context.mode} with session: {session}"
            )

            # Send initial events using SSEEventQueue helper methods
            await sse_queue.start_stream()

            await sse_queue.stage(
                name="initializing", description=f"Setting up {context.mode} process"
            )

            await sse_queue.status(
                message=f"Processing your {context.mode} request",
                details=f"Prompt: {context.prompt}",
            )

            # Process based on mode, passing the session
            if context.mode == "generate":
                await process_generate_request(request_id, context, sse_queue, session)
            elif context.mode == "edit":
                # If process_edit_request needs a session, pass it here
                await process_edit_request(request_id, context, sse_queue)
            else:  # chat
                # If process_chat_request needs a session, pass it here
                await process_chat_request(request_id, context, sse_queue)

            # Mark request as completed
            request_manager.update_request_status(request_id, RequestStatus.COMPLETED)

    except asyncio.CancelledError:
        # Task was cancelled - no need to do anything as request_manager handles cleanup
        logger.info(f"Processing cancelled for request: {request_id}")
        raise

    except Exception as e:
        # Log error and send error event
        logger.error(f"Error processing request {request_id}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")

        # Try to send error to client
        try:
            await sse_queue.error(
                message=f"Error processing your request: {str(e)}",
                error_data={"error": str(e), "traceback": traceback.format_exc()},
            )
        except Exception:
            logger.error(f"Failed to send error event for request: {request_id}")
            logger.error(f"Send error traceback: {traceback.format_exc()}")

        # Mark request as failed
        request_manager.update_request_status(request_id, RequestStatus.FAILED)

    finally:
        # Clean up request after a short delay to allow events to be consumed
        asyncio.create_task(delayed_request_cleanup(request_id))
        # Session is automatically closed by the 'with' statement
        if session:
            logger.info(f"Session closed for request {request_id}")


async def delayed_request_cleanup(request_id: str, delay_seconds: int = 10):
    """Cleanup request after a delay to ensure events are consumed"""
    await asyncio.sleep(delay_seconds)
    request_manager.remove_request(request_id)


async def _create_project_for_generation(context, session: Session, user_id: str) -> Optional[str]:
    """Create a project for music generation"""
    try:
        from app2.repositories.project_repository import ProjectRepository
        from app2.repositories.project_track_repository import ProjectTrackRepository
        from app2.services.track_service import TrackService
        from app2.services.project_service import ProjectService
        
        # Create services
        project_repo = ProjectRepository(session)
        track_repo = ProjectTrackRepository(session)
        track_service = TrackService(
            audio_repository=None,
            midi_repository=None, 
            sampler_repository=None,
            drum_repository=None,
            project_track_repository=track_repo,
            file_repository=None
        )
        project_service = ProjectService(project_repo, track_repo, track_service)
        
        # Create project data
        project_name = f"Generated Song - {context.prompt[:50]}"
        if len(project_name) > 100:
            project_name = project_name[:97] + "..."
        
        project_data = {
            "name": project_name,
            "bpm": 120,
            "time_signature_numerator": 4,
            "time_signature_denominator": 4,
            "key_signature": "C major"
        }
        
        # Create the project
        new_project = await project_service.create_project(
            user_id=UUID(user_id),
            project_data=project_data
        )
        
        return str(new_project.id)
        
    except Exception as e:
        logger.error(f"Failed to create project for generation: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return None


async def process_generate_request(
    request_id: str, context, sse_queue: SSEQueueManager, session: Session
):
    """Process a generate mode request"""

    # Generate music with music_gen_service, passing the session
    try:
        logger.info(f"🎵 PROCESS_GENERATE - Request ID: {request_id}")
        logger.info(f"🎵 PROCESS_GENERATE - Context: {context}")
        logger.info(f"🎵 PROCESS_GENERATE - Context.context: {getattr(context, 'context', 'None')}")
        
        selected_model_info = available_models.get_model_by_name(context.model)
        selected_model_info.api_key = selected_model_info.get_api_key()
        logger.info(f"Selected model: {selected_model_info}")
        
        # Check if we need to create or use a specific project
        project_id = None
        user_id = None
        
        # Extract user ID for project creation
        if hasattr(context, 'user_id') and context.user_id:
            user_id = context.user_id
        
        # Check for existing project_id
        if hasattr(context, 'context') and context.context and context.context.get('project_id'):
            project_id = context.context.get('project_id')
            logger.info(f"🎵 PROCESS_GENERATE - Using existing project: {project_id}")
        # Check if we should auto-create a project
        elif hasattr(context, 'context') and context.context and context.context.get('auto_create_project') and user_id:
            logger.info(f"🎵 PROCESS_GENERATE - Auto-creating project for user: {user_id}")
            project_id = await _create_project_for_generation(context, session, user_id)
            if project_id:
                logger.info(f"🎵 PROCESS_GENERATE - Created project: {project_id}")
            else:
                logger.warning("🎵 PROCESS_GENERATE - Failed to create project")
        else:
            logger.info(f"🎵 PROCESS_GENERATE - No project creation requested, context: {getattr(context, 'context', 'None')}")
        
        # Create a wrapped queue that also saves tracks to project
        if project_id:
            logger.info(f"🎵 PROCESS_GENERATE - Creating ProjectSavingSSEQueue wrapper for project {project_id}")
            wrapped_queue = ProjectSavingSSEQueue(sse_queue, session, project_id)
        else:
            logger.info("🎵 PROCESS_GENERATE - No project_id available, using regular SSE queue")
            wrapped_queue = sse_queue
        
        response = await music_agent.run(
            request_id=request_id,
            request=SongRequest(user_prompt=context.prompt,
                        duration_bars=4),
            model_info=selected_model_info,
            queue=wrapped_queue,
            db_session=session
        )
        
        # logger.info(
        #     f"Music generation complete: {len(response.get('instruments', []))} instruments"
        # )
        # logger.info(f"Response: {response}")
        # # Extract first instrument
        # if response.get("instruments") and len(response["instruments"]) > 0:
        #     tracks = []
        #     actions = []
        #     logger.info(f"Response instruments: {response['instruments']}")
        #     for instrument in response["instruments"]:
        #         if not instrument.get("notes"):
        #             continue
        #         logger.info(f"Adding instrument: {instrument}")

        #     # Create final response
        #     final_response = GenerateResponse(
        #         response=json.dumps(response), tracks=tracks, actions=actions
        #     )

            # Send complete event
        # Send the final composition data before completing the stream
        # Assuming 'response' is the SongComposition object returned by the agent
        # and sse_queue has a method to send the final structured data.
        # We'll use model_dump() to serialize the Pydantic model.
        # The event name "final_composition" is arbitrary, adjust as needed for frontend.
        
        # Now signal that the entire process is complete
        await sse_queue.complete({})
        logger.info(f"Generate request completed successfully: {request_id}")

    except Exception as gen_error:
        logger.error(f"Error in music generation: {gen_error}")
        logger.error(f"Generation error traceback: {traceback.format_exc()}")
        await sse_queue.error(
            message=f"Error generating music: {str(gen_error)}",
            error_data={"error": str(gen_error), "traceback": traceback.format_exc()},
        )
        raise


async def process_edit_request(request_id: str, context, queue: asyncio.Queue):
    """Process an edit mode request"""

    # Create message ID for this session
    message_id = f"msg-{int(time.time())}"

    # Response streaming setup
    await queue.put(
        (
            "response_start",
            {
                "message_id": message_id,
                "request_id": request_id,
                "track_id": context.track_id,
            },
        )
    )

    # Send processing stage
    await queue.put(
        ("stage", {"name": "processing", "description": "Processing your edit request"})
    )

    # Stream fake AI response chunks (for now)
    full_response = ""
    chunks = [
        f"Working on your edit request for track {context.track_id}... ",
        "Analyzing your instructions and determining necessary changes... ",
        f"Applying changes based on: '{context.prompt}'... ",
    ]

    for i, chunk in enumerate(chunks):
        await asyncio.sleep(0.5)  # Simulate processing time
        full_response += chunk
        await queue.put(
            (
                "response_chunk",
                {"message_id": message_id, "chunk": chunk, "chunk_index": i},
            )
        )

    # Mark response as complete
    await queue.put(("response_end", {"message_id": message_id, "is_complete": True}))

    # Simple edit example (adjust volume)
    action = AssistantAction(
        type="adjust_volume",
        data={
            "trackId": context.track_id,
            "value": 80,  # Example volume value
        },
    )

    # Send the action to the client
    await queue.put(("action", action.dict()))

    # Create empty track data (no note changes in this example)
    track_data = TrackData(notes=[], instrument_name="Edited Track", instrument_id=None)

    # Create final response
    final_response = EditResponse(
        response=full_response, track=track_data, actions=[action]
    )

    # Send complete event
    await queue.put(("complete", final_response.dict()))
    logger.info(f"Edit request completed successfully: {request_id}")


async def process_chat_request(request_id: str, context, queue: asyncio.Queue):
    """Process a chat mode request"""
    # Create message ID for this session
    message_id = f"msg-{int(time.time())}"

    # Response streaming setup
    await queue.put(
        ("response_start", {"message_id": message_id, "request_id": request_id})
    )

    # Send processing stage
    await queue.put(
        ("stage", {"name": "processing", "description": "Processing your question"})
    )

    # Stream fake AI response chunks (for now)
    full_response = ""
    chunks = [
        "I'm your AI music assistant. ",
        "I can help with music production, arrangement, and theory. ",
        f"Regarding your question: '{context.prompt}', I'll do my best to assist.",
    ]

    for i, chunk in enumerate(chunks):
        await asyncio.sleep(0.5)  # Simulate processing time
        full_response += chunk
        await queue.put(
            (
                "response_chunk",
                {"message_id": message_id, "chunk": chunk, "chunk_index": i},
            )
        )

    # Mark response as complete
    await queue.put(("response_end", {"message_id": message_id, "is_complete": True}))

    # Create final response
    final_response = AssistantResponse(response=full_response)

    # Send complete event
    await queue.put(("complete", final_response.dict()))
    logger.info(f"Chat request completed successfully: {request_id}")


# Ensure all endpoints in these routes are included in main.py
