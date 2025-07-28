import React, { useState } from 'react';
import { Drum } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

// Shared components and hooks
import { useDrumTracksPagination } from '../hooks/usePagination';
import { TRACK_PAGINATION_CONFIG, configToOptions } from '../constants/pagination';

// API and types
import { getDrumTracks, deleteDrumTrack } from '../api/sounds';
import { DrumTrackRead } from '../types/dto/track_models/drum_track';
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

  // Custom empty state with the correct icon
  const emptyState = {
    icon: <Drum size={60} />,
    title: "No drum tracks in your library",
    description: "Create drum tracks in the studio to see them here"
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
              <DrumTrackCard
                track={track}
                playingId={playingId}
                handlePlayTrack={handlePlayTrack}
                handleDeleteTrack={handleDeleteTrack}
                handleEditTrack={handleEditTrack}
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