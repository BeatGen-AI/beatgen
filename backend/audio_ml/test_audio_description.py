"""
Tests for Audio Description Service

This module contains tests for the audio description generation pipeline.
"""

import pytest
import os
import tempfile
import numpy as np
from unittest.mock import Mock, patch, MagicMock

from audio_description_service import AudioDescriptionService, AudioDescriptionResult
from model_evaluation import CLAPModelEvaluator


class TestAudioDescriptionService:
    """Test cases for AudioDescriptionService"""

    def setup_method(self):
        """Set up test fixtures"""
        self.service = AudioDescriptionService()

    def test_device_detection(self):
        """Test device detection logic"""
        device = self.service._get_device()
        assert device in ["cuda", "mps", "cpu"]

    def test_cache_dir_creation(self):
        """Test cache directory creation"""
        self.service._ensure_cache_dir()
        assert os.path.exists(self.service.cache_dir)

    def test_audio_type_classification(self):
        """Test audio type classification from file paths"""
        test_cases = [
            ("kick_drum.wav", "drums"),
            ("snare_hit.mp3", "drums"),
            ("hihat_closed.wav", "drums"),
            ("vocal_melody.wav", "vocals"),
            ("piano_chord.wav", "instruments"),
            ("guitar_strum.wav", "instruments"),
            ("random_audio.wav", "general"),
        ]
        
        for file_path, expected_type in test_cases:
            result = self.service.classify_audio_type(file_path)
            assert result == expected_type

    def test_description_candidates_retrieval(self):
        """Test description candidates for different audio types"""
        # Test drums
        drum_candidates = self.service.get_description_candidates("drums")
        assert "kick drum hit" in drum_candidates
        assert "snare drum hit" in drum_candidates
        
        # Test instruments
        instrument_candidates = self.service.get_description_candidates("instruments")
        assert "piano melody" in instrument_candidates
        assert "guitar chord" in instrument_candidates
        
        # Test vocals
        vocal_candidates = self.service.get_description_candidates("vocals")
        assert "vocal melody" in vocal_candidates
        assert "vocal harmony" in vocal_candidates
        
        # Test general
        general_candidates = self.service.get_description_candidates("general")
        assert "musical note" in general_candidates

    def test_invalid_audio_type(self):
        """Test handling of invalid audio types"""
        candidates = self.service.get_description_candidates("invalid_type")
        # Should return all candidates
        assert len(candidates) > 0

    @patch('librosa.load')
    def test_audio_loading(self, mock_librosa_load):
        """Test audio file loading"""
        # Mock librosa.load to return test data
        mock_audio = np.random.random(44100)  # 1 second at 44.1kHz
        mock_librosa_load.return_value = (mock_audio, 44100)
        
        with tempfile.NamedTemporaryFile(suffix='.wav') as temp_file:
            temp_file.write(b'fake audio data')
            temp_file.flush()
            
            result = self.service.load_audio(temp_file.name)
            assert result is not None
            assert isinstance(result, np.ndarray)
            assert len(result) >= int(0.5 * 48000)  # Minimum length check

    def test_audio_loading_nonexistent_file(self):
        """Test audio loading with non-existent file"""
        result = self.service.load_audio("nonexistent_file.wav")
        assert result is None

    @patch('sentence_transformers.SentenceTransformer')
    def test_model_initialization(self, mock_sentence_transformer):
        """Test model initialization"""
        mock_model = Mock()
        mock_sentence_transformer.return_value = mock_model
        
        service = AudioDescriptionService()
        result = service.initialize_model()
        
        assert result is True
        assert service.model is not None

    @patch('sentence_transformers.SentenceTransformer')
    def test_model_initialization_failure(self, mock_sentence_transformer):
        """Test model initialization failure"""
        mock_sentence_transformer.side_effect = Exception("Model load failed")
        
        service = AudioDescriptionService()
        result = service.initialize_model()
        
        assert result is False
        assert service.model is None

    def test_model_info(self):
        """Test model information retrieval"""
        info = self.service.get_model_info()
        
        assert "model_name" in info
        assert "device" in info
        assert "cache_dir" in info
        assert "is_initialized" in info
        assert info["model_name"] == "laion/clap-htsat-unfused"

    @patch.object(AudioDescriptionService, 'initialize_model')
    @patch.object(AudioDescriptionService, 'load_audio')
    @patch.object(AudioDescriptionService, 'generate_audio_embedding')
    @patch.object(AudioDescriptionService, 'generate_text_embeddings')
    @patch.object(AudioDescriptionService, 'compute_similarities')
    def test_description_generation(self, mock_similarities, mock_text_embeddings, 
                                  mock_audio_embedding, mock_load_audio, mock_init_model):
        """Test complete description generation pipeline"""
        # Mock all the dependencies
        mock_init_model.return_value = True
        mock_load_audio.return_value = np.random.random(44100)
        mock_audio_embedding.return_value = np.random.random(512)
        mock_text_embeddings.return_value = np.random.random((12, 512))
        mock_similarities.return_value = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05, 0.04, 0.03]
        
        with tempfile.NamedTemporaryFile(suffix='.wav') as temp_file:
            temp_file.write(b'fake audio data')
            temp_file.flush()
            
            result = self.service.generate_description(temp_file.name)
            
            assert result is not None
            assert isinstance(result, AudioDescriptionResult)
            assert result.best_description is not None
            assert result.confidence_score > 0
            assert len(result.descriptions) > 0
            assert result.inference_time > 0

    def test_description_generation_nonexistent_file(self):
        """Test description generation with non-existent file"""
        result = self.service.generate_description("nonexistent_file.wav")
        assert result is None

    @patch.object(AudioDescriptionService, 'generate_description')
    def test_batch_description_generation(self, mock_generate):
        """Test batch description generation"""
        mock_result = AudioDescriptionResult(
            audio_path="test.wav",
            descriptions=[{"text": "test", "confidence": 0.9, "rank": 1}],
            best_description="test",
            confidence_score=0.9,
            inference_time=1.0,
            model_used="test_model"
        )
        mock_generate.return_value = mock_result
        
        audio_paths = ["test1.wav", "test2.wav", "test3.wav"]
        results = self.service.generate_descriptions_batch(audio_paths)
        
        assert len(results) == 3
        assert all(isinstance(r, AudioDescriptionResult) for r in results)


