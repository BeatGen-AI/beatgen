import React, { useState } from 'react';
import { Piano, AudioWaveform, Music, Scissors } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { VirtualInstrumentsBottomSheet } from '../modals/VirtualInstrumentBottomSheet';
import { DrumMachineBottomSheet } from '../modals/drum-machine/DrumModelBottomSheet';
import { DrumSamplePublicRead } from 'src/platform/types/dto/public_models/drum_samples';
import { getPublicDrumSamples } from '../../../platform/api/drum_samples';
import { getPublicSoundfonts } from '../../../platform/api/soundfonts';
import { InstrumentFileRead } from 'src/platform/types/project';
// Import types from store types file
import { TrackType, AddTrackPayload, MidiTrackPayload, DrumTrackPayload, AudioTrackPayload } from '../../stores/types';

interface AddTrackMenuProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  // Use imported types
  onAddTrack: (type: TrackType, payload?: AddTrackPayload) => void;
  // Keep onFileUpload for direct audio/sampler uploads for now
  onFileUpload?: (file: File, isSampler?: boolean) => void;
  isAIAssistantOpen?: boolean;
}

export const AddTrackMenu: React.FC<AddTrackMenuProps> = ({ 
  isOpen, 
  onOpenChange, 
  children,
  onAddTrack, 
  onFileUpload,
  isAIAssistantOpen = false 
}) => {
  // Remove theme usage
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
      onOpenChange(false);
      console.log('File uploaded');
    }
  };
  
  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          {children}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48">
          <DropdownMenuItem 
            onClick={() => {
              // Close drum modal if open
              setIsDrumMachineBottomSheetOpen(false);
              // Reset virtual instrument height to default when opening
              setVirtualInstrumentHeight(400);
              // Fetch soundfonts if not already loaded
              fetchSoundfonts();
              setIsVirtualInstrumentBottomSheetOpen(true);
              setExpandedBottomSheet('virtual');
              onOpenChange(false);
            }}
            className="text-sm py-2 cursor-pointer"
          >
            <Piano className="w-4 h-4 mr-3 text-blue-500" />
            Virtual Instrument
          </DropdownMenuItem>
          
          <DropdownMenuItem 
            onClick={() => { 
              // Close VI modal if open
              setIsVirtualInstrumentBottomSheetOpen(false);
              // Reset drum machine height to default when opening
              setDrumMachineHeight(400);
              // Fetch drum samples if not already loaded
              fetchDrumSamples();
              setIsDrumMachineBottomSheetOpen(true);
              setExpandedBottomSheet('drum');
              onOpenChange(false); 
            }}
            className="text-sm py-2 cursor-pointer"
          >
            <Music className="w-4 h-4 mr-3 text-orange-500" />
            Drum Machine
          </DropdownMenuItem>
        
          <DropdownMenuItem 
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'audio/*';
              input.onchange = (e) => handleFileUpload(e as any, false);
              input.click();
            }}
            className="text-sm py-2 cursor-pointer"
          >
            <AudioWaveform className="w-4 h-4 mr-3 text-green-500" />
            Import Audio
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'audio/*';
              input.onchange = (e) => handleFileUpload(e as any, true);
              input.click();
            }}
            className="text-sm py-2 cursor-pointer"
          >
            <Scissors className="w-4 h-4 mr-3 text-purple-500" />
            Sampler
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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