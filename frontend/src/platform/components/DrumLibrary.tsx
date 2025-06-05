import React, { useState } from 'react';
import { Drum } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

// Shared components and hooks
import { PaginatedGrid } from './shared/PaginatedGrid';
import { useDrumTracksPagination } from '../hooks/usePagination';
import { TRACK_PAGINATION_CONFIG, configToOptions } from '../constants/pagination';

// API and types
import { getDrumTracks, deleteDrumTrack } from '../api/sounds';
import { DrumTrackRead } from '../types/track_models/drum_track';
import DrumTrackCard from './DisplayCards/DrumTrackCard';

interface DrumLibraryProps {
  onReload?: () => void;
  sectionColor: string;
}

export default function DrumLibrary({ onReload, sectionColor }: DrumLibraryProps) {
  const queryClient = useQueryClient();
  
  // Drum playback state
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Pagination using shared hook
  const pagination = useDrumTracksPagination(
    (page, size) => getDrumTracks(page, size),
    configToOptions(TRACK_PAGINATION_CONFIG.DRUM_TRACKS)
  );
  
  const handlePlayTrack = (track: DrumTrackRead) => {
    // If we're already playing this track, pause it
    if (playingId === track.id) {
      setPlayingId(null);
      return;
    }
    
    // Mock playback for now - in reality we would use a drum sequencer
    // For now, just set the playingId to simulate being able to play drums
    setPlayingId(track.id);
    
    // This is where you would initialize a drum sequencer
    console.log('Playing drum track:', track.name);
    
    // For debugging - after 5 seconds auto-stop
    setTimeout(() => {
      setPlayingId(null);
    }, 5000);
  };
  
  const { mutate: performDeleteDrumTrack } = useMutation<void, Error, string>({
    mutationFn: deleteDrumTrack,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drumTracks'] });
      if (onReload) {
        onReload();
      }
    },
    onError: (err: Error) => {
      console.error(`Failed to delete drum track: ${err.message}`);
    },
  });

  const handleDeleteTrack = async (id: string) => {
    // Stop playback if this is the track being played
    if (playingId === id) {
      setPlayingId(null);
    }
    performDeleteDrumTrack(id);
  };
  
  const handleEditTrack = (id: string) => {
    // For now, just log - this would open the drum editor in the future
    console.log('Edit drum track:', id);
  };

  // Render item function for the grid
  const renderDrumTrackCard = (track: DrumTrackRead) => (
    <DrumTrackCard
      track={track}
      playingId={playingId}
      handlePlayTrack={handlePlayTrack}
      handleDeleteTrack={handleDeleteTrack}
      handleEditTrack={handleEditTrack}
      sectionColor={sectionColor}
    />
  );

  // Custom empty state with the correct icon
  const emptyState = {
    icon: <Drum size={60} />,
    title: "No drum tracks in your library",
    description: "Create drum tracks in the studio to see them here"
  };

  return (
    <PaginatedGrid<DrumTrackRead>
      items={pagination.allFetchedItems}
      displayedCount={pagination.displayedCount}
      totalItems={pagination.totalItems}
      loading={pagination.isLoading}
      loadingMore={pagination.isFetching}
      error={pagination.error}
      onShowMore={pagination.showMore}
      canShowMore={pagination.canShowMore}
      renderItem={renderDrumTrackCard}
      getItemKey={(track) => track.id}
      emptyState={emptyState}
      gridProps={{ xs: 12, sm: 6, md: 4 }}
      sectionColor={sectionColor}
    />
  );
}