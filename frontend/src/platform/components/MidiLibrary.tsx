import React, { useState, useEffect } from 'react';
import { Music } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

// Shared components and hooks
import { PaginatedGrid } from './shared/PaginatedGrid';
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

  // Render item function for the grid
  const renderMidiTrackCard = (track: MidiTrackRead) => (
    <MidiTrackCard
      track={track}
      playingId={playingId}
      currentTime={currentTime}
      duration={duration}
      handlePlayTrack={handlePlayTrack}
      handleDeleteTrack={handleDeleteTrack}
      sectionColor={sectionColor}
    />
  );

  // Custom empty state with the correct icon
  const emptyState = {
    icon: <Music className="h-15 w-15" />,
    title: "No MIDI tracks in your library",
    description: "Create MIDI tracks in the studio to see them here"
  };

  return (
    <PaginatedGrid<MidiTrackRead>
      items={pagination.allFetchedItems}
      displayedCount={pagination.displayedCount}
      totalItems={pagination.totalItems}
      loading={pagination.isLoading}
      loadingMore={pagination.isFetching}
      error={pagination.error}
      onShowMore={pagination.showMore}
      canShowMore={pagination.canShowMore}
      renderItem={renderMidiTrackCard}
      getItemKey={(track) => track.id}
      emptyState={emptyState}
      gridProps={{ xs: 12, sm: 6, md: 4 }}
      sectionColor={sectionColor}
    />
  );
}