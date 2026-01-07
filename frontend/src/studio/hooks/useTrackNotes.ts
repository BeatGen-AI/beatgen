import { Note } from '../../types/note';
import { useStudioStore } from '../stores/studioStore';

/**
 * Result from useTrackNotes hook
 */
export interface UseTrackNotesResult {
  notes: Note[];
  hasTrack: boolean;
}

/**
 * Custom hook to get MIDI notes for a track from Zustand store.
 * Uses Zustand selectors for reactivity - re-renders when notes change.
 *
 * @param trackId The ID of the track to get notes for
 * @returns Object with notes array and hasTrack boolean
 */
export function useTrackNotes(trackId: string | undefined): UseTrackNotesResult {
  // Subscribe to noteVersion to trigger re-renders when notes change
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _noteVersion = useStudioStore(state => state.noteVersion);

  // Get notes directly from Zustand store via selector
  const notes = useStudioStore(state =>
    trackId ? state.getTrackNotes(trackId) : []
  );

  // Check if track exists in store
  const hasTrack = useStudioStore(state =>
    trackId ? state.hasTrackById(trackId) : false
  );

  return { notes: notes || [], hasTrack };
}