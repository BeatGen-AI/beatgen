import { Store } from '../../store';
// import { useGridStore } from '../../gridStore'; // Assuming unused
// Remove import for old store
// import { useStudioStore } from '../../../../stores/useStudioStore'; 
import { BaseAction, TrackAction } from './BaseAction';
import { pixelsToTicks, ticksToPixels } from '../../../../constants/gridConstants';
// Fix Position import path
import { Position } from '../../../../components/track'; 
// Fix TrackState: Use CombinedTrack from platform types
import { CombinedTrack } from 'src/platform/types/project'; 
// Fix GetFn import path
import { AudioTrackOptions, GetFn, RootState, TrackOptions } from '../../../../stores/types'; 
import { ActionType } from '.';
// Fix: Import TRACK_CONFIG
import { TRACK_CONFIG } from '../../../../stores/config'; 
import { DrumTrackRead } from 'src/platform/types/dto/track_models/drum_track';
import { SamplerTrackRead } from 'src/platform/types/dto/track_models/sampler_track';

/**
 * Action for changing track position without callbacks
 */
export class TrackPositionAction extends TrackAction {
    readonly type = 'TRACK_POSITION_CHANGE';
    private oldPosition: Position;
    private newPosition: Position;
    
    constructor(
        get: GetFn,
        trackId: string,
        oldPosition: Position,
        newPosition: Position
    ) {
        super(get, trackId);
        this.oldPosition = oldPosition;
        this.newPosition = newPosition;
    }
    
    private updatePosition(position: Position, _operation: string): void {
        // Update store state - this triggers syncEngineState() which updates the new AudioEngine
        this.get().updateTrackState(this.trackId, {
            position: { ...position },
            x_position: position.x,
            y_position: position.y
        });
    }
    
    async execute(): Promise<void> {
        this.updatePosition(this.newPosition, 'execute');
        this.log('Execute', { 
            trackId: this.trackId, 
            from: this.oldPosition, 
            to: this.newPosition,
            isCurrentlyPlaying: this.get().isPlaying
        });
    }
    
    async undo(): Promise<void> {
        this.updatePosition(this.oldPosition, 'undo');
        this.log('Undo', { 
            trackId: this.trackId, 
            from: this.newPosition, 
            to: this.oldPosition,
            isCurrentlyPlaying: this.get().isPlaying
        });
    }
}

/**
 * Action for adding a track without callbacks
 */
export class AddTrackAction extends BaseAction {
    readonly type = 'TRACK_ADD';
    private trackData: CombinedTrack;
    private initialFile?: File;
    
    constructor(get: GetFn, trackData: CombinedTrack, file?: File) {
        super(get);
        this.trackData = { ...trackData };
        this.initialFile = file;
    }
    
    async execute(): Promise<void> {
        
        // Step 1: Update Zustand state FIRST
        let trackAddedToState = false;
        console.log('AddTrackAction: Adding track with dirty flag:', this.trackData.dirty);
        this.get()._updateState('tracks', (prevTracks) => {
            if (prevTracks.some(t => t.id === this.trackData.id)) {
                return prevTracks; 
            }
            trackAddedToState = true;
            return [...prevTracks, this.trackData];
        });

        if (!trackAddedToState) return; 
        this.get().updateTrackIndices(); 

        // Step 2: Initialize Engine Backend
        const typeConfig = TRACK_CONFIG[this.trackData.track_type];
        if (!typeConfig) {
            console.error(`Invalid track type ${this.trackData.track_type} in AddTrackAction execute`);
            return; // Cannot initialize engine
        }
        
        // Use the stored initialFile if available
        const fileToLoad = this.initialFile; 
        const trackSpecificData = this.trackData.track as any;
        const instrumentId = this.trackData.track_type === 'MIDI' ? trackSpecificData?.instrument_id as string | undefined : undefined;

        
        try {
            // Pass the stored file object (or undefined)
            let options: TrackOptions;
            switch (this.trackData.track_type) {
                case 'AUDIO':
                    options = {
                        ...this.trackData.track,
                        audioFile: fileToLoad,
                    };
                    break;
                case 'SAMPLER':
                    options = {
                        ...this.trackData.track,
                        sampleFile: fileToLoad,
                    };
                    break;
                case 'MIDI':
                    options = {
                        ...this.trackData.track,
                        instrumentId: instrumentId,
                    };
                    break;
                default:
                    options = {
                        ...this.trackData.track,
                    };
            }
            await typeConfig.initEngine(this.store, this.trackData.id, this.get, options); 
        } catch (engineInitError) {
            console.error(`AddTrackAction: Error during initEngine for ${this.trackData.id}:`, engineInitError);
            // Consider potential rollback or error state update here?
        }

        // Step 3: Connect soundfont for MIDI tracks if applicable
        try {
            if ((this.trackData.track_type === 'MIDI' || this.trackData.track_type === 'DRUM') && instrumentId) {
                 await this.store.connectTrackToSoundfont(this.trackData.id, instrumentId);
            }
            // Track parameters (volume, pan, mute, position) are applied via new AudioEngine's setState()
        } catch (paramError) {
            console.error(`AddTrackAction: Error connecting soundfont for ${this.trackData.id}:`, paramError);
        }

        this.log('Execute', { trackId: this.trackData.id, name: this.trackData.name });
    }
    
