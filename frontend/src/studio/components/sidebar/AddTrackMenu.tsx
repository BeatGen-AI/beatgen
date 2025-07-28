import React, { useState } from 'react';
import { Piano, AudioWaveform, Music, Scissors } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { VirtualInstrumentsModal } from '../modals/VirtualInstrumentsModal';
import { DrumMachineModal } from '../modals/drum-machine/DrumMachineModal';
import { AudioTracksModal } from '../modals/AudioTracksModal';
import { DrumSamplePublicRead } from 'src/platform/types/dto/public_models/drum_samples';
import { AudioTrackRead } from 'src/platform/types/dto/track_models/audio_track';
// Import types from store types file
import { TrackType, AddTrackPayload, MidiTrackPayload, DrumTrackPayload, AudioTrackPayload } from '../../stores/types';
import { useAppTheme } from '../../../lib/theme-provider';

interface AddTrackMenuProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  // Use imported types
  onAddTrack: (type: TrackType, payload?: AddTrackPayload) => void;
  // Keep onFileUpload for direct audio/sampler uploads for now
  onFileUpload?: (file: File, isSampler?: boolean) => void;
}

export const AddTrackMenu: React.FC<AddTrackMenuProps> = ({ 
  isOpen, 
  onOpenChange, 
  children,
  onAddTrack, 
  onFileUpload 
}) => {
  const { studioMode } = useAppTheme();
  const [isVirtualInstrumentModalOpen, setIsVirtualInstrumentModalOpen] = useState(false);
  const [isDrumMachineModalOpen, setIsDrumMachineModalOpen] = useState(false);
  const [isAudioTracksModalOpen, setIsAudioTracksModalOpen] = useState(false);
  
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
        <DropdownMenuContent 
          className="w-48"
          style={{
            backgroundColor: studioMode === 'dark' ? '#1a1a1a' : '#ffffff',
            borderColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
            color: studioMode === 'dark' ? '#ffffff' : '#000000'
          }}
        >
          <DropdownMenuItem 
            onClick={() => {
              setIsVirtualInstrumentModalOpen(true);
              onOpenChange(false);
            }}
            className="text-sm py-2 cursor-pointer"
            style={{
              color: studioMode === 'dark' ? '#ffffff' : '#000000'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Piano className="w-4 h-4 mr-3 text-blue-500" />
            Virtual Instrument
          </DropdownMenuItem>
          
          <DropdownMenuItem 
            onClick={() => { 
              setIsDrumMachineModalOpen(true);
              onOpenChange(false); 
            }}
            className="text-sm py-2 cursor-pointer"
            style={{
              color: studioMode === 'dark' ? '#ffffff' : '#000000'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Music className="w-4 h-4 mr-3 text-orange-500" />
            Drum Machine
          </DropdownMenuItem>
          
          <DropdownMenuItem 
            onClick={() => {
              setIsAudioTracksModalOpen(true);
              onOpenChange(false);
            }}
            className="text-sm py-2 cursor-pointer"
            style={{
              color: studioMode === 'dark' ? '#ffffff' : '#000000'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <AudioWaveform className="w-4 h-4 mr-3 text-green-500" />
            Audio Tracks
          </DropdownMenuItem>
          
          <DropdownMenuItem 
            className="text-sm py-2 cursor-pointer"
            style={{
              color: studioMode === 'dark' ? '#ffffff' : '#000000'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <label className="flex items-center w-full cursor-pointer">
              <Scissors className="w-4 h-4 mr-3 text-purple-500" />
              Sampler
              <input 
                type="file" 
                accept="audio/*" 
                className="hidden" 
                onChange={(e) => handleFileUpload(e, true)}
              />
            </label>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <VirtualInstrumentsModal
        open={isVirtualInstrumentModalOpen}
        onClose={() => setIsVirtualInstrumentModalOpen(false)}
        onSelect={(instrumentId: string, instrumentName: string, instrumentStorageKey?: string) => {
          const payload: MidiTrackPayload = { instrumentId, instrumentName, instrumentStorageKey };
          onAddTrack('MIDI', payload);
          setIsVirtualInstrumentModalOpen(false);
        }}
      />
      <DrumMachineModal
        open={isDrumMachineModalOpen}
        onClose={() => setIsDrumMachineModalOpen(false)}
        onConfirmSelection={(selectedSamples: DrumSamplePublicRead[]) => {
          const payload: DrumTrackPayload = { samples: selectedSamples };
          onAddTrack('DRUM', payload);
          setIsDrumMachineModalOpen(false);
        }}
      />
      <AudioTracksModal
        open={isAudioTracksModalOpen}
        onClose={() => setIsAudioTracksModalOpen(false)}
        onSelectTrack={(track: AudioTrackRead) => {
          onAddTrack('AUDIO', { audioTrackData: track });
          setIsAudioTracksModalOpen(false);
        }}
        onFileUpload={(file: File) => {
          if (onFileUpload) {
            onFileUpload(file, false);
          }
          setIsAudioTracksModalOpen(false);
        }}
      />
    </>
  );
};

export default AddTrackMenu;