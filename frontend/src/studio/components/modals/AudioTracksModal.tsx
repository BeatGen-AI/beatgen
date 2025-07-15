import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Music, Loader2, Play, Pause, Upload, Send } from 'lucide-react';
import { AudioTrackRead } from '../../../platform/types/dto/track_models/audio_track';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getSoundsPaginated, downloadAudioTrackFile } from '../../../platform/api/sounds';
import { db } from '../../core/db/dexie-client';
import { cn } from '@/lib/utils';
import { interactWithAssistant, StreamCallbacks } from '../../../platform/api/assistant';
import GenerationPromptControl from '../shared/GenerationPromptControl';
import AudioPreview from '../shared/AudioPreview';

// TrackCard component for displaying individual audio tracks
interface TrackCardProps {
  track: AudioTrackRead;
  onClick: () => void;
  isPlaying: boolean;
  onPlayToggle: () => void;
}

const TrackCard: React.FC<TrackCardProps> = ({
  track,
  onClick,
  isPlaying,
  onPlayToggle,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Debug logging
  console.log('TrackCard: Rendering with track:', {
    id: track.id,
    name: track.name,
    storage_key: track.audio_file_storage_key,
    duration: track.audio_file_duration,
    isPlaying
  });

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
    if (!track.audio_file_storage_key || audioUrl) return;

    setIsDownloading(true);
    try {
      // Check if we already have this file in IndexedDB
      const existingFile = await db.getAudioFile(track.id);
      if (existingFile) {
        const url = URL.createObjectURL(existingFile.data);
        setAudioUrl(url);
        return;
      }

      // Download from remote storage
      const blob = await downloadAudioTrackFile(track.audio_file_storage_key);
      
      // Store in IndexedDB for future use (upsert to handle existing keys)
      const file = new File([blob], track.name, { type: blob.type });
      await db.upsertAudioFile(track.id, file, track.audio_file_duration);
      
      // Create URL for playback
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (error) {
      console.error('Failed to download audio track:', error);
    } finally {
      setIsDownloading(false);
    }
  }, [track.id, track.audio_file_storage_key, track.name, track.audio_file_duration, audioUrl]);

  // Auto-download when component mounts
  useEffect(() => {
    downloadAndCacheAudio();
  }, [downloadAndCacheAudio]);

  // Handle play/pause
  const handlePlayToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!audioUrl) {
      downloadAndCacheAudio();
      return;
    }

    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.addEventListener('ended', () => {
          onPlayToggle();
        });
      }
      audioRef.current.play().catch(console.error);
    }
    onPlayToggle();
  }, [audioUrl, isPlaying, onPlayToggle, downloadAndCacheAudio]);

  // Cleanup audio URL when component unmounts
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [audioUrl]);

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
          </div>
          
          {/* Format and Sample Rate */}
          <div className="flex items-center justify-between mt-1">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
              <Music className="w-2.5 h-2.5 mr-1" />
              {track.audio_file_format?.toUpperCase() || 'AUDIO'}
              {track.audio_file_sample_rate && ` • ${(track.audio_file_sample_rate / 1000).toFixed(0)}kHz`}
            </span>
          </div>
        </div>

        {/* Play Button */}
        <div className="flex items-center gap-0.5 ml-2">
          <button
            onClick={handlePlayToggle}
            className="p-1 rounded-full text-muted-foreground hover:text-primary transition-colors"
            disabled={isDownloading}
          >
            {isDownloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Audio waveform preview */}
      <div className="mb-2">
        <div className="w-full h-[40px] flex items-center justify-center">
          <AudioPreview 
            audioUrl={track.audio_file_storage_key || ''}
            variant="card"
            duration={track.audio_file_duration}
            isPlaying={isPlaying}
          />
        </div>
      </div>
    </div>
  );
};

interface AudioTracksModalProps {
  open: boolean;
  onClose: () => void;
  onSelectTrack: (track: AudioTrackRead) => void;
  onFileUpload?: (file: File) => void;
}

