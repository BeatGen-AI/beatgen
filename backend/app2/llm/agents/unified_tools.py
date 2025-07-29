"""
Pydantic AI toolsets for the unified music agent.
These toolsets replace keyword-based routing with LLM-driven tool selection.
"""

import asyncio
import json
import logging
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
from pydantic_ai import RunContext
from pydantic_ai.toolsets import FunctionToolset, CombinedToolset

from app2.llm.agents.music_agent import MusicGenerationAgent
from app2.llm.music_gen_service.llm_schemas import SongRequest
from app2.llm.chat_wrapper import ChatSession
from app2.sse.sse_queue_manager import SSEQueueManager
from app2.llm.available_models import ModelInfo
from sqlmodel import Session


logger = logging.getLogger(__name__)


class GenerateParams(BaseModel):
    """Parameters for music generation"""
    user_prompt: str = Field(..., description="The user's request for music generation")
    duration_bars: int = Field(default=4, description="Duration in bars for the composition")
    generation_type: str = Field(default="midi", description="Type of generation: 'midi' or 'audio'")


class EditParams(BaseModel):
    """Parameters for track editing"""
    user_prompt: str = Field(..., description="The user's editing request")
    track_names: List[str] = Field(default_factory=list, description="Names of tracks being referenced")


class ChatParams(BaseModel):
    """Parameters for chat interactions"""
    user_message: str = Field(..., description="The user's chat message")
    context: str = Field(default="", description="Additional conversation context")


class AnalyzeParams(BaseModel):
    """Parameters for music analysis"""
    user_prompt: str = Field(..., description="The user's analysis request")
    track_context: Optional[str] = Field(None, description="Context about tracks to analyze")


class UnifiedToolContext:
    """Context passed to all unified tools"""
    def __init__(self, model_info: ModelInfo, user_id: str, session: Session, sse_queue: SSEQueueManager):
        self.model_info = model_info
        self.user_id = user_id
        self.session = session
        self.sse_queue = sse_queue
        self.conversation_history: List[Dict[str, Any]] = []
        
        # Lazy initialization of specialized agents
        self._music_generator = None

    @property
    def music_generator(self) -> MusicGenerationAgent:
        """Lazy initialization of music generator"""
        if self._music_generator is None:
            self._music_generator = MusicGenerationAgent()
        return self._music_generator


async def generate_music_tool(ctx: RunContext[UnifiedToolContext], params: GenerateParams) -> str:
    """
    Generate new MIDI or audio music compositions.
    
    Use this tool when the user wants to create new music, beats, songs, or compositions.
    This handles both MIDI generation and AI audio generation.
    """
    try:
        logger.info(f"Music generation requested: {params.user_prompt}")
        
        # Get dependencies from context
        deps = ctx.deps
        
        # Create song request
        song_request = SongRequest(
            user_prompt=params.user_prompt,
            duration_bars=params.duration_bars
        )
        
        # Provide user feedback
        generation_type_msg = "audio" if params.generation_type == "audio" else "MIDI"
        await deps.sse_queue.add_chunk(f"🎵 Creating a new {generation_type_msg} composition based on your request...")
        
        # Run music generation with proper parameters
        await deps.music_generator.run(
            request_id=f"unified_gen_{asyncio.get_event_loop().time()}",
            request=song_request,
            model_info=deps.model_info,
            queue=deps.sse_queue,
            db_session=deps.session,
            user_id=deps.user_id,
            generation_type=params.generation_type
        )
        
        return f"Music generation completed for: {params.user_prompt}"
        
    except Exception as e:
        error_msg = f"Error during music generation: {str(e)}"
        logger.error(error_msg)
        await deps.sse_queue.error(error_msg)
        raise


async def edit_music_tool(ctx: RunContext[UnifiedToolContext], params: EditParams) -> str:
    """
    Edit or modify existing music tracks and compositions.
    
    Use this tool when the user wants to modify, change, or edit existing tracks.
    This is automatically triggered when track names are mentioned.
    """
    try:
        logger.info(f"Music editing requested: {params.user_prompt}")
        
        # Get dependencies from context
        deps = ctx.deps
        
        # Build track context message
        track_info = ""
        if params.track_names:
            track_info = f" I can see you're referring to: {', '.join(params.track_names)}."
        
        # Create conversational editing assistant
        edit_session = ChatSession(
            provider_name=deps.model_info.provider_name,
            model_name=deps.model_info.model_name,
            queue=deps.sse_queue,
            system_prompt="""You are a music editing assistant. Help users modify their existing tracks and compositions. 
            Be conversational, ask specific questions about what they want to change, and guide them through the process.
            Focus on understanding exactly what modifications they want to make.""",
            api_key=deps.model_info.get_api_key(),
            base_url=deps.model_info.base_url
        )
        
        # Create contextual prompt
        edit_prompt = f"""The user wants to edit music: "{params.user_prompt}"{track_info}

Recent conversation context:
{json.dumps(deps.conversation_history[-3:], indent=2)}

Help them with their editing request. Ask specific questions about what they want to modify and guide them through the process."""
        
        # Stream the response
        response = await edit_session.send_message_async(edit_prompt)
        await deps.sse_queue.add_chunk(response)
        await deps.sse_queue.complete({"response": response})
        
        return f"Edit assistance provided for: {params.user_prompt}"
        
    except Exception as e:
        error_msg = f"Error during music editing: {str(e)}"
        logger.error(error_msg)
        await deps.sse_queue.error(error_msg)
        raise