    async undo(): Promise<void> {
        // Remove from State - this triggers syncEngineState() which updates the new AudioEngine
        this.get()._updateState('tracks', state => state.filter(t => t.id !== this.trackData.id));
        this.get().updateTrackIndices();

        this.log('Undo', { trackId: this.trackData.id, name: this.trackData.name });
    }
}

/**
 * Action for deleting a track without callbacks
 */
export class DeleteTrackAction extends BaseAction {
    readonly type = 'TRACK_DELETE';
    private trackData: CombinedTrack;
    
    constructor(get: GetFn, trackData: CombinedTrack) {
        super(get);
        this.trackData = { ...trackData };
    }
    
    async execute(): Promise<void> {
        // Remove from State - this triggers syncEngineState() which updates the new AudioEngine
        this.get()._updateState('tracks', state => state.filter(t => t.id !== this.trackData.id));
        this.get().updateTrackIndices();

        this.log('Execute', {
            trackId: this.trackData.id,
            name: this.trackData.name,
            type: this.trackData.track_type
        });
    }

    async undo(): Promise<void> {
        const trackSpecificData = this.trackData.track as any;
        const audioFile = trackSpecificData.audioFile as File | undefined;
        const sampleFile = trackSpecificData.sampleFile as File | undefined;
        const instrumentId = trackSpecificData.instrumentId ?? trackSpecificData.instrument_id as string | undefined;

        // Restore track to state first
        this.get()._updateState('tracks', (prevTracks) => [...prevTracks, this.trackData]);
        this.get().updateTrackIndices();

        // Re-load audio buffer into new engine if applicable
        const { getAudioEngine } = await import('../../../../core/audio-engine/AudioEngine');
        const newEngine = getAudioEngine();

        if (this.trackData.track_type === 'AUDIO' && audioFile && newEngine.isReady()) {
            try {
                await newEngine.loadAudioBuffer(this.trackData.id, audioFile);
            } catch (error) {
                console.error(`DeleteTrackAction.undo: Failed to load audio for ${this.trackData.id}:`, error);
            }
        } else if (this.trackData.track_type === 'SAMPLER' && sampleFile && newEngine.isReady()) {
            try {
                await newEngine.loadAudioBuffer(this.trackData.id, sampleFile);
            } catch (error) {
                console.error(`DeleteTrackAction.undo: Failed to load sampler audio for ${this.trackData.id}:`, error);
            }
        }

        // Connect soundfont for MIDI tracks
        if ((this.trackData.track_type === 'MIDI' || this.trackData.track_type === 'DRUM') && instrumentId) {
            try {
                await this.store.connectTrackToSoundfont(this.trackData.id, instrumentId);
            } catch (error) {
                console.error(`DeleteTrackAction.undo: Failed to connect soundfont for ${this.trackData.id}:`, error);
            }
        }

        this.log('Undo', {
            trackId: this.trackData.id,
            name: this.trackData.name,
            isPlaying: this.get().isPlaying
        });
    }
}

/**
 * Action for track parameter changes (volume, pan, etc.) without callbacks
 */
