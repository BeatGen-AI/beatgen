import React, { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { IconPlayerPlay, IconPlayerPause, IconPlayerSkipBack, IconDownload } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import * as Tone from 'tone';

interface AudioPlayerProps {
  audioBlob: Blob;
  className?: string;
  fileName?: string;
  color?: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioBlob,
  className,
  fileName,
  color
}) => {
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const playerRef = useRef<Tone.Player | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(audioBlob);

    const player = new Tone.Player(url, () => {
      setDuration(player.buffer.duration);
      setIsLoaded(true);
    }).toDestination();

    player.sync().start(0, player.loopStart || 0); // syncs with Tone.Transport
    playerRef.current = player;

    return () => {
      player.dispose();
      URL.revokeObjectURL(url);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [audioBlob]);

  // Update current time every 100ms while playing
  useEffect(() => {
    if (!playerRef.current) return;

    if (Tone.Transport.state === 'started') {
      intervalRef.current = setInterval(() => {
        setCurrentTime(Tone.Transport.seconds % duration);
      }, 100);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [duration, Tone.Transport.state]);

  const handleSkipToStart = () => {
    if (playerRef.current) {
      Tone.Transport.seconds = 0;
      setCurrentTime(0);
    }
  };

  const handleDownload = () => {
    const url = URL.createObjectURL(audioBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'audio-download.wav';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex justify-between items-center">
        <div className="flex gap-1">
          {/* Play/pause now controlled by Tone.Transport, no direct handling here */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 bg-background/80 backdrop-blur-sm hover:bg-background/90 border border-border/50"
            onClick={() => {
              if (Tone.Transport.state === 'started') {
                Tone.Transport.pause();
              } else {
                Tone.start().then(() => Tone.Transport.start());
              }
            }}
          >
            {Tone.Transport.state === 'started' ? (
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

      {/* Simple progress display */}
      <div className="text-xs text-muted-foreground">
        {isLoaded ? `${currentTime.toFixed(2)} / ${duration.toFixed(2)} sec` : 'Loading...'}
      </div>
    </div>
  );
};

export default AudioPlayer;
