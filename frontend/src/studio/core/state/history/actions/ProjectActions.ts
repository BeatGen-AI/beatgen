import { BaseAction } from './BaseAction';
import { GetFn } from '../../../../stores/types';

/**
 * Action for BPM changes without callbacks
 */
export class BPMChangeAction extends BaseAction {
    readonly type = 'BPM_CHANGE';
    private oldBpm: number;
    private newBpm: number;
    private timeSignature: [number, number];
    
    constructor(
        get: GetFn,
        oldBpm: number,
        newBpm: number,
        timeSignature: [number, number]
    ) {
        super(get);
        this.oldBpm = oldBpm;
        this.newBpm = newBpm;
        this.timeSignature = timeSignature;
    }
    

    private async updateBPM(bpm: number): Promise<void> {
        await this.get().updateBPMState(bpm);
    }
    
    async execute(): Promise<void> {
        await this.updateBPM(this.newBpm);
        this.log('Execute', { from: this.oldBpm, to: this.newBpm });
    }
    
    async undo(): Promise<void> {
        await this.updateBPM(this.oldBpm);
        this.log('Undo', { from: this.newBpm, to: this.oldBpm });
    }
}

/**
 * Action for key signature changes without callbacks
 */
export class KeySignatureAction extends BaseAction {
    readonly type = 'KEY_SIGNATURE_CHANGE';
    private oldKeySignature: string;
    private newKeySignature: string;
    
    constructor(
        get: GetFn,
        oldKeySignature: string,
        newKeySignature: string
    ) {
        super(get);
        this.oldKeySignature = oldKeySignature;
        this.newKeySignature = newKeySignature;
    }
    
    private async updateKeySignature(keySignature: string): Promise<void> {
        if (this.store.projectManager && typeof this.store.projectManager.setKey === 'function') {
            this.store.projectManager.setKey(keySignature);
        }
        
        await this.get().handleProjectParamChange('keySignature', keySignature);
    }
    
    async execute(): Promise<void> {
        await this.updateKeySignature(this.newKeySignature);
        this.log('Execute', { from: this.oldKeySignature, to: this.newKeySignature });
    }
    
    async undo(): Promise<void> {
        await this.updateKeySignature(this.oldKeySignature);
        this.log('Undo', { from: this.newKeySignature, to: this.oldKeySignature });
    }
}

/**
 * Export all project actions
 */
export const ProjectActions = {
    BPMChange: BPMChangeAction,
    KeySignature: KeySignatureAction
};