export class ParameterChangeAction extends TrackAction {
    type: ActionType;
    private parameter: string;
    private oldValue: number;
    private newValue: number;
    
    constructor(
        get: GetFn,
        trackId: string,
        parameter: 'volume' | 'pan' | 'muted',
        oldValue: number,
        newValue: number
    ) {
        super(get, trackId);
        this.parameter = parameter;
        this.oldValue = oldValue;
        this.newValue = newValue;
        this.type = `TRACK_${parameter.toUpperCase()}_CHANGE` as ActionType;
    }
    
    private updateParameter(value: number): void {
        const isMuted = this.parameter === 'muted' ? value === 1 : undefined;

        // Update store state - this triggers syncEngineState() which updates the new AudioEngine
        switch (this.parameter) {
            case 'volume':
                // If this is a drum track, also update all its sampler tracks in the store
                const volumeTrack = this.get().findTrackById(this.trackId);
                if (volumeTrack?.track_type === 'DRUM') {
                    const samplerTracks = this.get().tracks.filter(t =>
                        t.track_type === 'SAMPLER' &&
                        t.track &&
                        (t.track as SamplerTrackRead).drum_track_id === this.trackId
                    );
                    samplerTracks.forEach(samplerTrack => {
                        this.get().updateTrackState(samplerTrack.id, { volume: value });
                    });
                }
                break;
            case 'pan':
                // No special handling needed for pan
                break;
            case 'muted':
                // If this is a drum track, also update all its sampler tracks in the store
                if (isMuted !== undefined) {
                    const muteTrack = this.get().findTrackById(this.trackId);
                    if (muteTrack?.track_type === 'DRUM') {
                        const samplerTracks = this.get().tracks.filter(t =>
                            t.track_type === 'SAMPLER' &&
                            t.track &&
                            (t.track as SamplerTrackRead).drum_track_id === this.trackId
                        );
                        samplerTracks.forEach(samplerTrack => {
                            this.get().updateTrackState(samplerTrack.id, { mute: isMuted });
                        });
                    }
                }
                break;
        }

        // Update the main track in the store
        const updateData = { [this.parameter]: this.parameter === 'muted' ? isMuted : value };
        if(this.parameter === 'muted') updateData.mute = isMuted;
        this.get().updateTrackState(this.trackId, updateData);
    }
    
    async execute(): Promise<void> {
        this.updateParameter(this.newValue);
        this.log('Execute', { 
            trackId: this.trackId, 
            parameter: this.parameter,
            from: this.oldValue, 
            to: this.newValue 
        });
    }
    
    async undo(): Promise<void> {
        this.updateParameter(this.oldValue);
        this.log('Undo', { 
            trackId: this.trackId, 
            parameter: this.parameter,
            from: this.newValue, 
            to: this.oldValue 
        });
    }
}

/**
 * Action for resizing a track (including trim operations)
 */
export class TrackResizeAction extends TrackAction {
    readonly type = 'TRACK_RESIZE';
    private oldTrimStartTicks: number;
    private oldTrimEndTicks: number;
    private oldPositionX: number;
    private newTrimStartTicks: number;
    private newTrimEndTicks: number;
    private newPositionX: number;
    
    constructor(
        get: GetFn,
        trackId: string,
        oldTrimStartTicks: number,
        oldTrimEndTicks: number,
        oldPositionX: number,
        newTrimStartTicks: number,
        newTrimEndTicks: number,
        newPositionX: number
    ) {
        super(get, trackId);
        this.oldTrimStartTicks = oldTrimStartTicks;
        this.oldTrimEndTicks = oldTrimEndTicks;
        this.oldPositionX = oldPositionX;
        this.newTrimStartTicks = newTrimStartTicks;
        this.newTrimEndTicks = newTrimEndTicks;
        this.newPositionX = newPositionX;
    }
    
