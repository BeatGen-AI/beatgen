import React from 'react';
import { Button } from "../../../components/ui/button";
import { Play, Pause, Trash2, Settings } from 'lucide-react';
import { IconWaveSine } from '@tabler/icons-react';
import { SamplerTrackRead } from '../../../platform/types/dto/track_models/sampler_track';
import { formatTime, formatFileSize } from '../../../studio/utils/audioProcessing';
import AudioPreview from '../../../studio/components/shared/AudioPreview';
import MidiNotesPreview from '../../../studio/components/piano-roll/components/MidiNotesPreview';
import { convertJsonToNotes } from '../../../types/note';
import BaseTrackCard from './BaseTrackCard';
import { formatDate } from '../../utils/dateFormat';

interface SamplerTrackCardProps {
  track: SamplerTrackRead;
  playingId: string | null;
  currentTime: number;
  duration: number;
  handlePlayTrack: (track: SamplerTrackRead) => void;
  handleDeleteTrack: (trackId: string) => void;
  handleEditTrack?: (trackId: string) => void;
  handleSeek?: (trackId: string, position: number) => void;
  sectionColor: string;
  isSelectable?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

const SamplerTrackCard: React.FC<SamplerTrackCardProps> = ({
  track,
  playingId,
  currentTime,
  duration,
  handlePlayTrack,
  handleDeleteTrack,
  handleEditTrack,
  handleSeek,
  sectionColor,
  isSelectable = false,
  isSelected = false,
  onSelect,
}) => {
  const isPlaying = playingId === track.id;
  
  // Calculate the number of notes in the track (if available)
  const noteCount = track.midi_notes_json && track.midi_notes_json.notes ? 
    (track.midi_notes_json.notes as any[]).length : 
    0;

  // Convert MIDI notes JSON to Note array for preview
  const notes = track.midi_notes_json ? convertJsonToNotes(track.midi_notes_json, track.id) : [];
  
  // Format the base MIDI note to a more readable format (e.g., C3, D#4)
  const formatMidiNote = (midiNote: number): string => {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteName = noteNames[midiNote % 12];
    const octave = Math.floor(midiNote / 12) - 1;
    return `${noteName}${octave}`;
  };

  const icon = <IconWaveSine className="text-green-600 dark:text-green-400" size={18} />;
  
  const headerActions = (
    <>
      <Button 
        variant="ghost"
        size="icon"
        onClick={() => handlePlayTrack(track)}
        className="text-muted-foreground hover:bg-accent hover:text-green-600 dark:hover:text-green-400 h-7 w-7"
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
          <Settings size={16} />
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
    <div className="w-full h-full flex flex-col gap-1">
      <div className="h-[35px] w-full">
        <AudioPreview
          audioUrl={track.audio_storage_key || ''}
          variant="card"
          duration={track.audio_file_duration}
          isPlaying={isPlaying}
          color={sectionColor}
        />
      </div>
      <div className="h-[35px] w-full">
        <MidiNotesPreview
          width={260}
          height={35}
          noteColor={sectionColor}
          notes={notes}
        />
      </div>
    </div>
  );

  const footerLeft = formatDate(track.created_at);
  const footerCenter = `${formatMidiNote(track.base_midi_note)} • ${formatTime(track.audio_file_duration, false)}`;
  const footerRight = `${noteCount} notes`;

  return (
    <BaseTrackCard
      title={track.name}
      icon={icon}
      sectionColor={sectionColor}
      headerActions={headerActions}
      previewContent={previewContent}
      footerLeft={footerLeft}
      footerCenter={footerCenter}
      footerRight={footerRight}
      className="sampler-track-card"
      isSelectable={isSelectable}
      isSelected={isSelected}
      onSelect={onSelect}
    />
  );
};

export default SamplerTrackCard;