import React from 'react';
import { Button } from "../../../components/ui/button";
import { Play, Pause, Trash2, Music } from 'lucide-react';
import { MidiTrackRead } from '../../../platform/types/dto/track_models/midi_track'; 
import { formatTime } from '../../../studio/utils/audioProcessing';
import MidiNotesPreview from '../../../studio/components/piano-roll/components/MidiNotesPreview';
import { convertJsonToNotes } from '../../../types/note';
import BaseTrackCard from './BaseTrackCard';

interface MidiTrackCardProps {
  track: MidiTrackRead;
  playingId: string | null;
  currentTime: number;
  duration: number;
  handlePlayTrack: (track: MidiTrackRead) => void;
  handleDeleteTrack: (trackId: string) => void;
  handleEditTrack?: (trackId: string) => void;
  sectionColor: string;
}

const MidiTrackCard: React.FC<MidiTrackCardProps> = ({
  track,
  playingId,
  currentTime,
  duration,
  handlePlayTrack,
  handleDeleteTrack,
  handleEditTrack,
  sectionColor,
}) => {
  const isPlaying = playingId === track.id;
  
  // Calculate the number of notes in the track (if available)
  const noteCount = track.midi_notes_json && track.midi_notes_json.notes ? 
    (track.midi_notes_json.notes as any[]).length : 
    0;

  // Convert MIDI notes JSON to Note array for preview
  const notes = track.midi_notes_json ? convertJsonToNotes(track.midi_notes_json, track.id) : [];

  const icon = <Music className="text-primary" size={18} />;
  
  const headerActions = (
    <>
      <Button 
        variant="ghost"
        size="icon"
        onClick={() => handlePlayTrack(track)}
        className="text-muted-foreground hover:bg-accent hover:text-primary h-7 w-7"
      >
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </Button>
      {handleEditTrack && (
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => handleEditTrack(track.id)}
          className="text-muted-foreground hover:bg-accent hover:text-yellow-500 dark:hover:text-yellow-400 h-7 w-7"
        >
          <Music size={16} />
        </Button>
      )}
      <Button 
        variant="ghost" 
        size="icon"
        onClick={() => handleDeleteTrack(track.id)}
        className="text-muted-foreground hover:bg-accent hover:text-destructive h-7 w-7"
      >
        <Trash2 size={16} />
      </Button>
    </>
  );

  const previewContent = (
    <div className="w-full h-[50px] flex items-center justify-center">
      <MidiNotesPreview
        width={260}
        height={50}
        noteColor={sectionColor}
        notes={notes}
      />
    </div>
  );

  const footerLeft = `Instrument: ${track.instrument_file?.display_name || 'Unknown'}`;
  const footerRight = `${noteCount} notes${isPlaying ? ` ${formatTime(currentTime, false)} / ${formatTime(duration, false)}` : ''}`;

  return (
    <BaseTrackCard
      title={track.name}
      icon={icon}
      sectionColor={sectionColor}
      headerActions={headerActions}
      previewContent={previewContent}
      footerLeft={footerLeft}
      footerRight={footerRight}
      className="midi-track-card"
    />
  );
};

export default MidiTrackCard;