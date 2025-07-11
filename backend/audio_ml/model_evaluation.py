"""
Model Evaluation Script for CLAP Models

This script evaluates different CLAP model variants on sample audio files
to determine the best model for audio description generation.
"""

import time
import librosa
import numpy as np
from typing import Dict, List, Optional
from pathlib import Path
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CLAPModelEvaluator:
    """Evaluates CLAP models for audio description generation."""
    
    def __init__(self):
        self.models = {}
        self.device = self._get_device()
        
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
    
    def load_model(self, model_name: str, cache_dir: Optional[str] = None) -> bool:
        """Load a CLAP model for evaluation."""
        try:
            from sentence_transformers import SentenceTransformer
            
            logger.info(f"Loading model: {model_name}")
            start_time = time.time()
            
            model = SentenceTransformer(model_name, device=self.device, cache_folder=cache_dir)
            
            load_time = time.time() - start_time
            logger.info(f"Model {model_name} loaded in {load_time:.2f}s")
            
            self.models[model_name] = {
                'model': model,
                'load_time': load_time,
                'device': self.device
            }
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to load model {model_name}: {e}")
            return False
    
    def load_audio(self, audio_path: str, sample_rate: int = 48000) -> Optional[np.ndarray]:
        """Load and preprocess audio file."""
        try:
            audio, _ = librosa.load(audio_path, sr=sample_rate)
            
            # Normalize audio to [-1, 1]
            audio = librosa.util.normalize(audio)
            
            # Ensure minimum length (some models require minimum duration)
            min_length = int(0.5 * sample_rate)  # 0.5 seconds minimum
            if len(audio) < min_length:
                audio = np.pad(audio, (0, min_length - len(audio)), mode='constant')
            
            return audio
            
        except Exception as e:
            logger.error(f"Failed to load audio {audio_path}: {e}")
            return None
    
    def generate_audio_embedding(self, model_name: str, audio_path: str) -> Optional[np.ndarray]:
        """Generate audio embedding using CLAP model."""
        if model_name not in self.models:
            logger.error(f"Model {model_name} not loaded")
            return None
        
        try:
            model = self.models[model_name]['model']
            
            # Load audio
            audio = self.load_audio(audio_path)
            if audio is None:
                return None
            
            # Generate embedding
            start_time = time.time()
            embedding = model.encode(audio)
            inference_time = time.time() - start_time
            
            logger.info(f"Generated embedding for {audio_path} in {inference_time:.2f}s")
            
            return embedding
            
        except Exception as e:
            logger.error(f"Failed to generate embedding for {audio_path}: {e}")
            return None
    
    def generate_text_embedding(self, model_name: str, text: str) -> Optional[np.ndarray]:
        """Generate text embedding using CLAP model."""
        if model_name not in self.models:
            logger.error(f"Model {model_name} not loaded")
            return None
        
        try:
            model = self.models[model_name]['model']
            
            start_time = time.time()
            embedding = model.encode(text)
            inference_time = time.time() - start_time
            
            logger.info(f"Generated text embedding in {inference_time:.2f}s")
            
            return embedding
            
        except Exception as e:
            logger.error(f"Failed to generate text embedding: {e}")
            return None
    
    def compute_similarity(self, audio_embedding: np.ndarray, text_embedding: np.ndarray) -> float:
        """Compute cosine similarity between audio and text embeddings."""
        try:
            # Normalize embeddings
            audio_norm = audio_embedding / np.linalg.norm(audio_embedding)
            text_norm = text_embedding / np.linalg.norm(text_embedding)
            
            # Compute cosine similarity
            similarity = np.dot(audio_norm, text_norm)
            
            return float(similarity)
            
        except Exception as e:
            logger.error(f"Failed to compute similarity: {e}")
            return 0.0
    
    def evaluate_model_on_samples(self, model_name: str, audio_samples: List[Dict]) -> Dict:
        """Evaluate a model on a set of audio samples with descriptions."""
        if model_name not in self.models:
            logger.error(f"Model {model_name} not loaded")
            return {}
        
        results = {
            'model_name': model_name,
            'device': self.device,
            'samples': [],
            'avg_similarity': 0.0,
            'avg_inference_time': 0.0,
            'total_evaluation_time': 0.0
        }
        
        start_time = time.time()
        similarities = []
        
        for sample in audio_samples:
            audio_path = sample['audio_path']
            descriptions = sample['descriptions']
            
            logger.info(f"Evaluating {audio_path}")
            
            # Generate audio embedding
            audio_embedding = self.generate_audio_embedding(model_name, audio_path)
            if audio_embedding is None:
                continue
            
            sample_results = {
                'audio_path': audio_path,
                'descriptions': []
            }
            
            # Test each description
            for desc in descriptions:
                text_embedding = self.generate_text_embedding(model_name, desc)
                if text_embedding is None:
                    continue
                
                similarity = self.compute_similarity(audio_embedding, text_embedding)
                
                sample_results['descriptions'].append({
                    'text': desc,
                    'similarity': similarity
                })
                
                similarities.append(similarity)
            
            results['samples'].append(sample_results)
        
        # Calculate averages
        if similarities:
            results['avg_similarity'] = np.mean(similarities)
        
        results['total_evaluation_time'] = time.time() - start_time
        
        return results
    
    def run_evaluation(self, models_to_test: List[str], sample_audio_dir: str) -> Dict:
        """Run full evaluation on multiple models."""
        logger.info("Starting CLAP model evaluation")
        
        # Prepare sample data
        audio_samples = self._prepare_sample_data(sample_audio_dir)
        
        if not audio_samples:
            logger.error("No audio samples found for evaluation")
            return {}
        
        evaluation_results = {}
        
        for model_name in models_to_test:
            logger.info(f"Evaluating model: {model_name}")
            
            # Load model
            if not self.load_model(model_name):
                continue
            
            # Evaluate model
            model_results = self.evaluate_model_on_samples(model_name, audio_samples)
            evaluation_results[model_name] = model_results
            
            # Log results
            logger.info(f"Model {model_name} - Avg Similarity: {model_results.get('avg_similarity', 0):.3f}")
        
        return evaluation_results
    
    def _prepare_sample_data(self, sample_dir: str) -> List[Dict]:
        """Prepare sample audio data with descriptions for evaluation."""
        samples = []
        
        # Example drum samples with descriptions
        drum_descriptions = [
            "drum beat",
            "kick drum",
            "snare drum",
            "hi-hat",
            "cymbal crash",
            "percussion",
            "rhythmic pattern",
            "electronic drum",
            "acoustic drum"
        ]
        
        # Find audio files in the sample directory
        sample_path = Path(sample_dir)
        if not sample_path.exists():
            logger.warning(f"Sample directory not found: {sample_dir}")
            return samples
        
        for audio_file in sample_path.glob("*.wav"):
            if audio_file.is_file():
                samples.append({
                    'audio_path': str(audio_file),
                    'descriptions': drum_descriptions
                })
        
        for audio_file in sample_path.glob("*.mp3"):
            if audio_file.is_file():
                samples.append({
                    'audio_path': str(audio_file),
                    'descriptions': drum_descriptions
                })
        
        logger.info(f"Found {len(samples)} audio samples for evaluation")
        return samples


