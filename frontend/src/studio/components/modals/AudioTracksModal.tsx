import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Music, Loader2, Upload, Send } from 'lucide-react';
import { AudioTrackRead } from '../../../platform/types/dto/track_models/audio_track';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { getSoundsPaginated, downloadAudioTrackFile } from '../../../platform/api/sounds';
import { db } from '../../core/db/dexie-client';
import { cn } from '@/lib/utils';
import { interactWithAssistant, StreamCallbacks } from '../../../platform/api/assistant';
import GenerationPromptControl from '../shared/GenerationPromptControl';
import AudioPlayer from '../shared/AudioPlayer';
import { useAppTheme } from '../../../lib/theme-provider';
import SampleManager from '../../core/samples/sampleManager';
import AudioGenerationModelMenu from '../ai-assistant/AudioGenerationModelMenu';
import KeySelectorMenu from '../ai-assistant/KeySelectorMenu';
import BPMSelector from '../ai-assistant/BPMSelector';
import BarSelector from '../ai-assistant/BarSelector';

// TrackCard component for displaying individual audio tracks
interface TrackCardProps {
  track: AudioTrackRead;
  onClick: () => void;
}

const TrackCard: React.FC<TrackCardProps> = ({
  track,
  onClick,
}) => {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  // Download and cache the audio file
  const downloadAndCacheAudio = useCallback(async () => {
    if (!track.audio_file_storage_key || audioBlob) return;

    setIsDownloading(true);
    try {
      // Check if we already have this file in IndexedDB
      const existingFile = await db.getAudioFile(track.id);
      if (existingFile) {
        setAudioBlob(existingFile.data);
        return;
      }

      // Download from remote storage
      const blob = await downloadAudioTrackFile(track.audio_file_storage_key);
      
      // Store in IndexedDB for future use (upsert to handle existing keys)
      const file = new File([blob], track.name, { type: blob.type });
      await db.upsertAudioFile(track.id, file, track.audio_file_duration);
      
      setAudioBlob(blob);
    } catch (error) {
      console.error('Failed to download audio track:', error);
    } finally {
      setIsDownloading(false);
    }
  }, [track.id, track.audio_file_storage_key, track.name, track.audio_file_duration, audioBlob]);

  // Auto-download when component mounts
  useEffect(() => {
    downloadAndCacheAudio();
  }, [downloadAndCacheAudio]);

  return (
    <div 
      className={cn(
        "rounded-lg overflow-hidden transition-all duration-150 cursor-pointer hover:shadow-md hover:border-primary border bg-card",
        "p-3"
      )}
      onClick={onClick}
    >
      {/* Track Name */}
      <div className="mb-2">
        <h3 className="text-sm font-medium text-foreground truncate">
          {track.name}
        </h3>
      </div>
      
      <div className="flex items-start justify-between mb-2">
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {track.created_at ? new Date(track.created_at).toLocaleDateString() : 'Unknown date'}
            </span>
            {track.audio_file_duration > 0 && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">
                  {formatDuration(track.audio_file_duration)}
                </span>
              </>
            )}
            {track.audio_file_size && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(track.audio_file_size)}
                </span>
              </>
            )}
            
            {/* Format and Sample Rate */}
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
              <Music className="w-2.5 h-2.5 mr-1" />
              {track.audio_file_format?.toUpperCase() || 'AUDIO'}
              {track.audio_file_sample_rate && ` • ${(track.audio_file_sample_rate / 1000).toFixed(0)}kHz`}
            </span>
          </div>
        </div>
      </div>

      {/* AudioPlayer component */}
      <div className="mb-2" onClick={(e) => e.stopPropagation()}>
        {audioBlob ? (
          <AudioPlayer
            audioBlob={audioBlob}
            fileName={`${track.name}.${track.audio_file_format || 'wav'}`}
            className="w-full"
          />
        ) : (
          <div className="w-full h-[80px] flex items-center justify-center bg-muted/20 rounded">
            <span className="text-sm text-muted-foreground">
              {isDownloading ? 'Loading...' : 'Loading audio...'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

interface AudioTracksModalProps {
  open: boolean;
  onClose: () => void;
  onSelectTrack: (track: AudioTrackRead) => void;
  onFileUpload?: (file: File) => void;
  useUiMode?: boolean; // When true, use UI mode; when false, use studio mode
  uploadModeOnly?: boolean; // When true, only show upload tab instead of my tracks
}

export const AudioTracksModal: React.FC<AudioTracksModalProps> = ({
  open,
  onClose,
  onSelectTrack,
  onFileUpload,
  useUiMode = false, // Default to studio mode
  uploadModeOnly = false // Default to show both tabs
}) => {
  const { mode: uiMode, studioMode } = useAppTheme();
  const effectiveMode = useUiMode ? uiMode : studioMode;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(uploadModeOnly ? 'upload' : 'my-tracks');
  const [currentPage, setCurrentPage] = useState(1);
  const [tracks, setTracks] = useState<AudioTrackRead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
  
  const ITEMS_PER_PAGE = 12;

  // Calculate duration from BPM and bars (assumes 4/4 time signature)
  const calculateDuration = (bpm: number, bars: number): number => {
    const beatsPerBar = 4;
    const totalBeats = bars * beatsPerBar;
    const durationSeconds = (totalBeats / bpm) * 60;
    return Math.ceil(durationSeconds); // Round up to nearest second
  };

  const duration = calculateDuration(bpm, bars);

  const handleTrackSelect = (track: AudioTrackRead) => {
    onSelectTrack(track);
    onClose();
  };


  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && onFileUpload) {
      // Handle multiple files
      Array.from(files).forEach((file) => {
        onFileUpload(file);
      });
      
      // Clear the input so the same files can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Refresh the tracks list after upload (only if not in upload mode only)
      if (!uploadModeOnly) {
        setTimeout(() => {
          fetchTracks(1, false);
        }, 1000);
      }
    }
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
            // Convert the track data to AudioTrackRead
            const trackData = action.data.track_data as AudioTrackRead;
            
            // Download and cache the audio file
            if (trackData.audio_file_storage_key) {
              try {
                setGenerationStatus('Downloading audio file...');
                const audioBlob = await downloadAudioTrackFile(trackData.audio_file_storage_key);
                
                // Cache the file
                const sampleManager = SampleManager.getInstance(db);
                await sampleManager.getSampleBlob(
                  trackData.id, 
                  trackData.audio_file_storage_key, 
                  'audio_track', 
                  trackData.name
                );
                
                // Store the generated track and blob for the AudioPlayer
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
          // Refresh tracks list to show the new generated track
          fetchTracks(1, false);
          // Also invalidate the React Query cache to ensure SoundLibrary refreshes
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

  // Generated audio action handlers
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
    // Keep the selected model as-is for user convenience
  };

  // Fetch tracks function
  const fetchTracks = async (page: number, append: boolean = false) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setTracks([]);
    }
    setError(null);

    try {
      const result = await getSoundsPaginated(page, ITEMS_PER_PAGE);
      
      if (append) {
        setTracks(prev => [...prev, ...(result.items || [])]);
        setCurrentPage(prev => prev + 1);
      } else {
        setTracks(result.items || []);
        setCurrentPage(1);
      }
      setTotalItems(result.total_items || 0);
    } catch (err: unknown) {
      console.error("Error fetching audio tracks:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(errorMessage);
      if (!append) {
        setTracks([]);
        setTotalItems(0);
      }
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  // Load more function
  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && currentPage < Math.ceil(totalItems / ITEMS_PER_PAGE)) {
      fetchTracks(currentPage + 1, true);
    }
  }, [isLoadingMore, currentPage, totalItems]);

  // Scroll detection for infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (scrollContainerRef.current && !isLoadingMore && currentPage < Math.ceil(totalItems / ITEMS_PER_PAGE)) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        // Trigger load more when user is 200px from the bottom
        if (scrollHeight - scrollTop <= clientHeight + 200) {
          handleLoadMore();
        }
      }
    };

    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, [isLoadingMore, currentPage, totalItems, handleLoadMore]);

  // Apply the appropriate dark mode to document element when dialog is open
  useEffect(() => {
    if (!open) return;
    
    const root = window.document.documentElement;
    const originalHasDark = root.classList.contains('dark');
    
    // Apply or remove dark class based on effectiveMode immediately
    if (effectiveMode === 'dark' && !originalHasDark) {
      root.classList.add('dark');
    } else if (effectiveMode === 'light' && originalHasDark) {
      root.classList.remove('dark');
    }
    
    // Don't restore immediately on cleanup - let the dialog close first
    return () => {
      // We'll handle restoration when dialog fully closes
    };
  }, [open, effectiveMode]);
  
  // Separate effect to handle restoration after dialog closes
  useEffect(() => {
    if (open) return; // Only run when dialog is closed
    
    // Restore the appropriate mode after animation completes
    const timeoutId = setTimeout(() => {
      const root = window.document.documentElement;
      const currentHasDark = root.classList.contains('dark');
      // Restore to the mode we were using before the dialog opened
      const shouldHaveDark = effectiveMode === 'dark';
      
      if (shouldHaveDark && !currentHasDark) {
        root.classList.add('dark');
      } else if (!shouldHaveDark && currentHasDark) {
        root.classList.remove('dark');
      }
    }, 200); // Wait for closing animation
    
    return () => clearTimeout(timeoutId);
  }, [open, effectiveMode]);

  // Initial load when modal opens (only if not in upload mode only)
  useEffect(() => {
    if (open && !uploadModeOnly) {
      setCurrentPage(1);
      setTracks([]);
      fetchTracks(1, false);
    }
  }, [open, uploadModeOnly]);

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
                onClick={handleImportClick}
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
                <div className="h-full flex flex-col overflow-hidden">
                  <div 
                    ref={scrollContainerRef}
                    className="flex-grow overflow-y-auto p-6 pt-0"
                  >
                    {isLoading && tracks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <Loader2 className="w-12 h-12 animate-spin mb-4" />
                        <p>Loading audio tracks...</p>
                      </div>
                    ) : error ? (
                      <Alert variant="destructive" className="mb-4">
                        Failed to load audio tracks: {error}
                      </Alert>
                    ) : (
                      <>
                        {/* Tracks List */}
                        <div className="space-y-3 pb-4">
                          {tracks.length === 0 && !isLoading ? (
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                              <Music className="w-16 h-16 mb-4" />
                              <p className="text-lg font-medium mb-2">No audio tracks found</p>
                              <p className="text-sm text-center">Upload some audio files to get started</p>
                            </div>
                          ) : (
                            tracks.map((track) => (
                              <TrackCard
                                key={track.id}
                                track={track}
                                onClick={() => handleTrackSelect(track)}
                              />
                            ))
                          )}
                        </div>

                        {/* Loading more indicator */}
                        {isLoadingMore && (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <span className="ml-2 text-muted-foreground">Loading more...</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </TabsContent>
            )}

            {uploadModeOnly && (
              <TabsContent value="upload" className="flex-grow overflow-hidden m-0">
                <div className="h-full flex flex-col overflow-hidden">
                  <div className="flex-grow overflow-y-auto p-6">
                    <div className="space-y-6">
                      <div className="text-center">
                        <Upload className="w-12 h-12 mx-auto mb-3 text-primary" />
                        <h3 className="text-lg font-semibold mb-2">Upload Audio</h3>
                        <p className="text-sm text-muted-foreground">
                          Add audio files to your library
                        </p>
                      </div>

                      {/* File Upload Area */}
                      <div className="border-2 h-80 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors flex items-center justify-center">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="audio/*"
                          multiple
                          onChange={handleFileChange}
                          className="hidden"
                          id="audio-upload"
                        />
                        <label
                          htmlFor="audio-upload"
                          className="cursor-pointer flex flex-col items-center gap-4"
                        >
                          <Upload className="w-8 h-8 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">
                              Choose files or drag and drop
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Supports MP3, WAV, FLAC, and other audio formats
                            </p>
                          </div>
                        </label>
                      </div>

                      {/* Help Text */}
                      <div className="bg-muted/30 rounded-lg p-4">
                        <h4 className="font-medium mb-2">Tips for uploading:</h4>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li>• Use high-quality audio files for best results</li>
                          <li>• Supported formats: MP3, WAV, FLAC, OGG, M4A</li>
                          <li>• Files will be added to your audio library</li>
                          <li>• You can then add them to studio projects</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            )}

            <TabsContent value="generate" className="flex-grow overflow-hidden m-0">
              <div className="h-full overflow-y-auto p-6">
                {/* Header and Tips - Top Section */}
                <div className="flex-shrink-0 space-y-6 mb-6">
                  <div className="text-center">
                    <Music className="w-12 h-12 mx-auto mb-3 text-primary" />
                    <h3 className="text-lg font-semibold mb-2">Generate Audio</h3>
                    <p className="text-sm text-muted-foreground">
                      Describe the audio you want to generate and let AI create it for you
                    </p>
                  </div>


                  {/* Generation Status or Help Text */}
                  {generatedTrack && generatedAudioBlob ? (
                    <div className="bg-muted/50 rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{generatedTrack.name}</span>
                      </div>
                      
                      {/* AudioPlayer */}
                      <AudioPlayer
                        audioBlob={generatedAudioBlob}
                        className="w-full"
                      />
                      
                      {/* Action Buttons */}
                      <div className="flex justify-center gap-3">
                        {!useUiMode && (
                          <Button
                            onClick={handleUseAudio}
                            className="min-w-24"
                          >
                            Use Audio
                          </Button>
                        )}
                        <Button
                          onClick={handleResetGeneration}
                          variant="outline"
                          className="min-w-24"
                        >
                          Reset
                        </Button>
                      </div>
                    </div>
                  ) : (isGenerating || generationStatus) ? (
                    <div className="bg-muted/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">
                          {isGenerating ? 'Generating...' : 'Status'}
                        </span>
                        {isGenerating && (
                          <Button
                            onClick={handleCancelGeneration}
                            variant="outline"
                            size="sm"
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isGenerating && <Loader2 className="h-4 w-4 animate-spin" />}
                        <span className="text-sm text-muted-foreground">
                          {generationStatus}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-muted/30 rounded-lg p-4">
                      <h4 className="font-medium mb-2">Tips for better results:</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Be specific about the instrument (e.g., "acoustic guitar", "piano")</li>
                        <li>• Mention the style or genre if desired</li>
                        <li>• Specify key signature for musical coherence</li>
                        <li>• Keep descriptions clear and concise</li>
                        {selectedModel === 'stability/stable-audio-2' && (
                          <li>• Stable Audio supports longer durations and precise BPM control</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Flexible space to push textarea to bottom */}
                <div className="flex-grow"></div>

                {/* Textarea and Controls - Bottom Section */}
                <div className="flex-shrink-0 space-y-4">
                  <GenerationPromptControl
                    prompt={generatePrompt}
                    onPromptChange={setGeneratePrompt}
                    onGenerate={handleGenerateAudio}
                    isGenerating={isGenerating}
                    useStudioTheme={!useUiMode}
                    placeholder="Describe the audio you want to generate (e.g., 'acoustic guitar melody in C major', 'piano chord progression', 'violin solo')"
                    maxLength={500}
                    showRandomButton={false}
                    showSelect={false}
                    submitButtonAriaLabel="Generate Audio"
                    textareaTopPadding={8}
                    textareaTopLeftComponent={
                      <div className="flex gap-2">
                        <KeySelectorMenu
                          triggerLabel={keySignature}
                          onSelect={setKeySignature}
                          selectedKey={keySignature}
                        />
                        <BPMSelector
                          triggerLabel={`${bpm} BPM`}
                          onSelect={setBpm}
                          selectedBPM={bpm}
                          min={60}
                          max={200}
                        />
                        <BarSelector
                          triggerLabel={`${bars} bars`}
                          onSelect={setBars}
                          selectedBars={bars}
                          min={1}
                          max={selectedModel === 'stability/stable-audio-2' ? 16 : 8}
                        />
                      </div>
                    }
                    textareaBottomLeftComponent={
                      <AudioGenerationModelMenu
                        triggerLabel={selectedModel === 'vertex-ai/lyria2' ? 'Lyria 2 (Vertex AI)' : 'Stable Audio 2.0'}
                        onSelect={setSelectedModel}
                        models={['vertex-ai/lyria2', 'stability/stable-audio-2']}
                        selectedModel={selectedModel}
                      />
                    }
                  />


                  {/* Generation Error */}
                  {generationError && (
                    <Alert variant="destructive">
                      {generationError}
                    </Alert>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="audio/*"
          className="hidden"
        />
      </DialogContent>
    </Dialog>
  );
};