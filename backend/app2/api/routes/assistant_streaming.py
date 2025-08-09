"""
Enhanced AI Assistant API with two-step request handling:
1. POST request to get a request ID
2. SSE connection to receive streaming updates

This implementation uses a request manager to track active requests and
provides streaming responses with proper resource management.
"""

import asyncio
import json
import math
import re
import time
import traceback
import uuid
from datetime import datetime
from dateutil.relativedelta import relativedelta
from typing import Dict, Any, Optional, Literal

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
from pydantic import BaseModel
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app2.api.dependencies import get_current_user
from app2.constants.credits import get_operation_cost, get_model_credit_cost
from app2.core.logging import get_api_logger
from app2.infrastructure.database.sqlmodel_client import get_async_session
from app2.llm import available_models
from app2.llm.agents.music_agent import SongRequest, music_agent
from app2.llm.available_models import ModelInfo
from app2.llm.chat_session_manager import chat_session_manager
from app2.llm.streaming import TextDeltaEvent
from app2.llm.tools.edit_tools import get_tool_actions, clear_tool_actions
from app2.models.assistant import (
    AssistantRequest,
    AssistantResponse,
    GenerateResponse,
    EditResponse,
    AssistantAction,
    TrackData,
)
from app2.models.assistant_message import GenerationStep
from app2.models.subscription import SubscriptionPlan, BillingPeriod
from app2.models.track_models.audio_track import AudioTrack, AudioTrackCreate, AudioTrackRead
from app2.models.user import User
from app2.repositories.audio_track_repository import AudioTrackRepository
from app2.repositories.file_repository import FileRepository
from app2.services.audio_generation_service import get_audio_generation_service
from app2.services.credits_service import credits_service
from app2.services.file_service import FileService
from app2.sse.request_manager import request_manager, RequestStatus
from app2.sse.sse import SSEManager
from app2.sse.sse_queue_manager import SSEQueueManager
from app2.types.assistant_actions import AudioTrackData

# Set up logger
logger = get_api_logger("assistant_streaming")

# Create router
router = APIRouter()

# Initialize SSE manager
sse_manager = SSEManager(heartbeat_interval=20)

load_dotenv()


async def ensure_project_exists(user_id: str, project_data: Dict[str, Any], session) -> str:
    """
    Ensure project exists in database, create if needed using frontend-provided ID
    
    Args:
        user_id: User ID who owns the project
        project_data: Project context data from frontend (must include project_id)
        session: Database session
        
    Returns:
        Project ID (string) - always the same as frontend provided
    """
    from app2.services.project_service import ProjectService
    from app2.core.exceptions import NotFoundException
    
    project_id = project_data.get('project_id')
    
    if not project_id:
        raise ValueError("project_id is required in request context")
    
    logger.info(f"🔍 ensure_project_exists: Checking project {project_id} for user {user_id}")
    
    # Validate UUID format
    try:
        project_uuid = uuid.UUID(project_id)
    except ValueError:
        raise ValueError(f"Invalid project_id format: {project_id}")
    
    # Check if project already exists
    try:
        from app2.repositories.project_repository import ProjectRepository
        project_repo = ProjectRepository(session)
        existing_project = await project_repo.get_by_id(project_uuid)
        
        # 🔒 SECURITY: Verify ownership
        if existing_project.user_id != uuid.UUID(user_id):
            logger.warning(f"🚨 SECURITY: User {user_id} tried to access project {project_id} owned by {existing_project.user_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to project"
            )
        
        logger.info(f"✅ Project {project_id} exists and user {user_id} has access")
        return project_id
        
    except NotFoundException:
        logger.info(f"📝 Project {project_id} doesn't exist, creating with frontend ID")
        pass  # Project doesn't exist, create it
    
    # Create project with exact frontend-provided ID
    project_service = ProjectService(session)
    
    project_creation_data = {
        'id': project_uuid,  # 🔑 Use frontend's exact ID
        'name': project_data.get('project_title', 'Untitled Project'),
        'bpm': float(project_data.get('bpm', 120)),
        'time_signature_numerator': int(project_data.get('time_signature', {}).get('numerator', 4)),
        'time_signature_denominator': int(project_data.get('time_signature', {}).get('denominator', 4)),
        'key_signature': project_data.get('key_signature', 'C')
    }
    
    new_project = await project_service.create_project(
        user_id=uuid.UUID(user_id),
        project_data=project_creation_data
    )
    
    logger.info(f"✅ Created project {new_project.id} for user {user_id}")
    
    # Verify the created project has the right ID
    if str(new_project.id) != project_id:
        logger.error(f"🚨 CRITICAL: Created project ID {new_project.id} doesn't match requested {project_id}")
        raise ValueError("Project creation ID mismatch")
    
    return project_id


