import React, { useState } from 'react';
import { Loader2, CloudUpload } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { 
  createProject, 
  updateProject, 
  saveProjectWithSounds
} from '../../../platform/api/projects';
import { useAuth } from '../../../platform/auth/auth-context';
import { useStudioStore } from '../../stores/studioStore';
import { CombinedTrack, Project } from 'src/platform/types/project';
import { useAppTheme } from '../../../lib/theme-provider';
import { cn } from '../../../lib/utils';

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
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'warning';
  }>({
    show: false,
    message: '',
    type: 'success'
  });
  
  // Get auth user and store
  const { user } = useAuth();
  const studioStore = useStudioStore();
  const { studioMode } = useAppTheme();

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
      if (track.track_type === 'MIDI' || track.track_type === 'SAMPLER') {
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
      setNotification({
        show: true,
        message: 'Please log in to save your project',
        type: 'error'
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
          setNotification({
            show: true,
            message: 'No changes to save',
            type: 'warning'
          });
          return; // Exit early - no need to save
        }

        if (projectId) {
          // Update existing project
          if (preparedTracks.some(track => track.track_type === 'AUDIO' || track.track_type === 'SAMPLER')) {
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
          
          setNotification({
            show: true,
            message: `Project updated successfully (${preparedTracks.length} tracks saved)`,
            type: 'success'
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
          
          setNotification({
            show: true,
            message: 'Project saved successfully',
            type: 'success'
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
          
          setNotification({
            show: true,
            message: `Save conflict detected, retrying... (${retryCount}/${maxRetries})`,
            type: 'warning'
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return attemptSave();
        }
        
        // Non-retryable error or max retries exceeded
        setNotification({
          show: true,
          message: retryCount >= maxRetries 
            ? `Failed to save project after ${maxRetries} attempts: ${error.message}`
            : `Failed to save project: ${error.message}`,
          type: 'error'
        });
        
        throw error;
      } finally {
        setSaving(false);
      }
    };
    
    return attemptSave();
  };

  const handleCloseNotification = () => {
    setNotification({
      ...notification,
      show: false
    });
  };

  // Auto-hide notifications after 4 seconds
  React.useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        handleCloseNotification();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification.show]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleSave}
        disabled={saving}
        className={cn(
          "h-8 w-8 rounded-lg",
          studioMode === 'dark'
            ? "text-white hover:bg-white/10"
            : "text-black hover:bg-black/10"
        )}
      >
        {saving ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <CloudUpload className="h-5 w-5" />
        )}
      </Button>
      
      {notification.show && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 min-w-[300px] max-w-[500px]">
          <Alert 
            variant={notification.type === 'error' ? 'destructive' : 'default'}
            className={cn(
              "shadow-lg border",
              notification.type === 'success' && "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
              notification.type === 'warning' && "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
              notification.type === 'error' && "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            )}
          >
            <AlertDescription className="text-sm">
              {notification.message}
            </AlertDescription>
          </Alert>
        </div>
      )}
    </>
  );
};