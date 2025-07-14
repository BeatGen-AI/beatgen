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
        duration: float = 10.0,
        temperature: float = 1.0,
        top_p: float = 0.95,
        audio_format: str = "wav"
    ) -> AudioGenerationResult:
        """
        Generate audio using FAL-AI's Lyria2 model
        
        Args:
            prompt: Text description of the audio to generate
            duration: Duration in seconds (default: 10.0)
            temperature: Controls randomness (0.0-2.0, default: 1.0)
            top_p: Controls diversity (0.0-1.0, default: 0.95)
            audio_format: Output format ("wav" or "mp3", default: "wav")
            
        Returns:
            AudioGenerationResult with the generated audio information
        """
        logger.info(f"Generating audio with prompt: '{prompt}', duration: {duration}s")
        
        # Prepare request arguments for FAL-AI Lyria2
        arguments = {
            "prompt": prompt,
            "duration": duration,
            "temperature": temperature,
            "top_p": top_p,
            "output_format": audio_format
        }
        
        try:
            # Track logs from FAL-AI
            def on_queue_update(update):
                if isinstance(update, fal_client.InProgress):
                    for log in update.logs:
                        logger.info(f"FAL-AI log: {log['message']}")
            
            logger.info(f"Submitting request to FAL-AI Lyria2: {arguments}")
            
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
            
            logger.info(f"FAL-AI response: {result}")
            
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
            
            # Generate a unique filename
            file_name = f"fal_ai_audio_{uuid.uuid4().hex[:8]}.{audio_format}"
            
            # Create result object
            audio_result = AudioGenerationResult(
                audio_url=audio_url,
                file_name=file_name,
                duration=duration,
                sample_rate=44100,  # FAL-AI typically uses 44.1kHz
                format=f"audio/{audio_format}"
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
        duration: float = 10.0,
        temperature: float = 1.0,
        top_p: float = 0.95,
        audio_format: str = "wav"
    ) -> Tuple[bytes, AudioGenerationResult]:
        """
        Generate and download audio in one step
        
        Returns:
            Tuple of (audio_bytes, AudioGenerationResult)
        """
        # Generate audio
        result = await self.generate_audio(
            prompt=prompt,
            duration=duration,
            temperature=temperature,
            top_p=top_p,
            audio_format=audio_format
        )
        
        # Download the audio file
        audio_data = await self.download_audio(result.audio_url)
        
        return audio_data, result


# Service factory function
def get_fal_ai_service() -> FalAIService:
    """Get a new FAL-AI service instance"""
    return FalAIService()