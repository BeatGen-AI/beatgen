import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from "../../components/ui/button";
import { Add as AddIcon } from '@mui/icons-material';
// import SoundUploader from './SoundUploader'; // Path might need adjustment if SoundUploader is in a different directory
import SoundLibrary from './SoundLibrary'; // Assuming SoundLibrary is in the same components folder or adjust path
import { AudioTracksModal } from '../../studio/components/modals/AudioTracksModal';
import { AudioTrackRead } from '../types/dto/track_models/audio_track';
import { getUploadUrl, createSoundRecord } from '../api/sounds';
import { processAudioFile as processAudioFileUtil, uploadFileWithProgress } from '../../studio/utils/audioProcessing';

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
  const queryClient = useQueryClient();
  const [isAudioTracksModalOpen, setIsAudioTracksModalOpen] = useState(false);

  const handleSelectTrack = (track: AudioTrackRead) => {
    // Track is already in the user's library, just close the modal
    // The SoundLibrary will automatically show the updated list
    setIsAudioTracksModalOpen(false);
    onReloadSounds(); // Refresh the sound library to show any new tracks
  };

  const handleFileUpload = async (file: File) => {
    try {
      // 1. Generate UUID and get presigned URL
      const trackId = crypto.randomUUID();
      const { id, upload_url, storage_key } = await getUploadUrl(file.name, trackId, 'audio');
      
      // 2. Upload file with progress tracking
      await uploadFileWithProgress(file, upload_url, () => {});
      
      // 3. Process file to get metadata
      const metadata = await processAudioFileUtil(file);
      
      // 4. Create database record with name derived from filename (same as studio)
      const soundName = file.name.split('.').slice(0, -1).join('.') || file.name;
      await createSoundRecord({
        id: id,
        name: soundName,
        audio_file_format: metadata.format,
        audio_file_duration: metadata.duration,
        audio_file_size: file.size,
        audio_file_sample_rate: metadata.sampleRate,
        audio_file_storage_key: storage_key,
        waveform_data: metadata.waveform
      });
      
      // 5. Close modal and refresh library
      setIsAudioTracksModalOpen(false);
      
      // Invalidate the audioTracks query to force a refresh
      queryClient.invalidateQueries({ queryKey: ['audioTracks'] });
      
      // Also call the callback if provided
      onReloadSounds();
    } catch (error) {
      console.error('Failed to upload audio file:', error);
      // TODO: Show error to user
    }
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
