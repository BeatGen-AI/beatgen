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

# Set up logger
logger = get_api_logger("assistant_streaming")

# Create router
router = APIRouter()

# Initialize SSE manager
sse_manager = SSEManager(heartbeat_interval=20)

load_dotenv()


class ProjectSavingSSEQueue:
    """Wrapper around SSEQueueManager that also saves tracks to a specific project"""
    
    def __init__(self, base_queue: SSEQueueManager, project_id: str, user_id: str, session: Session):
        """
        Initialize the project-saving queue wrapper
        
        Args:
            base_queue: The underlying SSE queue to wrap
            project_id: The project ID to save tracks to
            user_id: The user ID for authorization
            session: Database session for saving tracks
        """
        self.base_queue = base_queue
        self.project_id = project_id
        self.user_id = user_id
        self.session = session
        self._project_service = None
        self._updated_name = False  # Track if we've updated the project name
    
    @property
    def project_service(self):
        """Lazy initialization of project service"""
        if self._project_service is None:
            from app2.services.project_service import ProjectService
            from app2.repositories.project_repository import ProjectRepository
            from app2.repositories.project_track_repository import ProjectTrackRepository
            from app2.services.track_service import TrackService
            from app2.repositories.audio_track_repository import AudioTrackRepository
            from app2.repositories.midi_track_repository import MidiTrackRepository
            from app2.repositories.drum_track_repository import DrumTrackRepository
            from app2.repositories.sampler_track_repository import SamplerTrackRepository
            
            # Initialize repositories
            project_repo = ProjectRepository(self.session)
            project_track_repo = ProjectTrackRepository(self.session)
            audio_track_repo = AudioTrackRepository(self.session)
            midi_track_repo = MidiTrackRepository(self.session)
            drum_track_repo = DrumTrackRepository(self.session)
            sampler_track_repo = SamplerTrackRepository(self.session)
            
            # Initialize track service
            track_service = TrackService(
                audio_track_repo, midi_track_repo, drum_track_repo, sampler_track_repo
            )
            
            # Initialize project service
            self._project_service = ProjectService(
                project_repo, project_track_repo, track_service
            )
        
        return self._project_service
    
    async def action(self, action_data):
        """
        Send action and save both track data and project parameters
        """
        # Send the action via the base queue first
        await self.base_queue.action(action_data)
        
        # Check if this is an action that should update the project
        if hasattr(action_data, 'action_type'):
            action_type = action_data.action_type
            
            if action_type in ['add_track', 'add_drum_track', 'add_sampler_track']:
                try:
                    await self._save_track_from_action(action_data)
                except Exception as e:
                    logger.error(f"Failed to save track from action: {e}")
                    # Don't fail the generation, just log the error
            
            elif action_type in ['change_bpm', 'change_key', 'change_time_signature']:
                try:
                    await self._update_project_from_action(action_data)
                except Exception as e:
                    logger.error(f"Failed to update project from action: {e}")
                    # Don't fail the generation, just log the error
    
    async def _save_track_from_action(self, action_data):
        """Save a track to the project from an assistant action"""
        if not hasattr(action_data, 'data') or not hasattr(action_data.data, 'track_data'):
            logger.warning("Action data missing track_data, skipping save")
            return
        
        track_data = action_data.data.track_data
        if not track_data:
            logger.warning("Track data is None, skipping save")
            return
        
        # Convert track data to the format expected by project service
        track_dict = {
            'id': str(track_data.id),
            'name': track_data.name,
            'type': action_data.data.type.value,  # Convert enum to string
        }
        
        # Add track-specific data
        if hasattr(track_data, 'midi_notes_json'):
            track_dict['midi_notes_json'] = track_data.midi_notes_json
        if hasattr(track_data, 'instrument_id'):
            track_dict['instrument_id'] = track_data.instrument_id
        if hasattr(track_data, 'bpm'):
            track_dict['bpm'] = track_data.bpm
        if hasattr(track_data, 'sampler_tracks'):
            track_dict['sampler_tracks'] = track_data.sampler_tracks
        
        # Add default project track settings
        track_dict.update({
            'volume': 1.0,
            'pan': 0.0,
            'mute': False,
            'x_position': 0,
            'y_position': 0,
            'track_number': 0,
        })
        
        logger.info(f"Saving track to project {self.project_id}: {track_dict['name']}")
        
        # Save the track to the project
        import uuid
        await self.project_service.add_track(
            project_id=uuid.UUID(self.project_id),
            user_id=uuid.UUID(self.user_id),
            track_data=track_dict
        )
        
        logger.info(f"Successfully saved track {track_dict['name']} to project {self.project_id}")
    
    async def _update_project_from_action(self, action_data):
        """Update project parameters from an assistant action"""
        try:
            import uuid
            from app2.models.project import ProjectUpdate
            
            project_updates = {}
            
            if action_data.action_type == 'change_bpm':
                project_updates['bpm'] = action_data.data.value
                logger.info(f"Updating project {self.project_id} BPM to {action_data.data.value}")
                
            elif action_data.action_type == 'change_key':
                project_updates['key_signature'] = action_data.data.value
                logger.info(f"Updating project {self.project_id} key to {action_data.data.value}")
                
            elif action_data.action_type == 'change_time_signature':
                project_updates['time_signature_numerator'] = action_data.data.numerator
                project_updates['time_signature_denominator'] = action_data.data.denominator
                logger.info(f"Updating project {self.project_id} time signature to {action_data.data.numerator}/{action_data.data.denominator}")
            
            if project_updates:
                # Update the project using the project service
                await self.project_service.update_project(
                    project_id=uuid.UUID(self.project_id),
                    user_id=uuid.UUID(self.user_id),
                    updates=project_updates
                )
                
                logger.info(f"Successfully updated project {self.project_id} parameters")
                
        except Exception as e:
            logger.error(f"Failed to update project parameters: {e}")
            raise
    
    async def add_chunk(self, chunk: str):
        """
        Send chunk and potentially extract song title to update project name
        """
        # Send the chunk via the base queue first
        await self.base_queue.add_chunk(chunk)
        
        # Try to extract song title from the streaming text to update project name
        if not self._updated_name:
            await self._try_update_project_name_from_chunk(chunk)
    
    async def _try_update_project_name_from_chunk(self, chunk: str):
        """Try to extract song title from streaming text and update project name"""
        try:
            import re
            
            # Look for patterns like "Title: Song Name" or "Song Title: Song Name" in the chunk
            title_patterns = [
                r'title[:\s]+["\']?([^"\'\n]+)["\']?',
                r'song title[:\s]+["\']?([^"\'\n]+)["\']?',
                r'name[:\s]+["\']?([^"\'\n]+)["\']?',
            ]
            
            chunk_lower = chunk.lower()
            for pattern in title_patterns:
                match = re.search(pattern, chunk_lower, re.IGNORECASE)
                if match:
                    title = match.group(1).strip()
                    # Basic validation - reasonable length and not generic text
                    if 3 <= len(title) <= 50 and not any(word in title.lower() for word in ['untitled', 'generated', 'song', 'track']):
                        await self._update_project_name(title)
                        self._updated_name = True
                        break
                        
        except Exception as e:
            logger.debug(f"Failed to extract title from chunk: {e}")
            # Don't fail generation for this
    
    async def _update_project_name(self, title: str):
        """Update the project name with the determined song title"""
        try:
            import uuid
            
            project_updates = {'name': title}
            
            await self.project_service.update_project(
                project_id=uuid.UUID(self.project_id),
                user_id=uuid.UUID(self.user_id),
                updates=project_updates
            )
            
            logger.info(f"Updated project {self.project_id} name to: {title}")
            
        except Exception as e:
            logger.error(f"Failed to update project name: {e}")
            # Don't fail generation for this
    
    # Delegate all other methods to the base queue
    def __getattr__(self, name):
        return getattr(self.base_queue, name)

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
        f"CREATE REQUEST - Received request: mode={request.mode}, user_id={user.get('id') if user else 'None'}"
    )
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
    """
    Create a project automatically for generation when auto_create_project is enabled
    
    Args:
        context: The request context containing prompt and settings
        session: Database session
        user_id: User ID for project ownership
        
    Returns:
        The created project ID as string, or None if creation failed
    """
    try:
        from app2.services.project_service import ProjectService
        from app2.repositories.project_repository import ProjectRepository
        from app2.repositories.project_track_repository import ProjectTrackRepository
        from app2.services.track_service import TrackService
        from app2.repositories.audio_track_repository import AudioTrackRepository
        from app2.repositories.midi_track_repository import MidiTrackRepository
        from app2.repositories.drum_track_repository import DrumTrackRepository
        from app2.repositories.sampler_track_repository import SamplerTrackRepository
        from app2.models.project import ProjectCreate
        import uuid
        from datetime import datetime
        
        # Initialize repositories and services
        project_repo = ProjectRepository(session)
        project_track_repo = ProjectTrackRepository(session)
        audio_track_repo = AudioTrackRepository(session)
        midi_track_repo = MidiTrackRepository(session)
        drum_track_repo = DrumTrackRepository(session)
        sampler_track_repo = SamplerTrackRepository(session)
        
        track_service = TrackService(
            audio_track_repo, midi_track_repo, drum_track_repo, sampler_track_repo
        )
        
        project_service = ProjectService(
            project_repo, project_track_repo, track_service
        )
        
        # Create project with basic settings that will be updated during generation
        project_name = f"Generated Song - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        
        # Start with reasonable defaults - these will be updated as the AI determines parameters
        default_bpm = 120
        default_key = "C major"
        
        project_data = ProjectCreate(
            name=project_name,
            bpm=default_bpm,
            time_signature_numerator=4,
            time_signature_denominator=4,
            key_signature=default_key
        )
        
        logger.info(f"Creating auto-project for user {user_id}: {project_name}")
        
        # Create the project
        created_project = await project_service.create_project(
            uuid.UUID(user_id), project_data
        )
        
        project_id = str(created_project.id)
        logger.info(f"Successfully created auto-project: {project_id}")
        
        return project_id
        
    except Exception as e:
        logger.error(f"Failed to create auto-project for user {user_id}: {e}")
        logger.error(f"Auto-project creation traceback: {traceback.format_exc()}")
        return None


