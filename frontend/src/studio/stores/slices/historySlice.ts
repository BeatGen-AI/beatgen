import { Store } from '../../core/state/store';
import { RootState, SetFn, GetFn, StoreSliceCreator } from '../types';
import { historyManager } from '../../core/state/history/HistoryManager';
import { Action } from '../../core/state/history/actions/BaseAction';
import { getProjectController } from '../../core/controller';

// Define the state properties and actions for this slice
export interface HistorySlice {
  canUndo: boolean;
  canRedo: boolean;
  setCanUndo: (canUndo: boolean) => void; // Basic setters might still be useful
  setCanRedo: (canRedo: boolean) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  executeHistoryAction: (action: Action) => Promise<void>; // Action type needs to be consistent
  _updateHistoryState: () => void; // Internal helper to sync state
}

// Create the slice function
export const createHistorySlice: StoreSliceCreator<HistorySlice> = (set, get) => {
  const rootGet = get as GetFn; // Helper for root state access

  // Utility to set state within this slice
  const setHistoryState = (partial: Partial<HistorySlice> | ((state: HistorySlice) => Partial<HistorySlice>)) => set(partial);

  // Update canUndo/canRedo state based on BOTH controller and HistoryManager
  // During migration, commands are split between the two systems
  const _updateHistoryState = () => {
    const controller = getProjectController();
    const controllerCanUndo = controller.canUndo();
    const controllerCanRedo = controller.canRedo();
    const historyCanUndo = historyManager?.canUndo() ?? false;
    const historyCanRedo = historyManager?.canRedo() ?? false;

    // Can undo/redo if EITHER system has something
    setHistoryState({
      canUndo: controllerCanUndo || historyCanUndo,
      canRedo: controllerCanRedo || historyCanRedo
    });
  };

  // Execute a history action and update state
  const executeHistoryAction = async (action: Action) => {
    const { _withErrorHandling } = rootGet();

    if (!historyManager) {
        console.error("Critical: HistoryManager singleton instance not available for execute!");
        return;
    }
    if (!_withErrorHandling) {
        console.error("_withErrorHandling not available for executeHistoryAction");
        return; 
    }

    const execute = async () => {
        await historyManager.executeAction(action);
        _updateHistoryState();
    };

    await _withErrorHandling(execute, `executeHistoryAction: ${action.constructor.name}`)();
  };

  const undo = async () => {
    const { _withErrorHandling } = rootGet();
    const controller = getProjectController();

    if (!_withErrorHandling) {
      console.error("_withErrorHandling not available for undo");
      return;
    }

    const undoAction = async () => {
      // Try controller first (for migrated commands: volume, pan, mute, solo)
      if (controller.canUndo()) {
        await controller.undo();
        _updateHistoryState();
        return;
      }

      // Fall back to old HistoryManager (for non-migrated commands)
      if (historyManager?.canUndo()) {
        await historyManager.undo();
        _updateHistoryState();
        return;
      }

      console.warn("Undo called but nothing to undo in either system.");
    };

    await _withErrorHandling(undoAction, 'undo')();
  };

  const redo = async () => {
    const { _withErrorHandling } = rootGet();
    const controller = getProjectController();

    if (!_withErrorHandling) {
      console.error("_withErrorHandling not available for redo");
      return;
    }

    const redoAction = async () => {
      // Try controller first (for migrated commands)
      if (controller.canRedo()) {
        await controller.redo();
        _updateHistoryState();
        return;
      }

      // Fall back to old HistoryManager (for non-migrated commands)
      if (historyManager?.canRedo()) {
        await historyManager.redo();
        _updateHistoryState();
        return;
      }

      console.warn("Redo called but nothing to redo in either system.");
    };

    await _withErrorHandling(redoAction, 'redo')();
  };

  // Subscribe to controller state changes to keep canUndo/canRedo in sync
  // Use setTimeout to ensure controller is initialized before subscribing
  setTimeout(() => {
    try {
      const controller = getProjectController();
      controller.subscribe(() => {
        _updateHistoryState();
      });
    } catch (error) {
      console.warn('Failed to subscribe to ProjectController:', error);
    }
  }, 0);

  return {
    // Initial state
    canUndo: false,
    canRedo: false,

    // Basic setters (might not be needed if _updateHistoryState is always used)
    setCanUndo: (canUndo) => setHistoryState({ canUndo }),
    setCanRedo: (canRedo) => setHistoryState({ canRedo }),

    // Actions
    undo,
    redo,
    executeHistoryAction,
    _updateHistoryState, // Expose helper if needed externally (e.g., after project load)
  };
};
