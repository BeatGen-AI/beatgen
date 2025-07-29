"""
Lightweight routing agent that determines if messages should be routed to music generation
or handled as chat, using streaming LLM calls.
"""

import asyncio
import json
import logging
from typing import Dict, List, Optional, Any, AsyncGenerator, Union
from enum import Enum

from app2.llm.chat_wrapper import ChatSession
from app2.llm.streaming import AnyStreamEvent, TextDeltaEvent, StreamEndEvent
from app2.llm.agents.music_agent import MusicGenerationAgent
from app2.sse.sse_queue_manager import SSEQueueManager
from app2.llm.available_models import ModelInfo
from app2.llm.music_gen_service.llm_schemas import SongRequest
from sqlmodel import Session


logger = logging.getLogger(__name__)


class RouteDestination(str, Enum):
    """Available routing destinations"""
    CHAT = "chat"
    GENERATE = "generate" 
    GENERATE_AUDIO = "generate-audio"
    EDIT = "edit"


class RoutingDecision:
    """Represents a routing decision"""
    def __init__(self, destination: RouteDestination, confidence: float, reasoning: str, parameters: Dict[str, Any] = None):
        self.destination = destination
        self.confidence = confidence
        self.reasoning = reasoning
        self.parameters = parameters or {}


class LightweightRoutingAgent:
    """
    Lightweight agent that routes messages to appropriate handlers using streaming LLM calls.
    
    This agent:
    1. Analyzes user messages to determine routing destination
    2. Routes to music generation for beats/songs or handles as chat
    3. Streams all responses in real-time
    4. Uses no hardcoded responses
    """
    
    def __init__(self, model_info: ModelInfo, user_id: str, session: Session):
        self.model_info = model_info
        self.user_id = user_id
        self.session = session
        self.conversation_history: List[Dict[str, str]] = []
        
        # Lazy initialization of specialized agents
        self.music_generator = None
        
    async def process_message(self, 
                            user_message: str, 
                            sse_queue: SSEQueueManager,
                            track_context: Optional[List[Dict[str, Any]]] = None) -> None:
        """
        Process user message with lightweight routing and streaming responses.
        """
        try:
            # Add user message to history
            self.conversation_history.append({
                "role": "user",
                "content": user_message,
                "timestamp": asyncio.get_event_loop().time()
            })
            
            # Determine routing destination
            routing_decision = await self._determine_routing(user_message, sse_queue, track_context)
            
            logger.info(f"Routing decision: {routing_decision.destination} (confidence: {routing_decision.confidence:.2f}) - {routing_decision.reasoning}")
            
            # Route to appropriate handler
            if routing_decision.destination == RouteDestination.GENERATE:
                await self._route_to_music_generation(user_message, routing_decision, sse_queue, "midi")
            elif routing_decision.destination == RouteDestination.GENERATE_AUDIO:
                await self._route_to_music_generation(user_message, routing_decision, sse_queue, "audio")
            elif routing_decision.destination == RouteDestination.EDIT:
                await self._route_to_edit(user_message, routing_decision, sse_queue, track_context)
            else:  # CHAT
                await self._route_to_chat(user_message, routing_decision, sse_queue)
                
        except Exception as e:
            logger.error(f"Error in routing agent: {e}")
            await sse_queue.error(f"I encountered an error: {str(e)}")
            raise

    async def _determine_routing(self, 
                               user_message: str, 
                               sse_queue: SSEQueueManager,
                               track_context: Optional[List[Dict[str, Any]]] = None) -> RoutingDecision:
        """
        Use streaming LLM to determine where to route the message.
        """
        # Build context for routing decision
        context_info = {
            "recent_conversation": self.conversation_history[-3:],  # Last 3 messages
            "available_tracks": [track.get("name", track.get("id")) for track in (track_context or [])],
            "tracks_mentioned": self._extract_track_mentions(user_message, track_context)
        }
        
        routing_prompt = f"""You are a music assistant routing system. Analyze this user message and determine where to route it.

User message: "{user_message}"
Context: {json.dumps(context_info, indent=2)}

Routing options:
- "generate": User wants to create a new MIDI beat/song
- "generate-audio": User wants to create audio content 
- "edit": User wants to modify existing tracks
- "chat": General conversation about music

Rules:
1. If tracks are mentioned by name, route to "edit"
2. If user wants to create beats/songs/music, route to "generate" 
3. If user specifically mentions "audio" creation, route to "generate-audio"
4. Otherwise route to "chat"

Respond with ONLY a JSON object:
{{
    "destination": "generate|generate-audio|edit|chat",
    "confidence": 0.0-1.0,
    "reasoning": "brief explanation",
    "parameters": {{"duration_bars": 4}}
}}"""

        # Create streaming chat session for routing decision
        routing_session = ChatSession(
            provider_name=self.model_info.provider_name,
            model_name=self.model_info.model_name,
            queue=sse_queue,
            system_prompt="You are a routing system that analyzes messages and returns JSON routing decisions.",
            api_key=self.model_info.get_api_key(),
            base_url=self.model_info.base_url
        )
        
        try:
            # Use non-streaming for routing decision to get clean JSON
            response = await routing_session.send_message_async(routing_prompt, stream=False)
            
            # Clean and parse JSON
            clean_response = self._clean_json_response(response)
            routing_data = json.loads(clean_response)
            
            return RoutingDecision(
                destination=RouteDestination(routing_data["destination"]),
                confidence=routing_data["confidence"],
                reasoning=routing_data["reasoning"],
                parameters=routing_data.get("parameters", {})
            )
            
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.warning(f"Failed to parse routing response: {e}")
            # Fallback to simple heuristics
            return self._fallback_routing(user_message, track_context)

    def _extract_track_mentions(self, 
                               user_message: str, 
                               track_context: Optional[List[Dict[str, Any]]] = None) -> List[str]:
        """Extract track mentions from user message."""
        if not track_context:
            return []
            
        mentioned_tracks = []
        for track in track_context:
            track_name = track.get("name", "")
            if track_name and track_name.lower() in user_message.lower():
                mentioned_tracks.append(track_name)
                
        return mentioned_tracks

    def _clean_json_response(self, response: str) -> str:
        """Clean LLM response to extract JSON."""
        clean_response = response.strip()
        if clean_response.startswith('```json'):
            clean_response = clean_response[7:]
        if clean_response.endswith('```'):
            clean_response = clean_response[:-3]
        return clean_response.strip()

    def _fallback_routing(self, user_message: str, track_context: Optional[List[Dict[str, Any]]] = None) -> RoutingDecision:
        """Fallback routing using simple heuristics."""
        message_lower = user_message.lower()
        
        # Check for track mentions
        if track_context and any(track.get("name", "").lower() in message_lower for track in track_context):
            return RoutingDecision(RouteDestination.EDIT, 0.8, "Track mentioned in message")
            
        # Check for generation keywords
        generation_keywords = ["create", "generate", "make", "compose", "beat", "song", "track"]
        if any(keyword in message_lower for keyword in generation_keywords):
            if "audio" in message_lower:
                return RoutingDecision(RouteDestination.GENERATE_AUDIO, 0.7, "Audio generation keywords")
            else:
                return RoutingDecision(RouteDestination.GENERATE, 0.7, "Generation keywords detected")
        
        # Default to chat
        return RoutingDecision(RouteDestination.CHAT, 0.6, "No specific routing detected")

    async def _route_to_music_generation(self, 
                                       user_message: str, 
                                       routing_decision: RoutingDecision,
                                       sse_queue: SSEQueueManager,
                                       generation_type: str) -> None:
        """Route to music generation with streaming progress."""
        # Initialize music generator if needed
        if not self.music_generator:
            self.music_generator = MusicGenerationAgent()
            
        # Extract duration from parameters
        duration_bars = routing_decision.parameters.get("duration_bars", 4)
        
        # Create song request
        song_request = SongRequest(
            user_prompt=user_message,
            duration_bars=duration_bars
        )
        
        # Stream initial response
        initial_message = f"I'll create a new {'audio' if generation_type == 'audio' else 'MIDI'} composition for you. Let me get started!"
        await sse_queue.add_chunk(initial_message)
        
        # Route to music generator
        await self.music_generator.run(
            request_id=f"routing_{asyncio.get_event_loop().time()}",
            request=song_request,
            model_info=self.model_info,
            queue=sse_queue,
            db_session=self.session,
            user_id=self.user_id,
            generation_type=generation_type
        )

    async def _route_to_edit(self, 
                           user_message: str, 
                           routing_decision: RoutingDecision,
                           sse_queue: SSEQueueManager,
                           track_context: Optional[List[Dict[str, Any]]] = None) -> None:
        """Route to edit mode with streaming response."""
        # Create streaming chat session for edit conversation
        edit_session = ChatSession(
            provider_name=self.model_info.provider_name,
            model_name=self.model_info.model_name,
            queue=sse_queue,
            system_prompt="You are a music editing assistant. Help users modify their existing tracks and compositions. Be conversational and ask specific questions about what they want to change.",
            api_key=self.model_info.get_api_key(),
            base_url=self.model_info.base_url
        )
        
        # Build edit context
        track_info = ""
        if track_context:
            track_names = [track.get("name") for track in track_context if track.get("name")]
            if track_names:
                track_info = f" I can see you have these tracks available: {', '.join(track_names)}."
        
        edit_prompt = f"""The user wants to edit music: "{user_message}"{track_info}

Previous conversation context:
{json.dumps(self.conversation_history[-3:], indent=2)}

Help them with their editing request. Ask specific questions about what they want to modify and guide them through the process."""

        # Stream response
        await self._stream_chat_response(edit_session, edit_prompt, sse_queue)

    async def _route_to_chat(self, 
                           user_message: str, 
                           routing_decision: RoutingDecision,
                           sse_queue: SSEQueueManager) -> None:
        """Route to general chat with streaming response."""
        # Create streaming chat session
        chat_session = ChatSession(
            provider_name=self.model_info.provider_name,
            model_name=self.model_info.model_name,
            queue=sse_queue,
            system_prompt="You are a knowledgeable music assistant. Have helpful conversations about music theory, production, instruments, genres, and creativity. Be encouraging and educational.",
            api_key=self.model_info.get_api_key(),
            base_url=self.model_info.base_url
        )
        
        # Build chat context
        chat_prompt = f"""Continue the conversation naturally. The user said: "{user_message}"

Previous conversation context:
{json.dumps(self.conversation_history[-3:], indent=2)}

Respond helpfully and conversationally about music. If they seem interested in creating or editing music, you can offer to help with that."""

        # Stream response
        await self._stream_chat_response(chat_session, chat_prompt, sse_queue)

    async def _stream_chat_response(self, 
                                  chat_session: ChatSession, 
                                  prompt: str, 
                                  sse_queue: SSEQueueManager) -> None:
        """Stream chat response with real-time token streaming."""
        full_response = ""
        
        try:
            # Get streaming response
            stream_generator = await chat_session.send_message_async(prompt, stream=True)
            
            async for event in stream_generator:
                if isinstance(event, TextDeltaEvent):
                    # Stream each token as received
                    await sse_queue.add_chunk(event.content)
                    full_response += event.content
                elif isinstance(event, StreamEndEvent):
                    # Complete the stream
                    await sse_queue.complete({"response": full_response})
                    break
                    
            # Add to conversation history
            self.conversation_history.append({
                "role": "assistant",
                "content": full_response,
                "timestamp": asyncio.get_event_loop().time()
            })
            
        except Exception as e:
            logger.error(f"Error streaming chat response: {e}")
            await sse_queue.error(f"I encountered an error while responding: {str(e)}")
            raise


# Factory function
def create_routing_agent(model_info: ModelInfo, user_id: str, session: Session) -> LightweightRoutingAgent:
    """Create a new routing agent instance."""
    return LightweightRoutingAgent(model_info, user_id, session)