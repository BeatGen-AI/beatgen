import React, { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, Music, Trash2, Hand } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../components/ui/tooltip';
import { CombinedTrack, AudioTrackRead, SamplerTrackRead } from '../../../platform/types/project';
import { getTrackColor, GRID_CONSTANTS } from '../../constants/gridConstants';
import ControlKnob from './track-sidebar-controls/ControlKnob';
import { useAppTheme } from '../../../lib/theme-provider';

// Interface for the component props
interface TrackControlsSidebarProps {
  tracks: CombinedTrack[];
  onVolumeChange: (trackId: string, volume: number) => void;
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
    <div className="w-full h-full overflow-auto">
      {tracks.map((track, index) => (
        <TrackControls 
          key={track.id}
          track={track}
          index={index}
          onVolumeChange={onVolumeChange}
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
  
  // Handler for volume changes during dragging (updates local state only)
  const handleVolumeChange = (event: Event, newValue: number | number[]) => {
    // Just update local component state, no store updates
    setLocalVolume(newValue as number);
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
                backgroundColor: studioMode === 'dark' ? '#2a2a2a' : '#f1f5f9',
                color: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)'
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
            <Select value="808">
              <SelectTrigger 
                className="h-6 text-xs flex-grow"
                style={{
                  backgroundColor: studioMode === 'dark' ? '#2a2a2a' : '#f1f5f9',
                  borderColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                  color: studioMode === 'dark' ? '#ffffff' : '#000000'
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="808" className="text-xs">808 Kit</SelectItem>
                <SelectItem value="acoustic" className="text-xs">Acoustic Kit</SelectItem>
                <SelectItem value="electronic" className="text-xs">Electronic Kit</SelectItem>
              </SelectContent>
            </Select>
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLoadFileClick}
                    className="text-xs p-1 rounded flex-grow overflow-hidden text-ellipsis whitespace-nowrap text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                    style={{
                      backgroundColor: studioMode === 'dark' ? '#2a2a2a' : '#f1f5f9',
                      color: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)'
                    }}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.backgroundColor = studioMode === 'dark' ? '#3a3a3a' : '#e2e8f0';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = studioMode === 'dark' ? '#2a2a2a' : '#f1f5f9';
                    }}
                    disabled={!onLoadAudioFile}
                  >
                    {audioFileName || track.name}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Click to load audio file</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLoadFileClick}
                    className="text-xs p-1 rounded flex-grow overflow-hidden text-ellipsis whitespace-nowrap text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                    style={{
                      backgroundColor: studioMode === 'dark' ? '#2a2a2a' : '#f1f5f9',
                      color: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)'
                    }}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.backgroundColor = studioMode === 'dark' ? '#3a3a3a' : '#e2e8f0';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = studioMode === 'dark' ? '#2a2a2a' : '#f1f5f9';
                    }}
                    disabled={!onLoadAudioFile}
                  >
                    {samplerFileName || track.name}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Click to load audio file</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div 
      className="p-2 mb-1 box-border"
      style={{
        height: `${GRID_CONSTANTS.trackHeight - 2}px`,
        borderLeft: `3px solid ${trackColor}`,
        borderBottom: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
        backgroundColor: studioMode === 'dark' ? '#1a1a1a' : '#ffffff',
        color: studioMode === 'dark' ? '#ffffff' : '#000000'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = studioMode === 'dark' ? '#2a2a2a' : '#f5f5f5';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = studioMode === 'dark' ? '#1a1a1a' : '#ffffff';
      }}
    >
      {/* Track Name and Delete Button */}
      <div className="flex items-center justify-between mb-1 w-full">
        {/* Track name and type-specific controls */}
        <div className="flex-grow mr-2 max-w-36">
          {renderTypeSpecificControls()}
        </div>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button 
                onClick={handleDelete}
                className="p-1 -mt-1 mr-2 rounded-lg transition-colors"
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
              >
                <Trash2 size={18}/>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete track</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      {/* Controls row - Modified for even spacing */}
      <div className="grid grid-cols-4 items-center gap-2 mb-2">
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
            valueFormatter={(val) => `${val}%`}
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
        <div className="flex justify-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  onClick={handleMuteToggle}
                  className="rounded px-3 py-1 text-xs font-bold cursor-pointer transition-colors"
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
                >
                  M
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{track.mute ? "Unmute" : "Mute"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        {/* Solo Button */}
        <div className="flex justify-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  onClick={handleSoloToggle}
                  className="rounded px-3 py-1 text-xs font-bold cursor-pointer transition-colors"
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
                >
                  S
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{(track.solo ?? track.soloed) ? "Unsolo" : "Solo"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
};

export default TrackControlsSidebar;