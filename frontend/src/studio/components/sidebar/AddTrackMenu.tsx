import React, { useState } from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText, Divider, useTheme } from '@mui/material';
import PianoIcon from '@mui/icons-material/Piano';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import { VirtualInstrumentsModal } from '../modals/VirtualInstrumentsModal';
import { VirtualInstrumentsBottomSheet } from '../modals/VirtualInstrumentBottomSheet';
import { DrumMachineBottomSheet } from '../modals/drum-machine/DrumModelBottomSheet';
import { DrumMachineModal } from '../modals/drum-machine/DrumMachineModal';
import { DrumSamplePublicRead } from 'src/platform/types/dto/public_models/drum_samples';
// Import types from store types file
import { TrackType, AddTrackPayload, MidiTrackPayload, DrumTrackPayload } from '../../stores/types';

interface AddTrackMenuProps {
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  // Use imported types
  onAddTrack: (type: TrackType, payload?: AddTrackPayload) => void;
  // Keep onFileUpload for direct audio/sampler uploads for now
  onFileUpload?: (file: File, isSampler?: boolean) => void;
  isAIAssistantOpen?: boolean;
}

export const AddTrackMenu: React.FC<AddTrackMenuProps> = ({ 
  isOpen, 
  anchorEl, 
  onClose, 
  onAddTrack, 
  onFileUpload,
  isAIAssistantOpen = false 
}) => {
  const theme = useTheme();
  const [isVirtualInstrumentModalOpen, setIsVirtualInstrumentModalOpen] = useState(false);
  const [isVirtualInstrumentBottomSheetOpen, setIsVirtualInstrumentBottomSheetOpen] = useState(false);
  const [isDrumMachineBottomSheetOpen, setIsDrumMachineBottomSheetOpen] = useState(false);
  const [isDrumMachineModalOpen, setIsDrumMachineModalOpen] = useState(false);
  
  // Track which bottom sheet is currently expanded (only one can be expanded at a time)
  const [expandedBottomSheet, setExpandedBottomSheet] = useState<'virtual' | 'drum' | null>(null);
  // Track the opening order to maintain consistent visual stacking
  const [bottomSheetOrder, setBottomSheetOrder] = useState<('virtual' | 'drum')[]>([]);
  
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, isSampler: boolean = false) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Decide if we want to consolidate file uploads into onAddTrack or keep separate
      // Keeping separate for now based on original structure
      if (onFileUpload) {
          onFileUpload(file, isSampler);
      } else {
          // Or potentially call onAddTrack here if we refactor later
          // onAddTrack(isSampler ? 'sampler' : 'audio', { file });
      }
      onClose();
      console.log('File uploaded');
    }
  };
  
  return (
    <>
      <Menu
        open={isOpen}
        anchorEl={anchorEl}
        onClose={onClose}
        PaperProps={{
          sx: { 
            bgcolor: 'background.paper', 
            color: 'text.primary', 
            minWidth: 180, 
            boxShadow: theme.shadows[3]
          } 
        }}
      >
        <MenuItem onClick={() => {
          setIsVirtualInstrumentModalOpen(true);
          onClose();
        }}
          sx={{ 
            fontSize: '13px',
            py: 1,
            '&:hover': { 
              bgcolor: theme.palette.action.hover 
            }
          }}
        >
          <ListItemIcon><PianoIcon sx={{ color: '#2196f3' }} /></ListItemIcon>
          <ListItemText primary="Virtual Instrument (MUI)" />
        </MenuItem>
        
        <MenuItem onClick={() => {
          // Close drum modal if open
          setIsDrumMachineBottomSheetOpen(false);
          setIsVirtualInstrumentBottomSheetOpen(true);
          setExpandedBottomSheet('virtual');
          setBottomSheetOrder(['virtual']); // Only one sheet at a time
          onClose();
        }}
          sx={{ 
            fontSize: '13px',
            py: 1,
            '&:hover': { 
              bgcolor: theme.palette.action.hover 
            }
          }}
        >
          <ListItemIcon><PianoIcon sx={{ color: '#e91e63' }} /></ListItemIcon>
          <ListItemText primary="Virtual Instrument (Bottom Sheet)" />
        </MenuItem>
        
        <MenuItem onClick={() => { 
          setIsDrumMachineModalOpen(true);
          onClose(); 
        }}
          sx={{ 
            fontSize: '13px',
            py: 1,
            '&:hover': { 
              bgcolor: theme.palette.action.hover 
            }
          }}
        >
          <ListItemIcon><GraphicEqIcon sx={{ color: '#ff9800' }} /></ListItemIcon>
          <ListItemText primary="Drum Machine (MUI)" />
        </MenuItem>
        
        <MenuItem onClick={() => { 
          // Close VI modal if open
          setIsVirtualInstrumentBottomSheetOpen(false);
          setIsDrumMachineBottomSheetOpen(true);
          setExpandedBottomSheet('drum');
          setBottomSheetOrder(['drum']); // Only one sheet at a time
          onClose(); 
        }}
          sx={{ 
            fontSize: '13px',
            py: 1,
            '&:hover': { 
              bgcolor: theme.palette.action.hover 
            }
          }}
        >
          <ListItemIcon><GraphicEqIcon sx={{ color: '#ff5722' }} /></ListItemIcon>
          <ListItemText primary="Drum Machine (Bottom Sheet)" />
        </MenuItem>
        
        <MenuItem
          sx={{ 
            fontSize: '13px',
            py: 1,
            '&:hover': { 
              bgcolor: theme.palette.action.hover
            }
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', width: '100%', cursor: 'pointer' }}>
            <ListItemIcon><AudioFileIcon sx={{ color: '#4caf50' }} /></ListItemIcon>
            <ListItemText primary="Import Audio" />
            <input 
              type="file" 
              accept="audio/*" 
              style={{ display: 'none' }} 
              onChange={(e) => handleFileUpload(e, false)}
            />
          </label>
        </MenuItem>
        <MenuItem
          sx={{ 
            fontSize: '13px',
            py: 1,
            '&:hover': { 
              bgcolor: theme.palette.action.hover 
            }
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', width: '100%', cursor: 'pointer' }}>
            <ListItemIcon><ContentCutIcon sx={{ color: '#9c27b0' }} /></ListItemIcon>
            <ListItemText primary="Sampler" />
            <input 
              type="file" 
              accept="audio/*" 
              style={{ display: 'none' }} 
              onChange={(e) => handleFileUpload(e, true)}
            />
          </label>
        </MenuItem>
      </Menu>

      <VirtualInstrumentsModal
        open={isVirtualInstrumentModalOpen}
        onClose={() => setIsVirtualInstrumentModalOpen(false)}
        onSelect={(instrumentId: string, instrumentName: string, instrumentStorageKey?: string) => {
          const payload: MidiTrackPayload = { instrumentId, instrumentName, instrumentStorageKey };
          onAddTrack('MIDI', payload);
          setIsVirtualInstrumentModalOpen(false);
        }}
      />
      
      {/* Bottom Sheet Container - anchored to bottom of viewport */}
      {/* Virtual Instruments Bottom Sheet */}
      {isVirtualInstrumentBottomSheetOpen && (
        <div 
          className="fixed bottom-0 left-0 right-0 z-50"
          style={{ 
            height: '40vh',
            marginRight: isAIAssistantOpen ? '350px' : '0'
          }}
        >
          <VirtualInstrumentsBottomSheet
            isOpen={isVirtualInstrumentBottomSheetOpen}
            onClose={() => {
              setIsVirtualInstrumentBottomSheetOpen(false);
              setExpandedBottomSheet(null);
              setBottomSheetOrder([]);
            }}
            onSelect={(instrumentId: string, instrumentName: string, instrumentStorageKey?: string) => {
              const payload: MidiTrackPayload = { instrumentId, instrumentName, instrumentStorageKey };
              onAddTrack('MIDI', payload);
            }}
            isAIAssistantOpen={isAIAssistantOpen}
            isOtherBottomSheetOpen={false}
            isMinimized={false}
            onToggleMinimize={() => {
              // No minimize functionality needed when only one sheet is open
            }}
          />
        </div>
      )}
      
      {/* Drum Machine Bottom Sheet */}
      {isDrumMachineBottomSheetOpen && (
        <div 
          className="fixed bottom-0 left-0 right-0 z-50"
          style={{ 
            height: '40vh',
            marginRight: isAIAssistantOpen ? '350px' : '0'
          }}
        >
          <DrumMachineBottomSheet
            isOpen={isDrumMachineBottomSheetOpen}
            onClose={() => {
              setIsDrumMachineBottomSheetOpen(false);
              setExpandedBottomSheet(null);
              setBottomSheetOrder([]);
            }}
            onConfirmSelection={(selectedSamples: DrumSamplePublicRead[]) => {
              const payload: DrumTrackPayload = { samples: selectedSamples };
              onAddTrack('DRUM', payload);
              setIsDrumMachineBottomSheetOpen(false);
              setExpandedBottomSheet(null);
              setBottomSheetOrder([]);
            }}
            isAIAssistantOpen={isAIAssistantOpen}
            isOtherBottomSheetOpen={false}
            isMinimized={false}
            onToggleMinimize={() => {
              // No minimize functionality needed when only one sheet is open
            }}
          />
        </div>
      )}
      
      <DrumMachineModal
        open={isDrumMachineModalOpen}
        onClose={() => setIsDrumMachineModalOpen(false)}
        onConfirmSelection={(selectedSamples: DrumSamplePublicRead[]) => {
          const payload: DrumTrackPayload = { samples: selectedSamples };
          onAddTrack('DRUM', payload);
          setIsDrumMachineModalOpen(false);
        }}
      />
    </>
  );
};

export default AddTrackMenu;