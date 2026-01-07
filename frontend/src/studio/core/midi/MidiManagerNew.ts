import { Note } from '../../../types/note';

/**
 * Interface for track data
 */
interface MidiTrack {
  id: string;
  instrumentId: string;
  notes: MidiNote[];
  name?: string;
}

/**
 * Interface for MIDI note data
 */
interface MidiNote {
  id: number;
  row: number;
  column: number;
  length: number;
  velocity?: number;
  duration?: number;
  time?: number;
}

/**
 * Interface for MIDI data
 */
interface MidiData {
  tracks: MidiTrack[];
  bpm: number;
}

/**
 * Interface for Zustand store accessor
 * This allows MidiManager to read/write notes from Zustand state
 */
export interface ZustandStoreAccessor {
  getTrackNotes: (trackId: string) => Note[];
  setTrackNotes: (trackId: string, notes: Note[]) => void;
  addNoteToTrack: (trackId: string, note: Note) => number;
  removeNoteFromTrack: (trackId: string, noteId: number) => void;
  updateNoteInTrack: (trackId: string, note: Note) => void;
  hasTrack: (trackId: string) => boolean;
  initializeTrackNotes: (trackId: string) => void;
}

/**
 * MidiManager provides an API for MIDI note operations.
 * All note storage is delegated to Zustand via the storeAccessor.
 *
 * This class acts as a facade for MIDI operations, handling:
 * - Note CRUD operations (via Zustand)
 * - Instance management for playback calculations
 * - MIDI data format conversions
 */
export class MidiManager {
  // Zustand store accessor for reading/writing notes from Zustand state
  private storeAccessor: ZustandStoreAccessor | null = null;

  // Instance management
  private registeredInstances: Map<string, Set<string>> = new Map(); // trackId -> Set of instanceIds

  // Debouncing for persistence operations
  private pendingUpdates: Map<string, NodeJS.Timeout> = new Map();
  private debounceTime: number = 500; // 500ms debounce time

  /**
   * Set the Zustand store accessor
   * MidiManager reads/writes notes from Zustand via this accessor
   */
  setStoreAccessor(accessor: ZustandStoreAccessor): void {
    this.storeAccessor = accessor;
    console.log('MidiManager: Zustand store accessor connected');
  }

  /**
   * Ensure store accessor is set, throw if not
   */
  private requireStoreAccessor(): ZustandStoreAccessor {
    if (!this.storeAccessor) {
      throw new Error('MidiManager: Store accessor not set. Call setStoreAccessor() first.');
    }
    return this.storeAccessor;
  }

  /**
   * Check if a track exists
   * @param trackId The track ID
   * @returns True if the track exists
   */
  hasTrack(trackId: string): boolean {
    return this.requireStoreAccessor().hasTrack(trackId);
  }

  /**
   * Get track notes if the track exists
   * @param trackId The track ID
   * @returns The notes array or null if track doesn't exist
   */
  getTrackNotes(trackId: string): Note[] | null {
    const accessor = this.requireStoreAccessor();
    if (!accessor.hasTrack(trackId)) {
      return null;
    }
    const notes = accessor.getTrackNotes(trackId);
    return notes.length > 0 || accessor.hasTrack(trackId) ? notes : null;
  }

  /**
   * Create a new track with an empty notes array
   * @param instrumentId The instrument ID for the track
   * @param name Optional name for the track
   * @returns The created track object
   */
  createTrack(trackId: string, instrumentId: string, name: string = `Track ${instrumentId}`): MidiTrack {
    this.requireStoreAccessor().initializeTrackNotes(trackId);

    return {
      id: trackId,
      instrumentId,
      notes: [],
      name
    };
  }

  /**
   * Update track notes
   * This is the central method for updating notes - all note changes should go through here
   * @param trackId The track ID to update
   * @param notes The new notes array
   * @throws Error if the track doesn't exist
   */
  updateTrack(trackId: string, notes: Note[]): void {
    const accessor = this.requireStoreAccessor();
    if (!accessor.hasTrack(trackId)) {
      throw new Error(`Cannot update track ${trackId}: track does not exist`);
    }

    // Update notes in Zustand store
    accessor.setTrackNotes(trackId, notes);

    // Persist to DB with debouncing
    this.debouncePersistence(trackId, notes);
  }

