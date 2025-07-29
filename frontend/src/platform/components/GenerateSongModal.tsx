import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  X as CloseIcon,
  Music as MusicNoteIcon,
  Play as PlayIcon,
  Square as StopIcon,
  Save as SaveIcon,
} from 'lucide-react';
import { interactWithAssistant, StreamCallbacks } from '../api/assistant';
import { isAuthenticated } from '../auth/auth-utils';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from '@/components/ui/card';
import { useAppTheme } from '../../lib/theme-provider';

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
  const { mode } = useAppTheme();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState(-1);
  const [currentStageText, setCurrentStageText] = useState('');
  const [generatedData, setGeneratedData] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connectionRef = useRef<{ close: () => void } | null>(null);
  const userIsAuthenticated = isAuthenticated();

  // Theme-aware badge styling
  const getBadgeClassName = () => {
    return mode === 'dark' 
      ? 'cursor-pointer border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700 hover:border-gray-500'
      : 'cursor-pointer hover:bg-accent';
  };

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
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MusicNoteIcon className="h-5 w-5" />
            Generate Song
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4"
            onClick={handleClose}
            disabled={isGenerating}
          >
            <CloseIcon className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!generatedData && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Describe your song
                </label>
                <Textarea
                  placeholder="e.g., upbeat rock song about summer, chill lo-fi for studying, energetic electronic dance track..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isGenerating}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium mb-2">Quick Genre Options:</h4>
                  <div className="flex flex-wrap gap-2">
                    {GENRE_SUGGESTIONS.map((genre) => (
                      <Badge
                        key={genre}
                        variant="outline"
                        className={getBadgeClassName()}
                        onClick={() => !isGenerating && handleChipClick(genre, 'genre')}
                      >
                        {genre}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">Mood Options:</h4>
                  <div className="flex flex-wrap gap-2">
                    {MOOD_SUGGESTIONS.map((mood) => (
                      <Badge
                        key={mood}
                        variant="outline"
                        className={getBadgeClassName()}
                        onClick={() => !isGenerating && handleChipClick(mood, 'mood')}
                      >
                        {mood}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </>
        )}

          {isGenerating && (
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold mb-4">Generating your song...</h3>
                
                {/* Simple step indicator */}
                <div className="flex justify-between mb-4">
                  {GENERATION_STEPS.map((step, index) => (
                    <div key={step} className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        index <= generationStage 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {index + 1}
                      </div>
                      <span className="text-xs mt-1 text-center">{step}</span>
                    </div>
                  ))}
                </div>
                
                <Progress value={(generationStage + 1) / GENERATION_STEPS.length * 100} className="mb-2" />
                <p className="text-sm text-muted-foreground text-center">
                  {currentStageText || 'This usually takes 30-60 seconds'}
                </p>
              </CardContent>
            </Card>
          )}

          {generatedData && (
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  Song generated successfully!
                </AlertDescription>
              </Alert>
              
              <Card>
                <CardContent className="pt-6">
                  <h3 className="text-lg font-semibold mb-3">Generated Song Details:</h3>
                  <div className="space-y-1 text-sm">
                    <p>Tempo: {generatedData.tempo} BPM</p>
                    <p>Key: {generatedData.key}</p>
                    <p>Tracks: {generatedData.tracks.join(', ')}</p>
                    <p>Duration: {generatedData.duration}</p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handlePlayPreview}
                >
                  {isPlaying ? (
                    <><StopIcon className="h-4 w-4 mr-2" />Stop Preview</>
                  ) : (
                    <><PlayIcon className="h-4 w-4 mr-2" />Play Preview</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="ghost"
            onClick={handleClose}
            disabled={isGenerating}
          >
            {generatedData ? 'Close' : 'Cancel'}
          </Button>
          
          {!generatedData && (
            <Button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
            >
              <MusicNoteIcon className="h-4 w-4 mr-2" />
              {isGenerating ? 'Generating...' : 'Generate Song'}
            </Button>
          )}

          {generatedData && (
            <Button
              onClick={handleSaveAsProject}
            >
              <SaveIcon className="h-4 w-4 mr-2" />
              {userIsAuthenticated ? 'Save as Project' : 'Sign Up to Save'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}