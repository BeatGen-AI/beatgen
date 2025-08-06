import React, { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

// Shared components and hooks
import { useSamplerTracksPagination } from '../hooks/usePagination';
import { TRACK_PAGINATION_CONFIG, configToOptions } from '../constants/pagination';

// API and types
import { getSamplerTracks, deleteSamplerTrack } from '../api/sounds';
import { SamplerTrackRead } from '../types/dto/track_models/sampler_track';
import SamplerTrackCard from './DisplayCards/SamplerTrackCard';
import { getStorageUrl, StorageType } from '../types/storage';

interface SamplerLibraryProps {
  onReload?: () => void;
  sectionColor: string;
}

export default function SamplerLibrary({ onReload, sectionColor }: SamplerLibraryProps) {
  const queryClient = useQueryClient();
  
  // Audio playback state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Pagination using shared hook
  const pagination = useSamplerTracksPagination(
    (page, size) => getSamplerTracks(page, size),
    configToOptions(TRACK_PAGINATION_CONFIG.SAMPLER_TRACKS)
  );
  
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
  
  const handlePlayTrack = async (track: SamplerTrackRead) => {
    if (playingId === track.id && audioElement) {
      audioElement.pause();
      setPlayingId(null);
      return;
    }
    
    if (audioElement) {
      audioElement.pause();
      setCurrentTime(0);
    }
    
    try {
      const audio = new Audio();
      
      // Use getStorageUrl with the appropriate storage type
      const storageType = track.storage_type === 'PUBLIC_DRUM' ? StorageType.PUBLIC_DRUM :
                         track.storage_type === 'PUBLIC_SOUNDFONT' ? StorageType.PUBLIC_SOUNDFONT :
                         StorageType.USER_SAMPLE;
      const url = getStorageUrl(track.audio_storage_key, storageType);
      
      console.log('Audio URL:', url);
      
      audio.crossOrigin = "anonymous";
      audio.src = url;
      
      audio.preload = "metadata";
      
      audio.addEventListener('error', (e) => {
        console.error('Audio error details:', audio.error);
      });
      
      audio.play().catch(err => {
        console.error('Failed to play sampler track:', err);
      });
      
      setAudioElement(audio);
      setPlayingId(track.id);
      setCurrentTime(0);
    } catch (err) {
      console.error('Error playing sampler track:', err);
    }
  };
  
  const { mutate: performDeleteSamplerTrack } = useMutation<void, Error, string>({
    mutationFn: deleteSamplerTrack,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['samplerTracks'] });
      if (onReload) {
        onReload();
      }
    },
    onError: (err: Error) => {
      console.error(`Failed to delete sampler track: ${err.message}`);
    },
  });

  const handleDeleteTrack = async (id: string) => {
    if (playingId === id && audioElement) {
      audioElement.pause();
      setPlayingId(null);
    }
    performDeleteSamplerTrack(id);
  };
  
  const handleSeek = (trackId: string, position: number) => {
    if (!audioElement || playingId !== trackId) return;
    
    audioElement.currentTime = position;
    setCurrentTime(position);
  };

  // Custom empty state with the correct icon
  const emptyState = {
    icon: <BarChart3 className="h-15 w-15" />,
    title: "No sampler tracks in your library",
    description: "Create sampler tracks in the studio to see them here"
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
          {pagination.allFetchedItems.slice(0, pagination.displayedCount).map((track) => (
            <div key={track.id}>
              <SamplerTrackCard
                track={track}
                playingId={playingId}
                currentTime={currentTime}
                duration={duration}
                handlePlayTrack={handlePlayTrack}
                handleDeleteTrack={handleDeleteTrack}
                handleSeek={handleSeek}
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