def main():
    """Main evaluation script."""
    evaluator = CLAPModelEvaluator()
    
    # Models to test
    models_to_test = [
        "laion/clap-htsat-unfused",
        "laion/clap-htsat-fused"
    ]
    
    # Sample audio directory (adjust path as needed)
    sample_audio_dir = "/Users/tanis/Documents/beatgen/backend/sample_audio"
    
    # Run evaluation
    results = evaluator.run_evaluation(models_to_test, sample_audio_dir)
    
    # Print results
    print("\n" + "="*50)
    print("CLAP MODEL EVALUATION RESULTS")
    print("="*50)
    
    for model_name, result in results.items():
        print(f"\nModel: {model_name}")
        print(f"Device: {result.get('device', 'unknown')}")
        print(f"Average Similarity: {result.get('avg_similarity', 0):.3f}")
        print(f"Total Evaluation Time: {result.get('total_evaluation_time', 0):.2f}s")
        print(f"Samples Evaluated: {len(result.get('samples', []))}")
    
    # Recommend best model
    if results:
        best_model = max(results.keys(), key=lambda x: results[x].get('avg_similarity', 0))
        print(f"\nRecommended Model: {best_model}")
        print(f"Best Average Similarity: {results[best_model].get('avg_similarity', 0):.3f}")


if __name__ == "__main__":
    main()