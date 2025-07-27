"""
Fixed Model Evaluation Script for CLAP Models

This script properly evaluates CLAP models on audio files using the correct libraries.
"""

import time
import torch
import torchaudio
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
        self.cache_dir = Path(__file__).parent / "model_cache"
        self.cache_dir.mkdir(exist_ok=True)
        
    def _get_device(self) -> str:
        """Determine the best device for model inference."""
        if torch.cuda.is_available():
            return "cuda"
        else:
            # Use CPU for MPS devices as CLAP models have better CPU support
            return "cpu"
    
    def load_model(self, model_name: str) -> bool:
        """Load a CLAP model for evaluation."""
        try:
            from transformers import AutoProcessor, ClapModel
            
            logger.info(f"Loading model: {model_name}")
            start_time = time.time()
            
            # Load processor and model
            processor = AutoProcessor.from_pretrained(model_name, cache_dir=self.cache_dir)
            model = ClapModel.from_pretrained(model_name, cache_dir=self.cache_dir)
            model.to(self.device)
            model.eval()
            
            load_time = time.time() - start_time
            logger.info(f"Model {model_name} loaded in {load_time:.2f}s")
            
            self.models[model_name] = {
                'model': model,
                'processor': processor,
                'load_time': load_time,
                'device': self.device
            }
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to load model {model_name}: {e}")
            return False
    
    def load_audio(self, audio_path: str, sample_rate: int = 48000) -> Optional[torch.Tensor]:
        """Load and preprocess audio file."""
        try:
            # Load audio
            waveform, sr = torchaudio.load(audio_path)
            
            # Convert to mono if stereo
            if waveform.shape[0] > 1:
                waveform = torch.mean(waveform, dim=0, keepdim=True)
            
            # Resample if necessary
            if sr != sample_rate:
                resampler = torchaudio.transforms.Resample(sr, sample_rate)
                waveform = resampler(waveform)
            
            # Normalize
            waveform = waveform / waveform.abs().max()
            
            return waveform
            
        except Exception as e:
            logger.error(f"Failed to load audio {audio_path}: {e}")
            return None
    
    def generate_embeddings(self, model_name: str, audio_path: str, texts: List[str]) -> Optional[Dict]:
        """Generate audio and text embeddings using CLAP model."""
        if model_name not in self.models:
            logger.error(f"Model {model_name} not loaded")
            return None
        
        try:
            model_info = self.models[model_name]
            model = model_info['model']
            processor = model_info['processor']
            
            # Load audio
            waveform = self.load_audio(audio_path)
            if waveform is None:
                return None
            
            # Prepare inputs
            audio_inputs = processor(
                audios=waveform.squeeze(0).numpy(),
                return_tensors="pt",
                sampling_rate=48000
            ).to(self.device)
            
            text_inputs = processor(
                text=texts,
                return_tensors="pt",
                padding=True
            ).to(self.device)
            
            # Generate embeddings
            start_time = time.time()
            
            with torch.no_grad():
                audio_features = model.get_audio_features(**audio_inputs)
                text_features = model.get_text_features(**text_inputs)
                
                # Normalize embeddings
                audio_features = audio_features / audio_features.norm(dim=-1, keepdim=True)
                text_features = text_features / text_features.norm(dim=-1, keepdim=True)
                
                # Compute similarities
                similarities = (audio_features @ text_features.T).cpu().numpy()[0]
            
            inference_time = time.time() - start_time
            
            return {
                'audio_embedding': audio_features.cpu().numpy()[0],
                'text_embeddings': text_features.cpu().numpy(),
                'similarities': similarities,
                'inference_time': inference_time
            }
            
        except Exception as e:
            logger.error(f"Failed to generate embeddings: {e}")
            import traceback
            traceback.print_exc()
            return None
    
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
        all_similarities = []
        all_inference_times = []
        
        for sample in audio_samples:
            audio_path = sample['audio_path']
            descriptions = sample['descriptions']
            
            logger.info(f"Evaluating {Path(audio_path).name}")
            
            # Generate embeddings and similarities
            embeddings_result = self.generate_embeddings(model_name, audio_path, descriptions)
            if embeddings_result is None:
                continue
            
            similarities = embeddings_result['similarities']
            
            # Find best matching description
            best_idx = np.argmax(similarities)
            best_description = descriptions[best_idx]
            best_similarity = similarities[best_idx]
            
            sample_results = {
                'audio_path': audio_path,
                'best_description': best_description,
                'best_similarity': float(best_similarity),
                'all_similarities': [
                    {'text': desc, 'similarity': float(sim)}
                    for desc, sim in zip(descriptions, similarities)
                ],
                'inference_time': embeddings_result['inference_time']
            }
            
            results['samples'].append(sample_results)
            all_similarities.extend(similarities)
            all_inference_times.append(embeddings_result['inference_time'])
        
        # Calculate averages
        if all_similarities:
            results['avg_similarity'] = float(np.mean(all_similarities))
        if all_inference_times:
            results['avg_inference_time'] = float(np.mean(all_inference_times))
        
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
            logger.info(f"\nEvaluating model: {model_name}")
            
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
        
        # Define descriptions based on filename patterns
        description_mappings = {
            'kick': ['kick drum', 'bass drum', 'kick drum hit', 'low drum', 'bass drum hit'],
            'snare': ['snare drum', 'snare hit', 'snare drum hit', 'crisp drum', 'drum hit'],
            'hihat': ['hi-hat', 'hi-hat closed', 'hihat', 'cymbal', 'closed hat'],
            'hi-hat': ['hi-hat', 'hi-hat closed', 'hihat', 'cymbal', 'closed hat'],
            'piano': ['piano', 'piano note', 'piano melody', 'keyboard', 'piano sound'],
            'bass': ['bass', 'bass note', 'bass line', 'low frequency', 'bass sound'],
            'guitar': ['guitar', 'guitar chord', 'guitar strum', 'acoustic guitar', 'string instrument'],
            'drum': ['drum', 'drum hit', 'percussion', 'drum sound', 'rhythmic hit']
        }
        
        # Find audio files in the sample directory
        sample_path = Path(sample_dir)
        if not sample_path.exists():
            logger.warning(f"Sample directory not found: {sample_dir}")
            return samples
        
        for audio_file in sample_path.glob("*.wav"):
            if audio_file.is_file():
                # Determine descriptions based on filename
                filename_lower = audio_file.stem.lower()
                descriptions = None
                
                for key, desc_list in description_mappings.items():
                    if key in filename_lower:
                        descriptions = desc_list
                        break
                
                # Default descriptions if no match
                if descriptions is None:
                    descriptions = [
                        'sound', 'audio', 'music', 'tone', 'noise',
                        'musical sound', 'audio sample', 'sound effect'
                    ]
                
                samples.append({
                    'audio_path': str(audio_file),
                    'descriptions': descriptions
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
    
    # Sample audio directory
    sample_audio_dir = "/Users/tanis/Documents/beatgen/backend/sample_audio"
    
    # Run evaluation
    results = evaluator.run_evaluation(models_to_test, sample_audio_dir)
    
    # Print detailed results
    print("\n" + "="*60)
    print("CLAP MODEL EVALUATION RESULTS")
    print("="*60)
    
    for model_name, result in results.items():
        print(f"\nModel: {model_name}")
        print(f"Device: {result.get('device', 'unknown')}")
        print(f"Average Similarity: {result.get('avg_similarity', 0):.3f}")
        print(f"Average Inference Time: {result.get('avg_inference_time', 0):.3f}s")
        print(f"Total Evaluation Time: {result.get('total_evaluation_time', 0):.2f}s")
        print(f"Samples Evaluated: {len(result.get('samples', []))}")
        
        if result.get('samples'):
            print(f"\nSample Results:")
            for sample in result['samples'][:3]:  # Show first 3 samples
                filename = Path(sample['audio_path']).name
                print(f"  {filename}: '{sample['best_description']}' (similarity: {sample['best_similarity']:.3f})")
    
    # Recommend best model
    if results:
        best_model = max(results.keys(), key=lambda x: results[x].get('avg_similarity', 0))
        print(f"\n{'='*60}")
        print(f"RECOMMENDED MODEL: {best_model}")
        print(f"Best Average Similarity: {results[best_model].get('avg_similarity', 0):.3f}")
        print(f"Average Inference Time: {results[best_model].get('avg_inference_time', 0):.3f}s")


if __name__ == "__main__":
    main()