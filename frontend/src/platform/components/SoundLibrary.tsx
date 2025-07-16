import React, { useState, useEffect } from 'react';
import { MusicNote as MusicNoteIcon } from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';

// Shared components and hooks
import { PaginatedGrid } from './shared/PaginatedGrid';
import { useAudioTracksPagination } from '../hooks/usePagination';
import { TRACK_PAGINATION_CONFIG, configToOptions } from '../constants/pagination';

// API and types
import { getSoundsPaginated, deleteSound } from '../api/sounds';
import { AudioTrackRead } from '../types/dto/track_models/audio_track';
import AudioTrackCard from './DisplayCards/AudioTrackCard';
import { EditAudioModal } from '../../studio/components/modals/EditAudioModal';

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
  
  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTrack, setEditingTrack] = useState<AudioTrackRead | null>(null);

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
  const handlePlaySound = (sound: AudioTrackRead) => {
    if (playingId === sound.id && audioElement) {
      audioElement.pause();
      setPlayingId(null);
      return;
    }
    
    if (audioElement) {
      audioElement.pause();
      setCurrentTime(0);
    }
    
    const audio = new Audio();
    
    const baseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://fmpafpwdkegazcerrnso.supabase.co';
    const url = `${baseUrl}/storage/v1/object/public/tracks/${sound.audio_file_storage_key}`;
    console.log('Audio URL:', url);
    
    audio.crossOrigin = "anonymous";
    audio.src = url;
    audio.preload = "metadata";
    
    audio.addEventListener('error', (e) => {
      console.error('Audio error details:', audio.error);
    });
    
    audio.play().catch(err => {
      console.error('Failed to play sound:', err);
    });
    
    setAudioElement(audio);
    setPlayingId(sound.id);
    setCurrentTime(0);
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
  
  // Edit sound handler
  const handleEditSound = (sound: AudioTrackRead) => {
    setEditingTrack(sound);
    setIsEditModalOpen(true);
  };
  
  // Handle track updated from edit modal
  const handleTrackUpdated = (updatedTrack: AudioTrackRead) => {
    // Invalidate queries to refresh the list
    queryClient.invalidateQueries({ queryKey: ['audioTracks'] });
    if (onReload) {
      onReload();
    }
    // Don't auto-close the modal - let the user close it manually
    // The modal will show a success message and the user can close when ready
  };

  // Render item function for the grid
  const renderAudioTrackCard = (sound: AudioTrackRead) => (
    <AudioTrackCard
      sound={sound}
      playingId={playingId}
      currentTime={currentTime}
      duration={duration}
      handlePlaySound={handlePlaySound}
      handleDeleteSound={handleDeleteSound}
      handleEditSound={handleEditSound}
      handleSeek={handleSeek}
      sectionColor={sectionColor}
    />
  );

  // Custom empty state with the correct icon
  const emptyState = {
    icon: <MusicNoteIcon sx={{ fontSize: 60 }} />,
    title: "No sounds in your library",
    description: "Upload some sounds to get started"
  };

  return (
    <>
      <PaginatedGrid<AudioTrackRead>
        items={pagination.allFetchedItems}
        displayedCount={pagination.displayedCount}
        totalItems={pagination.totalItems}
        loading={pagination.isLoading}
        loadingMore={pagination.isFetching}
        error={pagination.error}
        onShowMore={pagination.showMore}
        canShowMore={pagination.canShowMore}
        renderItem={renderAudioTrackCard}
        getItemKey={(sound) => sound.id}
        emptyState={emptyState}
        gridProps={{ xs: 12, sm: 6, md: 4 }}
        sectionColor={sectionColor}
      />
      
      <EditAudioModal
        open={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingTrack(null);
        }}
        audioTrack={editingTrack}
        onTrackUpdated={handleTrackUpdated}
        useUiMode={true}
      />
    </>
  );
}