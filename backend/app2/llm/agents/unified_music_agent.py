"""
Unified Music Agent that handles conversations naturally without manual mode switching.
Automatically detects user intent and switches between chat, generate, edit, and analyze modes.
"""

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Any, Literal, Union
from enum import Enum

from app2.llm.chat_wrapper import ChatSession
from app2.llm.agents.music_agent import MusicGenerationAgent, MusicGenerationContext
from app2.llm.music_gen_service.llm_schemas import SongRequest
from app2.sse.sse_queue_manager import SSEQueueManager
from app2.models.assistant import AssistantAction
from app2.llm.available_models import ModelInfo
from sqlmodel import Session
from pydantic import BaseModel


logger = logging.getLogger(__name__)


class AgentMode(str, Enum):
    """Available agent modes"""
    CHAT = "chat"
    GENERATE = "generate" 
    EDIT = "edit"
    ANALYZE = "analyze"
    GENERATE_AUDIO = "generate-audio"


class UserIntent(BaseModel):
    """Parsed user intent from conversation"""
    mode: AgentMode
    confidence: float  # 0.0 to 1.0
    reasoning: str
    requires_clarification: bool = False
    clarification_questions: List[str] = None
    detected_tracks: List[str] = None  # Track IDs/names mentioned
    parameters: Dict[str, Any] = None
    
    def __init__(self, **data):
        if data.get('clarification_questions') is None:
            data['clarification_questions'] = []
        if data.get('detected_tracks') is None:
            data['detected_tracks'] = []
        if data.get('parameters') is None:
            data['parameters'] = {}
        super().__init__(**data)


@dataclass
class ConversationContext:
    """Maintains context across the conversation"""
    user_id: str
    conversation_history: List[Dict[str, str]] = None
    current_mode: AgentMode = AgentMode.CHAT
    pending_intent: Optional[UserIntent] = None
    active_tracks: List[str] = None  # Currently referenced tracks
    session_parameters: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.conversation_history is None:
            self.conversation_history = []
        if self.active_tracks is None:
            self.active_tracks = []
        if self.session_parameters is None:
            self.session_parameters = {}


