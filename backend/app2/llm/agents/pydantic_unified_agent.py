"""
Intelligent routing unified music agent.
Uses ChatSession for API key handling and LLM-driven routing instead of keywords.
"""

import asyncio
import json
import logging
import re
from typing import Dict, List, Optional, Any

from app2.llm.available_models import ModelInfo
from app2.sse.sse_queue_manager import SSEQueueManager
from app2.llm.chat_wrapper import ChatSession
from sqlmodel import Session


logger = logging.getLogger(__name__)


class PydanticUnifiedMusicAgent:
    """
    Intelligent routing unified music agent.
    Uses LLM-driven routing with ChatSession for reliable API key handling.
    """
    
    def __init__(self, model_info: ModelInfo, user_id: str, session: Session):
        self.model_info = model_info
        self.user_id = user_id
        self.session = session
        self.conversation_history: List[Dict[str, str]] = []

    async def process_message(self, 
                            user_message: str, 
                            sse_queue: SSEQueueManager,
                            track_context: Optional[List[Dict[str, Any]]] = None) -> None:
        """
        Process user message with intelligent LLM-based routing.
        """
        try:
            # Add user message to conversation history
            self.conversation_history.append({
                "role": "user",
                "content": user_message,
                "timestamp": asyncio.get_event_loop().time()
            })
            
            # Determine intent using LLM
            intent = await self._detect_user_intent(user_message, sse_queue, track_context)
            
            logger.info(f"Detected intent: {intent['action']} (confidence: {intent['confidence']:.2f}) - {intent['reasoning']}")
            
            # Route to appropriate handler
            if intent["action"] == "generate":
                await self._handle_full_beat_generation(user_message, intent, sse_queue)
            elif intent["action"] == "generate_audio":
                await self._handle_audio_generation_conversational(user_message, sse_queue)
            elif intent["action"] == "edit":
                await self._handle_music_editing(user_message, intent, sse_queue, track_context)
            else:  # chat
                await self._handle_chat(user_message, intent, sse_queue)
                
        except Exception as e:
            logger.error(f"Error in unified agent: {e}")
            await sse_queue.error(f"I encountered an error: {str(e)}")
            raise

    async def _detect_user_intent(self, 
                                 user_message: str, 
                                 sse_queue: SSEQueueManager,
                                 track_context: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """Use LLM to detect user intent and determine routing."""
        
        # Build context for intent detection
        context_info = {
            "conversation_history": self.conversation_history[-3:],
            "available_tracks": [track.get("name", track.get("id")) for track in (track_context or [])],
            "tracks_mentioned": self._extract_track_mentions(user_message, track_context)
        }
        
        intent_prompt = f"""Analyze this user message and determine what they want to do:

User message: "{user_message}"
Context: {json.dumps(context_info, indent=2)}

Determine the appropriate action:
- "generate": User wants to create a FULL BEAT/COMPOSITION (complete song with multiple instruments, drums, full arrangement)
- "generate_audio": User wants to create a SINGLE AUDIO TRACK/SAMPLE (one melody, one sound, one instrument recording)
- "edit": User wants to modify existing tracks that are mentioned in the context
- "chat": General conversation, questions, or requests that don't involve creating/editing music

Critical distinctions:
- "generate" = FULL BEAT/SONG (e.g., "make a trap beat", "create a jazz song", "compose a full track")
- "generate_audio" = SINGLE SAMPLE/MELODY (e.g., "generate a piano melody", "create a drum sample", "make a guitar riff")
- "edit" = ONLY when existing tracks are mentioned by name in the available_tracks context
- "chat" = Questions, advice, theory discussions, or unclear requests

Rules:
1. If tracks are mentioned by name in available_tracks → "edit"
2. If user wants a FULL BEAT/SONG/COMPOSITION → "generate" 
3. If user wants a SINGLE SAMPLE/MELODY/SOUND → "generate_audio"
4. If user asks questions, wants advice, or request is unclear → "chat"

Respond with valid JSON:
{{
    "action": "generate|generate_audio|edit|chat",
    "confidence": 0.0-1.0,
    "reasoning": "brief explanation of why this action was chosen",
    "generation_type": "midi|audio",
    "duration_bars": 4
}}"""
        
        # Create ChatSession for intent detection (this handles API keys properly!)
        intent_session = ChatSession(
            provider_name=self.model_info.provider_name,
            model_name=self.model_info.model_name,
            queue=sse_queue,
            system_prompt="You are an intent detection system. Analyze user messages and respond with JSON routing decisions.",
            api_key=self.model_info.get_api_key(),
            base_url=self.model_info.base_url
        )
        
        try:
            response = await intent_session.send_message_async(intent_prompt, stream=False)
            
            # Clean and parse JSON response
            clean_response = self._clean_json_response(response)
            return json.loads(clean_response)
            
        except (json.JSONDecodeError, Exception) as e:
            logger.warning(f"Failed to parse intent detection response: {e}")
            # Fallback to simple heuristics
            return self._fallback_intent_detection(user_message, track_context)

    def _extract_track_mentions(self, user_message: str, track_context: Optional[List[Dict[str, Any]]] = None) -> List[str]:
        """Extract track mentions from user message"""
        if not track_context:
            return []
            
        mentioned_tracks = []
        for track in track_context:
            track_name = track.get("name", "")
            if track_name and track_name.lower() in user_message.lower():
                mentioned_tracks.append(track_name)
                
        return mentioned_tracks

    def _clean_json_response(self, response: str) -> str:
        """Clean LLM response to extract JSON"""
        clean_response = response.strip()
        if clean_response.startswith('```json'):
            clean_response = clean_response[7:]
        if clean_response.endswith('```'):
            clean_response = clean_response[:-3]
        return clean_response.strip()

    def _fallback_intent_detection(self, user_message: str, track_context: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """Fallback intent detection using simple heuristics"""
        message_lower = user_message.lower()
        
        # Check for track mentions
        if track_context and any(track.get("name", "").lower() in message_lower for track in track_context):
            return {"action": "edit_music", "confidence": 0.8, "reasoning": "Track mentioned"}
            
        # Check for generation keywords
        if any(word in message_lower for word in ["create", "generate", "make", "compose", "beat", "song"]):
            generation_type = "audio" if "audio" in message_lower else "midi"
            return {"action": "generate_music", "confidence": 0.7, "reasoning": "Generation keywords", 
                   "generation_type": generation_type, "duration_bars": 4}
        
        # Check for analysis keywords
        if any(word in message_lower for word in ["analyze", "feedback", "what do you think"]):
            return {"action": "analyze_music", "confidence": 0.6, "reasoning": "Analysis keywords"}
            
        # Default to chat
        return {"action": "chat", "confidence": 0.5, "reasoning": "General conversation"}

    async def _handle_full_beat_generation(self, user_message: str, intent: Dict[str, Any], sse_queue: SSEQueueManager):
        """Handle full beat/composition generation - triggers step mode with accordions"""
        
        await sse_queue.add_chunk("I'll create a full beat composition for you! Let me get started with the generation process.")
        
        # Import here to avoid circular imports
        from app2.api.routes.assistant_streaming import process_generate_request
        from app2.sse.request_manager import RequestContext, RequestStatus
        
        # Create a proper RequestContext object for full beat generation
        request_id = f"unified_{asyncio.get_event_loop().time()}"
        
        mock_context = RequestContext(
            request_id=request_id,
            user_id=self.user_id,
            timestamp=asyncio.get_event_loop().time(),
            status=RequestStatus.PROCESSING,
            mode="generate",
            prompt=user_message,
            model=self.model_info.display_name,  # Use display_name, not provider:model format
            context={"generation_type": "midi"},  # Full beats are always MIDI compositions
            sse_queue=sse_queue
        )
        
        # Route to the existing handler that triggers step mode
        await process_generate_request(request_id, mock_context, sse_queue, self.session)

    async def _handle_music_editing(self, user_message: str, intent: Dict[str, Any], sse_queue: SSEQueueManager, track_context: Optional[List[Dict[str, Any]]] = None):
        """Handle music editing requests"""
        # Create conversational editing assistant using ChatSession
        edit_session = ChatSession(
            provider_name=self.model_info.provider_name,
            model_name=self.model_info.model_name,
            queue=sse_queue,
            system_prompt="You are a music editing assistant. Help users modify their existing tracks and compositions. Be conversational, ask specific questions about what they want to change, and guide them through the process.",
            api_key=self.model_info.get_api_key(),
            base_url=self.model_info.base_url
        )
        
        # Build context about available tracks
        track_info = ""
        if track_context:
            track_names = [track.get("name") for track in track_context if track.get("name")]
            if track_names:
                track_info = f" I can see you have these tracks available: {', '.join(track_names)}."
        
        edit_prompt = f"""The user wants to edit music: "{user_message}"{track_info}

Recent conversation:
{json.dumps(self.conversation_history[-3:], indent=2)}

Help them with their editing request. Ask specific questions about what they want to modify."""

        response = await edit_session.send_message_async(edit_prompt, stream=True)

    async def _handle_music_analysis(self, user_message: str, intent: Dict[str, Any], sse_queue: SSEQueueManager, track_context: Optional[List[Dict[str, Any]]] = None):
        """Handle music analysis requests"""
        analysis_session = ChatSession(
            provider_name=self.model_info.provider_name,
            model_name=self.model_info.model_name,
            queue=sse_queue,
            system_prompt="You are a music analysis expert. Provide detailed, educational analysis of musical content. Explain music theory concepts clearly, analyze chord progressions, melodies, rhythms, and song structures.",
            api_key=self.model_info.get_api_key(),
            base_url=self.model_info.base_url
        )
        
        analysis_prompt = f"""The user wants music analysis: "{user_message}"

Available tracks: {[track.get("name") for track in (track_context or [])]}

Previous conversation:
{json.dumps(self.conversation_history[-3:], indent=2)}

Provide detailed analysis and feedback. If you need more specific information about what to analyze, ask clarifying questions."""

        response = await analysis_session.send_message_async(analysis_prompt, stream=True)

    async def _handle_chat(self, user_message: str, intent: Dict[str, Any], sse_queue: SSEQueueManager):
        """Handle general chat about music"""
        chat_session = ChatSession(
            provider_name=self.model_info.provider_name,
            model_name=self.model_info.model_name,
            queue=sse_queue,
            system_prompt="You are a knowledgeable music assistant. Have helpful conversations about music theory, production, instruments, genres, and creativity. Be encouraging and educational.",
            api_key=self.model_info.get_api_key(),
            base_url=self.model_info.base_url
        )
        
        chat_prompt = f"""Continue the conversation naturally. The user said: "{user_message}"

Previous conversation:
{json.dumps(self.conversation_history[-3:], indent=2)}

Respond helpfully and conversationally about music. If they seem interested in creating or editing music, you can offer to help with that."""

        response = await chat_session.send_message_async(chat_prompt, stream=True)

    async def _handle_audio_generation_conversational(self, user_message: str, sse_queue: SSEQueueManager):
        """Handle audio generation with conversational approach (no step mode)"""
        # Create audio generation assistant using ChatSession
        audio_session = ChatSession(
            provider_name=self.model_info.provider_name,
            model_name=self.model_info.model_name,
            queue=sse_queue,
            system_prompt="You are an AI audio generation assistant. Help users create audio content by understanding their requirements and providing helpful guidance about audio generation.",
            api_key=self.model_info.get_api_key(),
            base_url=self.model_info.base_url
        )
        
        audio_prompt = f"""The user wants to generate audio: "{user_message}"

Previous conversation:
{json.dumps(self.conversation_history[-3:], indent=2)}

Help them with their audio generation request. Explain what kind of audio you would create based on their description and ask if they'd like you to proceed or if they want to adjust anything."""

        response = await audio_session.send_message_async(audio_prompt, stream=True)


# Factory function
def create_pydantic_unified_agent(model_info: ModelInfo, user_id: str, session: Session) -> PydanticUnifiedMusicAgent:
    """Create a new Pydantic AI-based unified music agent"""
    return PydanticUnifiedMusicAgent(model_info, user_id, session)