import React, { useState } from 'react';
import { IconButton, CircularProgress, Snackbar, Alert, useTheme } from '@mui/material';
import { IconCloudUpload } from '@tabler/icons-react';
import { 
  createProject, 
  updateProject, 
  saveProjectWithSounds
} from '../../../platform/api/projects';
import { useAuth } from '../../../platform/auth/auth-context';
import { useStudioStore } from '../../stores/studioStore';
import { CombinedTrack, Project } from 'src/platform/types/project';
import { useAppTheme } from '../../../platform/theme/ThemeContext';

interface SaveProjectButtonProps {
  projectTitle: string;
  bpm: number;
  timeSignature: [number, number];
  tracks: CombinedTrack[];
  projectId: string;
  keySignature: string;
  onSaved?: (project: Project) => void;
}

export const SaveProjectButton: React.FC<SaveProjectButtonProps> = ({
  projectTitle,
  bpm,
  timeSignature,
  tracks,
  projectId,
  keySignature,
  onSaved
}) => {
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning';
  }>({
    open: false,
    message: '',
    severity: 'success'
  });
  
  // Get auth user and store
  const { user } = useAuth();
  const studioStore = useStudioStore();
  const appTheme = useAppTheme(); // Renamed to avoid conflict
  const muiTheme = useTheme(); // Get the MUI theme for palette

  // Function to mark tracks as clean (not dirty) after successful save
  const markTracksAsClean = (trackIds: string[]) => {
    trackIds.forEach(trackId => {
      studioStore.updateTrackState(trackId, { dirty: false });
    });
  };

  // Function to mark a track as dirty when it's modified
  const markTrackAsDirty = (trackId: string) => {
    studioStore.updateTrackState(trackId, { dirty: true });
  };

  // Prepare MIDI notes for each track before saving
  const prepareTracksWithMidiNotes = (tracks: CombinedTrack[]): CombinedTrack[] => {
    return tracks.map(track => {
      // Clone the track to avoid mutating the original
      const preparedTrack = {...track};
      
      // For MIDI and sampler tracks, add MIDI notes from the manager
      if (track.type === 'MIDI' || track.type === 'SAMPLER') {
        const midiNotes = studioStore.getTrackNotes(track.id) || [];
        
        // Add MIDI notes JSON to the track data
        if (preparedTrack.track) {
          preparedTrack.track = {
            ...preparedTrack.track,
            midi_notes_json: { notes: midiNotes }
          };
        }
      }
      
      return preparedTrack;
    });
  };

  const handleSave = async () => {
    if (!user) {
      setSnackbar({
        open: true,
        message: 'Please log in to save your project',
        severity: 'error'
      });
      return;
    }

    const maxRetries = 3;
    let retryCount = 0;
    
    const attemptSave = async (): Promise<void> => {
      try {
        setSaving(true);
        console.log('Starting project save with tracks:', tracks);
        
        // Project data structure
        const projectData = {
          name: projectTitle,
          bpm: bpm,
          time_signature_numerator: timeSignature[0],
          time_signature_denominator: timeSignature[1],
          key_signature: keySignature,
          user_id: user.id
        };
        
        // Prepare tracks with MIDI notes
        let preparedTracks = prepareTracksWithMidiNotes(tracks);
        
        // Filter to only save dirty tracks (changed since last save)
        const dirtyTracks = preparedTracks.filter(track => track.dirty !== false);
        
        console.log(`Total tracks: ${preparedTracks.length}, Dirty tracks: ${dirtyTracks.length}`);
        
        // For new projects only, generate new track IDs to avoid conflicts
        if (!projectId && dirtyTracks.length > 0) {
          preparedTracks = dirtyTracks.map(track => {
            const { dirty, ...trackWithoutDirty } = track; // Remove dirty field for backend
            return {
              ...trackWithoutDirty,
              id: crypto.randomUUID(), // Generate new UUID for each track
              track: track.track ? {
                ...track.track,
                id: crypto.randomUUID() // Also update the nested track ID
              } : track.track
            };
          });
        } else {
          // For existing projects, only send dirty tracks
          preparedTracks = dirtyTracks.map(track => {
            const { dirty, ...trackWithoutDirty } = track; // Remove dirty field for backend
            return trackWithoutDirty;
          });
        }
        
        let savedProject: Project | undefined;
        
        // Skip save if no dirty tracks and project exists
        if (projectId && preparedTracks.length === 0) {
          setSnackbar({
            open: true,
            message: 'No changes to save',
            severity: 'warning'
          });
          return; // Exit early - no need to save
        }

        if (projectId) {
          // Update existing project
          if (preparedTracks.some(track => track.type === 'AUDIO' || track.type === 'SAMPLER')) {
            // Use saveProjectWithSounds if we have audio or sampler tracks
            savedProject = await saveProjectWithSounds(projectId, projectData, preparedTracks);
          } else {
            // Use standard update for projects without audio tracks
            savedProject = await updateProject(projectId, {
              ...projectData,
              tracks: preparedTracks
            });
          }
          
          // Mark saved tracks as clean in the store
          markTracksAsClean(preparedTracks.map(t => t.id));
          
          setSnackbar({
            open: true,
            message: `Project updated successfully (${preparedTracks.length} tracks saved)`,
            severity: 'success'
          });
        } else {
          // Create new project
          const newProject = await createProject(projectData);
          
          if (preparedTracks.length > 0) {
            // If we have tracks, use saveProjectWithSounds
            savedProject = await saveProjectWithSounds(
              newProject.id, 
              projectData, 
              preparedTracks
            );
          } else {
            savedProject = newProject;
          }
          
          // Mark all tracks as clean since it's a new project
          markTracksAsClean(preparedTracks.map(t => t.id));
          
          setSnackbar({
            open: true,
            message: 'Project saved successfully',
            severity: 'success'
          });
        }
        
        // After successful save/update, update URL and call onSaved
        if (savedProject && savedProject.id) {
          const newUrl = `/studio?projectId=${savedProject.id}`;
          window.history.replaceState({}, '', newUrl);

          // Call the onSaved callback if provided
          if (onSaved) {
            onSaved(savedProject);
          }
        }

      } catch (error: any) {
        console.error('Error saving project:', error);
        
        // Check if this is a retryable error (constraint violations, conflicts)
        const isRetryableError = error.status === 409 || 
                                error.response?.status === 409 ||
                                error.message?.toLowerCase().includes('constraint') ||
                                error.message?.toLowerCase().includes('duplicate key') ||
                                error.message?.toLowerCase().includes('integrity') ||
                                error.message?.toLowerCase().includes('conflict');
        
        if (isRetryableError && retryCount < maxRetries) {
          retryCount++;
          const delay = Math.pow(2, retryCount - 1) * 1000; // 1s, 2s, 4s
          console.log(`Save failed, retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`);
          
          setSnackbar({
            open: true,
            message: `Save conflict detected, retrying... (${retryCount}/${maxRetries})`,
            severity: 'warning'
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return attemptSave();
        }
        
        // Non-retryable error or max retries exceeded
        setSnackbar({
          open: true,
          message: retryCount >= maxRetries 
            ? `Failed to save project after ${maxRetries} attempts: ${error.message}`
            : `Failed to save project: ${error.message}`,
          severity: 'error'
        });
        
        throw error;
      } finally {
        setSaving(false);
      }
    };
    
    return attemptSave();
  };

  const handleCloseSnackbar = () => {
    setSnackbar({
      ...snackbar,
      open: false
    });
  };

  return (
    <>
      <IconButton
        size="small"
        onClick={handleSave}
        disabled={saving}
        sx={{
          color: appTheme.studioMode === 'dark' ? 'white' : 'black',
          borderRadius: '8px',
          '&:hover': {
            backgroundColor: muiTheme.palette.action.hover,
          },
        }}
        disableRipple
      >
        {saving ? <CircularProgress size={20} color="inherit" /> : <IconCloudUpload />}
      </IconButton>
      
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={4000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={handleCloseSnackbar} 
          severity={snackbar.severity} 
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};