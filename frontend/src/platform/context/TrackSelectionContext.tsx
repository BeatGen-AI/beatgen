import React, { createContext, useContext, useState, ReactNode } from 'react';
import { AudioTrackRead } from '../types/dto/track_models/audio_track';
import { MidiTrackRead } from '../types/dto/track_models/midi_track';
import { SamplerTrackRead } from '../types/dto/track_models/sampler_track';
import { DrumTrackRead } from '../types/dto/track_models/drum_track';

type SelectableTrack = AudioTrackRead | MidiTrackRead | SamplerTrackRead | DrumTrackRead;

interface SelectedTrackInfo {
  track: SelectableTrack;
  trackType: 'AUDIO' | 'MIDI' | 'SAMPLER' | 'DRUM';
}

interface TrackSelectionContextType {
  selectedTracks: Map<string, SelectedTrackInfo>;
  toggleTrackSelection: (track: SelectableTrack, trackType: 'AUDIO' | 'MIDI' | 'SAMPLER' | 'DRUM') => void;
  clearSelection: () => void;
  isTrackSelected: (trackId: string) => boolean;
  getSelectedTrackCount: () => number;
}

const TrackSelectionContext = createContext<TrackSelectionContextType | undefined>(undefined);

export const TrackSelectionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedTracks, setSelectedTracks] = useState<Map<string, SelectedTrackInfo>>(new Map());

  const toggleTrackSelection = (track: SelectableTrack, trackType: 'AUDIO' | 'MIDI' | 'SAMPLER' | 'DRUM') => {
    setSelectedTracks(prev => {
      const newMap = new Map(prev);
      if (newMap.has(track.id)) {
        newMap.delete(track.id);
      } else {
        newMap.set(track.id, { track, trackType });
      }
      return newMap;
    });
  };

  const clearSelection = () => {
    setSelectedTracks(new Map());
  };

  const isTrackSelected = (trackId: string) => {
    return selectedTracks.has(trackId);
  };

  const getSelectedTrackCount = () => {
    return selectedTracks.size;
  };

  return (
    <TrackSelectionContext.Provider
      value={{
        selectedTracks,
        toggleTrackSelection,
        clearSelection,
        isTrackSelected,
        getSelectedTrackCount,
      }}
    >
      {children}
    </TrackSelectionContext.Provider>
  );
};

export const useTrackSelection = () => {
  const context = useContext(TrackSelectionContext);
  if (!context) {
    throw new Error('useTrackSelection must be used within a TrackSelectionProvider');
  }
  return context;
};