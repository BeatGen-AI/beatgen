import { BaseAction } from './BaseAction';
import { GetState } from '../../../stores/types';
import { TrackInstance } from 'src/platform/types/project';
import { ActionType } from '.';

/**
 * Action for moving a track instance
 */
export class InstanceMove extends BaseAction {
    type: ActionType = 'INSTANCE_MOVE';
    private trackId: string;
    private instanceId: string;
    private oldX: number;
    private oldY: number;
    private newX: number;
    private newY: number;

    constructor(
        get: GetState,
        trackId: string,
        instanceId: string,
        oldX: number,
        oldY: number,
        newX: number,
        newY: number
    ) {
        super(get);
        this.trackId = trackId;
        this.instanceId = instanceId;
        this.oldX = oldX;
        this.oldY = oldY;
        this.newX = newX;
        this.newY = newY;
    }

    async execute(): Promise<void> {
        console.log('[InstanceMove] Execute called with:', {
            trackId: this.trackId,
            instanceId: this.instanceId,
            oldX: this.oldX,
            oldY: this.oldY,
            newX: this.newX,
            newY: this.newY
        });
        
        const { updateTrackInstance, tracks } = this.get();
        
        // Verify track exists before update
        const track = tracks.find(t => t.id === this.trackId);
        if (!track) {
            console.error('[InstanceMove] Track not found:', this.trackId);
            return;
        }
        
        // Verify instance exists
        const numericId = parseInt(this.instanceId);
        const instance = track.instance_metadata?.instances?.find(inst => inst.id === numericId);
        if (!instance) {
            console.error('[InstanceMove] Instance not found:', this.instanceId, 'in track:', this.trackId);
            return;
        }
        
        console.log('[InstanceMove] Current instance position:', { x: instance.x, y: instance.y });
        console.log('[InstanceMove] Updating to new position:', { x: this.newX, y: this.newY });
        
        updateTrackInstance(this.trackId, this.instanceId, {
            x: this.newX,
            y: this.newY
        });
        
        // Verify the update worked
        const updatedState = this.get();
        const updatedTrack = updatedState.tracks.find(t => t.id === this.trackId);
        const updatedInstance = updatedTrack?.instance_metadata?.instances?.find(inst => inst.id === numericId);
        console.log('[InstanceMove] After update - instance position:', updatedInstance);
        
        this.log('Execute', { trackId: this.trackId, instanceId: this.instanceId, newX: this.newX, newY: this.newY });
    }

    async undo(): Promise<void> {
        const { updateTrackInstance } = this.get();
        updateTrackInstance(this.trackId, this.instanceId, {
            x: this.oldX,
            y: this.oldY
        });
        this.log('Undo', { trackId: this.trackId, instanceId: this.instanceId, oldX: this.oldX, oldY: this.oldY });
    }
}

/**
 * Action for resizing a track instance
 */
export class InstanceResize extends BaseAction {
    type: ActionType = 'INSTANCE_RESIZE';
    private trackId: string;
    private instanceId: string;
    private oldTrimStart: number;
    private oldTrimEnd: number;
    private oldX: number;
    private newTrimStart: number;
    private newTrimEnd: number;
    private newX: number;

    constructor(
        get: GetState,
        trackId: string,
        instanceId: string,
        oldTrimStart: number,
        oldTrimEnd: number,
        oldX: number,
        newTrimStart: number,
        newTrimEnd: number,
        newX: number
    ) {
        super(get);
        this.trackId = trackId;
        this.instanceId = instanceId;
        this.oldTrimStart = oldTrimStart;
        this.oldTrimEnd = oldTrimEnd;
        this.oldX = oldX;
        this.newTrimStart = newTrimStart;
        this.newTrimEnd = newTrimEnd;
        this.newX = newX;
    }

    async execute(): Promise<void> {
        const { updateTrackInstance } = this.get();
        updateTrackInstance(this.trackId, this.instanceId, {
            trim_start_ticks: this.newTrimStart,
            trim_end_ticks: this.newTrimEnd,
            x: this.newX
        });
        this.log('Execute', { 
            trackId: this.trackId, 
            instanceId: this.instanceId, 
            newTrimStart: this.newTrimStart, 
            newTrimEnd: this.newTrimEnd,
            newX: this.newX
        });
    }

