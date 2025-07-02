import { BaseAction, Action } from './BaseAction';
import { GetFn } from '../../../../stores/types';

export class GroupAction extends BaseAction {
    readonly type = 'GROUP_ACTION' as const;
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
        
        // Execute all actions in order
        for (const action of this.actions) {
            await action.execute();
        }
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