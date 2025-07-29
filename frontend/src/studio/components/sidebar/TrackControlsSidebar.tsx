import React, { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, Music, Hand } from 'lucide-react';
import { IconBackspace } from '@tabler/icons-react';
import { CombinedTrack, AudioTrackRead, SamplerTrackRead } from '../../../platform/types/project';
import { getTrackColor, GRID_CONSTANTS } from '../../constants/gridConstants';
import ControlKnob from './track-sidebar-controls/ControlKnob';
import { useAppTheme } from '../../../lib/theme-provider';

// Interface for the component props
interface TrackControlsSidebarProps {
  tracks: CombinedTrack[];
  onVolumeChange: (trackId: string, volume: number) => void;
  onVolumeChangeLive?: (trackId: string, volume: number) => void; // For real-time updates during dragging
  onPanChange: (trackId: string, pan: number) => void;
  onMuteToggle: (trackId: string, muted: boolean) => void;
  onSoloToggle: (trackId: string, soloed: boolean) => void;
  onTrackDelete: (trackId: string) => void;
  onTrackNameChange?: (trackId: string, name: string) => void;
  onInstrumentChange?: (trackId: string, instrumentId: string, instrumentName: string, instrumentStorageKey?: string) => void;
  onLoadAudioFile?: (trackId: string) => void;
}

const TrackControlsSidebar: React.FC<TrackControlsSidebarProps> = ({
  tracks,
  onVolumeChange,
  onVolumeChangeLive,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  onTrackDelete,
  onTrackNameChange,
  onInstrumentChange,
  onLoadAudioFile
}) => {
  const { studioMode } = useAppTheme();
  if (tracks.length === 0) {
    return (
      <div 
        className="p-4 text-center flex flex-col items-center justify-center h-full"
        style={{
          color: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)'
        }}
      >
        <p className="text-sm">
          No tracks yet
        </p>
        <p className="text-xs mt-1">
          Add tracks using the button above
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto relative z-[100000]">
      {tracks.map((track, index) => (
        <TrackControls 
          key={track.id}
          track={track}
          index={index}
          onVolumeChange={onVolumeChange}
          onVolumeChangeLive={onVolumeChangeLive}
          onPanChange={onPanChange}
          onMuteToggle={onMuteToggle}
          onSoloToggle={onSoloToggle}
          onTrackDelete={onTrackDelete}
          onTrackNameChange={onTrackNameChange}
          onInstrumentChange={onInstrumentChange}
          onLoadAudioFile={onLoadAudioFile}
        />
      ))}
    </div>
  );
};

interface TrackControlsProps {
  track: CombinedTrack;
  index: number;
  onVolumeChange: (trackId: string, volume: number) => void;
  onVolumeChangeLive?: (trackId: string, volume: number) => void;
  onPanChange: (trackId: string, pan: number) => void;
  onMuteToggle: (trackId: string, muted: boolean) => void;
  onSoloToggle: (trackId: string, soloed: boolean) => void;
  onTrackDelete: (trackId: string) => void;
  onTrackNameChange?: (trackId: string, name: string) => void;
  onInstrumentChange?: (trackId: string, instrumentId: string, instrumentName: string) => void;
  onLoadAudioFile?: (trackId: string) => void;
}

