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
        const { updateTrackInstance } = this.get();
        updateTrackInstance(this.trackId, this.instanceId, {
            x_position: this.newX,
            y_position: this.newY
        });
        this.log('Execute', { trackId: this.trackId, instanceId: this.instanceId, newX: this.newX, newY: this.newY });
    }

    async undo(): Promise<void> {
        const { updateTrackInstance } = this.get();
        updateTrackInstance(this.trackId, this.instanceId, {
            x_position: this.oldX,
            y_position: this.oldY
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
            x_position: this.newX
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
            x_position: this.oldX
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
        const { updateTrackState } = this.get();
        const track = this.get().tracks.find(t => t.id === this.trackId);
        if (!track) return;

        const instances = track.instances || [];
        updateTrackState(this.trackId, {
            instances: [...instances, this.instance]
        });
        this.log('Execute', { trackId: this.trackId, instanceId: this.instance.id });
    }

    async undo(): Promise<void> {
        const { updateTrackState } = this.get();
        const track = this.get().tracks.find(t => t.id === this.trackId);
        if (!track) return;

        const instances = (track.instances || []).filter(inst => inst.id !== this.instance.id);
        updateTrackState(this.trackId, { instances });
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
        deleteTrackInstance(this.trackId, this.instance.id);
        this.log('Execute', { trackId: this.trackId, instanceId: this.instance.id });
    }

    async undo(): Promise<void> {
        const { updateTrackState } = this.get();
        const track = this.get().tracks.find(t => t.id === this.trackId);
        if (!track) return;

        const instances = [...(track.instances || [])];
        instances.splice(this.instanceIndex, 0, this.instance);
        updateTrackState(this.trackId, { instances });
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