  /**
   * Legacy method - kept for compatibility
   * Since instances now share notes, this just removes instance IDs
   */
  migrateNotesToFirstInstance(trackId: string, firstInstanceId: string): void {
    const notes = this.getTrackNotes(trackId);
    if (!notes) {
      console.log(`MidiManager: No notes to migrate for track ${trackId}`);
      return;
    }

    // Remove instance IDs from all notes since instances share notes
    let hasInstanceIds = false;
    const migratedNotes = notes.map(note => {
      if (note.instanceId) {
        hasInstanceIds = true;
        const { instanceId, ...noteWithoutInstanceId } = note;
        return noteWithoutInstanceId;
      }
      return note;
    });

    if (hasInstanceIds) {
      console.log(`MidiManager: Removed instance IDs from notes for shared instance model`);
      this.updateTrack(trackId, migratedNotes);
    } else {
      console.log(`MidiManager: Notes already using shared model`);
    }
  }

  /**
   * Add a single note to a track
   * Assigns a unique ID if the incoming note ID is invalid (-1).
   * @param trackId The track ID
   * @param note The note to add
   * @throws Error if the track doesn't exist
   */
  async addNoteToTrack(trackId: string, note: Note): Promise<void> {
    console.log(`>>> MidiManager: ENTER addNoteToTrack - Target ID: ${trackId}`);
    console.log(`>>> MidiManager: Checking if track exists... Has ${trackId}?`, this.hasTrack(trackId));

    // Remove instanceId if present since instances share notes
    const { instanceId, ...noteWithoutInstanceId } = note;
    const noteToAdd = { ...noteWithoutInstanceId };

    const accessor = this.requireStoreAccessor();
    if (!accessor.hasTrack(trackId)) {
      throw new Error(`Cannot add note to track ${trackId}: track does not exist`);
    }

    // Use the store accessor to add the note - store will assign ID if needed
    const assignedId = accessor.addNoteToTrack(trackId, noteToAdd);
    noteToAdd.id = assignedId;

    // Persist to DB with debouncing
    const updatedNotes = accessor.getTrackNotes(trackId);
    this.debouncePersistence(trackId, updatedNotes);
  }

  /**
   * Remove a single note from a track by its ID
   * @param trackId The track ID
   * @param noteId The ID of the note to remove
   * @throws Error if the track doesn't exist
   */
  async removeNoteFromTrack(trackId: string, noteId: number): Promise<void> {
    console.log("MidiManager: current notes:", this.getTrackNotes(trackId));
    console.log(`MidiManager: Removing note ${noteId} from track ${trackId}`);

    const accessor = this.requireStoreAccessor();
    if (!accessor.hasTrack(trackId)) {
      throw new Error(`Cannot remove note from track ${trackId}: track does not exist`);
    }

    // Use the store accessor to remove the note
    accessor.removeNoteFromTrack(trackId, noteId);

    // Persist to DB with debouncing
    const updatedNotes = accessor.getTrackNotes(trackId);
    this.debouncePersistence(trackId, updatedNotes);

    console.log("MidiManager: updated notes:", updatedNotes);
  }

  /**
   * Update a single note in a track
   * @param trackId The track ID
   * @param updatedNote The note with updated properties
   * @throws Error if the track doesn't exist or note not found
   */
  async updateNote(trackId: string, updatedNote: Note): Promise<void> {
    const accessor = this.requireStoreAccessor();
    if (!accessor.hasTrack(trackId)) {
      throw new Error(`Cannot update note in track ${trackId}: track does not exist`);
    }

    // Use the store accessor to update the note
    accessor.updateNoteInTrack(trackId, updatedNote);

    // Persist to DB with debouncing
    const updatedNotes = accessor.getTrackNotes(trackId);
    this.debouncePersistence(trackId, updatedNotes);
  }

