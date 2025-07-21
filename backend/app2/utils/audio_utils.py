"""
Audio utilities for shared audio processing functions
"""

import io
import os
import httpx
from typing import Union
from app2.core.logging import get_service_logger

# Import for audio metadata extraction
from mutagen import File as MutagenFile

logger = get_service_logger("audio_utils")


async def get_audio_duration(audio_source: Union[str, bytes]) -> float:
    """
    Get the duration of audio from either a URL, file path, or audio data bytes
    
    Args:
        audio_source: Can be:
            - URL (http/https) to download audio from
            - Local file path (including file:// URLs)  
            - Audio data as bytes
            
    Returns:
        Duration in seconds, defaults to 30.0 if detection fails
    """
    try:
        # If it's bytes, process directly
        if isinstance(audio_source, bytes):
            return _get_duration_from_bytes(audio_source)
        
        # If it's a string, determine if it's a URL or file path
        elif isinstance(audio_source, str):
            # Handle file:// URLs
            if audio_source.startswith("file://"):
                file_path = audio_source[7:]  # Remove "file://" prefix
                if os.path.exists(file_path):
                    with open(file_path, 'rb') as f:
                        audio_data = f.read()
                    return _get_duration_from_bytes(audio_data)
                else:
                    logger.warning(f"Local file not found: {file_path}")
                    return 30.0
            
            # Handle local file paths
            elif os.path.isfile(audio_source):
                with open(audio_source, 'rb') as f:
                    audio_data = f.read()
                return _get_duration_from_bytes(audio_data)
            
            # Handle HTTP/HTTPS URLs
            elif audio_source.startswith(("http://", "https://")):
                audio_data = await _download_audio(audio_source)
                return _get_duration_from_bytes(audio_data)
            
            else:
                logger.warning(f"Unrecognized audio source format: {audio_source}")
                return 30.0
        
        else:
            logger.warning(f"Invalid audio source type: {type(audio_source)}")
            return 30.0
            
    except Exception as e:
        logger.warning(f"Failed to detect audio duration: {str(e)}, falling back to 30.0 seconds")
        return 30.0


def _get_duration_from_bytes(audio_data: bytes) -> float:
    """
    Get the duration of audio from audio data bytes using mutagen
    
    Args:
        audio_data: Audio file content as bytes
        
    Returns:
        Duration in seconds
    """
    try:
        # Use mutagen for audio metadata extraction
        audio_file = MutagenFile(io.BytesIO(audio_data))
        if audio_file is not None and hasattr(audio_file, 'info') and hasattr(audio_file.info, 'length'):
            duration = audio_file.info.length
            logger.info(f"Audio duration detected: {duration:.2f} seconds")
            return duration
        else:
            logger.warning("Mutagen could not read audio file info")
            return 30.0
    except Exception as e:
        logger.warning(f"Failed to detect audio duration from bytes: {str(e)}")
        return 30.0


async def _download_audio(audio_url: str) -> bytes:
    """
    Download audio file from URL
    
    Args:
        audio_url: URL of the audio file
        
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