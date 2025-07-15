import React, { useState } from 'react';
import { Button } from "../../components/ui/button";
import { Add as AddIcon } from '@mui/icons-material';
// import SoundUploader from './SoundUploader'; // Path might need adjustment if SoundUploader is in a different directory
import SoundLibrary from './SoundLibrary'; // Assuming SoundLibrary is in the same components folder or adjust path
import { AudioTracksModal } from '../../studio/components/modals/AudioTracksModal';
import { AudioTrackRead } from '../types/dto/track_models/audio_track';

interface AudioTracksDisplayProps {
  onReloadSounds: () => void;
  sectionColor: string;
  useUiMode?: boolean; // When true, use UI mode; when false, use studio mode
  // If SoundUploader becomes active, we'll need more props:
  // showSoundUploader: boolean;
  // onToggleSoundUploader: () => void; // Or separate setShow for true/false
  // onSoundUploaded: (soundId: string) => void;
  // onCancelUpload: () => void;
  // showSnackbar: (message: string, severity: 'success' | 'error') => void;
}

const AudioTracksDisplay: React.FC<AudioTracksDisplayProps> = ({
  onReloadSounds,
  sectionColor,
  useUiMode = true, // Default to UI mode for homepage
  // showSoundUploader,
  // onToggleSoundUploader,
  // onSoundUploaded,
  // onCancelUpload,
  // showSnackbar,
}) => {
  const [isAudioTracksModalOpen, setIsAudioTracksModalOpen] = useState(false);

  const handleSelectTrack = (track: AudioTrackRead) => {
    // Track is already in the user's library, just close the modal
    // The SoundLibrary will automatically show the updated list
    setIsAudioTracksModalOpen(false);
    onReloadSounds(); // Refresh the sound library to show any new tracks
  };

  const handleFileUpload = (file: File) => {
    // File upload is handled by the AudioTracksModal's upload functionality
    // Once uploaded, it will appear in the user's library
    setIsAudioTracksModalOpen(false);
    onReloadSounds(); // Refresh the sound library to show the new track
  };

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div></div> {/* Empty div to push button to the right */}
        <Button
          variant="outline"
          className="flex items-center gap-2"
          onClick={() => setIsAudioTracksModalOpen(true)}
        >
          <AddIcon fontSize="small" />
          Add Audio Track
        </Button>
      </div>
      
      <SoundLibrary onReload={onReloadSounds} sectionColor={sectionColor} />
      
      <AudioTracksModal
        open={isAudioTracksModalOpen}
        onClose={() => setIsAudioTracksModalOpen(false)}
        onSelectTrack={handleSelectTrack}
        onFileUpload={handleFileUpload}
        useUiMode={useUiMode}
        uploadModeOnly={true}
      />
    </>
  );
};

export default AudioTracksDisplay;
