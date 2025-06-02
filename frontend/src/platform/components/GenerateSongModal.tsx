import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Chip,
  Typography,
  LinearProgress,
  Stepper,
  Step,
  StepLabel,
  Alert,
  IconButton,
} from '@mui/material';
import {
  Close as CloseIcon,
  MusicNote as MusicNoteIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { interactWithAssistant, StreamCallbacks } from '../api/assistant';
import { isAuthenticated } from '../auth/auth-utils';

interface GenerateSongModalProps {
  open: boolean;
  onClose: () => void;
  onSaveAsProject?: (generatedData: any) => void;
}

const GENERATION_STEPS = [
  'Research',
  'Parameters',
  'Instruments', 
  'Generation',
  'Complete'
];

const getStageIndex = (stageName: string): number => {
  const name = stageName.toLowerCase();
  
  if (name.includes('research') || name.includes('starting') || name.includes('analyzing') || name.includes('loading available instruments')) return 0;
  if (name.includes('parameters') || name.includes('determining')) return 1;
  if (name.includes('instruments') || name.includes('selecting')) return 2;
  if (name.includes('generating') || name.includes('creating') || name.includes('composing')) return 3;
  if (name.includes('complete') || name.includes('finalizing')) return 4;
  
  return -1; // No match, keep current stage
};

const GENRE_SUGGESTIONS = ['Pop', 'Rock', 'Electronic', 'Jazz', 'Classical', 'Hip-Hop', 'Country', 'R&B'];
const MOOD_SUGGESTIONS = ['Upbeat', 'Chill', 'Energetic', 'Melancholic', 'Dreamy', 'Intense', 'Relaxing'];

export default function GenerateSongModal({ open, onClose, onSaveAsProject }: GenerateSongModalProps) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState(-1);
  const [currentStageText, setCurrentStageText] = useState('');
  const [generatedData, setGeneratedData] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connectionRef = useRef<{ close: () => void } | null>(null);
  const userIsAuthenticated = isAuthenticated();

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setGenerationStage(0);
    setCurrentStageText('Initializing...');
    setError(null);
    setGeneratedData(null);

    // Extract genre and mood from prompt or use selected chips
    const promptLower = prompt.toLowerCase();
    const detectedGenre = GENRE_SUGGESTIONS.find(g => promptLower.includes(g.toLowerCase()));
    const detectedMood = MOOD_SUGGESTIONS.find(m => promptLower.includes(m.toLowerCase()));

    // Use assistant API directly with auto project creation
    const assistantCallbacks: StreamCallbacks = {
        onConnected: () => {
          console.log('Connected to assistant');
        },
        onStage: (stage) => {
          console.log('Assistant stage update:', stage);
          setCurrentStageText(stage.description || stage.name);
          
          const stageIndex = getStageIndex(stage.name);
          if (stageIndex !== -1) {
            setGenerationStage(stageIndex);
          }
        },
        onStatus: (status) => {
          console.log('Assistant status update:', status);
          setCurrentStageText(status.message);
        },
        onAction: (action) => {
          console.log('Assistant action received:', action);
        },
        onComplete: (response) => {
          console.log('Assistant generation complete:', response);
          setGeneratedData({
            response: response.response || 'Song generated successfully!',
            tracks: response.tracks || [],
            actions: response.actions || [],
            tempo: response.tempo || 120,
            key: response.key || 'C major',
            duration: '2:30'
          });
          setIsGenerating(false);
          setGenerationStage(GENERATION_STEPS.length - 1);
        },
        onError: (error) => {
          console.error('Assistant generation error:', error);
          setError(error.message || 'Failed to generate song. Please try again.');
          setIsGenerating(false);
          setGenerationStage(-1);
        },
        onCancelled: () => {
          console.log('Assistant generation cancelled');
          setIsGenerating(false);
          setGenerationStage(-1);
        }
      };

      try {
        const connection = await interactWithAssistant({
          prompt: prompt,
          mode: 'generate',
          model: 'Claude 4 Sonnet',
          context: {
            source: 'homepage_generation',
            auto_create_project: userIsAuthenticated // Create project automatically if authenticated
          }
        }, assistantCallbacks);
        
        connectionRef.current = connection;
      } catch (assistantErr) {
        console.error('Failed to start assistant generation:', assistantErr);
        setError('Failed to start generation. Please try again.');
        setIsGenerating(false);
        setGenerationStage(-1);
      }
  };

  const handlePlayPreview = () => {
    if (!generatedData) return;
    
    if (isPlaying) {
      // Stop preview
      setIsPlaying(false);
      // TODO: Stop actual audio playback
    } else {
      // Start preview
      setIsPlaying(true);
      
      // For now, just simulate playback for 10 seconds
      // TODO: Implement real MIDI preview using studio audio engine
      setTimeout(() => {
        setIsPlaying(false);
      }, 10000);
      
      console.log('Playing preview for generated data:', generatedData);
    }
  };

  const handleSaveAsProject = () => {
    if (generatedData && onSaveAsProject) {
      onSaveAsProject(generatedData);
      onClose();
    }
  };

  const handleChipClick = (text: string, type: 'genre' | 'mood') => {
    const addition = type === 'genre' ? `${text.toLowerCase()} song` : `${text.toLowerCase()} mood`;
    setPrompt(prev => prev ? `${prev}, ${addition}` : addition);
  };

  const handleClose = () => {
    // Cancel any ongoing generation
    if (connectionRef.current) {
      connectionRef.current.close();
      connectionRef.current = null;
    }
    
    if (!isGenerating) {
      setPrompt('');
      setGenerationStage(-1);
      setCurrentStageText('');
      setGeneratedData(null);
      setIsPlaying(false);
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2, maxHeight: '90vh' }
      }}
    >
      <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MusicNoteIcon />
          <Typography variant="h6">Generate Song</Typography>
        </Box>
        <IconButton
          aria-label="close"
          onClick={handleClose}
          disabled={isGenerating}
          sx={{ color: (theme) => theme.palette.grey[500] }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {!generatedData && (
          <>
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Describe your song"
              placeholder="e.g., upbeat rock song about summer, chill lo-fi for studying, energetic electronic dance track..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
              sx={{ mb: 3 }}
            />

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Quick Genre Options:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                {GENRE_SUGGESTIONS.map((genre) => (
                  <Chip
                    key={genre}
                    label={genre}
                    onClick={() => handleChipClick(genre, 'genre')}
                    disabled={isGenerating}
                    variant="outlined"
                    size="small"
                  />
                ))}
              </Box>

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Mood Options:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {MOOD_SUGGESTIONS.map((mood) => (
                  <Chip
                    key={mood}
                    label={mood}
                    onClick={() => handleChipClick(mood, 'mood')}
                    disabled={isGenerating}
                    variant="outlined"
                    size="small"
                  />
                ))}
              </Box>
            </Box>
          </>
        )}

        {isGenerating && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              Generating your song...
            </Typography>
            <Stepper activeStep={generationStage} alternativeLabel>
              {GENERATION_STEPS.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
            <LinearProgress sx={{ mt: 2 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
              {currentStageText || 'This usually takes 30-60 seconds'}
            </Typography>
          </Box>
        )}

        {generatedData && (
          <Box>
            <Alert severity="success" sx={{ mb: 2 }}>
              Song generated successfully!
            </Alert>
            
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>Generated Song Details:</Typography>
              <Typography variant="body2">Tempo: {generatedData.tempo} BPM</Typography>
              <Typography variant="body2">Key: {generatedData.key}</Typography>
              <Typography variant="body2">Tracks: {generatedData.tracks.join(', ')}</Typography>
              <Typography variant="body2">Duration: {generatedData.duration}</Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Button
                variant="outlined"
                startIcon={isPlaying ? <StopIcon /> : <PlayIcon />}
                onClick={handlePlayPreview}
              >
                {isPlaying ? 'Stop Preview' : 'Play Preview'}
              </Button>
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button 
          onClick={handleClose}
          disabled={isGenerating}
        >
          {generatedData ? 'Close' : 'Cancel'}
        </Button>
        
        {!generatedData && (
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            startIcon={<MusicNoteIcon />}
          >
            {isGenerating ? 'Generating...' : 'Generate Song'}
          </Button>
        )}

        {generatedData && (
          <Button
            variant="contained"
            onClick={handleSaveAsProject}
            startIcon={<SaveIcon />}
          >
            {userIsAuthenticated ? 'Save as Project' : 'Sign Up to Save'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}