export const AudioTracksModal: React.FC<AudioTracksModalProps> = ({
  open,
  onClose,
  onSelectTrack,
  onFileUpload
}) => {
  const [activeTab, setActiveTab] = useState('my-tracks');
  const [playingId, setPlayingId] = useState<string | null>(null);
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [streamConnection, setStreamConnection] = useState<{ close: () => void } | null>(null);
  
  const ITEMS_PER_PAGE = 12;

  const handleTrackSelect = (track: AudioTrackRead) => {
    onSelectTrack(track);
    onClose();
  };

  const handlePlayToggle = (trackId: string) => {
    setPlayingId(playingId === trackId ? null : trackId);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onFileUpload) {
      onFileUpload(file);
      // Clear the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      // Refresh the tracks list after upload
      setTimeout(() => {
        fetchTracks(1, false);
      }, 1000);
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
        onAction: (action) => {
          if (action.action_type === 'add_audio_track' && action.data?.track_data) {
            // Convert the track data to AudioTrackRead and select it
            const trackData = action.data.track_data as AudioTrackRead;
            onSelectTrack(trackData);
            setGenerationStatus('Audio generated successfully!');
            setTimeout(() => {
              onClose();
            }, 1500);
          }
        },
        onComplete: () => {
          setIsGenerating(false);
          setGenerationStatus('Generation completed!');
          // Refresh tracks list to show the new generated track
          fetchTracks(1, false);
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
          model: 'fal-ai/lyria2',
          context: {
            bpm: 120, // Default BPM, could be made configurable
            time_signature: { numerator: 4, denominator: 4 },
            key_signature: 'C Major'
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
      
      console.log('AudioTracksModal: Fetched tracks:', result.items?.length || 0, 'tracks');
      if (result.items && result.items.length > 0) {
        console.log('AudioTracksModal: Sample track data:', result.items[0]);
        console.log('AudioTracksModal: All tracks storage keys:', result.items.map(t => ({
          id: t.id,
          name: t.name,
          storage_key: t.audio_file_storage_key,
          duration: t.audio_file_duration
        })));
      }
      
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

  // Initial load when modal opens
  useEffect(() => {
    if (open) {
      setCurrentPage(1);
      setTracks([]);
      fetchTracks(1, false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-[95vw] h-[85vh] p-0 flex flex-col shadow-2xl rounded-lg">
        <DialogHeader className="p-2">
          <div className="flex items-center justify-between pl-4 pt-4 pr-4">
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
                <TabsTrigger value="my-tracks">My Audio Tracks</TabsTrigger>
                <TabsTrigger value="generate">Generate Audio</TabsTrigger>
              </TabsList>
            </div>

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
                              isPlaying={playingId === track.id}
                              onPlayToggle={() => handlePlayToggle(track.id)}
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

            <TabsContent value="generate" className="flex-grow overflow-hidden m-0">
              <div className="h-full flex flex-col overflow-hidden">
                <div className="flex-grow overflow-y-auto p-6">
                  <div className="space-y-6">
                    <div className="text-center">
                      <Music className="w-12 h-12 mx-auto mb-3 text-primary" />
                      <h3 className="text-lg font-semibold mb-2">Generate Audio</h3>
                      <p className="text-sm text-muted-foreground">
                        Describe the audio you want to generate and let AI create it for you
                      </p>
                    </div>

                    <GenerationPromptControl
                      prompt={generatePrompt}
                      onPromptChange={setGeneratePrompt}
                      onGenerate={handleGenerateAudio}
                      isGenerating={isGenerating}
                      placeholder="Describe the audio you want to generate (e.g., 'acoustic guitar melody in C major', 'piano chord progression', 'violin solo')"
                      maxLength={500}
                      showRandomButton={false}
                      showSelect={false}
                      submitButtonAriaLabel="Generate Audio"
                    />

                    {/* Generation Status */}
                    {(isGenerating || generationStatus) && (
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
                    )}

                    {/* Generation Error */}
                    {generationError && (
                      <Alert variant="destructive">
                        {generationError}
                      </Alert>
                    )}

                    {/* Help Text */}
                    <div className="bg-muted/30 rounded-lg p-4">
                      <h4 className="font-medium mb-2">Tips for better results:</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Be specific about the instrument (e.g., "acoustic guitar", "piano")</li>
                        <li>• Mention the style or genre if desired</li>
                        <li>• Specify key signature for musical coherence</li>
                        <li>• Keep descriptions clear and concise</li>
                      </ul>
                    </div>
                  </div>
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