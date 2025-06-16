import { BaseAction, Action } from './BaseAction';
import { GetFn } from '../../../../stores/types';
import { Actions } from '.';

export class GroupTrackMoveAction extends BaseAction {
    readonly type = 'GROUP_TRACK_MOVE' as const;
    private actions: Action[];
    private description: string;
    
    constructor(get: GetFn, actions: Action[], description: string) {
        super(get);
        this.actions = actions;
        this.description = description;
    }
    
    async execute(): Promise<void> {
        this.log('Execute', { 
            description: this.description,
            actionCount: this.actions.length,
            actionTypes: this.actions.map(a => a.type)
        });
        
        console.log('[GroupTrackMoveAction] Starting execution of', this.actions.length, 'move actions');
        
        // Execute all actions in order
        for (let i = 0; i < this.actions.length; i++) {
            console.log('[GroupTrackMoveAction] Executing action', i + 1, 'of', this.actions.length);
            await this.actions[i].execute();
        }
        
        console.log('[GroupTrackMoveAction] All move actions executed');
    }
    
    async undo(): Promise<void> {
        this.log('Undo', { 
            description: this.description,
            actionCount: this.actions.length 
        });
        
        // Undo all actions in reverse order (LIFO)
        for (let i = this.actions.length - 1; i >= 0; i--) {
            await this.actions[i].undo();
        }
    }
}