    private updateTrackResize(
        trimStartTicks: number,
        trimEndTicks: number,
        positionXTicks: number,
        _operation: string
    ): void {

        // This action should not be used anymore - use InstanceResizeAction instead
        console.warn('TrackResizeAction is deprecated - use InstanceResizeAction instead');
        // For now, update the first instance if it exists
        // Store update triggers syncEngineState() which updates the new AudioEngine
        const track = this.get().findTrackById(this.trackId);
        if (track && track.instances?.[0]) {
            const firstInstance = track.instances[0];
            this.get().updateTrackState(this.trackId, {
                instances: [{
                    ...firstInstance,
                    trim_start_ticks: trimStartTicks,
                    trim_end_ticks: trimEndTicks,
                    x_position: positionXTicks
                }]
            });
        }
    }
    
    async execute(): Promise<void> {
        this.updateTrackResize(
            this.newTrimStartTicks,
            this.newTrimEndTicks,
            this.newPositionX,
            'execute'
        );
        
        this.log('Execute', { 
            trackId: this.trackId, 
            from: {
                trimStartTicks: this.oldTrimStartTicks,
                trimEndTicks: this.oldTrimEndTicks,
                positionX: this.oldPositionX
            }, 
            to: {
                trimStartTicks: this.newTrimStartTicks,
                trimEndTicks: this.newTrimEndTicks,
                positionX: this.newPositionX
            },
            isCurrentlyPlaying: this.get().isPlaying
        });
    }
    
    async undo(): Promise<void> {
        this.updateTrackResize(
            this.oldTrimStartTicks,
            this.oldTrimEndTicks,
            this.oldPositionX,
            'undo'
        );
        
        this.log('Undo', { 
            trackId: this.trackId, 
            from: {
                trimStartTicks: this.newTrimStartTicks,
                trimEndTicks: this.newTrimEndTicks,
                positionX: this.newPositionX
            }, 
            to: {
                trimStartTicks: this.oldTrimStartTicks,
                trimEndTicks: this.oldTrimEndTicks,
                positionX: this.oldPositionX
            },
            isCurrentlyPlaying: this.get().isPlaying
        });
    }
}

// Example structure - adjust based on your ActionBase and state access needs
export class UpdateDrumTrackSamplers extends BaseAction {
    readonly type = 'DRUM_TRACK_SAMPLER_UPDATE';
    drumTrackId: string;
    oldSamplerIds: string[];
    newSamplerIds: string[];

    constructor(
        get: GetFn,
        drumTrackId: string,
        oldSamplerIds: string[],
        newSamplerIds: string[]
    ) {
        super(get);
        this.drumTrackId = drumTrackId;
        this.oldSamplerIds = [...oldSamplerIds]; // Store copies
        this.newSamplerIds = [...newSamplerIds];
    }

    async execute() {
        const { _updateNestedTrackData } = this.get();
        if (_updateNestedTrackData) {
            _updateNestedTrackData(this.drumTrackId, { sampler_track_ids: this.newSamplerIds } as Partial<DrumTrackRead>);
        } else {
            console.error("apply UpdateDrumTrackSamplers: _updateNestedTrackData not found");
        }
    }

    async undo() {
        const { _updateNestedTrackData } = this.get();
        if (_updateNestedTrackData) {
            _updateNestedTrackData(this.drumTrackId, { sampler_track_ids: this.oldSamplerIds } as Partial<DrumTrackRead>);
        } else {
            console.error("revert UpdateDrumTrackSamplers: _updateNestedTrackData not found");
        }
    }
}

/**
 * Action for attaching a sampler track to a drum track
 */
export class AttachSamplerToDrumAction extends BaseAction {
    readonly type = 'SAMPLER_ATTACH_TO_DRUM';
    private samplerTrackId: string;
    private drumTrackId: string;
    
    constructor(get: GetFn, samplerTrackId: string, drumTrackId: string) {
        super(get);
        this.samplerTrackId = samplerTrackId;
        this.drumTrackId = drumTrackId;
    }
    
    async execute(): Promise<void> {
        // Update drum track's sampler list
        const drumTrack = this.get().findTrackById(this.drumTrackId);
        if (drumTrack?.track_type === 'DRUM') {
            const drumData = drumTrack.track as DrumTrackRead;
            const currentSamplerIds = drumData.sampler_track_ids || [];
            const newSamplerIds = [...currentSamplerIds, this.samplerTrackId];
            
            this.get()._updateNestedTrackData(this.drumTrackId, { 
                sampler_track_ids: newSamplerIds 
            } as Partial<DrumTrackRead>);
        }
        
        // Update sampler track's drum reference
        this.get()._updateNestedTrackData(this.samplerTrackId, { 
            drum_track_id: this.drumTrackId 
        } as Partial<SamplerTrackRead>);
        
        this.log('Execute', { 
            samplerTrackId: this.samplerTrackId, 
            drumTrackId: this.drumTrackId 
        });
    }
    
