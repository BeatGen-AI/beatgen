"""
Vertex AI Music Generation Service

This service handles audio generation using Google Cloud Vertex AI's Lyria2 music generation model.
"""

import asyncio
import os
import httpx
import uuid
import base64
import tempfile
import requests
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass
from app2.core.logging import get_service_logger

from google.auth import default
from google.auth.transport.requests import Request
import json

logger = get_service_logger("vertex_ai_service")


@dataclass
class AudioGenerationResult:
    """Result from Vertex AI audio generation"""
    audio_url: str
    file_name: str
    duration: float
    sample_rate: int = 44100
    format: str = "audio/wav"


class VertexAIService:
    """Service for generating audio using Google Cloud Vertex AI's Lyria2 model"""
    
    def __init__(self):
        # Get required environment variables
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT_ID")
        self.location = os.getenv("GOOGLE_CLOUD_REGION", "us-central1")
        
        if not self.project_id:
            raise ValueError("GOOGLE_CLOUD_PROJECT_ID environment variable is required")
        
        # Initialize credentials for authentication
        try:
            self.credentials, _ = default()
            logger.info(f"Vertex AI service initialized for project: {self.project_id}, location: {self.location}")
        except Exception as e:
            logger.error(f"Failed to initialize Google credentials: {str(e)}")
            raise ValueError(f"Failed to initialize Google credentials: {str(e)}")
    
    async def generate_audio(
        self,
        prompt: str,
        negative_prompt: str = None,
        seed: int = None
    ) -> AudioGenerationResult:
        """
        Generate audio using Vertex AI's Lyria2 model
        
        Args:
            prompt: Text description of the audio to generate
            negative_prompt: What to avoid in generation (optional)
            seed: Random seed for reproducible results (optional)
            
        Returns:
            AudioGenerationResult with the generated audio information
        """
        logger.info(f"Generating audio with Vertex AI prompt: '{prompt}'")
        
        # Prepare request parameters for Vertex AI Lyria2
        parameters = {
            "prompt": prompt
        }
        
        # Add optional parameters if provided
        if negative_prompt:
            parameters["negative_prompt"] = negative_prompt
        if seed is not None:
            parameters["seed"] = seed
        
        try:
            # Get the event loop
            loop = asyncio.get_event_loop()
            
            # Run the Vertex AI prediction in a thread executor to avoid blocking
            result = await loop.run_in_executor(
                None,
                self._generate_music_sync,
                parameters
            )
            
            logger.info("Vertex AI generation completed successfully")
            
            # Extract audio data from response and save to temporary file
            audio_url, file_name = self._process_audio_response(result)
            
            if not audio_url:
                raise Exception(f"No audio data found in Vertex AI response. Response: {result}")
            
            # Create result object (Vertex AI Lyria2 generates 30-second clips at 48kHz)
            audio_result = AudioGenerationResult(
                audio_url=audio_url,
                file_name=file_name,
                duration=30.0,  # Vertex AI Lyria2 generates 30-second clips
                sample_rate=48000,  # Vertex AI Lyria2 uses 48kHz
                format="audio/wav"
            )
            
            logger.info(f"Audio generation successful: {file_name}")
            return audio_result
                
        except Exception as e:
            logger.error(f"Error generating audio with Vertex AI: {str(e)}")
            raise Exception(f"Failed to generate audio: {str(e)}")
    
    def _generate_music_sync(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Synchronous method to call Vertex AI music generation using REST API"""
        
        try:
            # Refresh credentials to get access token
            self.credentials.refresh(Request())
            access_token = self.credentials.token
            
            # Construct the REST API endpoint URL for Lyria-002
            url = f"https://{self.location}-aiplatform.googleapis.com/v1/projects/{self.project_id}/locations/{self.location}/publishers/google/models/lyria-002:predict"
            
            # Prepare the request payload according to Vertex AI docs
            instance = {
                "prompt": parameters["prompt"]
            }
            
            # Add optional parameters if provided
            if "negative_prompt" in parameters and parameters["negative_prompt"]:
                instance["negative_prompt"] = parameters["negative_prompt"]
            if "seed" in parameters and parameters["seed"] is not None:
                instance["seed"] = parameters["seed"]
            
            payload = {
                "instances": [instance],
                "parameters": {}
            }
            
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            logger.info(f"Calling Vertex AI REST API: {url}")
            logger.info(f"Request payload: {json.dumps(payload, indent=2)}")
            
            # Make the REST API call
            response = requests.post(url, headers=headers, json=payload, timeout=120)
            
            if response.status_code != 200:
                error_msg = f"Vertex AI API call failed: {response.status_code} - {response.text}"
                logger.error(error_msg)
                raise Exception(error_msg)
            
            result = response.json()
            logger.info("Vertex AI generation completed successfully")
            logger.info(f"Response keys: {list(result.keys())}")
            
            return result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Request error calling Vertex AI: {str(e)}")
            raise Exception(f"Failed to call Vertex AI API: {str(e)}")
        except Exception as e:
            logger.error(f"Error calling Vertex AI model: {str(e)}")
            raise Exception(f"Vertex AI generation failed: {str(e)}")
    
    def _process_audio_response(self, result: Dict[str, Any]) -> Tuple[Optional[str], str]:
        """Process Vertex AI audio response and save to temporary file"""
        
        # Generate a unique filename
        file_name = f"vertex_ai_audio_{uuid.uuid4().hex[:8]}.wav"
        
        # Extract audio content from response
        audio_content = None
        
        # Check for audioContent in response (base64 encoded)
        if "audioContent" in result:
            audio_content = result["audioContent"]
        elif "predictions" in result and result["predictions"]:
            prediction = result["predictions"][0]
            if isinstance(prediction, dict):
                if "audioContent" in prediction:
                    audio_content = prediction["audioContent"]
                elif "bytesBase64Encoded" in prediction:
                    audio_content = prediction["bytesBase64Encoded"]
        
        if not audio_content:
            logger.error(f"No audioContent found in response: {result}")
            return None, file_name
        
        try:
            # Decode base64 audio content
            audio_bytes = base64.b64decode(audio_content)
            
            # Create temporary file
            temp_dir = tempfile.gettempdir()
            temp_file_path = os.path.join(temp_dir, file_name)
            
            # Write audio data to temporary file
            with open(temp_file_path, 'wb') as f:
                f.write(audio_bytes)
            
            logger.info(f"Audio saved to temporary file: {temp_file_path}")
            
            # Return file:// URL for local file access
            file_url = f"file://{temp_file_path}"
            return file_url, file_name
            
        except Exception as e:
            logger.error(f"Error processing audio content: {str(e)}")
            return None, file_name
    
    async def download_audio(self, audio_url: str) -> bytes:
        """
        Download the generated audio file from the URL or local file path
        
        Args:
            audio_url: URL or file path of the generated audio file
            
        Returns:
            Audio file content as bytes
        """
        logger.info(f"Downloading audio from: {audio_url}")
        
        try:
            # Handle local file:// URLs
            if audio_url.startswith("file://"):
                file_path = audio_url[7:]  # Remove "file://" prefix
                if os.path.exists(file_path):
                    with open(file_path, 'rb') as f:
                        audio_data = f.read()
                    logger.info(f"Successfully read {len(audio_data)} bytes from local file")
                    return audio_data
                else:
                    raise Exception(f"Local file not found: {file_path}")
            
            # Handle HTTP/HTTPS URLs (fallback for other providers)
            else:
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
        # Generate audio
        result = await self.generate_audio(
            prompt=prompt,
            negative_prompt=negative_prompt,
            seed=seed
        )
        
        # Download the audio file
        audio_data = await self.download_audio(result.audio_url)
        
        return audio_data, result


# Service factory function
def get_vertex_ai_service() -> VertexAIService:
    """Get a new Vertex AI service instance"""
    return VertexAIService()