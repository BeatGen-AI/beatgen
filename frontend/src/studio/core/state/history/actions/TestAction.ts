import { BaseAction } from './BaseAction';
import { GetState } from '../../../stores/types';

/**
 * Simple test action to debug undo/redo
 */
export class TestAction extends BaseAction {
    type = 'TEST_ACTION' as const;
    private message: string;
    
    constructor(get: GetState, message: string) {
        super(get);
        this.message = message;
    }
    
    async execute(): Promise<void> {
        console.log(`[TestAction] Execute: ${this.message}`);
        const state = this.get();
        console.log('[TestAction] Current state:', {
            tracksCount: state.tracks.length,
            canUndo: state.canUndo,
            canRedo: state.canRedo
        });
    }
    
    async undo(): Promise<void> {
        console.log(`[TestAction] Undo: ${this.message}`);
        const state = this.get();
        console.log('[TestAction] Current state:', {
            tracksCount: state.tracks.length,
            canUndo: state.canUndo,
            canRedo: state.canRedo
        });
    }
}