async def validate_project_access(project_id: str, user_id: str, session) -> None:
    """
    Validate that user has access to the specified project
    
    Args:
        project_id: Project ID to validate
        user_id: User ID to check ownership
        session: Database session
        
    Raises:
        HTTPException: If user doesn't have access to project
    """
    try:
        from app2.repositories.project_repository import ProjectRepository
        project_repo = ProjectRepository(session)
        project = await project_repo.get_by_id(uuid.UUID(project_id))
        
        if project.user_id != uuid.UUID(user_id):
            logger.warning(f"🚨 SECURITY: User {user_id} denied access to project {project_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to project"
            )
    except Exception as e:
        logger.error(f"Error validating project access: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )


# TODO: ProjectSavingSSEQueue will be implemented in a separate PR
# This code is commented out to keep this merge focused on UI changes only

# class ProjectSavingSSEQueue:
#     """Wrapper around SSEQueueManager that also saves tracks to a specific project"""
#     [Implementation temporarily removed - will be added back when project saving is fixed]

# Request schema for unified assistant endpoint
class AssistantRequestModel(AssistantRequest):
    """Unified request model for all assistant interaction types"""

    mode: Literal["generate", "edit", "chat", "generate-audio"]


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
        if not await request_manager.can_create_request(user.get("id")):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Maximum concurrent requests reached ({request_manager.MAX_REQUESTS_PER_USER})",
            )

        # Create request in manager
        logger.info(
            f"📝 CREATE REQUEST - Creating request with user_id={user.get('id')}"
        )
        request_id = await request_manager.create_request(
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

        # Store project_id for later use in assistant message saving
        # This will be set during user message saving and reused for assistant message
        current_project_id = None
        
        # Ensure project exists and save user message if context provided
        if request.context:
            try:
                logger.info(f"🔍 REQUEST CONTEXT project_id: {request.context.get('project_id')}")
                # Get database session
                async with get_async_session() as session:
                    # Ensure project exists first
                    project_id = await ensure_project_exists(
                        user_id=user.get('id'),
                        project_data=request.context,
                        session=session
                    )
                    
                    # Store for later use - CRITICAL: this must be used by assistant message saving
                    current_project_id = project_id
                    logger.info(f"📝 FRONTEND project_id: {request.context.get('project_id')}")
                    logger.info(f"📝 BACKEND created/found project_id: {current_project_id}")
                    logger.info(f"📝 STORED project_id {current_project_id} for assistant message reuse")
                    
                    # Save user message
                    from app2.services.assistant_message_service import AssistantMessageService
                    message_service = AssistantMessageService(session)
                    await message_service.save_user_message(
                        project_id=uuid.UUID(project_id),
                        content=request.prompt,
                        mode=request.mode,
                        metadata={
                            'selected_track': request.context.get('track_id'),
                            'generation_type': request.context.get('generation_type'),
                            'model': request.model,
                            'request_id': request_id
                        }
                    )
                    logger.info(f"📝 Saved user message for project {project_id}")
            except Exception as e:
                logger.error(f"Error saving user message: {str(e)}")
                # Don't fail the request if message saving fails

        # Update request status to processing
        await request_manager.update_request_status(request_id, RequestStatus.PROCESSING)

        # Start processing in background, passing the project_id for message saving
        background_tasks.add_task(
            process_assistant_request, 
            request_id=request_id, 
            project_id=current_project_id
        )

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
    is_valid = await request_manager.validate_request_id(request_id, user.get("id"))
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
    queue = await request_manager.get_queue(request_id)
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
    if not await request_manager.validate_request_id(request_id, user.get("id")):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Request ID not found: {request_id}",
        )

    # Get the SSE queue
    sse_queue = await request_manager.get_sse_queue(request_id)
    if sse_queue:
        # Send cancelled event
        await sse_queue.cancelled()

    # Remove request
    if await request_manager.remove_request(request_id, RequestStatus.CANCELLED):
        return JSONResponse(
            content={"message": f"Request {request_id} cancelled successfully"}
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel request",
        )