class UnifiedMusicAgent:
    """
    Unified conversational music agent that automatically detects user intent
    and switches between different modes (chat, generate, edit, analyze).
    """
    
    def __init__(self, model_info: ModelInfo, user_id: str, session: Session):
        self.model_info = model_info
        self.user_id = user_id
        self.session = session
        self.context = ConversationContext(user_id=user_id)
        
        # Initialize chat session for conversational interactions
        # Note: We'll create chat sessions as needed with proper SSE queue
        
        # Keep reference to specialized agents
        self.music_generator = None  # Lazy initialization
        
    def _get_system_prompt(self) -> str:
        """Get system prompt for the unified agent"""
        return """You are a unified AI music assistant that can handle conversations naturally.

Your primary goal is to understand what the user wants to do and help them achieve it through natural conversation. You can:

1. CHAT: Have general conversations about music, answer questions, provide advice
2. GENERATE: Create new music compositions (MIDI or audio)
3. EDIT: Modify existing tracks or compositions  
4. ANALYZE: Analyze musical content, provide feedback, explain music theory

IMPORTANT RULES:
1. Always ask clarifying questions when the user's intent is unclear
2. If tracks are mentioned by name/ID, automatically consider edit mode
3. Be conversational and helpful - don't expose technical details
4. Don't make assumptions - ask questions to understand exactly what the user wants
5. When ready to take action, explain what you're about to do before doing it

Current conversation context will be provided with each message. Use this context to provide more personalized and relevant responses.

Remember: You are having a conversation, not executing commands. Be natural, helpful, and ask questions when needed."""

    async def process_message(self, 
                            user_message: str, 
                            sse_queue: SSEQueueManager,
                            track_context: Optional[List[Dict[str, Any]]] = None) -> None:
        """
        Main entry point for processing user messages.
        Automatically detects intent and responds appropriately.
        """
        try:
            # Add user message to conversation history
            self.context.conversation_history.append({
                "role": "user", 
                "content": user_message,
                "timestamp": asyncio.get_event_loop().time()
            })
            
            # Detect user intent from the message
            intent = await self._detect_user_intent(user_message, sse_queue, track_context)
            
            # Log detected intent
            logger.info(f"Detected intent: {intent.mode} (confidence: {intent.confidence:.2f}) - {intent.reasoning}")
            
            # Handle the detected intent
            if intent.requires_clarification:
                await self._handle_clarification_needed(intent, sse_queue)
            else:
                await self._handle_intent(intent, user_message, sse_queue, track_context)
                
        except Exception as e:
            logger.error(f"Error processing message: {e}")
            await sse_queue.error(f"Sorry, I encountered an error: {str(e)}")
            raise

    async def _detect_user_intent(self, 
                                user_message: str, 
                                sse_queue: SSEQueueManager,
                                track_context: Optional[List[Dict[str, Any]]] = None) -> UserIntent:
        """
        Analyze user message to detect intent using LLM.
        """
        # Check for track mentions first (automatic edit mode trigger)
        detected_tracks = self._extract_track_mentions(user_message, track_context)
        
        # Build context for intent detection
        context_info = {
            "conversation_history": self.context.conversation_history[-5:],  # Last 5 messages
            "current_mode": self.context.current_mode.value,
            "detected_tracks": detected_tracks,
            "available_tracks": [track.get("name", track.get("id")) for track in (track_context or [])],
            "session_parameters": self.context.session_parameters
        }
        
        intent_prompt = f"""Analyze this user message and determine their intent:

User message: "{user_message}"

Context: {json.dumps(context_info, indent=2)}

Determine:
1. What mode should handle this request? (chat, generate, edit, analyze, generate-audio)
2. How confident are you? (0.0 to 1.0)
3. What is your reasoning?
4. Do you need to ask clarifying questions?
5. What clarifying questions would help?
6. What parameters can you extract?

Rules:
- If tracks are mentioned by name/ID, lean towards "edit" mode
- If user wants to create new music, use "generate" or "generate-audio" 
- If user asks questions or wants to chat, use "chat" mode
- If user wants analysis/feedback, use "analyze" mode
- If intent is unclear, require clarification

Respond with valid JSON matching this schema:
{{
    "mode": "chat|generate|edit|analyze|generate-audio",
    "confidence": 0.0-1.0,
    "reasoning": "explanation of your analysis",
    "requires_clarification": boolean,
    "clarification_questions": ["question1", "question2"],
    "detected_tracks": ["track1", "track2"],
    "parameters": {{"key": "value"}}
}}"""

        try:
            # Create a temporary chat session for intent detection
            chat_session = ChatSession(
                provider_name=self.model_info.provider_name,
                model_name=self.model_info.model_name,
                queue=sse_queue,  # Use the provided SSE queue
                system_prompt="You are an AI assistant that analyzes user messages to detect intent. ALWAYS respond with valid JSON matching the requested schema.",
                api_key=self.model_info.get_api_key(),
                base_url=self.model_info.base_url
            )
            
            response = await chat_session.send_message_async(intent_prompt)
            
            # Clean up the response - sometimes LLMs add markdown formatting
            clean_response = response.strip()
            if clean_response.startswith('```json'):
                clean_response = clean_response[7:]
            if clean_response.endswith('```'):
                clean_response = clean_response[:-3]
            clean_response = clean_response.strip()
            
            # Parse JSON response
            intent_data = json.loads(clean_response)
            
            return UserIntent(
                mode=AgentMode(intent_data["mode"]),
                confidence=intent_data["confidence"],
                reasoning=intent_data["reasoning"],
                requires_clarification=intent_data.get("requires_clarification", False),
                clarification_questions=intent_data.get("clarification_questions", []),
                detected_tracks=intent_data.get("detected_tracks", detected_tracks),
                parameters=intent_data.get("parameters", {})
            )
            
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.warning(f"Failed to parse intent detection response: {e}")
            # Fallback to simple heuristics
            return self._fallback_intent_detection(user_message, detected_tracks)

    def _extract_track_mentions(self, 
                               user_message: str, 
                               track_context: Optional[List[Dict[str, Any]]] = None) -> List[str]:
        """
        Extract track mentions from user message using pattern matching.
        """
        if not track_context:
            return []
            
        mentioned_tracks = []
        track_names = [track.get("name", "") for track in track_context if track.get("name")]
        track_ids = [track.get("id", "") for track in track_context if track.get("id")]
        
        # Look for track names in the message (case insensitive)
        for track_name in track_names:
            if track_name and track_name.lower() in user_message.lower():
                mentioned_tracks.append(track_name)
                
        # Look for track IDs (UUID pattern)
        uuid_pattern = r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
        found_uuids = re.findall(uuid_pattern, user_message)
        for uuid in found_uuids:
            if uuid in track_ids:
                mentioned_tracks.append(uuid)
                
        return mentioned_tracks

    def _fallback_intent_detection(self, user_message: str, detected_tracks: List[str]) -> UserIntent:
        """
        Fallback intent detection using simple heuristics when LLM parsing fails.
        """
        message_lower = user_message.lower()
        
        # If tracks are mentioned, assume edit mode
        if detected_tracks:
            return UserIntent(
                mode=AgentMode.EDIT,
                confidence=0.8,
                reasoning="Tracks mentioned in message",
                detected_tracks=detected_tracks
            )
            
        # Look for generation keywords
        generate_keywords = ["create", "generate", "make", "compose", "write", "new song", "new track"]
        if any(keyword in message_lower for keyword in generate_keywords):
            # Check if they want audio generation
            if "audio" in message_lower or "wav" in message_lower or "mp3" in message_lower:
                return UserIntent(
                    mode=AgentMode.GENERATE_AUDIO,
                    confidence=0.7,
                    reasoning="Generation keywords + audio format mentioned"
                )
            else:
                return UserIntent(
                    mode=AgentMode.GENERATE,
                    confidence=0.7,
                    reasoning="Generation keywords detected"
                )
        
        # Look for analysis keywords  
        analyze_keywords = ["analyze", "feedback", "what do you think", "review", "explain"]
        if any(keyword in message_lower for keyword in analyze_keywords):
            return UserIntent(
                mode=AgentMode.ANALYZE,
                confidence=0.6,
                reasoning="Analysis keywords detected"
            )
            
        # Default to chat mode
        return UserIntent(
            mode=AgentMode.CHAT,
            confidence=0.5,
            reasoning="No specific intent detected, defaulting to chat",
            requires_clarification=True,
            clarification_questions=["What would you like me to help you with today?"]
        )

    async def _handle_clarification_needed(self, intent: UserIntent, sse_queue: SSEQueueManager) -> None:
        """
        Handle cases where clarification is needed from the user.
        """
        clarification_message = f"I want to make sure I understand what you're looking for. "
        
        if intent.clarification_questions:
            clarification_message += " ".join(intent.clarification_questions)
        else:
            clarification_message += "Could you provide more details about what you'd like me to help you with?"
            
        # Add reasoning if helpful
        if intent.reasoning and intent.confidence < 0.7:
            clarification_message += f"\n\n(I think you might want to {intent.mode.value}, but I want to be sure.)"
            
        await sse_queue.add_chunk(clarification_message)
        await sse_queue.complete({"response": clarification_message})
        
        # Store pending intent for next message
        self.context.pending_intent = intent

    async def _handle_intent(self, 
                           intent: UserIntent, 
                           user_message: str,
                           sse_queue: SSEQueueManager,
                           track_context: Optional[List[Dict[str, Any]]] = None) -> None:
        """
        Handle the detected intent by routing to appropriate agent/mode.
        """
        # Update current mode
        old_mode = self.context.current_mode
        self.context.current_mode = intent.mode
        
        # Log mode change
        if old_mode != intent.mode:
            logger.info(f"Mode changed: {old_mode.value} -> {intent.mode.value}")
            
        try:
            if intent.mode == AgentMode.CHAT:
                await self._handle_chat_mode(user_message, sse_queue)
            elif intent.mode == AgentMode.GENERATE:
                await self._handle_generate_mode(user_message, intent, sse_queue)
            elif intent.mode == AgentMode.GENERATE_AUDIO:
                await self._handle_generate_audio_mode(user_message, intent, sse_queue)
            elif intent.mode == AgentMode.EDIT:
                await self._handle_edit_mode(user_message, intent, sse_queue, track_context)
            elif intent.mode == AgentMode.ANALYZE:
                await self._handle_analyze_mode(user_message, intent, sse_queue, track_context)
            else:
                raise ValueError(f"Unknown mode: {intent.mode}")
                
        except Exception as e:
            logger.error(f"Error handling intent {intent.mode}: {e}")
            await sse_queue.error(f"I encountered an error while {intent.mode.value}ing. Could you try rephrasing your request?")
            raise

    async def _handle_chat_mode(self, user_message: str, sse_queue: SSEQueueManager) -> None:
        """
        Handle general chat/conversation mode.
        """
        # Create chat session for conversation
        chat_session = ChatSession(
            provider_name=self.model_info.provider_name,
            model_name=self.model_info.model_name,
            queue=sse_queue,
            system_prompt=self._get_system_prompt(),
            api_key=self.model_info.get_api_key(),
            base_url=self.model_info.base_url
        )
        
        # Update system prompt for chat context
        chat_prompt = f"""Continue the conversation naturally. The user said: "{user_message}"

Previous conversation context:
{json.dumps(self.context.conversation_history[-3:], indent=2)}

Respond helpfully and conversationally. If the user seems to want to do something specific with music (create, edit, analyze), gently guide them or ask if they'd like help with that."""

        response = await chat_session.send_message_async(chat_prompt)
        
        # Stream the response
        await sse_queue.add_chunk(response)
        await sse_queue.complete({"response": response})
        
        # Add to conversation history
        self.context.conversation_history.append({
            "role": "assistant", 
            "content": response,
            "timestamp": asyncio.get_event_loop().time()
        })

    async def _handle_generate_mode(self, 
                                  user_message: str, 
                                  intent: UserIntent,
                                  sse_queue: SSEQueueManager) -> None:
        """
        Handle music generation mode.
        """
        # Initialize music generator if needed
        if not self.music_generator:
            self.music_generator = MusicGenerationAgent()
            
        # Extract duration from parameters or use default
        duration_bars = intent.parameters.get("duration_bars", 4)
        
        # Create song request
        song_request = SongRequest(
            user_prompt=user_message,
            duration_bars=duration_bars
        )
        
        # Let user know what we're doing
        await sse_queue.add_chunk(f"I'll create a new MIDI composition based on your request. Let me get started!")
        
        # Create music generation context
        music_context = MusicGenerationContext(
            user_prompt=user_message,
            duration_bars=duration_bars,
            model_info=self.model_info,
            queue=sse_queue,
            session=self.session,
            user_id=self.user_id
        )
        
        # Run music generation
        await self.music_generator.run(
            request_id=f"unified_{asyncio.get_event_loop().time()}",
            request=song_request,
            model_info=self.model_info,
            queue=sse_queue,
            db_session=self.session,
            user_id=self.user_id,
            generation_type="midi"
        )

    async def _handle_generate_audio_mode(self, 
                                        user_message: str, 
                                        intent: UserIntent,
                                        sse_queue: SSEQueueManager) -> None:
        """
        Handle audio generation mode.
        """
        # Similar to generate mode but with audio generation
        if not self.music_generator:
            self.music_generator = MusicGenerationAgent()
            
        duration_bars = intent.parameters.get("duration_bars", 4)
        
        await sse_queue.add_chunk(f"I'll create a new audio composition using AI audio generation. This might take a moment!")
        
        song_request = SongRequest(
            user_prompt=user_message,
            duration_bars=duration_bars
        )
        
        await self.music_generator.run(
            request_id=f"unified_audio_{asyncio.get_event_loop().time()}",
            request=song_request,
            model_info=self.model_info,
            queue=sse_queue,
            db_session=self.session,
            user_id=self.user_id,
            generation_type="audio"
        )

    async def _handle_edit_mode(self, 
                              user_message: str, 
                              intent: UserIntent,
                              sse_queue: SSEQueueManager,
                              track_context: Optional[List[Dict[str, Any]]] = None) -> None:
        """
        Handle track editing mode.
        """
        # For now, provide a conversational response about editing
        # This would be expanded to actual editing functionality
        
        track_info = ""
        if intent.detected_tracks:
            track_info = f" I can see you're referring to: {', '.join(intent.detected_tracks)}."
            
        response = f"""I understand you want to edit some tracks.{track_info}

I'm currently working on implementing full editing capabilities, but I can help you think through what changes you'd like to make. 

What specific aspects would you like to modify? For example:
- Change the melody or harmony
- Adjust the rhythm or tempo  
- Modify instruments or sounds
- Add or remove sections

Let me know what you have in mind and I can guide you through the process!"""

        await sse_queue.add_chunk(response)
        await sse_queue.complete({"response": response})

    async def _handle_analyze_mode(self, 
                                 user_message: str, 
                                 intent: UserIntent,
                                 sse_queue: SSEQueueManager,
                                 track_context: Optional[List[Dict[str, Any]]] = None) -> None:
        """
        Handle music analysis mode.
        """
        response = f"""I'd be happy to analyze music for you! 

Based on your message, it seems like you want me to {intent.reasoning.lower()}.

To provide the best analysis, could you:
- Share the specific track or musical content you'd like me to analyze
- Let me know what aspects you're most interested in (harmony, melody, rhythm, structure, etc.)
- Tell me what kind of feedback would be most helpful

I can provide insights on music theory, composition techniques, arrangement choices, and suggest improvements or variations."""

        await sse_queue.add_chunk(response)
        await sse_queue.complete({"response": response})


# Factory function for creating unified agents
def create_unified_music_agent(model_info: ModelInfo, user_id: str, session: Session) -> UnifiedMusicAgent:
    """
    Factory function to create a new unified music agent instance.
    """
    return UnifiedMusicAgent(model_info, user_id, session)