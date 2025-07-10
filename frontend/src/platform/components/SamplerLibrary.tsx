import React, { useState, useEffect } from 'react';
import { GraphicEq as GraphicEqIcon } from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';

// Shared components and hooks
import { PaginatedGrid } from './shared/PaginatedGrid';
import { useSamplerTracksPagination } from '../hooks/usePagination';
import { TRACK_PAGINATION_CONFIG, configToOptions } from '../constants/pagination';

// API and types
import { getSamplerTracks, deleteSamplerTrack } from '../api/sounds';
import { SamplerTrackRead } from '../types/dto/track_models/sampler_track';
import SamplerTrackCard from './DisplayCards/SamplerTrackCard';

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
      
      const baseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://fmpafpwdkegazcerrnso.supabase.co';
      const url = `${baseUrl}/storage/v1/object/public/tracks/${track.audio_storage_key}`;
      
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

  // Render item function for the grid
  const renderSamplerTrackCard = (track: SamplerTrackRead) => (
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
  );

  // Custom empty state with the correct icon
  const emptyState = {
    icon: <GraphicEqIcon sx={{ fontSize: 60 }} />,
    title: "No sampler tracks in your library",
    description: "Create sampler tracks in the studio to see them here"
  };

  return (
    <PaginatedGrid<SamplerTrackRead>
      items={pagination.allFetchedItems}
      displayedCount={pagination.displayedCount}
      totalItems={pagination.totalItems}
      loading={pagination.isLoading}
      loadingMore={pagination.isFetching}
      error={pagination.error}
      onShowMore={pagination.showMore}
      canShowMore={pagination.canShowMore}
      renderItem={renderSamplerTrackCard}
      getItemKey={(track) => track.id}
      emptyState={emptyState}
      gridProps={{ xs: 12, sm: 6, md: 4 }}
      sectionColor={sectionColor}
    />
  );
}