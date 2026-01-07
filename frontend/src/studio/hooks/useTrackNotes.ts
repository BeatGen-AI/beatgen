import { Note } from '../../types/note';
import { useStudioStore } from '../stores/studioStore';

/**
 * Result from useTrackNotes hook
 */
export interface UseTrackNotesResult {
  notes: Note[];
  hasTrack: boolean;
}

// Stable empty array to prevent re-renders when no notes exist
// CRITICAL: Using a constant reference prevents Zustand from seeing "changes"
const EMPTY_NOTES: Note[] = [];

/**
 * Custom hook to get MIDI notes for a track from Zustand store.
 * Uses Zustand selectors for reactivity - re-renders when notes change.
 *
 * IMPORTANT: We select the raw notes array from state instead of calling
 * getTrackNotes() in the selector. This is because getTrackNotes() creates
 * new array copies, which would cause infinite re-renders in Zustand.
 * We use noteVersion to trigger re-renders when notes change.
 *
 * @param trackId The ID of the track to get notes for
 * @returns Object with notes array and hasTrack boolean
 */
export function useTrackNotes(trackId: string | undefined): UseTrackNotesResult {
  // Subscribe to noteVersion to trigger re-renders when notes change
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _noteVersion = useStudioStore(state => state.noteVersion);

  // Select the raw notes array from state directly (not via getTrackNotes which creates copies)
  // This returns a stable reference that only changes when notes actually change
  // CRITICAL: Use EMPTY_NOTES constant to avoid creating new array references
  const notes = useStudioStore(state => {
    if (!trackId) return EMPTY_NOTES;
    const track = state.tracks.find(t => t.id === trackId);
    return track?.notes ?? EMPTY_NOTES;
  });

  // Check if track exists in store
  const hasTrack = useStudioStore(state =>
    trackId ? state.hasTrackById(trackId) : false
  );

  return { notes, hasTrack };
}