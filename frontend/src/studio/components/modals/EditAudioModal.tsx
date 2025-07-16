import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Edit, Loader2, Send, X } from 'lucide-react';
import { AudioTrackRead } from '../../../platform/types/dto/track_models/audio_track';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { inpaintAudio } from '../../../platform/api/sounds';
import AudioPreview from '../shared/AudioPreview';
import AudioPlayer from '../shared/AudioPlayer';
import { useAppTheme } from '../../../platform/theme/ThemeContext';
import { db } from '../../core/db/dexie-client';
import SampleManager from '../../core/samples/sampleManager';

interface EditAudioModalProps {
  open: boolean;
  onClose: () => void;
  audioTrack: AudioTrackRead | null;
  onTrackUpdated: (updatedTrack: AudioTrackRead) => void;
  useUiMode?: boolean;
}

export const EditAudioModal: React.FC<EditAudioModalProps> = ({
  open,
  onClose,
  audioTrack,
  onTrackUpdated,
  useUiMode = false
}) => {
  const { mode: uiMode, studioMode } = useAppTheme();
  const effectiveMode = useUiMode ? uiMode : studioMode;
  const queryClient = useQueryClient();
  
  // Edit state
  const [editTags, setEditTags] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editStatus, setEditStatus] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);
  const [editedAudioUrl, setEditedAudioUrl] = useState<string | null>(null);
  
  // Audio preview state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load audio URL when modal opens
  useEffect(() => {
    if (open && audioTrack && audioTrack.audio_file_storage_key) {
      loadAudioPreview();
    }
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [open, audioTrack]);

  const loadAudioPreview = async () => {
    if (!audioTrack || !audioTrack.audio_file_storage_key) return;
    
    setIsLoadingAudio(true);
    try {
      const sampleManager = SampleManager.getInstance(db);
      const blob = await sampleManager.getSampleBlob(
        audioTrack.id,
        audioTrack.audio_file_storage_key,
        'audio_track',
        audioTrack.name
      );
      
      if (blob) {
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      }
    } catch (error) {
      console.error('Failed to load audio preview:', error);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handlePlayToggle = () => {
    if (!audioUrl) return;

    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.addEventListener('ended', () => {
          setIsPlaying(false);
        });
      }
      audioRef.current.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
  };

  const handleEditAudio = async () => {
    if (!editTags.trim() || isEditing || !audioTrack) return;

    setIsEditing(true);
    setEditStatus('Initializing audio editing...');
    setEditError(null);

    try {
      // Get the audio URL from the storage key (same logic as downloadFile)
      const baseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://fmpafpwdkegazcerrnso.supabase.co';
      const audioUrl = `${baseUrl}/storage/v1/object/public/tracks/${audioTrack.audio_file_storage_key}`;
      
      console.log('Audio URL for inpainting:', audioUrl);
      setEditStatus('Sending audio to FAL-AI for inpainting...');
      
      // Call the inpaint API
      const inpaintResult = await inpaintAudio({
        audio_url: audioUrl,
        tags: editTags,
        prompt: editPrompt || undefined,
        start_time: undefined,
        end_time: undefined,
        lyrics: undefined
      });

      setEditStatus('Processing completed! Audio edited successfully!');
      
      // Store the edited audio URL for playback
      console.log('Inpaint result:', inpaintResult);
      console.log('Setting edited audio URL:', inpaintResult.audio_url);
      setEditedAudioUrl(inpaintResult.audio_url);
      
      // Create an updated track with the new audio URL
      // For now, we'll keep the same track but update the storage key
      // In a real implementation, you might want to create a new track or update the existing one
      const updatedTrack: AudioTrackRead = {
        ...audioTrack,
        name: `${audioTrack.name} (Edited)`,
        // Note: You might want to update the storage key to point to the new audio
        // For now, we'll keep the same ID but this might need to be handled differently
      };

      // Set success state first
      setEditSuccess(true);
      
      // Update the track in the parent component
      onTrackUpdated(updatedTrack);
      
      // Force a small delay to ensure state updates are processed
      setTimeout(() => {
        console.log('After timeout - editedAudioUrl:', editedAudioUrl);
        console.log('After timeout - editSuccess:', editSuccess);
      }, 100);
      
      // Don't auto-close the modal - let the user close it manually
      // They can see the success message and close when ready
      
    } catch (error) {
      setIsEditing(false);
      
      // Handle different types of errors
      let errorMessage = 'Failed to edit audio';
      
      if (error.response) {
        // HTTP error from backend
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 402) {
          errorMessage = 'Insufficient credits. Please upgrade your plan to continue.';
        } else if (status === 400) {
          errorMessage = data.detail || 'Invalid request parameters';
        } else if (status === 401) {
          errorMessage = 'Authentication required. Please log in again.';
        } else if (status === 500) {
          errorMessage = 'Server error. Please try again later.';
        } else if (data && data.detail) {
          errorMessage = data.detail;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setEditError(errorMessage);
      setEditStatus('');
      console.error('Edit error:', error);
    } finally {
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    // For direct API calls, we can't really cancel them once started
    // But we can reset the UI state
    setIsEditing(false);
    setEditStatus('');
    setEditError(null);
  };

  const handleClose = () => {
    if (isEditing) {
      handleCancelEdit();
    }
    onClose();
  };

  // Apply the appropriate dark mode to document element when dialog is open
  useEffect(() => {
    if (!open) return;
    
    const root = window.document.documentElement;
    const originalHasDark = root.classList.contains('dark');
    
    if (effectiveMode === 'dark' && !originalHasDark) {
      root.classList.add('dark');
    } else if (effectiveMode === 'light' && originalHasDark) {
      root.classList.remove('dark');
    }
    
    return () => {
      // Restore original dark mode after dialog closes
      const timeoutId = setTimeout(() => {
        const currentHasDark = root.classList.contains('dark');
        const shouldHaveDark = uiMode === 'dark';
        
        if (shouldHaveDark && !currentHasDark) {
          root.classList.add('dark');
        } else if (!shouldHaveDark && currentHasDark) {
          root.classList.remove('dark');
        }
      }, 200);
      
      return () => clearTimeout(timeoutId);
    };
  }, [open, effectiveMode, uiMode]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setEditTags('');
      setEditPrompt('');
      setEditStatus('');
      setEditError(null);
      setIsEditing(false);
      setEditSuccess(false);
      setEditedAudioUrl(null);
    }
  }, [open]);

  if (!audioTrack) return null;

  // Debug render
  console.log('EditAudioModal render:', {
    editSuccess,
    editedAudioUrl,
    isEditing,
    audioTrackName: audioTrack.name
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl w-[90vw] max-h-[85vh] p-0 flex flex-col shadow-2xl rounded-lg">
        <DialogHeader className="p-6 pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Edit className="w-6 h-6" />
              Edit Audio
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-grow flex flex-col overflow-y-auto px-6 pb-6">
          {/* Current Audio Preview */}
          <div className="mb-6">
            <Label className="text-sm font-medium mb-3 block">
              Current Audio: {audioTrack.name}
            </Label>
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-4 mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePlayToggle}
                  disabled={isLoadingAudio || !audioUrl}
                >
                  {isLoadingAudio ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isPlaying ? (
                    'Pause'
                  ) : (
                    'Play'
                  )}
                </Button>
                <div className="text-sm text-muted-foreground">
                  {audioTrack.audio_file_duration > 0 && (
                    <span>Duration: {Math.round(audioTrack.audio_file_duration)}s</span>
                  )}
                  {audioTrack.audio_file_format && (
                    <span className="ml-3">Format: {audioTrack.audio_file_format.toUpperCase()}</span>
                  )}
                </div>
              </div>
              
              {audioUrl && (
                <AudioPreview
                  audioUrl={audioUrl}
                  variant="full"
                  duration={audioTrack.audio_file_duration}
                  isPlaying={isPlaying}
                />
              )}
            </div>
          </div>

          {/* Style Tags */}
          <div className="mb-6">
            <Label htmlFor="edit-tags" className="text-sm font-medium mb-3 block">
              Style Tags (Required)
            </Label>
            <Textarea
              id="edit-tags"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              placeholder="Enter style tags (e.g., 'lofi, hiphop, drum and bass, trap, chill')"
              className="min-h-[80px] resize-none"
              disabled={isEditing}
              maxLength={500}
            />
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-muted-foreground">
                {editTags.length}/500 characters
              </span>
              {editTags.length > 450 && (
                <span className="text-xs text-yellow-600">
                  {500 - editTags.length} characters remaining
                </span>
              )}
            </div>
          </div>

          {/* Edit Instructions (Optional) */}
          <div className="mb-6">
            <Label htmlFor="edit-prompt" className="text-sm font-medium mb-3 block">
              Additional Instructions (Optional)
            </Label>
            <Textarea
              id="edit-prompt"
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="Additional instructions for the audio editing (optional)"
              className="min-h-[80px] resize-none"
              disabled={isEditing}
              maxLength={1000}
            />
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-muted-foreground">
                {editPrompt.length}/1000 characters
              </span>
              {editPrompt.length > 900 && (
                <span className="text-xs text-yellow-600">
                  {1000 - editPrompt.length} characters remaining
                </span>
              )}
            </div>
          </div>

          {/* Help Text */}
          <div className="bg-muted/30 rounded-lg p-4 mb-6">
            <h4 className="font-medium mb-2">Tips for audio editing:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <strong>Style Tags:</strong> Use genre/style keywords separated by commas (e.g., "lofi, chill, ambient")</li>
              <li>• <strong>Additional Instructions:</strong> Be specific about changes you want (optional)</li>
              <li>• Common styles: lofi, hiphop, trap, chill, electronic, ambient, rock, jazz</li>
              <li>• Use clear, descriptive language</li>
            </ul>
          </div>

          {/* Edit Button */}
          <div className="mb-4">
            <Button
              onClick={handleEditAudio}
              disabled={!editTags.trim() || isEditing || editTags.length > 500 || editPrompt.length > 1000}
              className="w-full flex items-center gap-2"
            >
              {isEditing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Editing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Edit Audio
                </>
              )}
            </Button>
            {editTags.length > 500 && (
              <p className="text-sm text-destructive mt-1">
                Style tags are too long. Please keep them under 500 characters.
              </p>
            )}
            {editPrompt.length > 1000 && (
              <p className="text-sm text-destructive mt-1">
                Additional instructions are too long. Please keep them under 1000 characters.
              </p>
            )}
          </div>

          {/* Edit Status */}
          {(isEditing || editStatus) && (
            <div className="bg-muted/50 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {isEditing ? 'Editing...' : 'Status'}
                </span>
                {isEditing && (
                  <Button
                    onClick={handleCancelEdit}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isEditing && <Loader2 className="h-4 w-4 animate-spin" />}
                <span className="text-sm text-muted-foreground">
                  {editStatus}
                </span>
              </div>
            </div>
          )}

          {/* Debug info - Make it very visible */}
          <div className="mb-4 p-4 bg-red-100 border-2 border-red-300 rounded text-sm font-mono">
            <p className="font-bold text-red-800">DEBUG INFO:</p>
            <p>editSuccess: {String(editSuccess)}</p>
            <p>editedAudioUrl: {editedAudioUrl || 'NULL'}</p>
            <p>isEditing: {String(isEditing)}</p>
            <p>audioTrack: {audioTrack?.name || 'NULL'}</p>
          </div>

          {/* Edit Success */}
          {editSuccess && (
            <Alert className="mb-4 border-green-200 bg-green-50 text-green-800">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
                <span className="font-medium">Success!</span>
              </div>
              <p className="mt-1 text-sm">Audio has been successfully edited. You can listen to the result below.</p>
            </Alert>
          )}

          {/* Edited Audio Player */}
          {editedAudioUrl && (
            <div className="mb-4">
              <Label className="text-sm font-medium mb-3 block">
                Edited Audio Result
              </Label>
              <div className="p-2 bg-blue-50 border border-blue-200 rounded mb-2">
                <p className="text-xs text-blue-600">Debug: Audio URL = {editedAudioUrl}</p>
              </div>
              <AudioPlayer
                audioUrl={editedAudioUrl}
                title="Edited Audio"
                showWaveform={false}
              />
            </div>
          )}

          {/* Edit Error */}
          {editError && (
            <Alert variant="destructive" className="mb-4">
              {editError}
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};