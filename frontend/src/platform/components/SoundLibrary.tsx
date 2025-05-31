import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, 
  Typography, 
  Grid, 
  CircularProgress,
  Alert,
} from '@mui/material';
import { 
  MusicNote as MusicNoteIcon
} from '@mui/icons-material';
import { getSounds, deleteSound } from '../api/sounds';
import { AudioTrackRead } from '../../platform/types/track_models/audio_track';
import AudioTrackCard from './DisplayCards/AudioTrackCard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "../../components/ui/button";

interface SoundLibraryProps {
  onReload?: () => void;
  sectionColor: string;
}

// Constants for pagination and display
const INITIAL_DISPLAY_COUNT = 12;
const DISPLAY_INCREMENT = 6;

export default function SoundLibrary({ onReload, sectionColor }: SoundLibraryProps) {
  const queryClient = useQueryClient();

  const [displayedTracksCount, setDisplayedTracksCount] = useState<number>(INITIAL_DISPLAY_COUNT);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const { 
    data: allFetchedTracks = [],
    isLoading, 
    error: fetchError
  } = useQuery<AudioTrackRead[], Error>({
    queryKey: ['sounds'],
    queryFn: getSounds,
  });

  const totalTracksOnServer = allFetchedTracks.length;
  
  useEffect(() => {
    if (allFetchedTracks.length > 0) {
      setDisplayedTracksCount(Math.min(INITIAL_DISPLAY_COUNT, allFetchedTracks.length));
    }
  }, [allFetchedTracks.length]);

  const handleShowMore = () => {
    const newDisplayedCount = Math.min(
      displayedTracksCount + DISPLAY_INCREMENT,
      allFetchedTracks.length
    );
    setDisplayedTracksCount(newDisplayedCount);
  };
  
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
    
    const baseUrl = process.env.REACT_APP_SUPABASE_URL || '';
    const url = `${baseUrl}/storage/v1/object/public/tracks/${sound.audio_file_storage_key}`;
    console.log('Audio URL:', url);
    
    audio.crossOrigin = "anonymous";
    audio.src = url;
    
    audio.preload = "metadata";
    
    audio.addEventListener('error', (e) => {
      console.error('Audio error details:', audio.error);
      setError(`Failed to play sound: ${audio.error?.message || 'Unknown error'}`);
    });
    
    audio.play().catch(err => {
      console.error('Failed to play sound:', err);
      setError(`Failed to play sound: ${err.message}`);
    });
    
    setAudioElement(audio);
    setPlayingId(sound.id);
    setCurrentTime(0);
  };
  
  const handleSeek = (soundId: string, position: number) => {
    if (!audioElement || playingId !== soundId) return;
    
    audioElement.currentTime = position;
    setCurrentTime(position);
  };
  
  const { mutate: performDeleteSound, isPending: isDeletingSound } = useMutation<void, Error, string>({
    mutationFn: deleteSound,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sounds'] });
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
  
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }
  
  if (fetchError) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        {fetchError.message}
      </Alert>
    );
  }
  
  if (allFetchedTracks.length === 0 && !isLoading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        justifyContent: 'center',
        py: 4,
        height: '100%'
      }}>
        <MusicNoteIcon sx={{ fontSize: 60, color: '#666', mb: 2 }} />
        <Typography variant="h6" gutterBottom sx={{ color: '#ccc' }}>
          No sounds in your library
        </Typography>
        <Typography variant="body2" color="text.secondary" align="center">
          Upload some sounds to get started
        </Typography>
      </Box>
    );
  }
  
  return (
    <Box sx={{ mt: 2 }}>
      <Grid container spacing={2}>
        {allFetchedTracks.slice(0, displayedTracksCount).map((sound) => (
          <Grid item xs={12} sm={6} md={4} key={sound.id}>
            <AudioTrackCard
              sound={sound}
              playingId={playingId}
              currentTime={currentTime}
              duration={duration}
              handlePlaySound={handlePlaySound}
              handleDeleteSound={handleDeleteSound}
              handleSeek={handleSeek}
              sectionColor={sectionColor}
            />
          </Grid>
        ))}
      </Grid>
      
      {/* Show More Button */}
      {!isLoading && displayedTracksCount < totalTracksOnServer && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, mb: 2 }}>
          <Button 
            variant="outline"
            onClick={handleShowMore}
          >
            Show More
          </Button>
        </Box>
      )}
    </Box>
  );
}