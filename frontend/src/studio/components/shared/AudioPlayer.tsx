import React, { useState, useEffect, useRef } from 'react';
import { IconPlayerPlay, IconPlayerPause, IconPlayerSkipBack, IconDownload } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AudioPreview from './AudioPreview';

interface AudioPlayerProps {
  audioBlob: Blob;
  className?: string;
  onTimeUpdate?: (currentTime: number) => void;
  onDurationChange?: (duration: number) => void;
  fileName?: string; // Optional filename for download
  color?: string; // Color for the waveform
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioBlob,
  className,
  onTimeUpdate,
  onDurationChange,
  fileName,
  color
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Convert blob to URL on mount
  useEffect(() => {
    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(url);

    // Cleanup URL on unmount
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [audioBlob]);

  // Initialize audio element when URL is available
  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      const audioDuration = audio.duration;
      setDuration(audioDuration);
      onDurationChange?.(audioDuration);
    };

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      onTimeUpdate?.(time);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.pause();
    };
  }, [audioUrl, onTimeUpdate, onDurationChange]);

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      // state will update via the 'pause' event listener
    } else {
      audioRef.current.play().catch(() => {
        setIsPlaying(false);
      });
      // state will update via the 'play' event listener if successful
    }
  };

  const handleSeek = (position: number) => {
    if (!audioRef.current || !duration) return;

    const seekTime = position * duration;
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const handleSkipToStart = () => {
    if (!audioRef.current) return;

    audioRef.current.currentTime = 0;
    setCurrentTime(0);
  };

  const handleDownload = () => {
    if (!audioBlob) return;

    const url = URL.createObjectURL(audioBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'audio-download.wav';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!audioUrl) {
    return (
      <div className={cn('flex items-center justify-center p-4', className)}>
        <span className="text-sm text-muted-foreground">Loading audio...</span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Control buttons - Above the waveform */}
      <div className="flex justify-between items-center">
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePlayPause}
            className="h-6 w-6 bg-background/80 backdrop-blur-sm hover:bg-background/90 border border-border/50"
          >
            {isPlaying ? (
              <IconPlayerPause size={12} />
            ) : (
              <IconPlayerPlay size={12} />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSkipToStart}
            className="h-6 w-6 bg-background/80 backdrop-blur-sm hover:bg-background/90 border border-border/50"
          >
            <IconPlayerSkipBack size={12} />
          </Button>
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDownload}
          className="h-6 w-6 bg-background/80 backdrop-blur-sm hover:bg-background/90 border border-border/50"
        >
          <IconDownload size={12} />
        </Button>
      </div>

      {/* Waveform with AudioPreview */}
      <AudioPreview
        audioUrl={audioUrl}
        variant="card"
        duration={duration}
        isPlaying={isPlaying}
        currentTime={currentTime}
        onWaveformClick={handleSeek}
        color={color}
        className="w-full"
      />
    </div>
  );
};

export default AudioPlayer;