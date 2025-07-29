"""
Stability AI Audio Generation Service

This service handles audio generation using Stability AI's Stable Audio 2.0 model.
"""

import asyncio
import os
import httpx
import uuid
import tempfile
import requests
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass

from app2.core.logging import get_service_logger
from app2.utils.audio_utils import get_audio_duration

logger = get_service_logger("stability_ai_service")

@dataclass
class AudioGenerationResult:
    """Result from Stability AI audio generation"""
    audio_url: str
    file_name: str
    duration: float
    sample_rate: int = 44100
    format: str = "audio/wav"


class StabilityAIService:
    def __init__(self):
        self.api_key = os.getenv("STABILITY_API_KEY")
        if not self.api_key:
            raise ValueError("STABILITY_API_KEY environment variable is required")
        
        self.base_url = "https://api.stability.ai"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "audio/*"
        }
        
        logger.info(f"Stability AI service initialized with API key: {self.api_key[:10]}...")
    
    def calculate_duration_from_bars(self, bpm: float, bars: int) -> float:
        """
        Calculate duration in seconds from BPM and number of bars
        Assumes 4/4 time signature (4 beats per bar)
        
        Args:
            bpm: Beats per minute
            bars: Number of bars/measures
            
        Returns:
            float: Duration in seconds
        """
        beats_per_bar = 4
        total_beats = bars * beats_per_bar
        duration_seconds = (total_beats / bpm) * 60
        return duration_seconds

    async def generate_audio(
        self,
        prompt: str,
        duration: Optional[float] = None,
        bpm: Optional[float] = None,
        bars: Optional[int] = None,
        key: Optional[str] = None,
        seed: Optional[int] = None,
        negative_prompt: str = None  # Added for compatibility
    ) -> AudioGenerationResult:
        """
        Generate audio using Stability AI Stable Audio 2.0 API
        
        Args:
            prompt: Text description of the audio to generate
            duration: Length of audio in seconds (max 120) - overrides BPM/bars calculation
            bpm: Beats per minute (used with bars to calculate duration)
            bars: Number of bars/measures (used with BPM to calculate duration)
            key: Musical key (e.g., 'C major', 'Am', 'F# minor')
            seed: Random seed for reproducible results
            negative_prompt: Not used by Stability AI but kept for compatibility
            
        Returns:
            AudioGenerationResult with the generated audio information
        """
        logger.info(f"Generating audio with Stability AI")
        endpoint = f"{self.base_url}/v2beta/audio/stable-audio-2/text-to-audio"
        
        # Calculate duration from BPM and bars if not provided directly
        if duration is None and bpm is not None and bars is not None:
            duration = self.calculate_duration_from_bars(bpm, bars)
        elif duration is None:
            duration = 10.0  # Default duration
        
        # Build the enhanced prompt with key and BPM information
        enhanced_prompt = prompt
        if key is not None:
            enhanced_prompt += f" in {key}"
        if bpm is not None:
            enhanced_prompt += f" at {bpm} BPM"
        
        data = {
            "prompt": (None, enhanced_prompt),
            "duration": (None, str(float(duration)))
        }
        
        if seed is not None:
            data["seed"] = (None, str(seed))
        
        try:
            logger.info(f"Generating audio for prompt: '{enhanced_prompt}'")
            logger.info(f"Duration: {duration} seconds")
            if bpm is not None and bars is not None:
                logger.info(f"Calculated from: {bars} bars at {bpm} BPM")
            
            # Run the HTTP request in a thread executor to avoid blocking
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: requests.post(endpoint, headers=self.headers, files=data, timeout=120)
            )
            
            if response.status_code == 200:
                # Generate unique filename
                file_name = f"stability_ai_audio_{uuid.uuid4().hex[:8]}.wav"
                temp_file_path = os.path.join(tempfile.gettempdir(), file_name)
                
                # Save the audio file to temporary location
                with open(temp_file_path, "wb") as f:
                    f.write(response.content)
                
                # Create file:// URL for local access
                audio_url = f"file://{temp_file_path}"
                
                # Get actual duration from the audio file
                actual_duration = await get_audio_duration(audio_url)
                
                # Create result object
                audio_result = AudioGenerationResult(
                    audio_url=audio_url,
                    file_name=file_name,
                    duration=actual_duration,
                    sample_rate=44100,  # Stability AI default
                    format="audio/wav"
                )
                
                logger.info(f"Audio generation successful: {file_name}, duration: {actual_duration:.2f}s")
                return audio_result
            else:
                error_msg = f"Stability AI API error ({response.status_code}): {response.text}"
                logger.error(error_msg)
                raise Exception(error_msg)
                
        except Exception as e:
            logger.error(f"Error generating audio with Stability AI: {str(e)}")
            raise Exception(f"Failed to generate audio: {str(e)}") from e
    
    async def download_audio(self, audio_url: str) -> bytes:
        """
        Download the generated audio file from the URL or local file path
        
        Args:
            audio_url: URL or file path of the generated audio file
            
        Returns:
            Audio file content as bytes
        """
        try:
            # Handle local file:// URLs
            if audio_url.startswith("file://"):
                file_path = audio_url[7:]  # Remove "file://" prefix
                if os.path.exists(file_path):
                    with open(file_path, 'rb') as f:
                        return f.read()
                else:
                    raise Exception(f"Local file not found: {file_path}")
            
            # Handle HTTP/HTTPS URLs
            else:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.get(audio_url)
                    if response.status_code != 200:
                        raise Exception(f"Failed to download audio: {response.status_code}")
                    return response.content
                
        except Exception as e:
            logger.error(f"Error downloading audio: {str(e)}")
            raise Exception(f"Failed to download audio: {str(e)}") from e
    
    async def generate_and_download_audio(
        self,
        prompt: str,
        duration: Optional[float] = None,
        bpm: Optional[float] = None,
        bars: Optional[int] = None,
        key: Optional[str] = None,
        seed: Optional[int] = None,
        negative_prompt: str = None
    ) -> Tuple[bytes, AudioGenerationResult]:
        """
        Generate and download audio in one step
        
        Returns:
            Tuple of (audio_bytes, AudioGenerationResult)
        """
        result = await self.generate_audio(
            prompt=prompt,
            duration=duration,
            bpm=bpm,
            bars=bars,
            key=key,
            seed=seed,
            negative_prompt=negative_prompt
        )
        audio_data = await self.download_audio(result.audio_url)
        return audio_data, result


def get_stability_ai_service() -> StabilityAIService:
    """Get a new Stability AI service instance"""
    return StabilityAIService()