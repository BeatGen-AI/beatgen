import React, { useState } from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText, Divider, useTheme } from '@mui/material';
import PianoIcon from '@mui/icons-material/Piano';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import { VirtualInstrumentsBottomSheet } from '../modals/VirtualInstrumentBottomSheet';
import { DrumMachineBottomSheet } from '../modals/drum-machine/DrumModelBottomSheet';
import { DrumSamplePublicRead } from 'src/platform/types/dto/public_models/drum_samples';
import { getPublicDrumSamples } from '../../../platform/api/drum_samples';
import { getPublicSoundfonts } from '../../../platform/api/soundfonts';
import { InstrumentFileRead } from 'src/platform/types/project';
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
  const [isVirtualInstrumentBottomSheetOpen, setIsVirtualInstrumentBottomSheetOpen] = useState(false);
  const [isDrumMachineBottomSheetOpen, setIsDrumMachineBottomSheetOpen] = useState(false);
  
  // Track which bottom sheet is currently expanded
  const [expandedBottomSheet, setExpandedBottomSheet] = useState<'virtual' | 'drum' | null>(null);
  
  // Track bottom sheet heights
  const [virtualInstrumentHeight, setVirtualInstrumentHeight] = useState(400); // Default height in px
  const [drumMachineHeight, setDrumMachineHeight] = useState(400);
  
  // Persistent drum samples state to prevent data loss when switching modals
  const [drumSamples, setDrumSamples] = useState<DrumSamplePublicRead[]>([]);
  const [drumSamplesLoading, setDrumSamplesLoading] = useState(false);
  
  // Persistent soundfonts state to prevent data loss when switching modals
  const [soundfonts, setSoundfonts] = useState<InstrumentFileRead[]>([]);
  const [soundfontsLoading, setSoundfontsLoading] = useState(false);
  
  // Fetch drum samples once and persist across modal changes
  const fetchDrumSamples = async () => {
    if (drumSamples.length > 0) return; // Already loaded
    
    try {
      setDrumSamplesLoading(true);
      console.log('🥁 AddTrackMenu: Fetching drum samples...');
      const data = await getPublicDrumSamples();
      setDrumSamples(data);
      console.log(`AddTrackMenu: Loaded ${data.length} drum samples`);
    } catch (err: any) {
      console.error('AddTrackMenu: Error fetching drum samples:', err);
      setDrumSamples([]);
    } finally {
      setDrumSamplesLoading(false);
    }
  };
  
  // Fetch soundfonts once and persist across modal changes
  const fetchSoundfonts = async () => {
    if (soundfonts.length > 0) return; // Already loaded
    
    try {
      setSoundfontsLoading(true);
      console.log('🎹 AddTrackMenu: Fetching soundfonts...');
      const data = await getPublicSoundfonts();
      setSoundfonts(data);
      console.log(`AddTrackMenu: Loaded ${data.length} soundfonts`);
    } catch (err: any) {
      console.error('AddTrackMenu: Error fetching soundfonts:', err);
      setSoundfonts([]);
    } finally {
      setSoundfontsLoading(false);
    }
  };
  
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
          // Close drum modal if open
          setIsDrumMachineBottomSheetOpen(false);
          // Reset virtual instrument height to default when opening
          setVirtualInstrumentHeight(400);
          // Fetch soundfonts if not already loaded
          fetchSoundfonts();
          setIsVirtualInstrumentBottomSheetOpen(true);
          setExpandedBottomSheet('virtual');
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
          <ListItemText primary="Virtual Instrument" />
        </MenuItem>
        
        <MenuItem onClick={() => { 
          // Close VI modal if open
          setIsVirtualInstrumentBottomSheetOpen(false);
          // Reset drum machine height to default when opening
          setDrumMachineHeight(400);
          // Fetch drum samples if not already loaded
          fetchDrumSamples();
          setIsDrumMachineBottomSheetOpen(true);
          setExpandedBottomSheet('drum');
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
          <ListItemText primary="Drum Machine" />
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

      {/* Bottom Sheet Container - anchored to bottom of viewport */}
      {/* Virtual Instruments Bottom Sheet */}
      {isVirtualInstrumentBottomSheetOpen && (
        <div 
          className="fixed bottom-0 left-0 right-0 z-50"
          style={{ 
            height: expandedBottomSheet === 'virtual' ? `${virtualInstrumentHeight}px` : '60px',
            marginRight: isAIAssistantOpen ? '350px' : '0'
          }}
        >
          <VirtualInstrumentsBottomSheet
            isOpen={isVirtualInstrumentBottomSheetOpen}
            onClose={() => {
              setIsVirtualInstrumentBottomSheetOpen(false);
              setExpandedBottomSheet(null);
            }}
            onSelect={(instrumentId: string, instrumentName: string, instrumentStorageKey?: string) => {
              const payload: MidiTrackPayload = { instrumentId, instrumentName, instrumentStorageKey };
              onAddTrack('MIDI', payload);
            }}
            isMinimized={expandedBottomSheet !== 'virtual' && isVirtualInstrumentBottomSheetOpen}
            onToggleMinimize={() => {
              const newExpanded = expandedBottomSheet === 'virtual' ? null : 'virtual';
              setExpandedBottomSheet(newExpanded);
            }}
            height={virtualInstrumentHeight}
            onHeightChange={setVirtualInstrumentHeight}
            soundfonts={soundfonts}
            soundfontsLoading={soundfontsLoading}
            isAIAssistantOpen={isAIAssistantOpen}
          />
        </div>
      )}
      
      {/* Drum Machine Bottom Sheet */}
      {isDrumMachineBottomSheetOpen && (
        <div 
          className="fixed bottom-0 left-0 right-0 z-50"
          style={{ 
            height: expandedBottomSheet === 'drum' ? `${drumMachineHeight}px` : '60px',
            marginRight: isAIAssistantOpen ? '350px' : '0'
          }}
        >
          <DrumMachineBottomSheet
            isOpen={isDrumMachineBottomSheetOpen}
            onClose={() => {
              setIsDrumMachineBottomSheetOpen(false);
              setExpandedBottomSheet(null);
            }}
            onConfirmSelection={(selectedSamples: DrumSamplePublicRead[]) => {
              const payload: DrumTrackPayload = { samples: selectedSamples };
              onAddTrack('DRUM', payload);
              setIsDrumMachineBottomSheetOpen(false);
              setExpandedBottomSheet(null);
            }}
            isMinimized={expandedBottomSheet !== 'drum' && isDrumMachineBottomSheetOpen}
            onToggleMinimize={() => {
              const newExpanded = expandedBottomSheet === 'drum' ? null : 'drum';
              setExpandedBottomSheet(newExpanded);
            }}
            height={drumMachineHeight}
            onHeightChange={setDrumMachineHeight}
            drumSamples={drumSamples}
            drumSamplesLoading={drumSamplesLoading}
            isAIAssistantOpen={isAIAssistantOpen}
          />
        </div>
      )}
      
    </>
  );
};

export default AddTrackMenu;