async def process_assistant_request(request_id: str, project_id: str = None):
    """
    Background task to process an assistant request.

    Retrieves the request context, processes it according to its mode,
    and sends SSE events through the queue.
    """
    # Get request context
    context = await request_manager.get_request(request_id)
    if not context:
        logger.error(f"Request context not found for ID: {request_id}")
        return
    
    # Use the project_id passed from the main request (from user message saving)
    current_project_id = project_id
    logger.info(f"🔍 Using passed project_id {current_project_id} for assistant message saving")

    # Get the SSE queue for sending events
    sse_queue = context.sse_queue if context.sse_queue else await request_manager.get_sse_queue(request_id)
    if not sse_queue:
        logger.error(f"SSE queue not found for request: {request_id}")
        return

    # Get a database session for this background task
    # Use the async session context manager for proper cleanup
    try:
        async with get_async_session() as session:  # Use async session manager
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

            # Track processing start time for metadata
            processing_start_time = time.time()

            # Process based on mode, passing the session and project_id
            if context.mode == "generate":
                await process_generate_request(request_id, context, sse_queue, session, current_project_id)
            elif context.mode == "generate-audio":
                await process_generate_audio_request(request_id, context, sse_queue, session, current_project_id)
            elif context.mode == "edit":
                # Pass session to edit request for database saving
                await process_edit_request(request_id, context, sse_queue, session)
            else:  # chat
                # If process_chat_request needs a session, pass it here
                await process_chat_request(request_id, context, sse_queue)

            # Save complete assistant response if project_id is available
            if current_project_id:
                logger.info(f"🔍 Saving complete assistant message for {context.mode} mode")
                try:
                    # Create complete assistant response content based on mode
                    response_metadata = {
                        'mode': context.mode,
                        'model': context.model,
                        'request_id': request_id,
                        'processing_time': time.time() - processing_start_time,
                        'prompt': context.prompt[:200]  # Store first 200 chars of prompt for context
                    }
                    
                    # Add mode-specific content - this represents the COMPLETE assistant response
                    if context.mode == "generate":
                        assistant_content = "🎵 Generated complete music composition with all tracks and arrangements"
                    elif context.mode == "generate-audio":
                        assistant_content = "🎵 Generated complete audio track"
                    elif context.mode == "edit":
                        assistant_content = "✏️ Applied all requested edits to project"
                    elif context.mode == "chat":
                        assistant_content = "💬 Provided complete assistance and guidance"
                    else:
                        assistant_content = f"✅ Completed {context.mode} request"
                    
                    # Save complete assistant message
                    from app2.services.assistant_message_service import AssistantMessageService
                    message_service = AssistantMessageService(session)
                    await message_service.save_assistant_message(
                        project_id=uuid.UUID(current_project_id),
                        request_id=request_id,
                        content=assistant_content,
                        mode=context.mode,
                        step=GenerationStep.COMPLETE.value if context.mode == "generate" else None,
                        metadata=response_metadata
                    )
                    logger.info(f"📝 Saved complete assistant response for project {current_project_id}")
                    
                except Exception as e:
                    # Don't fail the request if message saving fails
                    logger.error(f"Failed to save assistant message for request {request_id}: {str(e)}")
                    logger.error(traceback.format_exc())

            # Mark request as completed
            await request_manager.update_request_status(request_id, RequestStatus.COMPLETED)

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

        # Save error response using the same project_id from the main request
        error_project_id = project_id
        logger.info(f"🔍 Checking error message saving - error_project_id: {error_project_id}")
        if error_project_id:
            try:
                error_content = f"Error in {context.mode} request: {str(e)}"
                error_metadata = {
                    'mode': context.mode,
                    'model': getattr(context, 'model', 'unknown'),
                    'request_id': request_id,
                    'error': str(e),
                    'status': 'failed'
                }
                
                # Use a new session for error saving
                async with get_async_session() as error_session:
                    from app2.services.assistant_message_service import AssistantMessageService
                    error_message_service = AssistantMessageService(error_session)
                    await error_message_service.save_assistant_message(
                        project_id=uuid.UUID(error_project_id),
                        request_id=request_id,
                        content=error_content,
                        metadata=error_metadata
                    )
                    logger.info(f"📝 Saved error response for project {error_project_id}")
            except Exception as save_error:
                logger.error(f"Failed to save error message: {str(save_error)}")

        # Mark request as failed
        await request_manager.update_request_status(request_id, RequestStatus.FAILED)

    finally:
        # Clean up request after a short delay to allow events to be consumed
        asyncio.create_task(delayed_request_cleanup(request_id))
        logger.info(f"Cleanup scheduled for request {request_id}")


