import React from 'react';
import { Button } from "../../../components/ui/button";
import { AudioWaveform, Trash2 } from 'lucide-react';
import { AudioTrackRead as Sound } from '../../../platform/types/dto/track_models/audio_track'; 
import { formatTime } from '../../../studio/utils/audioProcessing';
import AudioPlayer from '../../../studio/components/shared/AudioPlayer';
import BaseTrackCard from './BaseTrackCard';
import { downloadAudioTrackFile } from '../../api/sounds';
import { useState, useEffect } from 'react';

interface AudioTrackCardProps {
  sound: Sound;
  handleDeleteSound: (soundId: string) => void;
  sectionColor: string;
}

const AudioTrackCard: React.FC<AudioTrackCardProps> = ({
  sound,
  handleDeleteSound,
  sectionColor,
}) => {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isLoadingBlob, setIsLoadingBlob] = useState(false);

  const loadAudioBlob = async () => {
    if (audioBlob || isLoadingBlob) return;
    
    setIsLoadingBlob(true);
    try {
      const blob = await downloadAudioTrackFile(sound.audio_file_storage_key);
      setAudioBlob(blob);
    } catch (error) {
      console.error('Failed to load audio blob:', error);
    } finally {
      setIsLoadingBlob(false);
    }
  };

  // Auto-load audio when component mounts
  useEffect(() => {
    loadAudioBlob();
  }, [sound.audio_file_storage_key]);

  const icon = <AudioWaveform className="text-primary" size={18} />;
  
  const previewContent = (
    <div className="w-full h-[80px] flex items-center justify-center p-2">
      {audioBlob ? (
        <AudioPlayer
          audioBlob={audioBlob}
          fileName={`${sound.name}.wav`}
          color={sectionColor}
          className="w-full"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted/20 rounded">
          <span className="text-sm text-muted-foreground">
            {isLoadingBlob ? 'Loading...' : 'Loading audio...'}
          </span>
        </div>
      )}
    </div>
  );

  const footerLeft = formatTime(sound.audio_file_duration, false);

  return (
    <BaseTrackCard
      title={sound.name}
      icon={icon}
      sectionColor={sectionColor}
      headerActions={
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => handleDeleteSound(sound.id)}
          className="text-muted-foreground hover:bg-accent hover:text-destructive h-7 w-7"
        >
          <Trash2 size={16} />
        </Button>
      }
      previewContent={previewContent}
      footerLeft={footerLeft}
      className="audio-track-card"
    />
  );
};

export default AudioTrackCard;
