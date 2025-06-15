import { useMemo, useCallback } from 'react';
import { useInteractions, DraggableResizableItem } from '../../shared/interactions';
import { NoteState } from './PianoRoll';
import { GridSnapOption } from './gridConstants';
import { Tool } from '../../shared/interactions/types';
import { MUSIC_CONSTANTS } from '../../constants/musicConstants';

// Constants from PianoRoll
const GRID_SIZE = 48;
const PULSES_PER_QUARTER_NOTE = MUSIC_CONSTANTS.pulsesPerQuarterNote;
const PIXELS_PER_TICK = GRID_SIZE / PULSES_PER_QUARTER_NOTE;

// Adapter to convert Note to DraggableResizableItem
interface NoteItem extends DraggableResizableItem {
  note: NoteState;
  row: number;
}

function noteToItem(note: NoteState, keyHeight: number): NoteItem {
  return {
    id: note.id,
    x: note.column, // In ticks
    y: note.row * keyHeight, // Convert row to pixels
    width: note.length, // In ticks
    height: keyHeight,
    note,
    row: note.row
  };
}

interface UsePianoRollWithInteractionsOptions {
  notes: NoteState[];
  selectedNoteIds: number[];
  keyHeight: number;
  totalKeys: number;
  zoomLevel: number;
  selectedTool?: Tool;
  gridSnapEnabled?: boolean;
  gridSnapSize?: GridSnapOption;
  onNotesChange?: (notes: NoteState[]) => void;
  onSelectionChange?: (selectedIds: number[]) => void;
  noteColor?: string;
}