  /**
   * Delete a track and its persistence
   * @param trackId The track ID to delete
   */
  async deleteTrackWithPersistence(trackId: string): Promise<void> {
    try {
      // Cancel any pending update
      if (this.pendingUpdates.has(trackId)) {
        clearTimeout(this.pendingUpdates.get(trackId)!);
        this.pendingUpdates.delete(trackId);
      }

      console.log(`MidiManager: Deleted persisted track ${trackId}`);
    } catch (error) {
      console.error(`MidiManager: Error deleting persisted track ${trackId}:`, error);
      // Continue even if persistence fails
    }
  }

  /**
   * Debounce persistence operations to reduce DB load
   * @param trackId The track ID to persist
   * @param notes The notes to persist
   */
  private debouncePersistence(trackId: string, notes: Note[]): void {
    // Cancel any pending update for this track
    if (this.pendingUpdates.has(trackId)) {
      clearTimeout(this.pendingUpdates.get(trackId)!);
    }

    // Schedule a new update
    const timeoutId = setTimeout(async () => {
      try {
        // Persistence is handled by auto-save service
        // Clear from pending updates
        this.pendingUpdates.delete(trackId);
      } catch (error) {
        console.error(`MidiManager: Error persisting track ${trackId}:`, error);
        this.pendingUpdates.delete(trackId);
      }
    }, this.debounceTime);

    this.pendingUpdates.set(trackId, timeoutId);
  }

  /**
   * Convert MIDI data to app note format
   * @param midiData The MIDI data
   * @returns Array of notes
   */
  midiToNotes(midiData: MidiData): Note[] {
    // Flatten all tracks into a single array of notes
    return midiData.tracks.flatMap(track =>
      track.notes.map(note => ({
        id: note.id,
        row: note.row,
        column: note.column,
        length: note.length,
        trackId: track.id,
        velocity: note.velocity
      }))
    );
  }

  /**
   * Register a track instance
   * @param trackId The track ID
   * @param instanceId The instance ID to register
   */
  registerInstance(trackId: string, instanceId: string): void {
    console.log(`MidiManager: Registering instance ${instanceId} for track ${trackId}`);

    if (!this.registeredInstances.has(trackId)) {
      this.registeredInstances.set(trackId, new Set());
    }

    this.registeredInstances.get(trackId)!.add(instanceId);
  }

  /**
   * Unregister a track instance
   * @param trackId The track ID
   * @param instanceId The instance ID to unregister
   */
  unregisterInstance(trackId: string, instanceId: string): void {
    console.log(`MidiManager: Unregistering instance ${instanceId} for track ${trackId}`);

    const instances = this.registeredInstances.get(trackId);
    if (instances) {
      instances.delete(instanceId);
    }
  }

  /**
   * Get notes for a specific instance
   * Since instances share the same notes, this returns all track notes
   * @param trackId The track ID
   * @param instanceId The instance ID (not used since all instances share notes)
   * @returns Array of notes for the track
   */
  getInstanceNotes(trackId: string, instanceId: string): Note[] {
    const notes = this.getTrackNotes(trackId);
    if (!notes) {
      console.log(`MidiManager: No notes found for track ${trackId}`);
      return [];
    }

    console.log(`MidiManager: Returning ${notes.length} shared notes for instance ${instanceId} of track ${trackId}`);

    // All instances share the same notes
    return notes;
  }

  /**
   * Add a note to a specific instance
   * Since instances share notes, this just adds to the track
   * @param trackId The track ID
   * @param instanceId The instance ID (not used)
   * @param note The note to add
   */
  async addNoteToInstance(trackId: string, instanceId: string, note: Note): Promise<void> {
    // Just add to track since all instances share notes
    await this.addNoteToTrack(trackId, note);
  }

  /**
   * Update all notes for a specific instance
   * Since instances share notes, this updates the track notes
   * @param trackId The track ID
   * @param instanceId The instance ID (not used)
   * @param instanceNotes The new notes
   */
  updateInstanceNotes(trackId: string, instanceId: string, instanceNotes: Note[]): void {
    // Just update track notes since all instances share them
    this.updateTrack(trackId, instanceNotes);
  }

