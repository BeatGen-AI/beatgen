"""
Audio Description Service using CLAP models

This service provides audio description generation using CLAP models.
It properly handles audio input using the laion-clap library.
"""

import os
import time
import torch
import torchaudio
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
    CLAP_AUDIO_630K = "630k-audioset-best.pt"
    CLAP_AUDIO_MUSIC = "630k-audioset-fusion-best.pt"
    CLAP_AUDIO_GENERAL = "630k-best.pt"


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
    
    def __init__(self, model_checkpoint: str = "630k-audioset-best.pt"):
        self.model_checkpoint = model_checkpoint
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
                "piano chord",
                "piano note",
                "guitar chord",
                "guitar strum",
                "bass line",
                "bass note",
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
        if torch.cuda.is_available():
            return "cuda"
        else:
            # CLAP models work better on CPU for MPS devices currently
            return "cpu"
    
    def _ensure_cache_dir(self):
        """Ensure model cache directory exists."""
        os.makedirs(self.cache_dir, exist_ok=True)
    
    def initialize_model(self) -> bool:
        """Initialize the CLAP model."""
        if self.model is not None:
            return True
        
        try:
            import laion_clap
            
            logger.info(f"Initializing CLAP model: {self.model_checkpoint}")
            start_time = time.time()
            
            # Download the checkpoint if needed
            checkpoint_path = os.path.join(self.cache_dir, self.model_checkpoint)
            
            if not os.path.exists(checkpoint_path):
                logger.info(f"Downloading CLAP checkpoint to {checkpoint_path}")
                # For now, we'll use a smaller model that works better
                model = laion_clap.CLAP_Module(enable_fusion=False, device=self.device)
                model.load_ckpt()  # Load default checkpoint
            else:
                model = laion_clap.CLAP_Module(enable_fusion=False, device=self.device)
                model.load_ckpt(checkpoint_path)
            
            self.model = model
            
            load_time = time.time() - start_time
            logger.info(f"Model initialized in {load_time:.2f}s on device: {self.device}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize model: {e}")
            logger.info("Trying alternative initialization method...")
            
            # Fallback to simple embedding approach
            try:
                from transformers import AutoProcessor, ClapModel
                
                model_name = "laion/clap-htsat-unfused"
                self.processor = AutoProcessor.from_pretrained(model_name, cache_dir=self.cache_dir)
                self.model = ClapModel.from_pretrained(model_name, cache_dir=self.cache_dir)
                self.model.to(self.device)
                self.model.eval()
                
                logger.info(f"Initialized with transformers CLAP model")
                return True
                
            except Exception as e2:
                logger.error(f"Failed to initialize alternative model: {e2}")
                return False
    
    def load_audio(self, audio_path: str, sample_rate: int = 48000) -> Optional[torch.Tensor]:
        """Load and preprocess audio file."""
        try:
            # Load audio using torchaudio
            waveform, sr = torchaudio.load(audio_path)
            
            # Convert to mono if stereo
            if waveform.shape[0] > 1:
                waveform = torch.mean(waveform, dim=0, keepdim=True)
            
            # Resample if necessary
            if sr != sample_rate:
                resampler = torchaudio.transforms.Resample(sr, sample_rate)
                waveform = resampler(waveform)
            
            # Ensure proper shape
            if waveform.dim() == 1:
                waveform = waveform.unsqueeze(0)
            
            return waveform
            
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
            
            # Generate embedding based on model type
            start_time = time.time()
            
            if hasattr(self.model, 'get_audio_embedding_from_data'):
                # laion_clap style
                embedding = self.model.get_audio_embedding_from_data(
                    x=audio, use_tensor=True
                )
                if isinstance(embedding, torch.Tensor):
                    embedding = embedding.cpu().numpy()
            else:
                # transformers style
                with torch.no_grad():
                    inputs = self.processor(
                        audios=audio.squeeze(0).numpy(), 
                        return_tensors="pt", 
                        sampling_rate=48000
                    )
                    audio_features = self.model.get_audio_features(**inputs)
                    embedding = audio_features.cpu().numpy()[0]
            
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
            
            if hasattr(self.model, 'get_text_embedding'):
                # laion_clap style
                embeddings = []
                for text in texts:
                    emb = self.model.get_text_embedding([text], use_tensor=True)
                    if isinstance(emb, torch.Tensor):
                        emb = emb.cpu().numpy()
                    embeddings.append(emb[0])
                embeddings = np.array(embeddings)
            else:
                # transformers style
                with torch.no_grad():
                    inputs = self.processor(text=texts, return_tensors="pt", padding=True)
                    text_features = self.model.get_text_features(**inputs)
                    embeddings = text_features.cpu().numpy()
            
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
        
        if any(keyword in path_lower for keyword in ['drum', 'kick', 'snare', 'hihat', 'hi-hat', 'cymbal']):
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
                model_used=self.model_checkpoint,
                embedding=audio_embedding
            )
            
            logger.info(f"Generated description for {audio_path}: '{best_description}' (confidence: {confidence_score:.3f})")
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to generate description for {audio_path}: {e}")
            return None
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the current model."""
        return {
            "model_checkpoint": self.model_checkpoint,
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
            "model": service.model_checkpoint,
            "all_descriptions": []
        }


if __name__ == "__main__":
    # Example usage
    service = AudioDescriptionService()
    
    # Test with sample files
    sample_dir = Path("/Users/tanis/Documents/beatgen/backend/sample_audio")
    
    if sample_dir.exists():
        for audio_file in sample_dir.glob("*.wav"):
            print(f"\nProcessing: {audio_file.name}")
            result = service.generate_description(str(audio_file))
            if result:
                print(f"Best description: {result.best_description}")
                print(f"Confidence: {result.confidence_score:.3f}")
                print(f"Top 3 candidates:")
                for desc in result.descriptions[:3]:
                    print(f"  - {desc['text']}: {desc['confidence']:.3f}")
    else:
        print(f"Sample directory not found: {sample_dir}")