import { Store } from '../../store';
import { GetFn, RootState } from '../../../../stores/types';
import { ActionType } from '.';

export interface Action {
    execute(): Promise<void>;
    undo(): Promise<void>;
    type: string;
}

/**
 * Base class for all direct actions that update state without callbacks
 */
export abstract class BaseAction implements Action {
    abstract type: ActionType;
    protected get: GetFn;
    protected store: Store;
    
    constructor(get: GetFn) {
        this.get = get;
        const storeInstance = this.get().store;
        if (!storeInstance) {
            throw new Error("Store instance not available when creating action!");
        }
        this.store = storeInstance;
    }
    
    /**
     * Helper method for logging actions
     */
    protected log(operation: string, message: object): void {
        const emoji = operation === 'Execute' ? '🔄' : '↩️';
        console.log(`${emoji} ${operation} ${this.type}:`, message);
    }
    // Note: Track position sync is handled by new AudioEngine via setState()

    abstract execute(): Promise<void>;
    abstract undo(): Promise<void>;
}

/**
 * Abstract base class for actions that operate on a track
 */
export abstract class TrackAction extends BaseAction {
    protected trackId: string;
    
    constructor(get: GetFn, trackId: string) {
        super(get);
        this.trackId = trackId;
    }
    
    abstract execute(): Promise<void>;
    abstract undo(): Promise<void>;
}

/**
 * Abstract base class for actions that operate on a note within a track
 */
export abstract class NoteAction extends BaseAction {
    protected trackId: string;
    protected noteId: string;
    
    constructor(get: GetFn, trackId: string, noteId: string) {
        super(get);
        this.trackId = trackId;
        this.noteId = noteId;
    }
    
    /**
     * Helper method to mark a track as dirty when notes are modified
     */
    protected markTrackAsDirty(): void {
        console.log('markTrackAsDirty called for track:', this.trackId);
        const { updateTrackState } = this.get();
        if (updateTrackState) {
            console.log('Calling updateTrackState with dirty: true');
            updateTrackState(this.trackId, { dirty: true });
        } else {
            console.warn('updateTrackState not available');
        }
    }
    
    abstract execute(): Promise<void>;
    abstract undo(): Promise<void>;
}