export function usePianoRollWithInteractions(options: UsePianoRollWithInteractionsOptions) {
  const {
    notes,
    selectedNoteIds,
    keyHeight,
    totalKeys,
    zoomLevel,
    selectedTool = 'select',
    gridSnapEnabled = true,
    gridSnapSize = GridSnapOption.STEP,
    onNotesChange,
    onSelectionChange,
    noteColor = '#ff5555'
  } = options;

  // Convert notes to items
  const noteItems = useMemo(() => 
    notes.map(note => noteToItem(note, keyHeight)),
    [notes, keyHeight]
  );

  // Calculate grid size in ticks based on snap option
  const gridSizeInTicks = useMemo(() => {
    switch (gridSnapSize) {
      case GridSnapOption.NONE:
        return 0;
      case GridSnapOption.BAR:
        return PULSES_PER_QUARTER_NOTE * 4; // 4 beats per bar
      case GridSnapOption.BEAT:
        return PULSES_PER_QUARTER_NOTE; // 1 beat
      case GridSnapOption.STEP:
        // For step, we want the visual grid cell size
        // GRID_SIZE is 48 pixels, which represents 1 step visually
        // We need to calculate how many ticks that represents
        const pixelsPerStep = GRID_SIZE;
        const ticksPerStep = pixelsPerStep / (PIXELS_PER_TICK * zoomLevel);
        return ticksPerStep;
      default:
        return PULSES_PER_QUARTER_NOTE / 4; // 16th note fallback
    }
  }, [gridSnapSize, zoomLevel]);

  // Handle drag move - update note positions
  const handleDragMove = useCallback((updates: Map<string | number, { x: number; y: number }>) => {
    if (!onNotesChange) return;

    const updatedNotes = notes.map(note => {
      const update = updates.get(note.id);
      if (update) {
        return {
          ...note,
          column: update.x, // Already in ticks
          row: Math.round(update.y / keyHeight) // Convert pixels back to row
        };
      }
      return note;
    });

    onNotesChange(updatedNotes);
  }, [notes, keyHeight, onNotesChange]);

  // Handle resize move - update note lengths
  const handleResizeMove = useCallback((updates: Map<string | number, { start?: number; width?: number }>) => {
    if (!onNotesChange) return;

    const updatedNotes = notes.map(note => {
      const update = updates.get(note.id);
      if (update) {
        const newNote = { ...note };
        
        if (update.start !== undefined) {
          // Left resize - update start position and length
          const oldEnd = note.column + note.length;
          newNote.column = update.start;
          newNote.length = oldEnd - update.start;
        } else if (update.width !== undefined) {
          // Right resize - update length only
          newNote.length = update.width;
        }
        
        return newNote;
      }
      return note;
    });

    onNotesChange(updatedNotes);
  }, [notes, onNotesChange]);

  // Use the unified interaction system
  const interaction = useInteractions({
    items: noteItems,
    pixelsPerTick: PIXELS_PER_TICK,
    zoom: zoomLevel,
    initialTool: selectedTool,
    snapToGrid: gridSnapEnabled,
    gridSize: gridSizeInTicks,
    onSelectionChange: (selectedIds) => {
      const noteIds = selectedIds.filter(id => typeof id === 'number') as number[];
      onSelectionChange?.(noteIds);
    },
    onDragMove: handleDragMove,
    onDragEnd: handleDragMove, // Same as move for real-time updates
    onResizeMove: handleResizeMove,
    onResizeEnd: handleResizeMove, // Same as move for real-time updates
    onItemClick: (itemId, tool) => {
      if (tool === 'eraser' && typeof itemId === 'number') {
        handleDelete([itemId]);
      }
    },
    onDelete: (itemIds) => {
      handleDelete(itemIds);
    },
    onDuplicate: (itemIds) => {
      handleDuplicate(itemIds);
    }
  });

  // Handle item deletion
  const handleDelete = useCallback((itemIds: (string | number)[]) => {
    if (!onNotesChange) return;
    
    const idsToDelete = new Set(itemIds);
    const remainingNotes = notes.filter(note => !idsToDelete.has(note.id));
    onNotesChange(remainingNotes);
  }, [notes, onNotesChange]);

  // Handle item duplication
  const handleDuplicate = useCallback((itemIds: (string | number)[]) => {
    if (!onNotesChange) return;
    
    const idsToDuplicate = new Set(itemIds);
    const notesToDuplicate = notes.filter(note => idsToDuplicate.has(note.id));
    
    // Find the next available ID
    const maxId = Math.max(...notes.map(n => n.id), 0);
    let nextId = maxId + 1;
    
    // Create duplicates offset by one beat
    const duplicatedNotes = notesToDuplicate.map(note => ({
      ...note,
      id: nextId++,
      column: note.column + PULSES_PER_QUARTER_NOTE // Offset by one beat
    }));
    
    onNotesChange([...notes, ...duplicatedNotes]);
  }, [notes, onNotesChange]);

  // Helper to create a new note at a position
  const createNoteAtPosition = useCallback((x: number, y: number): NoteState | null => {
    // Convert visual coordinates to logical
    const column = interaction.pixelsToTicks(x);
    const row = totalKeys - 1 - Math.floor(y / keyHeight); // Inverted for flipped keyboard
    
    // Snap to grid
    const snappedColumn = gridSnapEnabled && gridSizeInTicks > 0
      ? Math.round(column / gridSizeInTicks) * gridSizeInTicks
      : column;
    
    // Check if a note already exists at this position
    const existingNote = notes.find(note => 
      note.column === snappedColumn && note.row === row
    );
    
    if (existingNote) return null;
    
    // Find the next available ID
    const maxId = Math.max(...notes.map(n => n.id), 0);
    
    return {
      id: maxId + 1,
      column: snappedColumn,
      row,
      length: gridSizeInTicks > 0 ? gridSizeInTicks : PULSES_PER_QUARTER_NOTE // Default to one beat if no grid snap
    };
  }, [notes, interaction, totalKeys, keyHeight, gridSnapEnabled, gridSizeInTicks]);

  // Helper to get note at position
  const getNoteAtPosition = useCallback((x: number, y: number): NoteState | undefined => {
    const column = interaction.pixelsToTicks(x);
    const row = totalKeys - 1 - Math.floor(y / keyHeight);
    
    return notes.find(note => {
      const noteStart = note.column;
      const noteEnd = note.column + note.length;
      
      return column >= noteStart && 
             column <= noteEnd && 
             note.row === row;
    });
  }, [notes, interaction, totalKeys, keyHeight]);

  return {
    ...interaction,
    createNoteAtPosition,
    getNoteAtPosition,
    noteColor,
    // Expose grid size in ticks for other uses
    gridSizeInTicks
  };
}