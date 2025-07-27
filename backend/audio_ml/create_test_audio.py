"""
Create Test Audio Files

This script creates simple test audio files for CLAP model evaluation.
"""

import numpy as np
import soundfile as sf
import os

def create_test_audio_files(output_dir: str):
    """Create test audio files for model evaluation."""
    os.makedirs(output_dir, exist_ok=True)
    
    sample_rate = 44100
    duration = 2.0  # 2 seconds
    t = np.linspace(0, duration, int(sample_rate * duration))
    
    # 1. Kick drum simulation (low frequency sine wave with decay)
    kick_freq = 60  # Hz
    kick_audio = np.sin(2 * np.pi * kick_freq * t) * np.exp(-t * 3)
    kick_audio = kick_audio * 0.5
    sf.write(os.path.join(output_dir, "kick_drum.wav"), kick_audio, sample_rate)
    
    # 2. Snare drum simulation (noise burst with envelope)
    snare_audio = np.random.normal(0, 0.1, len(t))
    envelope = np.exp(-t * 10)
    snare_audio = snare_audio * envelope * 0.3
    sf.write(os.path.join(output_dir, "snare_drum.wav"), snare_audio, sample_rate)
    
    # 3. Hi-hat simulation (high frequency noise)
    hihat_audio = np.random.normal(0, 0.05, len(t))
    # High-pass filter simulation
    hihat_audio = hihat_audio * np.exp(-t * 15)
    sf.write(os.path.join(output_dir, "hihat.wav"), hihat_audio, sample_rate)
    
    # 4. Piano note simulation (multiple harmonics)
    piano_fund = 261.63  # C4
    piano_audio = (np.sin(2 * np.pi * piano_fund * t) + 
                   0.5 * np.sin(2 * np.pi * piano_fund * 2 * t) + 
                   0.25 * np.sin(2 * np.pi * piano_fund * 3 * t))
    piano_audio = piano_audio * np.exp(-t * 1) * 0.3
    sf.write(os.path.join(output_dir, "piano_note.wav"), piano_audio, sample_rate)
    
    # 5. Bass note simulation (low frequency)
    bass_freq = 82.41  # E2
    bass_audio = np.sin(2 * np.pi * bass_freq * t) * np.exp(-t * 0.5)
    bass_audio = bass_audio * 0.4
    sf.write(os.path.join(output_dir, "bass_note.wav"), bass_audio, sample_rate)
    
    print(f"Created test audio files in: {output_dir}")
    print("Files created:")
    for file in os.listdir(output_dir):
        if file.endswith('.wav'):
            print(f"  - {file}")

if __name__ == "__main__":
    output_dir = "/Users/tanis/Documents/beatgen/backend/sample_audio"
    create_test_audio_files(output_dir)