export interface Note {
    id: number;
    row: number;  // Pitch, MIDI note number (0-127)
    column: number;  // Time position in grid
    length: number;  // Duration in grid units
    velocity?: number;  // MIDI velocity (0-127), defaults to 100
    trackId?: string;  // ID of the track this note belongs to
    instanceId?: string;  // ID of the track instance this note belongs to
}

// Generate unique note IDs using timestamp + counter to ensure uniqueness across sessions
let noteIdCounter = 0;
const generateUniqueNoteId = () => {
    noteIdCounter++;
    return Date.now() * 1000 + noteIdCounter;
};

// Type for the note data we expect from JSON
interface JsonNote {
    id?: number;  // Include ID since it's saved with notes
    row?: number;
    pitch?: number;
    column?: number;
    start?: number;
    length?: number;
    duration?: number;
    velocity?: number;
}

export function convertJsonToNotes(json_data: { [k: string]: unknown }, trackId?: string): Note[] {
    // Check if json_data has a 'notes' property and if it's an array
    if (json_data && Array.isArray(json_data.notes)) {
        // Type assertion with proper interface
        const notesArray = json_data.notes as JsonNote[];
        const ret = notesArray.map((note: JsonNote) => ({
            // Preserve existing ID if available, otherwise generate a new one
            id: note.id ?? generateUniqueNoteId(),
            row: note.row ?? note.pitch ?? 0,
            column: note.column ?? note.start ?? 0,
            length: note.length ?? note.duration ?? 1,
            velocity: note.velocity,
            trackId: trackId
        }));
        return ret;
    } else {
        console.error("Invalid JSON data format: 'notes' array not found.", json_data);
        return []; // Return an empty array or throw an error, depending on desired behavior
    }
}