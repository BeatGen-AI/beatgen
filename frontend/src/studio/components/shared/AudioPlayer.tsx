import React, { useState, useEffect, useRef } from 'react';
import { IconPlayerPlay, IconPlayerPause } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AudioPreview from './AudioPreview';

interface AudioPlayerProps {
  audioBlob: Blob;
  className?: string;
  onTimeUpdate?: (currentTime: number) => void;
  onDurationChange?: (duration: number) => void;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioBlob,
  className,
  onTimeUpdate,
  onDurationChange
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

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
    };
  }, [audioUrl, onTimeUpdate, onDurationChange]);

  const handlePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (position: number) => {
    if (!audioRef.current || !duration) return;

    const seekTime = position * duration;
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  if (!audioUrl) {
    return (
      <div className={cn('flex items-center justify-center p-4', className)}>
        <span className="text-sm text-muted-foreground">Loading audio...</span>
      </div>
    );
  }

  return (
    <div className={cn('relative flex items-center', className)}>
      {/* Play/Pause Button - Top Left */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handlePlayPause}
        className="absolute left-2 top-2 z-10 h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background/90"
      >
        {isPlaying ? (
          <IconPlayerPause size={16} />
        ) : (
          <IconPlayerPlay size={16} />
        )}
      </Button>

      {/* Waveform with AudioPreview */}
      <div className="w-full pl-12"> {/* Padding to avoid overlap with play button */}
        <AudioPreview
          audioUrl={audioUrl}
          variant="card"
          duration={duration}
          isPlaying={isPlaying}
          onWaveformClick={handleSeek}
          className="w-full"
        />
      </div>
    </div>
  );
};

export default AudioPlayer;