async def process_generate_request(
    request_id: str, context, sse_queue: SSEQueueManager, session: Session
):
    """Process a generate mode request"""

    # Generate music with music_gen_service, passing the session
    try:
        logger.info(f"Processing generate request: {request_id}")
        
        selected_model_info = available_models.get_model_by_name(context.model)
        selected_model_info.api_key = selected_model_info.get_api_key()
        logger.info(f"Selected model: {selected_model_info}")
        
        # Check if auto project creation is enabled
        auto_create_project = context.context and context.context.get('auto_create_project', False)
        project_id = None
        wrapped_queue = sse_queue
        
        if auto_create_project:
            logger.info("Auto-creation enabled, creating project for generation")
            # Get user ID from context (set by the request manager)
            user_id = context.user_id
            if user_id:
                project_id = await _create_project_for_generation(context, session, user_id)
                if project_id:
                    logger.info(f"Created auto-project: {project_id}")
                    # Wrap the queue to save tracks automatically
                    wrapped_queue = ProjectSavingSSEQueue(sse_queue, project_id, user_id, session)
                else:
                    logger.warning("Failed to create auto-project, using regular queue")
            else:
                logger.warning("No user_id available for auto-project creation")
        
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
        complete_data = {}
        if project_id:
            complete_data['project_id'] = project_id
            complete_data['message'] = f'Song generated and saved to project {project_id}'
        else:
            complete_data['message'] = 'Song generated successfully'
            
        await sse_queue.complete(complete_data)
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
