import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../../../components/ui/button';
import { Play, Pause, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import AudioPreview from './AudioPreview';

interface AudioPlayerProps {
  audioUrl?: string;
  audioBlob?: Blob;
  title?: string;
  className?: string;
  showWaveform?: boolean;
  duration?: number;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  audioBlob,
  title,
  className,
  showWaveform = true,
  duration
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [effectiveAudioUrl, setEffectiveAudioUrl] = useState<string | null>(null);

  // Create audio element when URL or blob changes
  useEffect(() => {
    // Clean up previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    // Clear previous object URL
    if (effectiveAudioUrl && effectiveAudioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(effectiveAudioUrl);
    }

    // Determine the audio source - try blob first, then URL
    let sourceUrl: string | null = null;
    let isBlobSource = false;
    
    if (audioBlob && audioBlob.size > 0 && audioBlob.type) {
      try {
        // Use blob if provided and valid
        console.log('AudioPlayer: Using blob source, size:', audioBlob.size, 'type:', audioBlob.type);
        sourceUrl = URL.createObjectURL(audioBlob);
        isBlobSource = true;
      } catch (error) {
        console.warn('Failed to create object URL from blob:', error);
        sourceUrl = null;
      }
    }
    
    // Fallback to URL if blob failed or wasn't provided
    if (!sourceUrl && audioUrl) {
      console.log('AudioPlayer: Using URL source:', audioUrl);
      sourceUrl = audioUrl;
      isBlobSource = false;
    }

    if (!sourceUrl) {
      setEffectiveAudioUrl(null);
      setError('No audio source available');
      setIsLoading(false);
      return;
    }

    setEffectiveAudioUrl(sourceUrl);

    // Create new audio element
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'metadata';
    
    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = (e: any) => {
      console.error('Audio playback error:', e, 'for source:', sourceUrl);
      console.error('Audio error details:', audio.error);
      
      // If blob source failed and we have a URL fallback, try it
      if (isBlobSource && audioUrl && sourceUrl !== audioUrl) {
        console.log('Blob source failed, trying URL fallback:', audioUrl);
        // Clean up blob URL
        if (sourceUrl && sourceUrl.startsWith('blob:')) {
          URL.revokeObjectURL(sourceUrl);
        }
        // Try URL fallback
        const fallbackAudio = new Audio();
        fallbackAudio.crossOrigin = 'anonymous';
        fallbackAudio.preload = 'metadata';
        
        const handleFallbackMetadata = () => {
          setAudioDuration(fallbackAudio.duration);
          setIsLoading(false);
        };
        
        const handleFallbackError = (fallbackE: any) => {
          console.error('Fallback audio also failed:', fallbackE);
          setError('Failed to load audio');
          setIsLoading(false);
          setIsPlaying(false);
        };
        
        fallbackAudio.addEventListener('loadedmetadata', handleFallbackMetadata);
        fallbackAudio.addEventListener('error', handleFallbackError);
        fallbackAudio.addEventListener('timeupdate', handleTimeUpdate);
        fallbackAudio.addEventListener('ended', handleEnded);
        
        fallbackAudio.src = audioUrl;
        audioRef.current = fallbackAudio;
        setEffectiveAudioUrl(audioUrl);
        return;
      }
      
      setError('Failed to load audio');
      setIsLoading(false);
      setIsPlaying(false);
    };

    // Add event listeners
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    // Set source and load
    console.log('AudioPlayer: Setting audio source:', sourceUrl);
    audio.src = sourceUrl;
    audioRef.current = audio;
    setIsLoading(true);
    setError(null);
    
    // Set a timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      if (audioRef.current === audio) {
        console.warn('AudioPlayer: Loading timeout, marking as failed');
        setError('Loading timeout - audio may be corrupted');
        setIsLoading(false);
      }
    }, 10000); // 10 second timeout
    
    const originalHandleMetadata = handleLoadedMetadata;
    const originalHandleError = handleError;
    
    const handleLoadedMetadataWithTimeout = () => {
      clearTimeout(loadingTimeout);
      originalHandleMetadata();
    };
    
    const handleErrorWithTimeout = (e: any) => {
      clearTimeout(loadingTimeout);
      originalHandleError(e);
    };
    
    // Update event listeners to use timeout versions
    audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    audio.removeEventListener('error', handleError);
    audio.addEventListener('loadedmetadata', handleLoadedMetadataWithTimeout);
    audio.addEventListener('error', handleErrorWithTimeout);

    return () => {
      clearTimeout(loadingTimeout);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeEventListener('loadedmetadata', handleLoadedMetadataWithTimeout);
        audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
        audioRef.current.removeEventListener('ended', handleEnded);
        audioRef.current.removeEventListener('error', handleErrorWithTimeout);
        audioRef.current.src = '';
      }
      // Clean up object URL if it was created from blob
      if (sourceUrl && sourceUrl.startsWith('blob:')) {
        URL.revokeObjectURL(sourceUrl);
      }
    };
  }, [audioUrl, audioBlob]);

  const togglePlayPause = async () => {
    if (!audioRef.current) return;

    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Playback error:', error);
      setError('Failed to play audio');
      setIsPlaying(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className={cn('p-4 bg-red-50 border border-red-200 rounded-lg', className)}>
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className={cn('p-6 bg-muted/30 rounded-lg', className)}>
      {title && (
        <div className="mb-4">
          <h4 className="font-medium text-sm">{title}</h4>
        </div>
      )}
      
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="default"
          onClick={togglePlayPause}
          disabled={isLoading || !!error || !effectiveAudioUrl}
          className="flex items-center gap-2 h-10"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-5 h-5" />
          ) : (
            <Play className="w-5 h-5" />
          )}
        </Button>

        {showWaveform && !isLoading && effectiveAudioUrl && (
          <div className="flex-1 min-h-[80px] flex items-center">
            <AudioPreview
              audioBlob={audioBlob}
              audioUrl={!effectiveAudioUrl.startsWith('blob:') ? effectiveAudioUrl : undefined}
              variant="card"
              duration={audioDuration}
              isPlaying={isPlaying}
            />
          </div>
        )}
        
        <div className="text-sm text-muted-foreground">
          {formatTime(currentTime)} / {formatTime(audioDuration)}
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;