async def delayed_request_cleanup(request_id: str, delay_seconds: int = 10):
    """Cleanup request after a delay to ensure events are consumed"""
    await asyncio.sleep(delay_seconds)
    await request_manager.remove_request(request_id)


# TODO: Project auto-creation will be implemented in a separate PR
# async def _create_project_for_generation(context, session: AsyncSession, user_id: str) -> Optional[str]:
#     [Implementation temporarily removed - will be added back when project saving is fixed]


async def process_generate_request(
    request_id: str, context, sse_queue: SSEQueueManager, session: AsyncSession, project_id: str = None
):
    """Process a generate mode request"""

    # Generate music with music_gen_service, passing the session
    try:
        logger.info(f"Processing generate request: {request_id}")
        
        # Get user ID
        user_id = context.user_id
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User ID not found in request context"
            )
        
        # Check credits before processing
        # Get model info first to calculate model-specific costs
        selected_model_info = available_models.get_model_by_name(context.model)
        model_cost = get_model_credit_cost(context.model)
        
        user_credits_info = await credits_service.get_user_credits(user_id)
        if not user_credits_info:
            # Initialize credits if not found
            user = await session.get(User, user_id)
            if user:
                await credits_service.initialize_user_credits(user)
                user_credits_info = await credits_service.get_user_credits(user_id)
        
        # Check if user has enough credits (unless they have unlimited)
        if user_credits_info and not user_credits_info.get("is_unlimited", False):
            current_balance = user_credits_info.get("balance", 0)
            if isinstance(current_balance, str):  # Handle "unlimited" string
                current_balance = 999999
            
            if current_balance < model_cost:
                await sse_queue.error(
                    message="Insufficient credits",
                    error_data={
                        "error": "insufficient_credits",
                        "required": model_cost,
                        "current_balance": current_balance,
                        "message": f"You need at least {model_cost} credits to generate music with {context.model}. Please upgrade your plan or wait for your monthly allocation."
                    }
                )
                return
        
        await sse_queue.status(
            message=f"Credits verified, generating music with {context.model}...",
            details=f"Current balance: {user_credits_info.get('balance', 0)}, Cost: {model_cost} credits"
        )
        
        selected_model_info.api_key = selected_model_info.get_api_key()
        logger.info(f"Selected model: {selected_model_info}")
        
        # Prepare request context with project_id for assistant message saving
        enhanced_context = context.context.copy() if context.context else {}
        logger.info(f"🔍 BEFORE enhancement - original context: {context.context}")
        logger.info(f"🔍 BEFORE enhancement - stored project_id: {project_id}")
        if project_id:
            enhanced_context['project_id'] = project_id
            logger.info(f"🔍 AFTER enhancement - enhanced context: {enhanced_context}")
            logger.info(f"🔍 Added project_id {project_id} to music agent context")
        else:
            logger.warning(f"🔍 NO project_id to add to music agent context!")
        
        wrapped_queue = sse_queue
        
        response = await music_agent.run(
            request_id=request_id,
            request=SongRequest(user_prompt=context.prompt,
                        duration_bars=4),
            model_info=selected_model_info,
            queue=wrapped_queue,
            db_session=session,
            user_id=user_id,
            generation_type=enhanced_context.get('generation_type', 'midi'),
            request_context=enhanced_context
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
        
        # Check if generation was successful and deduct credits
        if response and response.get("success"):
            # Extract model info from selected_model_info
            model_provider = None
            if selected_model_info:
                if selected_model_info.provider_name == "openai":
                    model_provider = "openai"
                elif selected_model_info.provider_name == "anthropic":
                    model_provider = "anthropic"
                elif selected_model_info.provider_name == "openrouter":
                    # Check the model name for the actual provider
                    if "deepseek" in selected_model_info.model_name.lower():
                        model_provider = "deepseek"
                    elif "llama" in selected_model_info.model_name.lower():
                        model_provider = "meta"
                    else:
                        model_provider = "openrouter"
                elif selected_model_info.provider_name == "google-gla":
                    model_provider = "google"
                else:
                    model_provider = selected_model_info.provider_name
            
            credit_deducted = await credits_service.use_credits(
                user_id=user_id,
                amount=get_model_credit_cost(context.model),
                description=f"AI music generation ({context.model})",
                metadata={
                    "request_id": request_id,
                    "prompt": context.prompt[:100],  # Store first 100 chars of prompt
                    "song_title": response.get("song_title", "Untitled"),
                    "duration_bars": response.get("duration_bars", 4),
                    "tempo": response.get("tempo"),
                    "key": response.get("key"),
                    "model": context.model,
                    "stage_tokens": response.get("stage_tokens", {})  # Stage-by-stage token breakdown
                },
                # AI-specific parameters
                model_provider=model_provider,
                model_name=selected_model_info.model_name if selected_model_info else context.model,
                request_tokens=response.get("request_tokens"),  # If the agent provides this
                response_tokens=response.get("response_tokens"),  # If the agent provides this
                request_id=request_id,
                generation_type="music",
                prompt_preview=context.prompt[:200] if context.prompt else None
            )
            
            if credit_deducted:
                # Get updated balance
                updated_credits = await credits_service.get_user_credits(user_id)
                new_balance = updated_credits.get("balance", 0) if updated_credits else 0
                
                await sse_queue.status(
                    message="Music generated successfully! Credit deducted.",
                    details=f"New balance: {new_balance}"
                )
                logger.info(f"Deducted 1 credit for user {user_id}. New balance: {new_balance}")
            else:
                # This shouldn't happen since we checked before, but log it
                logger.warning(f"Failed to deduct credit for user {user_id} after generation")
        
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


async def process_edit_request(request_id: str, context, sse_queue: SSEQueueManager, session: Any = None):
    """Process an edit mode request using LLM tool calling with persistent ChatSession"""

    try:
        logger.info(f"Processing edit request with LLM tools: {request_id}")

        # Send processing stage
        await sse_queue.stage(
            name="analyzing", 
            description="Analyzing your edit request"
        )

        # Clear any previous tool actions
        clear_tool_actions()

        # Extract project_id from context - try multiple sources
        project_id = None
        if context.context:
            project_id = (
                context.context.get('project_id') or
                context.context.get('projectId') or 
                context.context.get('project_title')  # fallback to project title as identifier
            )
        
        # Fallback to user_id if no project context (shouldn't happen in normal flow)
        if not project_id:
            project_id = f"user_{context.user_id}"
            logger.warning(f"No project_id found in context, using fallback: {project_id}")

        # Get or create persistent ChatSession for this project
        chat_session = chat_session_manager.get_or_create_session(
            project_id=project_id,
            mode="edit",
            model=context.model,
            sse_queue=sse_queue,
            user_id=context.user_id,
            track_context=context.context,
            db_session=session,  # Pass database session for message saving
            request_id=request_id
        )

        logger.info(f"Using ChatSession for project {project_id}, user {context.user_id}, session count: {chat_session_manager.get_session_count()}")

        # Send the edit request to the LLM with tools  
        edit_prompt = f"Please edit: {context.prompt}"
        
        await sse_queue.stage(
            name="processing", 
            description="Determining the best way to make your requested changes"
        )

        # Use ChatSession to process the edit request with streaming
        logger.info("Streaming edit request response...")
        full_response_text = ""
        try:
            stream_generator = await chat_session.send_message_async(
                user_prompt_content=edit_prompt,
                stream=True
            )
            
            event_count = 0
            async for event in stream_generator:
                event_count += 1
                logger.debug(f"EDIT STREAMING EVENT #{event_count} - TYPE: {type(event)}")
                
                # Handle different event types
                if isinstance(event, TextDeltaEvent):
                    text_chunk = event.delta
                    full_response_text += text_chunk
                    await sse_queue.add_chunk(text_chunk)
                elif isinstance(event, str):
                    # Direct string chunks (if music agent pattern works)
                    full_response_text += event
                    await sse_queue.add_chunk(event)
                else:
                    # Log unknown event types for debugging
                    logger.debug(f"EDIT STREAMING UNKNOWN EVENT: {type(event)} - {event}")
                    
            logger.info(f"Total streaming events processed: {event_count}")
            logger.info("Finished streaming edit response.")
        except Exception as e:
            logger.error(f"Error during streaming: {e}")
            raise

        logger.info(f"Edit LLM response streamed, full response length: {len(full_response_text)}")

        # Get actions that were created by tool calls
        tool_actions = get_tool_actions()
        logger.info(f"Tool actions retrieved: {len(tool_actions)} actions")
        
        # If tools were called, send the actions
        if tool_actions:
            logger.info(f"Processing {len(tool_actions)} tool actions")
            for i, action in enumerate(tool_actions):
                logger.info(f"Sending tool action #{i+1}: {action.action_type} with data: {action.data}")
                try:
                    await sse_queue.action(action)
                    logger.info(f"Successfully sent action #{i+1} to SSE queue")
                except Exception as e:
                    logger.error(f"Failed to send action #{i+1}: {e}")
        else:
            logger.info("No tool actions were generated - AI provided explanation only")

        # Create response
        full_response = f"Applied edit: {context.prompt}"
        track_data = TrackData(notes=[], instrument_name="Edited", instrument_id=None)
        final_response_obj = EditResponse(
            response=full_response, track=track_data, actions=tool_actions
        )

        # Send complete event
        await sse_queue.complete(final_response_obj.model_dump())
        logger.info(f"Edit request completed successfully: {request_id}")

    except Exception as e:
        logger.error(f"Error in edit request {request_id}: {str(e)}")
        await sse_queue.error(
            message=f"Failed to process edit request: {str(e)}",
            error_data={"error": "edit_failed", "details": str(e)}
        )
        raise


async def process_chat_request(request_id: str, context, sse_queue: SSEQueueManager):
    """Process a chat mode request"""
    
    try:
        logger.info(f"Processing chat request: {request_id}")

        # Send processing stage
        await sse_queue.stage(
            name="processing", 
            description="Processing your question"
        )

        # Create message ID for this session
        message_id = f"msg-{int(time.time())}"

        # Stream AI response chunks with delays to simulate processing
        chunks = [
            "I'm your AI music assistant. ",
            "I can help with music production, arrangement, and theory. ",
            f"Regarding your question: '{context.prompt}', I'll do my best to assist."
        ]

        full_response = ""
        
        for chunk in chunks:
            await asyncio.sleep(0.6)  # Simulate processing time
            full_response += chunk
            await sse_queue.add_chunk(chunk)

        # Create final response
        final_response_obj = AssistantResponse(response=full_response)

        # Send complete event
        await sse_queue.complete(final_response_obj.model_dump())
        logger.info(f"Chat request completed successfully: {request_id}")

    except Exception as e:
        logger.error(f"Error in chat request {request_id}: {str(e)}")
        await sse_queue.error(
            message=f"Failed to process chat request: {str(e)}",
            error_data={"error": "chat_failed", "details": str(e)}
        )
        raise


async def process_generate_audio_request(
    request_id: str, context, sse_queue: SSEQueueManager, session: AsyncSession, project_id: str = None
):
    """
    Process a generate-audio mode request using FAL-AI Lyria2 model
    
    Generates solo instrument audio tracks based on user prompts, incorporating
    musical context (BPM, key signature, time signature) from the DAW project.
    
    Args:
        request_id: Unique identifier for this generation request
        context: Request context containing user prompt and musical parameters
        sse_queue: Server-sent events queue for real-time updates
        session: Database session for track creation and credit management
    """
    try:
        # Create file service instance
        file_repository = FileRepository(session)
        file_service = FileService(file_repository)
        
        logger.info(f"Processing generate-audio request: {request_id}")
        
        # Get user ID
        user_id = context.user_id
        if not user_id:
            await sse_queue.error(
                message="User ID not found",
                error_data={"error": "unauthorized", "message": "User authentication required"}
            )
            return
        
        # Check credits (same as generate mode)
        user_credits_info = await credits_service.get_user_credits(user_id)
        if not user_credits_info:
            user = await session.get(User, user_id)
            if user:
                await credits_service.initialize_user_credits(user)
                user_credits_info = await credits_service.get_user_credits(user_id)
        
        if user_credits_info and not user_credits_info.get("is_unlimited", False):
            current_balance = user_credits_info.get("balance", 0)
            if isinstance(current_balance, str):
                current_balance = 999999
            
            if current_balance < 1:
                await sse_queue.error(
                    message="Insufficient credits",
                    error_data={
                        "error": "insufficient_credits",
                        "required": 1,
                        "current_balance": current_balance,
                        "message": "You need at least 1 credit to generate audio. Please upgrade your plan."
                    }
                )
                return
        
        # Extract musical context from request with sensible defaults
        bpm = context.context.get('bpm', 120) if context.context else 120
        key_signature = context.context.get('key_signature', 'C Major') if context.context else 'C Major'
        time_signature = context.context.get('time_signature', {'numerator': 4, 'denominator': 4}) if context.context else {'numerator': 4, 'denominator': 4}
        bars = context.context.get('bars', 4) if context.context else 4
        duration_from_user = context.context.get('duration') if context.context else None
        
        prompt_text = context.prompt
        
        # Use user-provided duration if available, otherwise parse from prompt or use bars calculation
        if duration_from_user:
            duration = duration_from_user
        else:
            # Parse number of bars from prompt (fallback behavior)
            bars_match = re.search(r'(\d+)\s*(?:bar|bars|measure|measures)\b', prompt_text.lower())
            if bars_match:
                bars = int(bars_match.group(1))
                bars = min(max(bars, 1), 16)  # Clamp between 1-16 bars
        
        # Match the exact successful format from the API docs example with simplicity emphasis
        enhanced_prompt = f"{prompt_text} solo, simple, minimalist, no accompaniment, no drums, no bass, acoustic"
        
        # Add key signature
        if key_signature:
            enhanced_prompt += f", key {key_signature}"
        
        # Add BPM and quality specs exactly like the working example
        enhanced_prompt += f", {bpm}bpm, studio, 48kHz Stereo"
        
        await sse_queue.stage(
            name="generating_audio",
            description=f"Generating audio: {enhanced_prompt}"
        )
        
        # Create audio generation service instance
        audio_service = get_audio_generation_service(context.model)
        
        # Enhanced negative prompt to avoid complexity and ensure solo focus
        negative_prompt = "accompaniment, drums, background instruments, complex, layered, arrangement"
        
        # Use duration from user if provided, otherwise calculate from bars and BPM for Stability AI
        if duration_from_user:
            duration = duration_from_user
        elif hasattr(audio_service, 'calculate_duration_from_bars'):
            duration = audio_service.calculate_duration_from_bars(bpm, bars)
        else:
            duration = None
        
        # Generate audio with service-specific parameters
        logger.info(f"Generating audio - BPM: {bpm}, Key: {key_signature}, Bars: {bars}, Duration: {duration}s")
        
        # Check if this is Stability AI service (supports additional parameters)
        if context.model == 'stability/stable-audio-2':
            audio_data, generation_result = await audio_service.generate_and_download_audio(
                prompt=enhanced_prompt,
                negative_prompt=negative_prompt,
                duration=duration,
                bpm=bpm,
                bars=bars,
                key=key_signature
            )
        else:
            # VertexAI and FAL AI services only support prompt and negative_prompt
            audio_data, generation_result = await audio_service.generate_and_download_audio(
                prompt=enhanced_prompt,
                negative_prompt=negative_prompt
            )
        
        await sse_queue.stage(
            name="processing_audio",
            description="Processing and storing generated audio..."
        )
        
        # Upload audio to storage
        audio_track_id = str(uuid.uuid4())
        storage_key, _ = await file_service.upload_audio_file(
            audio_data, 
            generation_result.file_name,
            user_id
        )
        
        # Generate waveform data (simplified - you may want to use a proper audio analysis library)
        # For now, we'll create a simple mock waveform
        waveform_data = [0.0] * 200  # Placeholder waveform
        
        # Create audio track record data as a dictionary (since AudioTrackCreate doesn't have user_id)
        audio_track_data = {
            "id": audio_track_id,
            "name": f"Generated Audio: {prompt_text[:50]}...",
            "audio_file_storage_key": storage_key,
            "audio_file_format": "wav",
            "audio_file_size": len(audio_data),
            "audio_file_duration": generation_result.duration,  # Use actual duration from generated audio
            "audio_file_sample_rate": generation_result.sample_rate,
            "waveform_data": waveform_data,
            "user_id": user_id
        }
        
        # Create AudioTrack model directly
        audio_track = AudioTrack(**audio_track_data)
        
        # Save to database
        session.add(audio_track)
        await session.commit()
        await session.refresh(audio_track)
        
        # Convert to read model for the response
        created_track = AudioTrackRead.model_validate(audio_track)
        
        
        await sse_queue.stage(
            name="completing",
            description="Finalizing audio track..."
        )
        
        # Use mode='json' to ensure proper serialization of UUIDs and datetimes
        action = AssistantAction(
            action_type="add_audio_track",
            data=AudioTrackData(track_data=created_track.model_dump(mode='json'))
        )
        
        # Send the action
        await sse_queue.action(action)
        
        # Deduct credits using the correct method name with comprehensive metadata
        if user_credits_info and not user_credits_info.get("is_unlimited", False):
            await credits_service.use_credits(
                user_id=user_id,
                amount=get_operation_cost("audio_generation_fal"),
                description="Audio generation with FAL-AI",
                metadata={
                    "request_id": request_id,
                    "model": "fal-ai/lyria2",
                    "user_prompt": prompt_text,
                    "enhanced_prompt": enhanced_prompt,
                    "negative_prompt": negative_prompt,
                    "bpm": bpm,
                    "key_signature": key_signature,
                    "time_signature": time_signature,
                    "bars": bars,
                    "calculated_duration": generation_result.duration,
                    "generation_type": "audio"
                },
                # AI-specific parameters
                model_provider="fal-ai",
                model_name="lyria2",
                request_id=request_id,
                generation_type="audio",
                prompt_preview=prompt_text[:200] if prompt_text else None
            )
        
        # Send completion message
        response_text = f"Successfully generated audio: '{prompt_text}' ({generation_result.duration} seconds)"
        
        # Send completion
        final_response = AssistantResponse(response=response_text)
        await sse_queue.complete(final_response.model_dump())
        
        logger.info(f"Generate-audio request completed successfully: {request_id}")
        
    except Exception as e:
        logger.error(f"Error in generate-audio request {request_id}: {str(e)}")
        await sse_queue.error(
            message=f"Failed to generate audio: {str(e)}",
            error_data={"error": "generation_failed", "details": str(e)}
        )


# Ensure all endpoints in these routes are included in main.py