async def chat_tool(ctx: RunContext[UnifiedToolContext], params: ChatParams) -> str:
    """
    Handle general conversations about music, answer questions, and provide advice.
    
    Use this tool for general music discussions, questions about music theory,
    recommendations, or when the user's intent is unclear.
    """
    try:
        logger.info(f"Chat interaction requested: {params.user_message}")
        
        # Get dependencies from context
        deps = ctx.deps
        
        # Create chat session
        chat_session = ChatSession(
            provider_name=deps.model_info.provider_name,
            model_name=deps.model_info.model_name,
            queue=deps.sse_queue,
            system_prompt="""You are a knowledgeable music assistant. Have helpful conversations about music theory, 
            production, instruments, genres, and creativity. Be encouraging and educational. If the user seems 
            interested in creating or editing music, you can offer to help with that.""",
            api_key=deps.model_info.get_api_key(),
            base_url=deps.model_info.base_url
        )
        
        # Build contextual prompt
        chat_prompt = f"""Continue the conversation naturally. The user said: "{params.user_message}"

{params.context}

Previous conversation context:
{json.dumps(deps.conversation_history[-3:], indent=2)}

Respond helpfully and conversationally about music. If they seem to want to do something specific with music 
(create, edit, analyze), gently guide them or ask if they'd like help with that."""
        
        # Stream the response
        response = await chat_session.send_message_async(chat_prompt)
        await deps.sse_queue.add_chunk(response)
        await deps.sse_queue.complete({"response": response})
        
        # Add to conversation history
        deps.conversation_history.append({
            "role": "user",
            "content": params.user_message,
            "timestamp": asyncio.get_event_loop().time()
        })
        deps.conversation_history.append({
            "role": "assistant", 
            "content": response,
            "timestamp": asyncio.get_event_loop().time()
        })
        
        return f"Chat response provided for: {params.user_message}"
        
    except Exception as e:
        error_msg = f"Error during chat: {str(e)}"
        logger.error(error_msg)
        await deps.sse_queue.error(error_msg)
        raise


async def analyze_music_tool(ctx: RunContext[UnifiedToolContext], params: AnalyzeParams) -> str:
    """
    Analyze musical content, provide feedback, and explain music theory concepts.
    
    Use this tool when the user wants analysis, feedback, or explanations about music,
    chord progressions, melodies, or music theory concepts.
    """
    try:
        logger.info(f"Music analysis requested: {params.user_prompt}")
        
        # Get dependencies from context
        deps = ctx.deps
        
        # Create analysis session
        analysis_session = ChatSession(
            provider_name=deps.model_info.provider_name,
            model_name=deps.model_info.model_name,
            queue=deps.sse_queue,
            system_prompt="""You are a music analysis expert. Provide detailed, educational analysis of musical content.
            Explain music theory concepts clearly, analyze chord progressions, melodies, rhythms, and song structures.
            Be thorough but accessible in your explanations.""",
            api_key=deps.model_info.get_api_key(),
            base_url=deps.model_info.base_url
        )
        
        # Build analysis prompt
        analysis_prompt = f"""The user wants music analysis: "{params.user_prompt}"

Track context: {params.track_context or "No specific tracks mentioned"}

Previous conversation context:
{json.dumps(deps.conversation_history[-3:], indent=2)}

Provide detailed analysis and feedback. If you need more specific information about what to analyze, 
ask clarifying questions to give the most helpful response."""
        
        # Stream the response
        response = await analysis_session.send_message_async(analysis_prompt)
        await deps.sse_queue.add_chunk(response)
        await deps.sse_queue.complete({"response": response})
        
        return f"Analysis provided for: {params.user_prompt}"
        
    except Exception as e:
        error_msg = f"Error during music analysis: {str(e)}"
        logger.error(error_msg)
        await deps.sse_queue.error(error_msg)
        raise


# Create toolsets for different domains
def create_music_generation_toolset() -> FunctionToolset:
    """Toolset for music generation capabilities"""
    return FunctionToolset(tools=[
        generate_music_tool
    ])


def create_music_editing_toolset() -> FunctionToolset:
    """Toolset for music editing capabilities"""
    return FunctionToolset(tools=[
        edit_music_tool
    ])


def create_chat_toolset() -> FunctionToolset:
    """Toolset for general conversation capabilities"""
    return FunctionToolset(tools=[
        chat_tool
    ])


def create_analysis_toolset() -> FunctionToolset:
    """Toolset for music analysis capabilities"""
    return FunctionToolset(tools=[
        analyze_music_tool
    ])


def create_unified_toolset() -> CombinedToolset:
    """Combined toolset with all unified agent capabilities"""
    return CombinedToolset([
        create_music_generation_toolset(),
        create_music_editing_toolset(), 
        create_chat_toolset(),
        create_analysis_toolset()
    ])


# Tool function registry for easy access
UNIFIED_TOOLS = {
    "generate_music": generate_music_tool,
    "edit_music": edit_music_tool, 
    "chat": chat_tool,
    "analyze_music": analyze_music_tool
}