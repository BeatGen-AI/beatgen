import { useState, useEffect } from 'react';
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
 * Custom hook to get real-time MIDI notes for a track from MidiManager.
 * Subscribes to updates and returns the latest notes.
 * 
 * @param trackId The ID of the track to get notes for
 * @returns Object with notes array and hasTrack boolean
 */
export function useTrackNotes(trackId: string | undefined): UseTrackNotesResult {
  const { store } = useStudioStore();
  const midiManager = store?.getMidiManager();
  const [notes, setNotes] = useState<Note[]>([]);
  const [hasTrack, setHasTrack] = useState(false);
  
  useEffect(() => {
    if (!midiManager || !trackId) {
      setNotes([]);
      setHasTrack(false);
      return;
    }
    
    // Check if track exists in MidiManager
    const trackExists = midiManager.hasTrack(trackId);
    setHasTrack(trackExists);
    
    if (trackExists) {
      // Get initial notes
      const initialNotes = midiManager.getTrackNotes(trackId);
      setNotes(initialNotes || []);
    } else {
      setNotes([]);
    }
    
    // Subscribe to updates for this specific track
    const unsubscribe = midiManager.subscribeToTrack(trackId, (_, updatedNotes) => {
      console.log(`useTrackNotes: Received update for track ${trackId}, ${updatedNotes.length} notes`);
      setNotes(updatedNotes);
      setHasTrack(true); // Track now exists if we're getting updates
    });
    
    return () => {
      unsubscribe();
    };
  }, [midiManager, trackId]);
  
  return { notes, hasTrack };
}