class TestCLAPModelEvaluator:
    """Test cases for CLAPModelEvaluator"""

    def setup_method(self):
        """Set up test fixtures"""
        self.evaluator = CLAPModelEvaluator()

    def test_device_detection(self):
        """Test device detection"""
        device = self.evaluator._get_device()
        assert device in ["cuda", "mps", "cpu"]

    def test_similarity_computation(self):
        """Test similarity computation"""
        # Create mock embeddings
        audio_embedding = np.random.random(512)
        text_embedding = np.random.random(512)
        
        similarity = self.evaluator.compute_similarity(audio_embedding, text_embedding)
        
        assert isinstance(similarity, float)
        assert -1 <= similarity <= 1

    def test_sample_data_preparation(self):
        """Test sample data preparation"""
        with tempfile.TemporaryDirectory() as temp_dir:
            # Create dummy audio files
            for name in ["kick.wav", "snare.wav", "hihat.wav"]:
                dummy_file = os.path.join(temp_dir, name)
                with open(dummy_file, 'wb') as f:
                    f.write(b'dummy audio data')
            
            samples = self.evaluator._prepare_sample_data(temp_dir)
            
            assert len(samples) == 3
            assert all("audio_path" in sample for sample in samples)
            assert all("descriptions" in sample for sample in samples)

    def test_sample_data_preparation_empty_dir(self):
        """Test sample data preparation with empty directory"""
        with tempfile.TemporaryDirectory() as temp_dir:
            samples = self.evaluator._prepare_sample_data(temp_dir)
            assert len(samples) == 0

    def test_sample_data_preparation_nonexistent_dir(self):
        """Test sample data preparation with non-existent directory"""
        samples = self.evaluator._prepare_sample_data("/nonexistent/directory")
        assert len(samples) == 0


class TestIntegration:
    """Integration tests for the audio description pipeline"""

    def test_service_and_evaluator_compatibility(self):
        """Test that service and evaluator work together"""
        service = AudioDescriptionService()
        evaluator = CLAPModelEvaluator()
        
        # Both should detect the same device
        assert service.device == evaluator.device

    @patch('sentence_transformers.SentenceTransformer')
    def test_end_to_end_workflow(self, mock_sentence_transformer):
        """Test end-to-end workflow with mocked dependencies"""
        # Mock the sentence transformer
        mock_model = Mock()
        mock_model.encode.side_effect = lambda x: np.random.random(512) if isinstance(x, str) else np.random.random(512)
        mock_sentence_transformer.return_value = mock_model
        
        service = AudioDescriptionService()
        
        # Test model initialization
        assert service.initialize_model() is True
        
        # Test model info
        info = service.get_model_info()
        assert info["is_initialized"] is True


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"])