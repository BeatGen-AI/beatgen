"""
Audio Description Service

This service provides audio description generation using CLAP models.
It integrates with the existing audio processing pipeline to generate
semantic descriptions of audio content.
"""

import os
import time
import librosa
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path
import logging
from dataclasses import dataclass
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AudioDescriptionModel(Enum):
    """Available audio description models."""
    CLAP_HTSAT_UNFUSED = "laion/clap-htsat-unfused"
    CLAP_HTSAT_FUSED = "laion/clap-htsat-fused"


@dataclass
class AudioDescriptionResult:
    """Result of audio description generation."""
    audio_path: str
    descriptions: List[Dict[str, Any]]
    best_description: str
    confidence_score: float
    inference_time: float
    model_used: str
    embedding: Optional[np.ndarray] = None


class AudioDescriptionService:
    """Service for generating audio descriptions using CLAP models."""
    
    def __init__(self, model_name: str = AudioDescriptionModel.CLAP_HTSAT_UNFUSED.value):
        self.model_name = model_name
        self.model = None
        self.device = self._get_device()
        self.cache_dir = os.path.join(os.path.dirname(__file__), "model_cache")
        self._ensure_cache_dir()
        
        # Predefined description candidates for different audio types
        self.description_candidates = {
            "drums": [
                "kick drum hit",
                "snare drum hit",
                "hi-hat closed",
                "hi-hat open",
                "crash cymbal",
                "ride cymbal",
                "tom drum",
                "percussion hit",
                "drum loop",
                "electronic drum",
                "acoustic drum",
                "rhythmic pattern"
            ],
            "instruments": [
                "piano melody",
                "guitar chord",
                "bass line",
                "synthesizer pad",
                "organ chord",
                "string section",
                "brass section",
                "woodwind melody",
                "electric guitar",
                "acoustic guitar",
                "electronic sound",
                "ambient texture"
            ],
            "vocals": [
                "vocal melody",
                "vocal harmony",
                "rap vocals",
                "sung lyrics",
                "vocal chops",
                "vocal sample",
                "background vocals",
                "lead vocals",
                "vocal percussion",
                "vocal effects"
            ],
            "general": [
                "musical note",
                "harmonic sound",
                "rhythmic element",
                "melodic phrase",
                "chord progression",
                "sound effect",
                "ambient sound",
                "noise texture",
                "tone",
                "musical phrase"
            ]
        }
    
    def _get_device(self) -> str:
        """Determine the best device for model inference."""
        try:
            import torch
            if torch.cuda.is_available():
                return "cuda"
            elif torch.backends.mps.is_available():
                return "mps"
            else:
                return "cpu"
        except ImportError:
            return "cpu"
    
    def _ensure_cache_dir(self):
        """Ensure model cache directory exists."""
        os.makedirs(self.cache_dir, exist_ok=True)
    
    def initialize_model(self) -> bool:
        """Initialize the CLAP model."""
        if self.model is not None:
            return True
        
        try:
            from sentence_transformers import SentenceTransformer
            
            logger.info(f"Initializing CLAP model: {self.model_name}")
            start_time = time.time()
            
            self.model = SentenceTransformer(
                self.model_name, 
                device=self.device,
                cache_folder=self.cache_dir
            )
            
            load_time = time.time() - start_time
            logger.info(f"Model initialized in {load_time:.2f}s on device: {self.device}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize model: {e}")
            return False
    
    def load_audio(self, audio_path: str, sample_rate: int = 48000) -> Optional[np.ndarray]:
        """Load and preprocess audio file."""
        try:
            audio, sr = librosa.load(audio_path, sr=sample_rate)
            
            # Normalize audio to [-1, 1]
            audio = librosa.util.normalize(audio)
            
            # Ensure minimum length for model processing
            min_length = int(0.5 * sample_rate)  # 0.5 seconds minimum
            if len(audio) < min_length:
                audio = np.pad(audio, (0, min_length - len(audio)), mode='constant')
            
            # Limit maximum length to avoid memory issues
            max_length = int(30 * sample_rate)  # 30 seconds maximum
            if len(audio) > max_length:
                audio = audio[:max_length]
            
            return audio
            
        except Exception as e:
            logger.error(f"Failed to load audio {audio_path}: {e}")
            return None
    
    def generate_audio_embedding(self, audio_path: str) -> Optional[np.ndarray]:
        """Generate audio embedding using CLAP model."""
        if not self.initialize_model():
            return None
        
        try:
            # Load audio
            audio = self.load_audio(audio_path)
            if audio is None:
                return None
            
            # Generate embedding
            start_time = time.time()
            embedding = self.model.encode(audio)
            inference_time = time.time() - start_time
            
            logger.info(f"Generated audio embedding in {inference_time:.2f}s")
            
            return embedding
            
        except Exception as e:
            logger.error(f"Failed to generate audio embedding: {e}")
            return None
    
    def generate_text_embeddings(self, texts: List[str]) -> Optional[np.ndarray]:
        """Generate text embeddings for multiple texts."""
        if not self.initialize_model():
            return None
        
        try:
            start_time = time.time()
            embeddings = self.model.encode(texts)
            inference_time = time.time() - start_time
            
            logger.info(f"Generated {len(texts)} text embeddings in {inference_time:.2f}s")
            
            return embeddings
            
        except Exception as e:
            logger.error(f"Failed to generate text embeddings: {e}")
            return None
    
    def compute_similarities(self, audio_embedding: np.ndarray, text_embeddings: np.ndarray) -> List[float]:
        """Compute cosine similarities between audio and text embeddings."""
        try:
            # Normalize embeddings
            audio_norm = audio_embedding / np.linalg.norm(audio_embedding)
            text_norms = text_embeddings / np.linalg.norm(text_embeddings, axis=1, keepdims=True)
            
            # Compute cosine similarities
            similarities = np.dot(text_norms, audio_norm)
            
            return similarities.tolist()
            
        except Exception as e:
            logger.error(f"Failed to compute similarities: {e}")
            return []
    
    def get_description_candidates(self, audio_type: str = "general") -> List[str]:
        """Get description candidates based on audio type."""
        if audio_type in self.description_candidates:
            return self.description_candidates[audio_type]
        else:
            # Return all candidates if type not recognized
            all_candidates = []
            for candidates in self.description_candidates.values():
                all_candidates.extend(candidates)
            return list(set(all_candidates))  # Remove duplicates
    
    def classify_audio_type(self, audio_path: str) -> str:
        """Classify audio type based on file path or content."""
        path_lower = audio_path.lower()
        
        if any(keyword in path_lower for keyword in ['drum', 'kick', 'snare', 'hihat', 'cymbal']):
            return "drums"
        elif any(keyword in path_lower for keyword in ['vocal', 'voice', 'sing']):
            return "vocals"
        elif any(keyword in path_lower for keyword in ['piano', 'guitar', 'bass', 'synth']):
            return "instruments"
        else:
            return "general"
    
    def generate_description(self, audio_path: str, audio_type: Optional[str] = None) -> Optional[AudioDescriptionResult]:
        """Generate description for an audio file."""
        if not os.path.exists(audio_path):
            logger.error(f"Audio file not found: {audio_path}")
            return None
        
        try:
            start_time = time.time()
            
            # Auto-classify audio type if not provided
            if audio_type is None:
                audio_type = self.classify_audio_type(audio_path)
            
            # Get description candidates
            candidates = self.get_description_candidates(audio_type)
            
            # Generate audio embedding
            audio_embedding = self.generate_audio_embedding(audio_path)
            if audio_embedding is None:
                return None
            
            # Generate text embeddings
            text_embeddings = self.generate_text_embeddings(candidates)
            if text_embeddings is None:
                return None
            
            # Compute similarities
            similarities = self.compute_similarities(audio_embedding, text_embeddings)
            
            # Create description results
            descriptions = []
            for i, (candidate, similarity) in enumerate(zip(candidates, similarities)):
                descriptions.append({
                    "text": candidate,
                    "confidence": float(similarity),
                    "rank": i + 1
                })
            
            # Sort by confidence
            descriptions.sort(key=lambda x: x["confidence"], reverse=True)
            
            # Update ranks
            for i, desc in enumerate(descriptions):
                desc["rank"] = i + 1
            
            # Get best description
            best_description = descriptions[0]["text"] if descriptions else "unknown audio"
            confidence_score = descriptions[0]["confidence"] if descriptions else 0.0
            
            inference_time = time.time() - start_time
            
            result = AudioDescriptionResult(
                audio_path=audio_path,
                descriptions=descriptions,
                best_description=best_description,
                confidence_score=confidence_score,
                inference_time=inference_time,
                model_used=self.model_name,
                embedding=audio_embedding
            )
            
            logger.info(f"Generated description for {audio_path}: '{best_description}' (confidence: {confidence_score:.3f})")
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to generate description for {audio_path}: {e}")
            return None
    
    def generate_descriptions_batch(self, audio_paths: List[str], audio_type: Optional[str] = None) -> List[AudioDescriptionResult]:
        """Generate descriptions for multiple audio files."""
        results = []
        
        for audio_path in audio_paths:
            result = self.generate_description(audio_path, audio_type)
            if result:
                results.append(result)
        
        return results
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the current model."""
        return {
            "model_name": self.model_name,
            "device": self.device,
            "cache_dir": self.cache_dir,
            "is_initialized": self.model is not None
        }


# Example usage function
def process_audio_file(file_path: str) -> dict:
    """Example pipeline function for processing audio files."""
    service = AudioDescriptionService()
    
    # Generate description
    result = service.generate_description(file_path)
    
    if result:
        return {
            "audio_path": result.audio_path,
            "description": result.best_description,
            "confidence": result.confidence_score,
            "inference_time": result.inference_time,
            "model": result.model_used,
            "all_descriptions": result.descriptions[:5]  # Top 5 descriptions
        }
    else:
        return {
            "audio_path": file_path,
            "description": "Failed to generate description",
            "confidence": 0.0,
            "inference_time": 0.0,
            "model": service.model_name,
            "all_descriptions": []
        }


if __name__ == "__main__":
    # Example usage
    service = AudioDescriptionService()
    
    # Test with a sample audio file
    sample_path = "/Users/tanis/Documents/beatgen/backend/sample_audio/test.wav"
    
    if os.path.exists(sample_path):
        result = service.generate_description(sample_path)
        if result:
            print(f"Best description: {result.best_description}")
            print(f"Confidence: {result.confidence_score:.3f}")
            print(f"Inference time: {result.inference_time:.2f}s")
        else:
            print("Failed to generate description")
    else:
        print(f"Sample file not found: {sample_path}")
        print("Please add audio files to the sample_audio directory for testing")