    async undo(): Promise<void> {
        const { updateTrackInstance } = this.get();
        updateTrackInstance(this.trackId, this.instanceId, {
            trim_start_ticks: this.oldTrimStart,
            trim_end_ticks: this.oldTrimEnd,
            x: this.oldX
        });
        this.log('Undo', { 
            trackId: this.trackId, 
            instanceId: this.instanceId, 
            oldTrimStart: this.oldTrimStart, 
            oldTrimEnd: this.oldTrimEnd,
            oldX: this.oldX
        });
    }
}

/**
 * Action for adding a track instance
 */
export class InstanceAdd extends BaseAction {
    type: ActionType = 'INSTANCE_ADD';
    private trackId: string;
    private instance: TrackInstance;

    constructor(
        get: GetState,
        trackId: string,
        instance: TrackInstance
    ) {
        super(get);
        this.trackId = trackId;
        this.instance = instance;
    }

    async execute(): Promise<void> {
        const { updateTrackState, tracks } = this.get();
        const track = tracks.find(t => t.id === this.trackId);
        if (!track) {
            console.error(`[InstanceAdd] Execute failed: Track ${this.trackId} not found`);
            return;
        }

        const instances = track.instance_metadata?.instances || [];
        // Check if instance already exists
        const exists = instances.some(inst => inst.id === this.instance.id);
        if (exists) {
            console.warn(`[InstanceAdd] Instance ${this.instance.id} already exists in track ${this.trackId}`);
            return;
        }

        updateTrackState(this.trackId, {
            instance_metadata: {
                instances: [...instances, this.instance]
            }
        });
        this.log('Execute', { trackId: this.trackId, instanceId: this.instance.id });
    }

    async undo(): Promise<void> {
        const { updateTrackState, tracks } = this.get();
        const track = tracks.find(t => t.id === this.trackId);
        if (!track) {
            console.error(`[InstanceAdd] Undo failed: Track ${this.trackId} not found`);
            return;
        }

        const instances = track.instance_metadata?.instances || [];
        const filtered = instances.filter(inst => inst.id !== this.instance.id);
        
        if (filtered.length === instances.length) {
            console.warn(`[InstanceAdd] Undo: Instance ${this.instance.id} not found in track ${this.trackId}`);
            return;
        }

        updateTrackState(this.trackId, { 
            instance_metadata: {
                instances: filtered
            }
        });
        this.log('Undo', { trackId: this.trackId, instanceId: this.instance.id });
    }
}

/**
 * Action for deleting a track instance
 */
export class InstanceDelete extends BaseAction {
    type: ActionType = 'INSTANCE_DELETE';
    private trackId: string;
    private instance: TrackInstance;
    private instanceIndex: number;

    constructor(
        get: GetState,
        trackId: string,
        instance: TrackInstance,
        instanceIndex: number
    ) {
        super(get);
        this.trackId = trackId;
        this.instance = instance;
        this.instanceIndex = instanceIndex;
    }

    async execute(): Promise<void> {
        const { deleteTrackInstance } = this.get();
        deleteTrackInstance(this.trackId, String(this.instance.id));
        this.log('Execute', { trackId: this.trackId, instanceId: this.instance.id });
    }

    async undo(): Promise<void> {
        const { updateTrackState, tracks } = this.get();
        const track = tracks.find(t => t.id === this.trackId);
        if (!track) {
            console.error(`[InstanceDelete] Undo failed: Track ${this.trackId} not found`);
            return;
        }

        const instances = [...(track.instance_metadata?.instances || [])];
        
        // Validate instance index
        if (this.instanceIndex < 0 || this.instanceIndex > instances.length) {
            console.error(`[InstanceDelete] Undo failed: Invalid instance index ${this.instanceIndex}`);
            return;
        }
        
        // Check if instance already exists (shouldn't happen, but be safe)
        const exists = instances.some(inst => inst.id === this.instance.id);
        if (exists) {
            console.warn(`[InstanceDelete] Undo: Instance ${this.instance.id} already exists in track ${this.trackId}`);
            return;
        }
        
        instances.splice(this.instanceIndex, 0, this.instance);
        updateTrackState(this.trackId, { 
            instance_metadata: {
                instances
            }
        });
        this.log('Undo', { trackId: this.trackId, instanceId: this.instance.id });
    }
}

// Export all instance actions
export const InstanceActions = {
    InstanceMove,
    InstanceResize,
    InstanceAdd,
    InstanceDelete
};