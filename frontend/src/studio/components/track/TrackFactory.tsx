import React from 'react';
import { getTrackColor } from '../../constants/gridConstants';
import { TrackPreviewProps } from './types';
import AudioTrackPreview from './audio/AudioTrackPreview';
import MidiTrackPreview from './midi/MidiTrackPreview';
import DrumTrackPreview from './drum/DrumTrackPreview';
import { Tool } from '../../shared/interactions';

/**
 * TrackFactory is responsible for creating the appropriate track component
 * based on the track type. It follows the factory pattern to instantiate
 * the correct specialized component (Audio, MIDI, or Drum) while maintaining
 * a consistent interface for the parent Track component.
 * 
 * This allows the Track component to work with any track type without
 * knowing the internal implementation details of each specialized track component.
 */
interface TrackFactoryProps extends TrackPreviewProps {
  isSelected?: boolean;
  selectedTool?: Tool;
  isGroupDrag?: boolean;
  isPrimaryDrag?: boolean;
  onTrackClick?: (trackId: string, event: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => void;
  onTrackDoubleClick?: (trackId: string) => void;
  interaction?: any;
}

export const TrackFactory: React.FC<TrackFactoryProps> = (props) => {
  const { 
    track, 
    trackIndex = 0, 
    trackColor: providedTrackColor, 
    onResizeEnd,
    isSelected,
    selectedTool,
    isGroupDrag,
    isPrimaryDrag,
    onTrackClick,
    onTrackDoubleClick,
    interaction
  } = props;
  const trackColor = providedTrackColor || getTrackColor(trackIndex);
  
  // Ensure track exists
  if (!track) {
    console.error('TrackFactory received null or undefined track');
    return null;
  }
  
  // This property access can't be directly checked due to TypeScript limitations
  // So we'll use a type assertion, but fallback gracefully if it's undefined
  const trackType = track['type'] as string | undefined;
  
  if (!trackType) {
    console.error('TrackFactory received track with missing type:', track);
    return null;
  }
  
  const commonProps = {
    ...props,
    trackColor,
    onResizeEnd,
    isSelected,
    selectedTool,
    isGroupDrag,
    isPrimaryDrag,
    onTrackClick,
    onTrackDoubleClick,
    interaction
  };

  switch(trackType) {
    case 'AUDIO':
      return <AudioTrackPreview {...commonProps} />;
    case 'MIDI':
      return <MidiTrackPreview {...commonProps} />;
    case 'SAMPLER':
      return <MidiTrackPreview {...commonProps} />;
    case 'DRUM':
      return <DrumTrackPreview {...commonProps} />;
    default:
      console.error(`Unknown track type: ${trackType}`);
      return null;
  }
};

export default TrackFactory;