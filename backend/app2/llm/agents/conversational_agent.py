"""
Simple conversational agent for music-related chat.
Uses ChatSession with streaming for natural conversations.
"""

import logging
from typing import Dict, List, Optional, Any

from app2.llm.chat_wrapper import ChatSession
from app2.llm.streaming import TextDeltaEvent, StreamEndEvent
from app2.sse.sse_queue_manager import SSEQueueManager
from app2.llm.available_models import ModelInfo
from sqlmodel import Session


logger = logging.getLogger(__name__)


class ConversationalMusicAgent:
    """
    Simple conversational agent that feels like talking to an AI with music generation tools.
    Uses ChatSession with streaming and tool calling capabilities.
    """
    
    def __init__(self, model_info: ModelInfo, user_id: str, session: Session):
        self.model_info = model_info
        self.user_id = user_id
        self.session = session
        
        # System prompt for conversational chat
        self.system_prompt = """You are a helpful music assistant for conversational questions.

You can discuss music theory, production techniques, composition advice, and general music topics.

Guidelines:
- Be conversational and helpful
- Provide informative responses about music
- Ask clarifying questions when needed
- Be encouraging and supportive"""

        
    async def process_message(self, 
                            user_message: str, 
                            sse_queue: SSEQueueManager,
                            track_context: Optional[List[Dict[str, Any]]] = None) -> None:
        """
        Process user message using ChatSession with streaming and tool support.
        """
        try:
            # Create streaming chat session with tool support
            chat_session = ChatSession(
                provider_name=self.model_info.provider_name,
                model_name=self.model_info.model_name,
                queue=sse_queue,
                system_prompt=self.system_prompt,
                api_key=self.model_info.get_api_key(),
                base_url=self.model_info.base_url
            )
            
            # Add tool context if available
            context_info = ""
            if track_context:
                track_names = [track.get("name") for track in track_context if track.get("name")]
                if track_names:
                    context_info = f"\n\nAvailable tracks: {', '.join(track_names)}"
            
            # Send message with streaming
            full_message = user_message + context_info
            await self._stream_with_tools(chat_session, full_message, sse_queue)
            
        except Exception as e:
            logger.error(f"Error in conversational agent: {e}")
            await sse_queue.error(f"I encountered an error: {str(e)}")
            raise
    
    async def _stream_with_tools(self, 
                                chat_session: ChatSession,
                                message: str,
                                sse_queue: SSEQueueManager) -> None:
        """
        Handle pure conversational requests only.
        Music generation is handled by routing at the process_unified_request level.
        """
        logger.info(f"Processing conversational message: '{message[:50]}...'")
        
        # Handle as pure conversation
        await self._stream_conversation(chat_session, message, sse_queue)
    
    
    async def _stream_conversation(self,
                                 chat_session: ChatSession,
                                 message: str,
                                 sse_queue: SSEQueueManager) -> None:
        """
        Stream conversational response using ChatSession.
        """
        full_response = ""
        
        try:
            logger.info(f"Starting streaming conversation for message: {message[:50]}...")
            
            # Get streaming response
            stream_generator = await chat_session.send_message_async(message, stream=True)
            logger.info("Got stream generator, starting to iterate...")
            
            async for event in stream_generator:
                logger.info(f"Received stream event: {type(event)}")
                
                if isinstance(event, TextDeltaEvent):
                    logger.info(f"TextDelta: '{event.delta}'")
                    # Stream each token as received
                    await sse_queue.add_chunk(event.delta)
                    full_response += event.delta
                elif isinstance(event, StreamEndEvent):
                    logger.info("Stream ended, completing...")
                    # Complete the stream
                    await sse_queue.complete({"response": full_response})
                    return  # Exit after completion
                else:
                    logger.info(f"Other event type: {type(event)}")
            
            logger.info("Stream iteration completed")
                    
        except Exception as e:
            logger.error(f"Error streaming conversation: {e}")
            await sse_queue.error(f"I encountered an error while responding: {str(e)}")
            raise




# Factory function
def create_conversational_agent(model_info: ModelInfo, user_id: str, session: Session) -> ConversationalMusicAgent:
    """Create a new conversational music agent instance."""
    return ConversationalMusicAgent(model_info, user_id, session)