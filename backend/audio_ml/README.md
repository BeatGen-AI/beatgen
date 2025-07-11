# Audio ML - CLAP Model Integration

This module implements audio description generation using CLAP (Contrastive Language-Audio Pre-training) models for the BeatGen application.

## Features

- **Automatic Audio Description**: Generates semantic descriptions for uploaded audio files
- **CLAP Model Integration**: Uses state-of-the-art CLAP models for audio-text understanding
- **Multiple Model Support**: Supports both unfused and fused CLAP model variants
- **Confidence Scoring**: Provides confidence scores for generated descriptions
- **API Integration**: RESTful endpoints for description generation and management
- **Frontend Display**: Audio descriptions shown in the UI with confidence scores

## Components

### Core Services

- **`audio_description_service.py`**: Main service for generating audio descriptions
- **`model_evaluation.py`**: Tools for evaluating and comparing CLAP models

### API Endpoints

- **`/audio-descriptions/audio-tracks/{id}/generate-description`**: Generate description for an audio track
- **`/audio-descriptions/audio-tracks/{id}/regenerate-description`**: Regenerate existing description
- **`/audio-descriptions/audio-tracks/{id}/description`**: Get audio description
- **`/audio-descriptions/audio-tracks/{id}/description`**: Delete audio description (DELETE)
- **`/audio-descriptions/models`**: Get available model information

### Database Schema

The `AudioTrack` model includes these description fields:
- `description`: Primary audio description
- `description_confidence`: Confidence score (0.0 to 1.0)
- `description_model`: Model used for generation
- `description_candidates`: Top candidate descriptions with scores
- `description_embedding`: Audio embedding vector
- `description_generated_at`: Generation timestamp

## Usage

### Basic Usage

```python
from audio_ml.audio_description_service import AudioDescriptionService

# Initialize service
service = AudioDescriptionService()

# Generate description for an audio file
result = service.generate_description("/path/to/audio.wav")

if result:
    print(f"Description: {result.best_description}")
    print(f"Confidence: {result.confidence_score}")
```

### Model Evaluation

```python
from audio_ml.model_evaluation import CLAPModelEvaluator

# Initialize evaluator
evaluator = CLAPModelEvaluator()

# Evaluate models on sample audio
models = ["laion/clap-htsat-unfused", "laion/clap-htsat-fused"]
results = evaluator.run_evaluation(models, "/path/to/sample/audio")
```

### API Usage

```bash
# Generate description for audio track
curl -X POST "http://localhost:8000/audio-descriptions/audio-tracks/{track_id}/generate-description" \
  -H "Authorization: Bearer {token}"

# Get description
curl -X GET "http://localhost:8000/audio-descriptions/audio-tracks/{track_id}/description" \
  -H "Authorization: Bearer {token}"
```

## Model Information

### Supported Models

1. **laion/clap-htsat-unfused** (Recommended)
   - Lighter weight
   - Good performance
   - Faster inference

2. **laion/clap-htsat-fused**
   - Higher quality
   - More compute intensive
   - Better for accuracy-critical applications

### Description Categories

The service automatically categorizes audio and provides relevant descriptions:

- **Drums**: kick drum, snare drum, hi-hat, cymbal, etc.
- **Instruments**: piano, guitar, bass, synthesizer, etc.
- **Vocals**: vocal melody, harmony, rap, etc.
- **General**: musical phrases, harmonic sounds, etc.

## Integration

### Automatic Description Generation

Audio descriptions are automatically generated when:
1. New audio tracks are uploaded
2. The `generate_description` parameter is True (default)
3. The audio file is successfully processed

### Frontend Display

Audio descriptions appear in the audio track cards with:
- Description badge
- Confidence percentage
- Model name (for debugging)

## Testing

Run the test suite:

```bash
python audio_ml/run_tests.py
```

Test coverage includes:
- Service functionality
- Model evaluation
- Audio processing
- API endpoints
- Integration tests

## Performance Considerations

- **Model Loading**: Models are loaded on first use and cached
- **Inference Time**: Typically 1-3 seconds per audio file
- **Memory Usage**: ~2GB RAM for model + audio processing
- **Device Support**: Automatic detection of CUDA/MPS/CPU

## Error Handling

- Graceful fallbacks for model loading failures
- Audio file validation and error reporting
- Confidence thresholds for quality control
- Comprehensive logging for debugging

## Future Enhancements

- [ ] Support for additional CLAP model variants
- [ ] Batch processing for multiple audio files
- [ ] Custom model fine-tuning capabilities
- [ ] Real-time audio description streaming
- [ ] Integration with audio similarity search
- [ ] Multi-language description support

## Dependencies

- `torch>=2.0.0`: PyTorch for model inference
- `transformers>=4.35.0`: Hugging Face transformers
- `sentence-transformers>=2.2.0`: Sentence transformers for CLAP
- `librosa>=0.11.0`: Audio processing
- `numpy>=1.26.4`: Numerical operations

## License

This module is part of the BeatGen application and follows the same licensing terms.