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
import json
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass

from google.auth import default
from google.auth.transport.requests import Request
from google.oauth2 import service_account

from app2.core.logging import get_service_logger
from app2.utils.audio_utils import get_audio_duration

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
            self._setup_credentials()
            logger.info(f"Vertex AI service initialized for project: {self.project_id}, location: {self.location}")
        except Exception as e:
            logger.error(f"Failed to initialize Google credentials: {str(e)}")
            raise ValueError(f"Failed to initialize Google credentials: {str(e)}") from e
    
    def _setup_credentials(self):
        """Setup Google Cloud credentials with proper scopes"""
        app_env = os.getenv("APP_ENV", "prod")
        scopes = ['https://www.googleapis.com/auth/cloud-platform']
        
        # Handle development environment with local credentials
        if app_env == "dev":
            local_creds = os.getenv("LOCAL_GOOGLE_APPLICATION_CREDENTIALS")
            print(f"Local credentials: {local_creds}")
            if local_creds and os.path.exists(local_creds):
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = local_creds
                logger.info(f"Development mode: Using local credentials from: {local_creds}")
            else:
                logger.warning("APP_ENV=dev but LOCAL_GOOGLE_APPLICATION_CREDENTIALS not set or file not found")
        
        # Load credentials with proper scopes
        creds_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if creds_file and os.path.exists(creds_file):
            # Load service account credentials with specific scopes
            self.credentials = service_account.Credentials.from_service_account_file(
                creds_file, scopes=scopes
            )
            logger.info(f"Using service account credentials from file")
        else:
            # Fall back to Application Default Credentials
            self.credentials, _ = default(scopes=scopes)
            logger.info("Using Application Default Credentials")
    
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
        logger.info(f"Generating audio with Vertex AI")
        
        # Prepare request parameters
        parameters = {"prompt": prompt}
        if negative_prompt:
            parameters["negative_prompt"] = negative_prompt
        if seed is not None:
            parameters["seed"] = seed
        
        try:
            # Run the Vertex AI prediction in a thread executor to avoid blocking
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, self._generate_music_sync, parameters)
            
            # Process the audio response
            audio_url, file_name = self._process_audio_response(result)
            if not audio_url:
                raise Exception("No audio data found in Vertex AI response")
            
            # Get actual duration from the audio file
            actual_duration = await get_audio_duration(audio_url)
            
            # Create result object
            audio_result = AudioGenerationResult(
                audio_url=audio_url,
                file_name=file_name,
                duration=actual_duration,
                sample_rate=48000,  # Vertex AI Lyria2 uses 48kHz
                format="audio/wav"
            )
            
            logger.info(f"Audio generation successful: {file_name}, duration: {actual_duration:.2f}s")
            return audio_result
                
        except Exception as e:
            logger.error(f"Error generating audio with Vertex AI: {str(e)}")
            raise Exception(f"Failed to generate audio: {str(e)}") from e
    
    def _generate_music_sync(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Synchronous method to call Vertex AI music generation using REST API"""
        try:
            # Refresh credentials to get access token
            self.credentials.refresh(Request())
            access_token = self.credentials.token
            
            # Construct the REST API endpoint URL
            url = f"https://{self.location}-aiplatform.googleapis.com/v1/projects/{self.project_id}/locations/{self.location}/publishers/google/models/lyria-002:predict"
            
            # Prepare the request payload
            instance = {"prompt": parameters["prompt"]}
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
            
            # Make the REST API call
            response = requests.post(url, headers=headers, json=payload, timeout=120)
            
            if response.status_code != 200:
                try:
                    error_response = response.json()
                    error_msg = f"Vertex AI API error ({response.status_code}): {error_response.get('error', {}).get('message', 'Unknown error')}"
                except:
                    error_msg = f"Vertex AI API error ({response.status_code}): {response.reason}"
                raise Exception(error_msg)
            
            return response.json()
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Request error calling Vertex AI: {str(e)}")
            raise Exception(f"Failed to call Vertex AI API: {str(e)}") from e
        except Exception as e:
            logger.error(f"Error calling Vertex AI model: {str(e)}")
            raise Exception(f"Vertex AI generation failed: {str(e)}") from e
    
    def _process_audio_response(self, result: Dict[str, Any]) -> Tuple[Optional[str], str]:
        """Process Vertex AI audio response and save to temporary file"""
        file_name = f"vertex_ai_audio_{uuid.uuid4().hex[:8]}.wav"
        
        # Extract audio content from response (base64 encoded)
        audio_content = None
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
            return None, file_name
        
        try:
            # Decode base64 audio content and save to temporary file
            audio_bytes = base64.b64decode(audio_content)
            temp_file_path = os.path.join(tempfile.gettempdir(), file_name)
            
            with open(temp_file_path, 'wb') as f:
                f.write(audio_bytes)
            
            return f"file://{temp_file_path}", file_name
            
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
        negative_prompt: str = None,
        seed: int = None
    ) -> Tuple[bytes, AudioGenerationResult]:
        """
        Generate and download audio in one step
        
        Returns:
            Tuple of (audio_bytes, AudioGenerationResult)
        """
        result = await self.generate_audio(prompt=prompt, negative_prompt=negative_prompt, seed=seed)
        audio_data = await self.download_audio(result.audio_url)
        return audio_data, result


def get_vertex_ai_service() -> VertexAIService:
    """Get a new Vertex AI service instance"""
    return VertexAIService()