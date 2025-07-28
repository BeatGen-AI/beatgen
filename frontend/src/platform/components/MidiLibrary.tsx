import React, { useState, useEffect } from 'react';
import { Music } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

// Shared components and hooks
import { useMidiTracksPagination } from '../hooks/usePagination';
import { TRACK_PAGINATION_CONFIG, configToOptions } from '../constants/pagination';

// API and types
import { getMidiTracks, deleteMidiTrack } from '../api/sounds';
import { MidiTrackRead } from '../types/dto/track_models/midi_track';
import MidiTrackCard from './DisplayCards/MidiTrackCard';

interface MidiLibraryProps {
  onReload?: () => void;
  sectionColor: string;
}

export default function MidiLibrary({ onReload, sectionColor }: MidiLibraryProps) {
  const queryClient = useQueryClient();
  
  // MIDI playback state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Pagination using shared hook
  const pagination = useMidiTracksPagination(
    (page, size) => getMidiTracks(page, size),
    configToOptions(TRACK_PAGINATION_CONFIG.MIDI_TRACKS)
  );
  
  // Set up timeupdate listener for tracking playback progress
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
    
    // Add event listeners
    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    audioElement.addEventListener('durationchange', handleDurationChange);
    audioElement.addEventListener('ended', handleEnded);
    
    // Clean up listeners
    return () => {
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      audioElement.removeEventListener('durationchange', handleDurationChange);
      audioElement.removeEventListener('ended', handleEnded);
      audioElement.pause();
    };
  }, [audioElement]);
  
  const handlePlayTrack = (track: MidiTrackRead) => {
    // If we're already playing this track, pause it
    if (playingId === track.id && audioElement) {
      audioElement.pause();
      setPlayingId(null);
      return;
    }
    
    // Mock playback for now - in reality we would use a MIDI player library
    // For now, just set the playingId to simulate being able to play MIDI
    setPlayingId(track.id);
    
    // This is where you would initialize a MIDI player
    console.log('Playing MIDI track:', track.name);
    
    // For debugging - after 5 seconds auto-stop
    setTimeout(() => {
      setPlayingId(null);
    }, 5000);
  };
  
  const { mutate: performDeleteMidiTrack } = useMutation<void, Error, string>({
    mutationFn: deleteMidiTrack,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['midiTracks'] });
      if (onReload) {
        onReload();
      }
    },
    onError: (err: Error) => {
      console.error(`Failed to delete MIDI track: ${err.message}`);
    },
  });

  const handleDeleteTrack = async (id: string) => {
    // Stop playback if this is the track being played
    if (playingId === id && audioElement) {
      audioElement.pause();
      setPlayingId(null);
    }
    performDeleteMidiTrack(id);
  };

  // Custom empty state with the correct icon
  const emptyState = {
    icon: <Music className="h-15 w-15" />,
    title: "No MIDI tracks in your library",
    description: "Create MIDI tracks in the studio to see them here"
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
              <MidiTrackCard
                track={track}
                playingId={playingId}
                currentTime={currentTime}
                duration={duration}
                handlePlayTrack={handlePlayTrack}
                handleDeleteTrack={handleDeleteTrack}
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