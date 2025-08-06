import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { AudioTrackRead } from '../../../platform/types/dto/track_models/audio_track';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { downloadAudioTrackFile } from '../../../platform/api/sounds';
import { interactWithAssistant, StreamCallbacks } from '../../../platform/api/assistant';
import { useAppTheme } from '../../../lib/theme-provider';
import SampleManager from '../../core/samples/sampleManager';
import { db } from '../../core/db/dexie-client';
import TrackListPanel from './components/TrackListPanel';
import AudioGenerationPanel from './components/AudioGenerationPanel';
import FileUploadPanel from './components/FileUploadPanel';

interface AudioTracksModalProps {
  open: boolean;
  onClose: () => void;
  onSelectTrack: (track: AudioTrackRead) => void;
  onFileUpload?: (file: File) => void;
  useUiMode?: boolean;
  uploadModeOnly?: boolean;
}

export const AudioTracksModal: React.FC<AudioTracksModalProps> = ({
  open,
  onClose,
  onSelectTrack,
  onFileUpload,
  useUiMode = false,
  uploadModeOnly = false
}) => {
  const { mode: uiMode, studioMode } = useAppTheme();
  const effectiveMode = useUiMode ? uiMode : studioMode;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(uploadModeOnly ? 'upload' : 'my-tracks');
  
  // Generation state
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('vertex-ai/lyria2');
  const [bpm, setBpm] = useState(120);
  const [keySignature, setKeySignature] = useState('C Major');
  const [bars, setBars] = useState(4);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [streamConnection, setStreamConnection] = useState<{ close: () => void } | null>(null);
  const [generatedTrack, setGeneratedTrack] = useState<AudioTrackRead | null>(null);
  const [generatedAudioBlob, setGeneratedAudioBlob] = useState<Blob | null>(null);

  // Calculate duration from BPM and bars (assumes 4/4 time signature)
  const calculateDuration = (bpm: number, bars: number): number => {
    const beatsPerBar = 4;
    const totalBeats = bars * beatsPerBar;
    const durationSeconds = (totalBeats / bpm) * 60;
    return Math.ceil(durationSeconds);
  };

  const duration = calculateDuration(bpm, bars);

  const handleTrackSelect = (track: AudioTrackRead) => {
    onSelectTrack(track);
    onClose();
  };

  const handleGenerateAudio = async () => {
    if (!generatePrompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setGenerationStatus('Initializing audio generation...');
    setGenerationError(null);

    try {
      const streamCallbacks: StreamCallbacks = {
        onConnected: () => {
          setGenerationStatus('Connected to generation service...');
        },
        onStage: (stage) => {
          setGenerationStatus(stage.description || `Stage: ${stage.name}`);
        },
        onStatus: (status) => {
          setGenerationStatus(status.message || 'Processing...');
        },
        onAction: async (action) => {
          if (action.type === 'add_audio_track' && action.data?.track_data) {
            const trackData = action.data.track_data as AudioTrackRead;
            
            if (trackData.audio_file_storage_key) {
              try {
                setGenerationStatus('Downloading audio file...');
                // Use storage_type if available from the track data
                const audioBlob = await downloadAudioTrackFile(
                  trackData.audio_file_storage_key,
                  (trackData as any).storage_type
                );
                
                const sampleManager = SampleManager.getInstance(db);
                await sampleManager.getSampleBlob(
                  trackData.id, 
                  trackData.audio_file_storage_key, 
                  'audio_track', 
                  trackData.name,
                  (trackData as any).storage_type
                );
                
                setGeneratedTrack(trackData);
                setGeneratedAudioBlob(audioBlob);
                setGenerationStatus('Audio generated successfully!');
              } catch (error) {
                console.error('Failed to download generated audio file:', error);
                setGenerationError('Failed to download audio file');
                return;
              }
            }
          }
        },
        onComplete: () => {
          setIsGenerating(false);
          setGenerationStatus('Generation completed!');
          queryClient.invalidateQueries({ queryKey: ['audioTracks'] });
        },
        onError: (error) => {
          setIsGenerating(false);
          setGenerationError(error.message || 'Failed to generate audio');
          setGenerationStatus('');
        }
      };

      const { close } = await interactWithAssistant(
        {
          prompt: generatePrompt,
          mode: 'generate-audio',
          model: selectedModel,
          context: {
            bpm: bpm,
            time_signature: { numerator: 4, denominator: 4 },
            key_signature: keySignature,
            bars: bars,
            duration: duration
          }
        },
        streamCallbacks
      );

      setStreamConnection({ close });
    } catch (error) {
      setIsGenerating(false);
      setGenerationError('Failed to start audio generation');
      setGenerationStatus('');
      console.error('Generation error:', error);
    }
  };

  const handleCancelGeneration = () => {
    if (streamConnection) {
      streamConnection.close();
      setStreamConnection(null);
    }
    setIsGenerating(false);
    setGenerationStatus('');
    setGenerationError(null);
  };

  const handleUseAudio = () => {
    if (generatedTrack) {
      onSelectTrack(generatedTrack);
      onClose();
    }
  };

  const handleResetGeneration = () => {
    setGeneratedTrack(null);
    setGeneratedAudioBlob(null);
    setGenerationStatus('');
    setGenerationError(null);
    setGeneratePrompt('');
  };

  // Apply the appropriate dark mode to document element when dialog is open
  useEffect(() => {
    if (!open) return;
    
    const root = window.document.documentElement;
    const originalHasDark = root.classList.contains('dark');
    
    if (effectiveMode === 'dark' && !originalHasDark) {
      root.classList.add('dark');
    } else if (effectiveMode === 'light' && originalHasDark) {
      root.classList.remove('dark');
    }
    
    return () => {
      // Restore after dialog closes
      setTimeout(() => {
        const root = window.document.documentElement;
        const currentHasDark = root.classList.contains('dark');
        const shouldHaveDark = effectiveMode === 'dark';
        
        if (shouldHaveDark && !currentHasDark) {
          root.classList.add('dark');
        } else if (!shouldHaveDark && currentHasDark) {
          root.classList.remove('dark');
        }
      }, 200);
    };
  }, [open, effectiveMode]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-[95vw] h-[85vh] p-0 flex flex-col shadow-2xl rounded-lg">
        <DialogHeader className="p-2">
          <div className="flex items-center justify-between pl-4 pt-8 pr-4">
            <DialogTitle className="text-2xl font-bold">
              Audio Tracks
            </DialogTitle>
            {onFileUpload && activeTab === 'my-tracks' && (
              <Button
                onClick={() => document.getElementById('audio-upload')?.click()}
                className="flex items-center gap-2"
                size="sm"
              >
                <Upload className="h-4 w-4" />
                Import Audio
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-grow flex flex-col overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <div className="px-6 pb-0">
              <TabsList className="grid w-full grid-cols-2">
                {uploadModeOnly ? (
                  <>
                    <TabsTrigger value="upload">Upload Audio</TabsTrigger>
                    <TabsTrigger value="generate">Generate Audio</TabsTrigger>
                  </>
                ) : (
                  <>
                    <TabsTrigger value="my-tracks">My Audio Tracks</TabsTrigger>
                    <TabsTrigger value="generate">Generate Audio</TabsTrigger>
                  </>
                )}
              </TabsList>
            </div>

            {!uploadModeOnly && (
              <TabsContent value="my-tracks" className="flex-grow overflow-hidden m-0">
                <TrackListPanel onSelectTrack={handleTrackSelect} />
              </TabsContent>
            )}

            {uploadModeOnly && (
              <TabsContent value="upload" className="flex-grow overflow-hidden m-0">
                <FileUploadPanel onFileUpload={onFileUpload} />
              </TabsContent>
            )}

            <TabsContent value="generate" className="flex-grow overflow-hidden m-0">
              <AudioGenerationPanel
                generatePrompt={generatePrompt}
                setGeneratePrompt={setGeneratePrompt}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                bpm={bpm}
                setBpm={setBpm}
                keySignature={keySignature}
                setKeySignature={setKeySignature}
                bars={bars}
                setBars={setBars}
                duration={duration}
                isGenerating={isGenerating}
                generationStatus={generationStatus}
                generationError={generationError}
                generatedTrack={generatedTrack}
                generatedAudioBlob={generatedAudioBlob}
                onGenerateAudio={handleGenerateAudio}
                onCancelGeneration={handleCancelGeneration}
                onUseAudio={handleUseAudio}
                onResetGeneration={handleResetGeneration}
                useUiMode={useUiMode}
                effectiveMode={effectiveMode}
              />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};