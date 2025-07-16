"""
FAL-AI Audio Generation Service

This service handles audio generation using FAL-AI's Lyria2 text-to-audio model.
"""

import asyncio
import os
import httpx
import uuid
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass
from app2.core.logging import get_service_logger

# Import the official FAL client
import fal_client

logger = get_service_logger("fal_ai_service")


@dataclass
class AudioGenerationResult:
    """Result from FAL-AI audio generation"""
    audio_url: str
    file_name: str
    duration: float
    sample_rate: int = 44100
    format: str = "audio/wav"


@dataclass
class AudioInpaintResult:
    """Result from FAL-AI audio inpainting"""
    audio_url: str
    file_name: str
    duration: float
    sample_rate: int = 44100
    format: str = "audio/wav"


class FalAIService:
    """Service for generating audio using FAL-AI's Lyria2 model"""
    
    def __init__(self):
        # According to FAL-AI docs, the environment variable should be FAL_KEY
        self.api_key = os.getenv("FAL_KEY")
        if not self.api_key:
            # Fallback to FAL_API_KEY if that's what the user set
            self.api_key = os.getenv("FAL_API_KEY")
            if self.api_key:
                # Set FAL_KEY since that's what fal_client expects
                os.environ["FAL_KEY"] = self.api_key
            else:
                raise ValueError("FAL_KEY environment variable is required (see https://fal.ai/models/fal-ai/lyria2/api#api-call-setup)")
        
        # Log that we found the API key
        logger.info(f"FAL-AI service initialized with API key: {self.api_key[:10]}...")
    
    async def generate_audio(
        self,
        prompt: str,
        negative_prompt: str = None,
        seed: int = None
    ) -> AudioGenerationResult:
        """
        Generate audio using FAL-AI's Lyria2 model
        
        Args:
            prompt: Text description of the audio to generate
            negative_prompt: What to avoid in generation (optional)
            seed: Random seed for reproducible results (optional)
            
        Returns:
            AudioGenerationResult with the generated audio information
        """
        logger.info(f"Generating audio with prompt: '{prompt}'")
        
        # Prepare request arguments for FAL-AI Lyria2 (only supported parameters)
        arguments = {
            "prompt": prompt
        }
        
        # Add optional parameters if provided
        if negative_prompt:
            arguments["negative_prompt"] = negative_prompt
        if seed is not None:
            arguments["seed"] = seed
        
        try:
            # Track logs from FAL-AI
            def on_queue_update(update):
                if isinstance(update, fal_client.InProgress):
                    for log in update.logs:
                        logger.info(f"FAL-AI log: {log['message']}")
            
            logger.info(f"Submitting request to FAL-AI Lyria2")
            logger.info(f"Prompt: '{arguments.get('prompt', 'N/A')[:100]}...'")
            if arguments.get('negative_prompt'):
                logger.info(f"Negative prompt: '{arguments.get('negative_prompt')}')")
            
            # Get the event loop
            loop = asyncio.get_event_loop()
            
            # Use the subscribe method as shown in the official docs
            result = await loop.run_in_executor(
                None,
                lambda: fal_client.subscribe(
                    "fal-ai/lyria2",
                    arguments=arguments,
                    with_logs=True,
                    on_queue_update=on_queue_update,
                )
            )
            
            logger.info("FAL-AI generation completed successfully")
            
            # Extract audio URL from response
            # FAL-AI Lyria2 returns the audio in the "audio" field with nested structure
            audio_url = None
            if "audio" in result:
                audio = result["audio"]
                if isinstance(audio, dict) and "url" in audio:
                    audio_url = audio["url"]
                elif isinstance(audio, str):
                    audio_url = audio
            elif "audio_file" in result:
                # Fallback for other models that might use "audio_file"
                audio_file = result["audio_file"]
                if isinstance(audio_file, dict) and "url" in audio_file:
                    audio_url = audio_file["url"]
                elif isinstance(audio_file, str):
                    audio_url = audio_file
            
            if not audio_url:
                raise Exception(f"No audio URL found in FAL-AI response. Response keys: {list(result.keys())}")
            
            # Generate a unique filename (FAL-AI Lyria2 outputs WAV)
            file_name = f"fal_ai_audio_{uuid.uuid4().hex[:8]}.wav"
            
            # Create result object (FAL-AI Lyria2 generates 30-second clips at 48kHz)
            audio_result = AudioGenerationResult(
                audio_url=audio_url,
                file_name=file_name,
                duration=30.0,  # FAL-AI Lyria2 always generates 30-second clips
                sample_rate=48000,  # FAL-AI Lyria2 uses 48kHz
                format="audio/wav"
            )
            
            logger.info(f"Audio generation successful: {file_name}")
            return audio_result
                
        except Exception as e:
            logger.error(f"Error generating audio with FAL-AI: {str(e)}")
            raise Exception(f"Failed to generate audio: {str(e)}")
    
    async def download_audio(self, audio_url: str) -> bytes:
        """
        Download the generated audio file from the URL
        
        Args:
            audio_url: URL of the generated audio file
            
        Returns:
            Audio file content as bytes
        """
        logger.info(f"Downloading audio from: {audio_url}")
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(audio_url)
                
                if response.status_code != 200:
                    error_msg = f"Failed to download audio: {response.status_code} - {response.text}"
                    logger.error(error_msg)
                    raise Exception(error_msg)
                
                audio_data = response.content
                logger.info(f"Successfully downloaded {len(audio_data)} bytes of audio data")
                return audio_data
                
        except Exception as e:
            logger.error(f"Error downloading audio: {str(e)}")
            raise Exception(f"Failed to download audio: {str(e)}")
    
    async def generate_and_download_audio(
        self,
        prompt: str,
        negative_prompt: str = None,
        seed: int = None
    ) -> Tuple[bytes, AudioGenerationResult]:
        """
        Generate and download audio in one step
        
        Returns:
            Tuple of (audio_bytes, AudioGenerationResult)
        """
        # Generate audio with only supported parameters
        result = await self.generate_audio(
            prompt=prompt,
            negative_prompt=negative_prompt,
            seed=seed
        )
        
        # Download the audio file
        audio_data = await self.download_audio(result.audio_url)
        
        return audio_data, result
    
    async def audio_inpaint(
        self,
        audio_url: str,
        tags: str,
        prompt: Optional[str] = None,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        lyrics: Optional[str] = None
    ) -> AudioInpaintResult:
        """
        Modify audio using FAL-AI's ace-step/audio-inpaint model
        
        Args:
            audio_url: URL of the source audio file to modify
            tags: Style tags for the generation (e.g., "lofi, hiphop, drum and bass, trap, chill")
            prompt: Optional text description of desired modifications
            start_time: Optional start time for the segment to modify (in seconds)
            end_time: Optional end time for the segment to modify (in seconds)
            lyrics: Optional lyrics to guide the inpainting
            
        Returns:
            AudioInpaintResult with the modified audio information
        """
        logger.info(f"Inpainting audio with tags: '{tags}' and prompt: '{prompt}'")
        
        # Prepare request arguments for FAL-AI ace-step/audio-inpaint
        arguments = {
            "audio_url": audio_url,
            "tags": tags
        }
        
        # Add optional parameters if provided
        if prompt:
            arguments["prompt"] = prompt
        if start_time is not None:
            arguments["start_time"] = start_time
        if end_time is not None:
            arguments["end_time"] = end_time
        if lyrics:
            arguments["lyrics"] = lyrics
        
        try:
            # Track logs from FAL-AI
            def on_queue_update(update):
                if isinstance(update, fal_client.InProgress):
                    for log in update.logs:
                        logger.info(f"FAL-AI inpaint log: {log['message']}")
            
            logger.info(f"Submitting request to FAL-AI ace-step/audio-inpaint")
            logger.info(f"Audio URL: {audio_url}")
            logger.info(f"Prompt: '{arguments.get('prompt', 'N/A')[:100]}...'")
            if arguments.get('prompt'):
                logger.info(f"Style tags: '{arguments.get('style_tags')}'")
            
            # Get the event loop
            loop = asyncio.get_event_loop()
            
            # Use the subscribe method for audio-inpaint
            result = await loop.run_in_executor(
                None,
                lambda: fal_client.subscribe(
                    "fal-ai/ace-step/audio-inpaint",
                    arguments=arguments,
                    with_logs=True,
                    on_queue_update=on_queue_update,
                )
            )
            
            logger.info("FAL-AI inpaint completed successfully")
            
            # Extract audio URL from response
            # ace-step/audio-inpaint returns the audio in the "audio" field
            audio_url_result = None
            if "audio" in result:
                audio = result["audio"]
                if isinstance(audio, dict) and "url" in audio:
                    audio_url_result = audio["url"]
                elif isinstance(audio, str):
                    audio_url_result = audio
            elif "audio_file" in result:
                # Fallback for different response structure
                audio_file = result["audio_file"]
                if isinstance(audio_file, dict) and "url" in audio_file:
                    audio_url_result = audio_file["url"]
                elif isinstance(audio_file, str):
                    audio_url_result = audio_file
            
            if not audio_url_result:
                raise Exception(f"No audio URL found in FAL-AI response. Response keys: {list(result.keys())}")
            
            # Generate a unique filename for the inpainted audio
            file_name = f"fal_ai_inpaint_{uuid.uuid4().hex[:8]}.wav"
            
            # Create result object (ace-step/audio-inpaint preserves input duration)
            # We'll use the input duration as the default, but this could be updated
            # based on the actual response if FAL-AI provides duration info
            inpaint_result = AudioInpaintResult(
                audio_url=audio_url_result,
                file_name=file_name,
                duration=30.0,  # Default duration, should be updated based on input
                sample_rate=44100,  # Default sample rate for inpaint
                format="audio/wav"
            )
            
            logger.info(f"Audio inpaint successful: {file_name}")
            return inpaint_result
                
        except Exception as e:
            logger.error(f"Error inpainting audio with FAL-AI: {str(e)}")
            raise Exception(f"Failed to inpaint audio: {str(e)}")


# Service factory function
def get_fal_ai_service() -> FalAIService:
    """Get a new FAL-AI service instance"""
    return FalAIService()