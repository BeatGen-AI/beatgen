import React, { useState, useEffect } from 'react';
import { Music } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

// Shared components and hooks
import { useAudioTracksPagination } from '../hooks/usePagination';
import { TRACK_PAGINATION_CONFIG, configToOptions } from '../constants/pagination';

// API and types
import { getSoundsPaginated, deleteSound, downloadAudioTrackFile } from '../api/sounds';
import { AudioTrackRead } from '../types/dto/track_models/audio_track';
import AudioTrackCard from './DisplayCards/AudioTrackCard';

interface SoundLibraryProps {
  onReload?: () => void;
  sectionColor: string;
}

export default function SoundLibrary({ onReload, sectionColor }: SoundLibraryProps) {
  const queryClient = useQueryClient();
  
  // Audio playback state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioBlobs, setAudioBlobs] = useState<Record<string, Blob>>({});

  // Pagination using shared hook
  const pagination = useAudioTracksPagination(
    (page, size) => getSoundsPaginated(page, size),
    configToOptions(TRACK_PAGINATION_CONFIG.AUDIO_TRACKS)
  );

  // Audio element event handlers
  useEffect(() => {
    if (!audioElement) return;
    
    const handleTimeUpdate = () => {
      setCurrentTime(audioElement.currentTime);
    };
    
    const handleDurationChange = () => {
      setDuration(audioElement.duration);
    };
    
    const handleEnded = () => {
      setPlayingId(null);
      setCurrentTime(0);
    };
    
    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    audioElement.addEventListener('durationchange', handleDurationChange);
    audioElement.addEventListener('ended', handleEnded);
    
    return () => {
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      audioElement.removeEventListener('durationchange', handleDurationChange);
      audioElement.removeEventListener('ended', handleEnded);
      audioElement.pause();
    };
  }, [audioElement]);
  
  // Play sound handler
  const handlePlaySound = async (sound: AudioTrackRead) => {
    if (playingId === sound.id && audioElement) {
      audioElement.pause();
      setPlayingId(null);
      setCurrentTime(0);
      return;
    }
    
    if (audioElement) {
      audioElement.pause();
      setCurrentTime(0);
    }
    
    try {
      // Use the proper API function to download the audio file with storage_type if available
      const audioBlob = await downloadAudioTrackFile(
        sound.audio_file_storage_key
      );
      
      // Store the blob for use by AudioPlayer
      setAudioBlobs(prev => ({ ...prev, [sound.id]: audioBlob }));
      
      const url = URL.createObjectURL(audioBlob);
      
      const audio = new Audio();
      audio.src = url;
      audio.preload = "metadata";
      
      audio.addEventListener('error', (e) => {
        console.error('Audio error details:', audio.error);
        URL.revokeObjectURL(url); // Clean up on error
      });
      
      audio.addEventListener('ended', () => {
        setPlayingId(null);
        setAudioElement(null);
        setCurrentTime(0);
        URL.revokeObjectURL(url); // Clean up when finished
      });
      
      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime);
      });
      
      audio.play().catch(err => {
        console.error('Failed to play sound:', err);
        URL.revokeObjectURL(url); // Clean up on error
      });
      
      setAudioElement(audio);
      setPlayingId(sound.id);
      // currentTime will be updated via the timeupdate event listener
    } catch (error) {
      console.error('Failed to download audio file:', error);
    }
  };
  
  // Seek handler
  const handleSeek = (soundId: string, position: number) => {
    if (!audioElement || playingId !== soundId) return;
    
    audioElement.currentTime = position;
    setCurrentTime(position);
  };
  
  // Delete mutation
  const { mutate: performDeleteSound } = useMutation<void, Error, string>({
    mutationFn: deleteSound,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audioTracks'] });
      if (onReload) {
        onReload();
      }
    },
    onError: (err: Error) => {
      console.error(`Failed to delete sound: ${err.message}`);
    },
  });

  const handleDeleteSound = async (id: string) => {
    if (playingId === id && audioElement) {
      audioElement.pause();
      setPlayingId(null);
    }
    performDeleteSound(id);
  };

  // Custom empty state with the correct icon
  const emptyState = {
    icon: <Music className="h-15 w-15" />,
    title: "No sounds in your library",
    description: "Upload some sounds to get started"
  };

  return (
    <React.Fragment>
      {pagination.error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{pagination.error}</AlertDescription>
        </Alert>
      )}

      {pagination.isLoading ? (
        <Card className="flex flex-col items-center py-8 mt-2">
          <CardContent className="flex flex-col items-center space-y-4 pt-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-sm text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      ) : pagination.allFetchedItems.length === 0 ? (
        <Card className="flex flex-col items-center py-8 mt-2 text-center">
          <CardContent className="flex flex-col items-center space-y-4 pt-6">
            <div className="text-6xl mb-2">
              {emptyState.icon}
            </div>
            <h3 
              className="text-lg font-semibold"
              style={{ 
                color: sectionColor || '#666',
              }}
            >
              {emptyState.title}
            </h3>
            <p className="text-sm text-muted-foreground">
              {emptyState.description}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-2">
          {pagination.allFetchedItems.slice(0, pagination.displayedCount).map((sound) => (
            <div key={sound.id}>
              <AudioTrackCard
                sound={sound}
                handleDeleteSound={handleDeleteSound}
                sectionColor={sectionColor}
              />
            </div>
          ))}
        </div>
      )}

      {/* Show More Button */}
      {!pagination.isLoading && pagination.canShowMore && pagination.displayedCount < pagination.totalItems && (
        <div className="flex justify-center mt-4 mb-2">
          <Button 
            variant="outline"
            onClick={pagination.showMore} 
            disabled={pagination.isFetching}
          >
            {pagination.isFetching ? 'Loading...' : 'Show More'}
          </Button>
        </div>
      )}

      {/* Loading indicator when fetching more items */}
      {pagination.isFetching && pagination.allFetchedItems.length > 0 && (
        <div className="flex justify-center mt-2 mb-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      )}
    </React.Fragment>
  );
}