const TrackControls: React.FC<TrackControlsProps> = ({
  track,
  index,
  onVolumeChange,
  onVolumeChangeLive,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  onTrackDelete,
  onTrackNameChange,
  onInstrumentChange,
  onLoadAudioFile
}) => {
  // Return null if track has a drum_track_id
  if (track.track_type === 'SAMPLER' && 
      track.track && 
      'drum_track_id' in track.track && 
      track.track.drum_track_id != null) {
    return null;
  }

  const { studioMode } = useAppTheme();
  const trackColor = getTrackColor(index);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(track.name);
  const nameInputRef = useRef<HTMLInputElement>(null);
  
  // Local state for slider values during dragging
  const [localVolume, setLocalVolume] = useState(track.volume ?? 80);
  const [localPan, setLocalPan] = useState(track.pan ?? 0);
  
  // Update local state if track values change from elsewhere
  useEffect(() => {
    setLocalVolume(track.volume ?? 80);
  }, [track.volume]);
  
  useEffect(() => {
    setLocalPan(track.pan ?? 0);
  }, [track.pan]);
  
  // Handler for volume changes during dragging (updates local state and audio engine in real-time)
  const handleVolumeChange = (event: Event, newValue: number | number[]) => {
    const volume = newValue as number;
    // Update local component state
    setLocalVolume(volume);
    
    // Update audio engine in real-time if live handler is provided
    if (onVolumeChangeLive) {
      onVolumeChangeLive(track.id, volume);
    }
  };
  
  // Handler for volume changes when drag completes (updates store)
  const handleVolumeChangeCommitted = (event: React.SyntheticEvent | Event, newValue: number | number[]) => {
    onVolumeChange(track.id, newValue as number);
  };
  
  // Handler for pan changes during dragging (updates local state only)
  const handlePanChange = (event: Event, newValue: number | number[]) => {
    // Just update local component state, no store updates
    setLocalPan(newValue as number);
  };
  
  // Handler for pan changes when drag completes (updates store)
  const handlePanChangeCommitted = (event: React.SyntheticEvent | Event, newValue: number | number[]) => {
    onPanChange(track.id, newValue as number);
  };
  
  // Handler for mute toggling
  const handleMuteToggle = () => {
    onMuteToggle(track.id, !(track.mute ?? false));
  };
  
  // Handler for solo toggling
  const handleSoloToggle = () => {
    onSoloToggle(track.id, !(track.solo ?? track.soloed ?? false));
  };
  
  // Handler for track deletion
  const handleDelete = () => {
    onTrackDelete(track.id);
  };
  
  // Handler for track name editing
  const handleNameChange = () => {
    if (editedName.trim() !== '' && onTrackNameChange) {
      onTrackNameChange(track.id, editedName);
    }
    setIsEditingName(false);
  };
  
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isEditingName]);
  
  const handleLoadFileClick = () => {
    if (onLoadAudioFile) {
        onLoadAudioFile(track.id);
    }
  }
  
  // Render type-specific controls based on track type
  const renderTypeSpecificControls = () => {
    switch(track.track_type) {
      case 'MIDI':
        return (
          <div className="mb-1 flex items-center">
            <span 
              className="text-xs mr-1 whitespace-nowrap -mt-5"
              style={{ color: trackColor, fontSize: '9px' }}
            >
              Inst:
            </span>
            <div 
              className="text-xs p-1 rounded flex-grow overflow-hidden text-ellipsis whitespace-nowrap"
              style={{
                backgroundColor: studioMode === 'dark' ? '#0f0f0f' : '#e2e8f0',
                color: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)',
                fontSize: '10px',
                fontWeight: 'lighter'
              }}
            >
              {track.name}
            </div>
          </div>
        );
      
      case 'DRUM':
        return (
          <div className="mb-1 flex items-center">
            <span 
              className="text-xs mr-1 whitespace-nowrap -mt-5"
              style={{ color: trackColor, fontSize: '9px' }}
            >
              Kit:
            </span>
            <button
              className="text-xs p-1 rounded flex-grow overflow-hidden text-ellipsis whitespace-nowrap text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              style={{
                backgroundColor: studioMode === 'dark' ? '#0f0f0f' : '#e2e8f0',
                color: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)',
                fontSize: '10px',
                fontWeight: 'lighter'
              }}
            >
              808 Kit
            </button>
          </div>
        );
        
      case 'AUDIO':
        // Cast track.track to AudioTrackRead
        const audioTrackData = track.track as AudioTrackRead;
        const audioFileName = audioTrackData.name;
        return (
          <div className="mb-1 flex items-center">
            <span 
              className="text-xs mr-1 whitespace-nowrap -mt-5"
              style={{ color: trackColor, fontSize: '9px' }}
            >
              File:
            </span>
            <button
              onClick={handleLoadFileClick}
              className="text-xs p-1 rounded flex-grow overflow-hidden text-ellipsis whitespace-nowrap text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              style={{
                backgroundColor: studioMode === 'dark' ? '#0f0f0f' : '#e2e8f0',
                color: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)',
                fontSize: '10px',
                fontWeight: 'lighter'
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = studioMode === 'dark' ? '#1a1a1a' : '#d1d5db';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = studioMode === 'dark' ? '#0f0f0f' : '#e2e8f0';
              }}
              disabled={!onLoadAudioFile}
              title="Click to load audio file"
            >
              {audioFileName || track.name}
            </button>
          </div>
        );
        
      case 'SAMPLER':
        // Cast track.track to SamplerTrackRead
        const samplerTrackData = track.track as SamplerTrackRead;
        const samplerFileName = samplerTrackData.audio_file_name;
        return (
          <div className="mb-1 flex items-center">
            <span 
              className="text-xs mr-1 whitespace-nowrap -mt-5"
              style={{ color: trackColor, fontSize: '9px' }}
            >
              File:
            </span>
            <button
              onClick={handleLoadFileClick}
              className="text-xs p-1 rounded flex-grow overflow-hidden text-ellipsis whitespace-nowrap text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              style={{
                backgroundColor: studioMode === 'dark' ? '#0f0f0f' : '#e2e8f0',
                color: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)',
                fontSize: '10px',
                fontWeight: 'lighter'
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.backgroundColor = studioMode === 'dark' ? '#1a1a1a' : '#d1d5db';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = studioMode === 'dark' ? '#0f0f0f' : '#e2e8f0';
              }}
              disabled={!onLoadAudioFile}
              title="Click to load audio file"
            >
              {samplerFileName || track.name}
            </button>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div 
      className="px-2 py-1 box-border relative"
      style={{
        height: `${GRID_CONSTANTS.trackHeight}px`,
        borderLeft: `3px solid ${trackColor}`,
        borderBottom: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
        backgroundColor: studioMode === 'dark' ? '#0a0a0a' : '#f8fafc',
        color: studioMode === 'dark' ? '#ffffff' : '#000000'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = studioMode === 'dark' ? '#1a1a1a' : '#f1f5f9';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = studioMode === 'dark' ? '#0a0a0a' : '#f8fafc';
      }}
    >
      {/* Delete Button - Positioned absolutely in top right */}
      <button 
        onClick={handleDelete}
        className="absolute top-1 right-1 py-1 px-2 rounded-lg transition-colors z-10"
        style={{ 
          color: trackColor,
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
        title="Delete track"
      >
        <IconBackspace size={18}/>
      </button>

      {/* Track Name and Type-specific controls */}
      <div className="mb-1 mt-1 w-full pr-8" style={{ paddingBottom: '40px' }}>
        {renderTypeSpecificControls()}
      </div>
      
            {/* Controls row - Positioned absolutely at bottom with even spacing */}
      <div className="absolute bottom-3 left-2 right-2 grid grid-cols-4 items-center gap-4">
        {/* Volume Knob */}
        <div className="flex justify-center">
          <ControlKnob
            value={localVolume}
            min={0}
            max={100}
            size={32}
            color={track.mute ? '#9ca3af' : trackColor}
            label="Vol"
            type="volume"
            onChange={handleVolumeChange}
            onChangeCommitted={handleVolumeChangeCommitted}
            disabled={track.mute ?? false}
          />
        </div>
          
        {/* Pan Knob */}
        <div className="flex justify-center">
          <ControlKnob
            value={localPan}
            min={-100}
            max={100}
            size={32}
            color={trackColor}
            label="Pan"
            type="pan"
            onChange={handlePanChange}
            onChangeCommitted={handlePanChangeCommitted}
          />
        </div>

        {/* Mute button */}
        <div className="flex justify-center" style={{ transform: 'translateY(1px)' }}>
          <div 
            onClick={handleMuteToggle}
            className="rounded px-2.5 py-1 text-xs font-bold cursor-pointer transition-colors"
            style={{
              backgroundColor: track.mute 
                ? '#fbbf24' 
                : (studioMode === 'dark' ? '#2a2a2a' : '#f1f5f9'),
              color: track.mute ? '#000' : trackColor
            }}
            onMouseEnter={(e) => {
              if (track.mute) {
                e.currentTarget.style.backgroundColor = '#f59e0b';
              } else {
                e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (track.mute) {
                e.currentTarget.style.backgroundColor = '#fbbf24';
              } else {
                e.currentTarget.style.backgroundColor = studioMode === 'dark' ? '#2a2a2a' : '#f1f5f9';
              }
            }}
            title={track.mute ? "Unmute" : "Mute"}
          >
            M
          </div>
        </div>
        
        {/* Solo Button */}
        <div className="flex justify-center" style={{ transform: 'translateY(1px)' }}>
          <div 
            onClick={handleSoloToggle}
            className="rounded px-2.5 py-1 text-xs font-bold cursor-pointer transition-colors"
            style={{
              backgroundColor: (track.solo ?? track.soloed) 
                ? '#fbbf24' 
                : (studioMode === 'dark' ? '#2a2a2a' : '#f1f5f9'),
              color: (track.solo ?? track.soloed) ? '#000' : trackColor
            }}
            onMouseEnter={(e) => {
              if (track.solo ?? track.soloed) {
                e.currentTarget.style.backgroundColor = '#f59e0b';
              } else {
                e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (track.solo ?? track.soloed) {
                e.currentTarget.style.backgroundColor = '#fbbf24';
              } else {
                e.currentTarget.style.backgroundColor = studioMode === 'dark' ? '#2a2a2a' : '#f1f5f9';
              }
            }}
            title={(track.solo ?? track.soloed) ? "Unsolo" : "Solo"}
          >
            S
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrackControlsSidebar;