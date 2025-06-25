import React, { useState, useRef, useEffect } from 'react';
import { 
  Typography, 
  Slider, 
  IconButton, 
  Tooltip, 
  TextField,
  Select, 
  MenuItem,
  ButtonBase
} from '@mui/material';
import { useTheme } from '../../../platform/theme/ThemeContext';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import { IconTrash } from '@tabler/icons-react';
import { IconBackspace } from '@tabler/icons-react';
import { IconBackspaceFilled } from '@tabler/icons-react';
import PanToolIcon from '@mui/icons-material/PanTool';
import { CombinedTrack, AudioTrackRead, SamplerTrackRead } from '../../../platform/types/project';
import { getTrackColor, GRID_CONSTANTS } from '../../constants/gridConstants';
import ControlKnob from './track-sidebar-controls/ControlKnob';
import { alpha } from '@mui/material/styles';

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
  const theme = useTheme();

  if (tracks.length === 0) {
    return (
      <div className="p-2 text-center flex flex-col items-center justify-center h-full" style={{
        color: theme.palette.text.disabled
      }}>
        <Typography variant="body2" color="inherit">
          No tracks yet
        </Typography>
        <Typography variant="caption" sx={{ mt: 1 }} color="inherit">
          Add tracks using the button above
        </Typography>
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
  const theme = useTheme();
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
    console.warn('Solo toggle state location unclear on CombinedTrack');
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
          <div className="mb-2 flex items-center">
            <Typography variant="caption" sx={{ 
              color: trackColor,
              fontSize: '9px',
              mr: 0.5,
              whiteSpace: 'nowrap',
              marginTop: '-20px',
            }}>
              Inst:
            </Typography>
            <div className="text-xs p-1 rounded flex-grow overflow-hidden text-ellipsis whitespace-nowrap" style={{
              backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)',
              color: theme.palette.text.secondary
            }}>
              {track.name}
            </div>
          </div>
        );
      
      case 'DRUM':
        return (
          <div className="mb-2 flex items-center">
            <Typography variant="caption" sx={{ 
              color: trackColor,
              fontSize: '9px',
              mr: 0.5,
              whiteSpace: 'nowrap',
              marginTop: '-20px',
            }}>
              Kit:
            </Typography>
            <Select
              size="small"
              value="808"
              fullWidth
              sx={{ 
                fontSize: '10px',
                height: '22px',
                '.MuiSelect-select': { py: 0 },
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)',
                color: 'text.primary'
              }}
            >
              <MenuItem value="808" sx={{ fontSize: '10px' }}>808 Kit</MenuItem>
              <MenuItem value="acoustic" sx={{ fontSize: '10px' }}>Acoustic Kit</MenuItem>
              <MenuItem value="electronic" sx={{ fontSize: '10px' }}>Electronic Kit</MenuItem>
            </Select>
          </div>
        );
        
      case 'AUDIO':
        // Cast track.track to AudioTrackRead
        const audioTrackData = track.track as AudioTrackRead;
        const audioFileName = audioTrackData.name;
        return (
          <div className="mb-2 flex items-center">
            <Typography variant="caption" sx={{ 
              color: trackColor,
              fontSize: '9px',
              mr: 0.5,
              whiteSpace: 'nowrap',
              marginTop: '-20px',
            }}>
              File:
            </Typography>
            <Tooltip title="Click to load audio file">
              <ButtonBase
                onClick={handleLoadFileClick}
                sx={{
                  fontSize: '10px',
                  color: 'text.secondary',
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)',
                  p: 0.5,
                  borderRadius: 1,
                  flexGrow: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'left',
                  justifyContent: 'flex-start',
                  width: '100%',
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: theme.palette.action.hover,
                  }
                }}
                disabled={!onLoadAudioFile}
              >
                  {audioFileName || track.name}
              </ButtonBase>
            </Tooltip>
          </div>
        );
        
      case 'SAMPLER':
        // Cast track.track to SamplerTrackRead
        const samplerTrackData = track.track as SamplerTrackRead;
        const samplerFileName = samplerTrackData.audio_file_name;
        return (
          <div className="mb-2 flex items-center">
            <Typography variant="caption" sx={{ 
              color: trackColor,
              fontSize: '9px',
              mr: 0.5,
              whiteSpace: 'nowrap',
              marginTop: '-20px',
            }}>
              File:
            </Typography>
            <Tooltip title="Click to load audio file">
              <ButtonBase
                onClick={handleLoadFileClick}
                sx={{
                  fontSize: '10px',
                  color: 'text.secondary',
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)',
                  p: 0.5,
                  borderRadius: 1,
                  flexGrow: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'left',
                  justifyContent: 'flex-start',
                  width: '100%',
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: theme.palette.action.hover,
                  }
                }}
                disabled={!onLoadAudioFile}
              >
                  {samplerFileName || track.name}
              </ButtonBase>
            </Tooltip>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div className="p-2 mb-1 box-border border-b hover:bg-opacity-50" style={{
      height: `${GRID_CONSTANTS.trackHeight - 2}px`,
      borderLeft: `3px solid ${trackColor}`,
      borderBottomColor: theme.palette.divider,
      backgroundColor: theme.palette.background.paper
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = theme.palette.action.hover;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = theme.palette.background.paper;
    }}>
      {/* Track Name and Delete Button */}
      <div className="flex items-center justify-between mb-1 w-full">
        {/* Track name and type-specific controls */}
        <div className="flex-grow mr-1 max-w-36">
          {renderTypeSpecificControls()}
        </div>
        
        <Tooltip title="Delete track">
          <IconButton 
            size="small" 
            onClick={handleDelete}
            sx={{ 
              color: trackColor, 
              padding: '3px',
              mt: -0.3,
              mr: 0.9, 
              borderRadius: '8px',
              '&:hover': { 
                bgcolor: theme.palette.action.hover
              }
            }}
            disableRipple 
          >
            <IconBackspace size={18}/>
          </IconButton>
        </Tooltip>
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
            color={track.mute ? theme.palette.action.disabled : trackColor}
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
          <Tooltip title={track.mute ? "Unmute" : "Mute"}>
              <div 
                onClick={handleMuteToggle}
                className="rounded px-3 py-1 text-xs font-bold cursor-pointer"
                style={{ 
                  backgroundColor: track.mute ? theme.palette.warning.light : theme.palette.action.disabledBackground,
                  color: track.mute ? theme.palette.warning.contrastText : trackColor
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = track.mute ? theme.palette.warning.main : theme.palette.action.hover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = track.mute ? theme.palette.warning.light : theme.palette.action.disabledBackground;
                }}
              >
                M
              </div>
            </Tooltip>
        </div>
        
        {/* Solo Button */}
        <div className="flex justify-center">
          <Tooltip title={track.solo ? "Unsolo" : "Solo"}>
            <div 
              onClick={handleSoloToggle}
              className="rounded px-3 py-1 text-xs font-bold cursor-pointer"
              style={{ 
                backgroundColor: track.solo ? '#ffc107' : 'rgba(255, 255, 255, 0.1)',
                color: track.solo ? '#000' : trackColor
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = track.solo ? '#e6ac00' : 'rgba(255, 255, 255, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = track.solo ? '#ffc107' : 'rgba(255, 255, 255, 0.1)';
              }}
            >
              S
            </div>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default TrackControlsSidebar;