  /**
   * Move all notes of an instance by a delta
   * Since instances share notes, this is not applicable
   * @deprecated Instances share notes and are positioned independently
   */
  moveInstance(trackId: string, instanceId: string, deltaX: number): void {
    console.warn('MidiManager: moveInstance is deprecated - instances share notes and are positioned independently');
  }

  /**
   * Get visible notes for an instance based on its position and trim values
   * This is used during playback to determine which notes should actually play
   * @param trackId The track ID
   * @param instanceId The instance ID
   * @param instancePosition The x position of the instance in ticks
   * @param trimStartTicks The start trim position in ticks (relative to track start)
   * @param trimEndTicks The end trim position in ticks (relative to track start)
   * @returns Notes adjusted for playback with their positions relative to the timeline
   */
  getInstanceNotesForPlayback(
    trackId: string,
    instanceId: string,
    instancePosition: number,
    trimStartTicks: number,
    trimEndTicks: number
  ): Note[] {
    const notes = this.getInstanceNotes(trackId, instanceId);
    if (notes.length === 0) return [];

    // Filter and adjust notes based on trim window
    const playableNotes = notes.filter(note => {
      // Note positions are relative to track start (0-based)
      const noteStart = note.column;
      const noteEnd = note.column + note.length;

      // Check if note overlaps with trim window
      return noteEnd > trimStartTicks && noteStart < trimEndTicks;
    }).map(note => {
      const noteStart = note.column;
      const noteEnd = note.column + note.length;

      // Calculate note position relative to the trim window
      let relativeColumn = noteStart - trimStartTicks;
      let adjustedLength = note.length;

      // Clip note if it starts before trim window
      if (noteStart < trimStartTicks) {
        const clipAmount = trimStartTicks - noteStart;
        relativeColumn = 0; // Start at beginning of trim window
        adjustedLength -= clipAmount;
      }

      // Clip note if it extends beyond trim window
      if (noteEnd > trimEndTicks) {
        adjustedLength = trimEndTicks - Math.max(noteStart, trimStartTicks);
      }

      // Calculate final position on timeline
      const timelineColumn = instancePosition + relativeColumn;

      return {
        ...note,
        column: timelineColumn,
        length: Math.max(1, adjustedLength)
      };
    });

    // Debug logging
    if (playableNotes.length > 0) {
      console.log(`MidiManager: Instance ${instanceId} playback notes:`, {
        originalNoteCount: notes.length,
        playableNoteCount: playableNotes.length,
        instancePosition,
        trimRange: `${trimStartTicks}-${trimEndTicks}`,
        firstNote: {
          originalColumn: notes[0].column,
          adjustedColumn: playableNotes[0].column
        }
      });
    }

    return playableNotes;
  }

  /**
   * Trim instance notes based on trim boundaries
   * This returns notes that would be visible with these trim settings
   * @param trackId The track ID
   * @param instanceId The instance ID
   * @param trimStartTicks The start trim position in ticks
   * @param trimEndTicks The end trim position in ticks
   * @returns The trimmed notes
   */
  trimInstance(trackId: string, instanceId: string, trimStartTicks: number, trimEndTicks: number): Note[] {
    const notes = this.getInstanceNotes(trackId, instanceId);
    if (notes.length === 0) return [];

    console.log(`MidiManager: Trim boundaries updated for instance ${instanceId}: ${trimStartTicks}-${trimEndTicks} ticks`);

    // Return the notes that would be visible with these trim settings
    return this.getInstanceNotesForPlayback(trackId, instanceId, 0, trimStartTicks, trimEndTicks);
  }

  /**
   * Convert app notes to MIDI data format
   * @param trackId The track ID
   * @param notes The notes array
   * @param bpm The BPM
   * @returns MIDI data object
   */
  notesToMidi(trackId: string, notes: Note[], bpm: number): MidiData {
    const track: MidiTrack = {
      id: trackId,
      instrumentId: 'default',
      notes: notes.map(note => ({
        ...note,
        velocity: note.velocity || 100,
        duration: note.length,
        time: note.column
      }))
    };

    return {
      tracks: [track],
      bpm,
    };
  }
}
