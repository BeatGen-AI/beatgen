import React from 'react';
import { Button } from "../../../components/ui/button";
import { 
  PlayArrow as PlayIcon, 
  Pause as PauseIcon, 
  DeleteOutline as DeleteIcon,
  DriveFileMove as EditIcon
} from '@mui/icons-material';
import { Drum } from 'lucide-react';
import { DrumTrackRead } from '../../../platform/types/dto/track_models/drum_track';
import { Badge } from "../../../components/ui/badge";
import BaseTrackCard from './BaseTrackCard';

interface DrumTrackCardProps {
  track: DrumTrackRead;
  playingId: string | null;
  handlePlayTrack: (track: DrumTrackRead) => void;
  handleDeleteTrack: (trackId: string) => void;
  handleEditTrack?: (trackId: string) => void;
  sectionColor: string;
}

const DrumTrackCard: React.FC<DrumTrackCardProps> = ({
  track,
  playingId,
  handlePlayTrack,
  handleDeleteTrack,
  handleEditTrack,
  sectionColor
}) => {
  const isPlaying = playingId === track.id;
  const samplerCount = track.sampler_tracks?.length || 0;

  const icon = <Drum className="text-primary" size={18} />;
  
  const headerActions = (
    <>
      <Button 
        variant="ghost"
        size="icon"
        onClick={() => handlePlayTrack(track)}
        className="text-muted-foreground hover:bg-accent hover:text-primary h-7 w-7"
      >
        {isPlaying ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
      </Button>
      {handleEditTrack && (
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => handleEditTrack(track.id)}
          className="text-muted-foreground hover:bg-accent hover:text-yellow-500 dark:hover:text-yellow-400 h-7 w-7"
        >
          <EditIcon fontSize="small" />
        </Button>
      )}
      <Button 
        variant="ghost" 
        size="icon"
        onClick={() => handleDeleteTrack(track.id)}
        className="text-muted-foreground hover:bg-accent hover:text-destructive h-7 w-7"
      >
        <DeleteIcon fontSize="small" />
      </Button>
    </>
  );

  const previewContent = (
    <div className="flex flex-wrap gap-1 justify-center items-center">
      {samplerCount > 0 ? (
        track.sampler_tracks?.map((sampler) => (
          <Badge 
            key={sampler.id} 
            variant="outline" 
            className="text-xs"
          >
            {sampler.name}
          </Badge>
        ))
      ) : (
        <div className="text-muted-foreground text-sm">
          No samples added yet
        </div>
      )}
    </div>
  );

  const footerRight = `${samplerCount} ${samplerCount === 1 ? 'sample' : 'samples'}`;

  return (
    <BaseTrackCard
      title={track.name}
      icon={icon}
      sectionColor={sectionColor}
      headerActions={headerActions}
      previewContent={previewContent}
      footerRight={footerRight}
      className="drum-track-card"
    />
  );
};

export default DrumTrackCard;