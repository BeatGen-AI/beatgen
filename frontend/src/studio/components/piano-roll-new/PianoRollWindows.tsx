import React, { useState, useCallback, useEffect, memo, useMemo } from 'react';
import { usePianoRollStore } from '../../stores/usePianoRollStore';
import { useStudioStore } from '../../stores/studioStore';
import PianoRoll from '../piano-roll2/PianoRoll';
import { convertToNoteState, NoteState } from '../../utils/noteConversion';
import { diffNotes } from '../../utils/noteDiffing';
import { getTrackColor } from '../../constants/gridConstants';
import { MidiTrack } from 'src/platform/types/dto/track_models/midi_track';
import { CombinedTrack } from 'src/platform/types/project';
import { Actions } from '../../core/state/history/actions';
import { convertFromNoteState } from '../../utils/noteConversion'; 

const PianoRollWindows: React.FC = memo(() => {
  const openPianoRolls = usePianoRollStore(state => state.openPianoRolls);
  const closePianoRoll = usePianoRollStore(state => state.closePianoRoll);
  
  const store = useStudioStore(state => state.store);
  const tracks = useStudioStore(state => state.tracks);
  const addMidiNote = useStudioStore(state => state.addMidiNote);
  const removeMidiNote = useStudioStore(state => state.removeMidiNote);
  const updateMidiNote = useStudioStore(state => state.updateMidiNote);
  //const noteVersion = useStudioStore(state => state.noteVersion); // Subscribe to note changes
  
  // Tool state from store
  const selectedTool = useStudioStore(state => state.selectedTool);
  const snapToGrid = useStudioStore(state => state.snapToGrid);
  const setSelectedTool = useStudioStore(state => state.setSelectedTool);
  const toggleSnapToGrid = useStudioStore(state => state.toggleSnapToGrid);
  const getKeyNotes = useStudioStore(state => state.getKeyNotes);
  
  const [prevNotesByTrack, setPrevNotesByTrack] = useState<Record<string, NoteState[]>>({});
  
  const openTrackIds = useMemo(() =>
      Object.entries(openPianoRolls)
          .filter(([_, isOpen]) => isOpen)
          .map(([trackId]) => trackId),
      [openPianoRolls]
  );

  // Add a useEffect to clean up stale openPianoRolls entries
  useEffect(() => {
    openTrackIds.forEach(trackId => {
      const trackExists = tracks.some(t => t.id === trackId);
      if (!trackExists) {
        console.warn(`PianoRollWindows: Stale open piano roll detected for non-existent track ${trackId}. Closing it.`);
        closePianoRoll(trackId);
      }
    });
  // Depend on the raw openTrackIds array and the tracks array
  }, [openTrackIds, tracks, closePianoRoll]);

  //console.log('Piano Roll Windows - Render (Individual Selectors) - Open IDs:', openTrackIds, 'Note Version:', noteVersion);

  const handleNotesChange = useCallback(async (trackId: string, newNotes: NoteState[]) => {
    const prevNotes = prevNotesByTrack[trackId] || [];
    const changes = diffNotes(prevNotes, newNotes);
    
    // If there are multiple changes, use a GroupAction
    if (changes.length > 1) {
      const executeHistoryAction = useStudioStore.getState().executeHistoryAction;
      const midiManager = store?.getMidiManager();
      if (!executeHistoryAction || !midiManager) return;
      
      // Create individual actions for each change
      const actions: any[] = [];
      for (const change of changes) {
        try {
          switch (change.type) {
            case 'add': {
              const internalNoteData = convertFromNoteState({ ...change.note, id: -1 }, trackId);
              const tempNoteIdString = change.note.id?.toString() || crypto.randomUUID();
              actions.push(new Actions.AddNote(useStudioStore.getState, trackId, tempNoteIdString, internalNoteData));
              break;
            }
            case 'delete': {
              const originalNote = midiManager.getTrackNotes(trackId)?.find(n => n.id === change.id);
              if (originalNote) {
                actions.push(new Actions.DeleteNote(useStudioStore.getState, trackId, change.id.toString(), { ...originalNote }));
              }
              break;
            }
            case 'move':
            case 'resize': {
              if (change.oldNote) {
                const noteId = change.note.id as number;
                const originalNote = midiManager.getTrackNotes(trackId)?.find(n => n.id === noteId);
                if (originalNote) {
                  const oldNoteForCompare = originalNote;
                  const newNoteForCompare = convertFromNoteState(change.note, trackId);
                  
                  if (oldNoteForCompare.column !== newNoteForCompare.column || oldNoteForCompare.row !== newNoteForCompare.row) {
                    const oldPos = { column: Math.round(oldNoteForCompare.column), row: oldNoteForCompare.row };
                    const newPos = { column: Math.round(newNoteForCompare.column), row: newNoteForCompare.row };
                    
                    if (oldNoteForCompare.length !== newNoteForCompare.length) {
                      actions.push(new Actions.ResizeNote(useStudioStore.getState, trackId, noteId.toString(), Math.round(oldNoteForCompare.length), Math.round(newNoteForCompare.length), { ...originalNote }, oldPos.column, newPos.column));
                    } else {
                      actions.push(new Actions.MoveNote(useStudioStore.getState, trackId, noteId.toString(), oldPos, newPos, { ...originalNote }));
                    }
                  } else if (oldNoteForCompare.length !== newNoteForCompare.length) {
                    actions.push(new Actions.ResizeNote(useStudioStore.getState, trackId, noteId.toString(), Math.round(oldNoteForCompare.length), Math.round(newNoteForCompare.length), { ...originalNote }));
                  }
                }
              }
              break;
            }
          }
        } catch (error) { 
          console.error(`Error creating action for ${change.type}:`, error); 
        }
      }
      
      // Execute all actions as a group
      if (actions.length > 0) {
        const groupAction = new Actions.GroupAction(useStudioStore.getState, actions, `Edit ${actions.length} notes`);
        await executeHistoryAction(groupAction);
        
        // Increment note version once for the whole group
        // const incrementNoteVersion = useStudioStore.getState().incrementNoteVersion;
        // if (incrementNoteVersion) {
        //   incrementNoteVersion();
        // }
      }
    } else {
      // Single change - use the existing individual action handlers
      for (const change of changes) {
        try {
          switch (change.type) {
            case 'add': await addMidiNote(trackId, change.note); break;
            case 'delete': await removeMidiNote(trackId, change.id); break;
            case 'move':
            case 'resize': if (change.oldNote) { await updateMidiNote(trackId, change.note); } break;
          }
        } catch (error) { console.error(`Error processing ${change.type} op:`, error); }
      }
    }
    
    setPrevNotesByTrack(prev => ({ ...prev, [trackId]: [...newNotes] }));
  }, [prevNotesByTrack, addMidiNote, removeMidiNote, updateMidiNote, store]);

  const handleNotePreview = useCallback((trackId: string, midiNote: number, isOn: boolean) => {
    const instrumentManager = store?.getInstrumentManager(); 
    if (!instrumentManager) return;
    const track = tracks.find(t => t.id === trackId);
    const instrumentId = (track?.track as MidiTrack)?.instrument_id || 'default';
    if (isOn) { instrumentManager.playNote(instrumentId, midiNote); }
    else { instrumentManager.stopNote(instrumentId, midiNote); }
  }, [store, tracks]);

  // Effect to initialize prevNotesByTrack for newly opened rolls
  useEffect(() => {
    const midiManager = store?.getMidiManager();
    if (!midiManager || openTrackIds.length === 0) return; // Exit if no manager or no open rolls

    let stateUpdateNeeded = false;
    const updates: Record<string, NoteState[]> = {};

    openTrackIds.forEach(trackId => {
      if (!prevNotesByTrack[trackId]) { // Check if state for this ID needs initialization
        const currentNotes = midiManager.getTrackNotes(trackId) || [];
        const pianoRollNotes = currentNotes.map(convertToNoteState);
        updates[trackId] = pianoRollNotes;
        stateUpdateNeeded = true;
        console.log(`Initializing prevNotesByTrack for new trackId: ${trackId}`);
      }
    });

    if (stateUpdateNeeded) {
      setPrevNotesByTrack(prev => ({ ...prev, ...updates }));
    }
  // Depend on the list of open IDs and the store instance
  }, [openTrackIds, store, prevNotesByTrack]); 

  // Keep MidiManager useEffect commented out
  /* useEffect(() => { ... }, [store]); */

  if (openTrackIds.length === 0) { return null; }
  
  // Filter openTrackIds again *just before rendering* based on current tracks state
  const currentlyAvailableTrackIds = openTrackIds.filter(trackId => tracks.some(t => t.id === trackId));

  return (
    <>
      {currentlyAvailableTrackIds.map(trackId => { // Map over the filtered list
        const track = tracks.find(t => t.id === trackId); // This find should now always succeed
        const midiManager = store?.getMidiManager();
        const currentNotes = midiManager?.getTrackNotes(trackId) || [];
        const pianoRollNotes = currentNotes.map(convertToNoteState);

        if (!track) {
           console.error(`PianoRollWindows: Track data for ID ${trackId} unexpectedly not found despite check.`);
           return null;
        }

        const trackWithIndex = track as (CombinedTrack & { index?: number });
        const trackColor = getTrackColor(trackWithIndex?.index ?? 0); 

        return (
          <div 
            key={`piano-roll-wrapper-${trackId}`} 
            style={{ /* Necessary wrapper styles */ 
                position: 'fixed', 
                zIndex: 9999, // Ensure it's on top
                // Remove pointer-events: none if the wrapper shouldn't block interaction
                // pointerEvents: 'none' 
                // Position might be handled by PianoRoll component itself via initialX/Y
                // top: 0, left: 0, width: '100%', height: '100%' // Example covering screen
            }} 
          >
            <PianoRoll
              key={`piano-roll-${trackId}`}
              title={`Piano Roll - ${track?.name || 'Unknown Track'}`}
              color={trackColor} 
              notes={pianoRollNotes} 
              onNotesChange={(newNotes) => handleNotesChange(trackId, newNotes)}
              // Restore necessary props
              initialX={Math.max(50, window.innerWidth / 2 - 420)}
              initialY={Math.max(50, window.innerHeight / 2 - 250)}
              initialWidth={840}
              initialHeight={500}
              contentWidth={5000} 
              keyboardWidth={60} 
              scaleNotes={[]} 
              onClose={() => closePianoRoll(trackId)}
              // Tool state props
              //selectedTool={selectedTool}
              //snapToGrid={snapToGrid}
              //onToolChange={setSelectedTool}
              //onToggleSnapToGrid={toggleSnapToGrid}
            />
          </div>
        );
      })}
    </>
  );
});

export default PianoRollWindows;