    async undo(): Promise<void> {
        // Remove from drum track's sampler list
        const drumTrack = this.get().findTrackById(this.drumTrackId);
        if (drumTrack?.track_type === 'DRUM') {
            const drumData = drumTrack.track as DrumTrackRead;
            const currentSamplerIds = drumData.sampler_track_ids || [];
            const newSamplerIds = currentSamplerIds.filter(id => id !== this.samplerTrackId);
            
            this.get()._updateNestedTrackData(this.drumTrackId, { 
                sampler_track_ids: newSamplerIds 
            } as Partial<DrumTrackRead>);
        }
        
        // Clear sampler track's drum reference
        this.get()._updateNestedTrackData(this.samplerTrackId, { 
            drum_track_id: undefined 
        } as Partial<SamplerTrackRead>);
        
        this.log('Undo', { 
            samplerTrackId: this.samplerTrackId, 
            drumTrackId: this.drumTrackId 
        });
    }
}

/**
 * Action for detaching a sampler track from a drum track
 */
export class DetachSamplerFromDrumAction extends BaseAction {
    readonly type = 'SAMPLER_DETACH_FROM_DRUM';
    private samplerTrackId: string;
    private drumTrackId: string;
    
    constructor(get: GetFn, samplerTrackId: string, drumTrackId: string) {
        super(get);
        this.samplerTrackId = samplerTrackId;
        this.drumTrackId = drumTrackId;
    }
    
    async execute(): Promise<void> {
        // Remove from drum track's sampler list
        const drumTrack = this.get().findTrackById(this.drumTrackId);
        if (drumTrack?.track_type === 'DRUM') {
            const drumData = drumTrack.track as DrumTrackRead;
            const currentSamplerIds = drumData.sampler_track_ids || [];
            const newSamplerIds = currentSamplerIds.filter(id => id !== this.samplerTrackId);
            
            this.get()._updateNestedTrackData(this.drumTrackId, { 
                sampler_track_ids: newSamplerIds 
            } as Partial<DrumTrackRead>);
        }
        
        // Clear sampler track's drum reference
        this.get()._updateNestedTrackData(this.samplerTrackId, { 
            drum_track_id: undefined 
        } as Partial<SamplerTrackRead>);
        
        this.log('Execute', { 
            samplerTrackId: this.samplerTrackId, 
            drumTrackId: this.drumTrackId 
        });
    }
    
    async undo(): Promise<void> {
        // Re-add to drum track's sampler list
        const drumTrack = this.get().findTrackById(this.drumTrackId);
        if (drumTrack?.track_type === 'DRUM') {
            const drumData = drumTrack.track as DrumTrackRead;
            const currentSamplerIds = drumData.sampler_track_ids || [];
            const newSamplerIds = [...currentSamplerIds, this.samplerTrackId];
            
            this.get()._updateNestedTrackData(this.drumTrackId, { 
                sampler_track_ids: newSamplerIds 
            } as Partial<DrumTrackRead>);
        }
        
        // Restore sampler track's drum reference
        this.get()._updateNestedTrackData(this.samplerTrackId, { 
            drum_track_id: this.drumTrackId 
        } as Partial<SamplerTrackRead>);
        
        this.log('Undo', { 
            samplerTrackId: this.samplerTrackId, 
            drumTrackId: this.drumTrackId 
        });
    }
}

/**
 * Export all track actions
 */
export const TrackActions = {
    TrackPosition: TrackPositionAction,
    AddTrack: AddTrackAction, 
    DeleteTrack: DeleteTrackAction,
    ParameterChange: ParameterChangeAction,
    TrackResize: TrackResizeAction,
    UpdateDrumTrackSamplers: UpdateDrumTrackSamplers,
    AttachSamplerToDrum: AttachSamplerToDrumAction,
    DetachSamplerFromDrum: DetachSamplerFromDrumAction
};