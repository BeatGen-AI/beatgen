import React from 'react';
import { Button } from "../../../components/ui/button";
import { PlayArrow as PlayIcon, Pause as PauseIcon, DeleteOutline as DeleteIcon, Launch as LaunchIcon } from '@mui/icons-material';
import { AudioWaveform } from 'lucide-react';
import { AudioTrackRead as Sound } from '../../../platform/types/dto/track_models/audio_track'; 
import { formatTime } from '../../../studio/utils/audioProcessing';
import AudioPreview from '../../../studio/components/shared/AudioPreview';
import BaseTrackCard from './BaseTrackCard';
import { openTrackInStudio } from '../../utils/studioLinks';

interface AudioTrackCardProps {
  sound: Sound;
  playingId: string | null;
  currentTime: number;
  duration: number | null;
  handlePlaySound: (sound: Sound) => void;
  handleDeleteSound: (soundId: string) => void;
  handleSeek: (soundId: string, position: number) => void;
  sectionColor: string;
}

const AudioTrackCard: React.FC<AudioTrackCardProps> = ({
  sound,
  playingId,
  handlePlaySound,
  handleDeleteSound,
  sectionColor,
}) => {
  const isPlaying = playingId === sound.id;

  const icon = <AudioWaveform className="text-primary" size={18} />;
  
  const headerActions = (
    <>
      <Button 
        variant="ghost"
        size="icon"
        onClick={() => handlePlaySound(sound)}
        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground h-7 w-7"
      >
        {isPlaying ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
      </Button>
      <Button 
        variant="ghost"
        size="icon"
        onClick={() => openTrackInStudio(sound.id, 'audio')}
        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground h-7 w-7"
        title="Open in Studio"
      >
        <LaunchIcon fontSize="small" />
      </Button>
      <Button 
        variant="ghost" 
        size="icon"
        onClick={() => handleDeleteSound(sound.id)}
        className="text-muted-foreground hover:bg-accent hover:text-destructive h-7 w-7"
      >
        <DeleteIcon fontSize="small" />
      </Button>
    </>
  );

  const previewContent = (
    <div className="w-full h-[50px] flex items-center justify-center">
      <AudioPreview
        audioUrl={sound.audio_file_storage_key || ''}
        variant="card"
        duration={sound.audio_file_duration}
        isPlaying={isPlaying}
        color={sectionColor}
      />
    </div>
  );

  const footerRight = formatTime(sound.audio_file_duration, false);

  return (
    <BaseTrackCard
      title={sound.name}
      icon={icon}
      sectionColor={sectionColor}
      headerActions={headerActions}
      previewContent={previewContent}
      footerRight={footerRight}
      className="audio-track-card"
    />
  );
};

export default AudioTrackCard;
