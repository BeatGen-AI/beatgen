import { Action } from "./actions/BaseAction";

export class HistoryManager {
  private undoStack: Action[] = [];
  private redoStack: Action[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    console.log('📝 History Manager initialized');
  }

  subscribe(listener: () => void): void {
    this.listeners.add(listener);
  }

  unsubscribe(listener: () => void): void {
    this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  async executeAction(action: Action): Promise<void> {
    console.log('[HistoryManager] Executing action:', action.type);
    await action.execute();
    console.log('[HistoryManager] Action executed successfully');
    this.undoStack.push(action);
    this.redoStack = []; // Clear redo stack when new action is executed
    this.logState();
    this.notifyListeners();
  }

  async undo(): Promise<void> {
    console.log('[HistoryManager] Undo called, stack length:', this.undoStack.length);
    const action = this.undoStack.pop();
    if (action) {
      console.log('[HistoryManager] Undoing action:', action.type);
      try {
        await action.undo();
        this.redoStack.push(action);
        console.log('[HistoryManager] Undo completed successfully');
      } catch (error) {
        console.error('[HistoryManager] Undo failed:', error);
        // Re-add action to undo stack since it failed
        this.undoStack.push(action);
        throw error;
      }
      this.logState();
      this.notifyListeners();
    } else {
      console.warn('[HistoryManager] No actions to undo');
    }
  }

  async redo(): Promise<void> {
    console.log('[HistoryManager] Redo called, stack length:', this.redoStack.length);
    const action = this.redoStack.pop();
    if (action) {
      console.log('[HistoryManager] Redoing action:', action.type);
      try {
        await action.execute();
        this.undoStack.push(action);
        console.log('[HistoryManager] Redo completed successfully');
      } catch (error) {
        console.error('[HistoryManager] Redo failed:', error);
        // Re-add action to redo stack since it failed
        this.redoStack.push(action);
        throw error;
      }
      this.logState();
      this.notifyListeners();
    } else {
      console.warn('[HistoryManager] No actions to redo');
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  private logState(): void {
    console.log('📝 History State:', {
      undoStack: this.undoStack.map(a => ({ type: a.type })),
      redoStack: this.redoStack.map(a => ({ type: a.type })),
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    });
  }
}

// Export a singleton instance
export const historyManager = new HistoryManager(); 