import { useStudioStore } from '../../stores/studioStore';
import { getAudioEngine } from '../audio-engine/AudioEngine';
import {
  Command,
  CommandHandler,
  CommandContext,
  CommandType,
  Patch,
  PatchOperation,
  SideEffect,
  ControllerListener,
  Unsubscribe,
} from './types';

/**
 * ProjectController - Central orchestrator for all state mutations.
 *
 * All mutations flow through controller.execute(command), which:
 * 1. Executes the appropriate handler to generate a Patch
 * 2. Applies the patch to Zustand state
 * 3. Pushes to undo stack
 * 4. Runs registered side effects (audio engine sync, auto-save, etc.)
 *
 * This centralizes side effects that were previously scattered across
 * action classes, store slices, and hooks.
 */
export class ProjectController {
  private handlers: Map<CommandType, CommandHandler> = new Map();
  private sideEffects: SideEffect[] = [];
  private undoStack: Patch[] = [];
  private redoStack: Patch[] = [];
  private listeners: Set<ControllerListener> = new Set();
  private maxUndoStackSize = 100;

  // ============================================================================
  // HANDLER REGISTRATION
  // ============================================================================

  /**
   * Register a command handler for a specific command type.
   */
  registerHandler<T extends Command>(
    type: T['type'],
    handler: CommandHandler<T>
  ): void {
    this.handlers.set(type, handler as CommandHandler);
  }

  /**
   * Register a side effect that runs after patches are applied.
   */
  registerSideEffect(effect: SideEffect): void {
    this.sideEffects.push(effect);
  }

  // ============================================================================
  // COMMAND EXECUTION
  // ============================================================================

  /**
   * Execute a command and return the resulting patch.
   * This is the single entry point for all state mutations.
   */
  async execute(command: Command): Promise<Patch> {
    const handler = this.handlers.get(command.type);
    if (!handler) {
      throw new Error(`No handler registered for command type: ${command.type}`);
    }

    const context = this.createContext();

    // 1. Execute handler to get patch
    const patch = await handler(command, context);

    // 2. Apply patch to state
    this.applyPatch(patch);

    // 3. Push to undo stack (unless skipped)
    if (!command.metadata?.skipHistory) {
      this.pushToUndoStack(patch);
    }

    // 4. Run side effects (unless skipped)
    if (!command.metadata?.skipSideEffects) {
      await this.runSideEffects(patch, command, context);
    }

    return patch;
  }

  // ============================================================================
  // UNDO / REDO
  // ============================================================================

  /**
   * Undo the last command by applying the inverse patch.
   */
  async undo(): Promise<void> {
    const patch = this.undoStack.pop();
    if (!patch) return;

    // Create inverse patch
    const inversePatch: Patch = {
      operations: patch.inverse,
      inverse: patch.operations,
      affectedPaths: patch.affectedPaths,
    };

    // Apply inverse
    this.applyPatch(inversePatch);

    // Move to redo stack
    this.redoStack.push(patch);

    // Run side effects (to sync audio engine, etc.)
    const context = this.createContext();
    await this.runSideEffects(inversePatch, {
      type: 'GROUP_COMMAND' as CommandType,
      payload: null,
      metadata: { skipHistory: true, description: 'Undo' },
    }, context);

    this.notifyListeners();
  }

  /**
   * Redo the last undone command by re-applying the patch.
   */
  async redo(): Promise<void> {
    const patch = this.redoStack.pop();
    if (!patch) return;

    // Re-apply original patch
    this.applyPatch(patch);

    // Move back to undo stack
    this.undoStack.push(patch);

    // Run side effects
    const context = this.createContext();
    await this.runSideEffects(patch, {
      type: 'GROUP_COMMAND' as CommandType,
      payload: null,
      metadata: { skipHistory: true, description: 'Redo' },
    }, context);

    this.notifyListeners();
  }

  /**
   * Check if undo is available.
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available.
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get the current undo stack size.
   */
  getUndoStackSize(): number {
    return this.undoStack.length;
  }

  /**
   * Get the current redo stack size.
   */
  getRedoStackSize(): number {
    return this.redoStack.length;
  }

  /**
   * Clear all undo/redo history.
   */
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notifyListeners();
  }

  // ============================================================================
  // STATE SUBSCRIPTION
  // ============================================================================

  /**
   * Subscribe to controller state changes (undo/redo availability).
   */
  subscribe(listener: ControllerListener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private createContext(): CommandContext {
    const state = useStudioStore.getState();
    return {
      getState: () => useStudioStore.getState(),
      audioEngine: getAudioEngine(),
      midiManager: state.store?.getMidiManager() ?? null,
    };
  }

  /**
   * Apply a patch to Zustand state.
   * Uses Zustand's set function with direct mutation (Immer handles immutability).
   */
  private applyPatch(patch: Patch): void {
    useStudioStore.setState((state) => {
      for (const op of patch.operations) {
        this.applyOperation(state, op);
      }
      return state;
    });
  }

  /**
   * Apply a single patch operation to the state draft.
   */
  private applyOperation(state: any, op: PatchOperation): void {
    const { path, value } = op;

    if (path.length === 0) {
      throw new Error('Patch operation path cannot be empty');
    }

    // Navigate to the parent of the target
    let current = state;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (current[key] === undefined) {
        throw new Error(`Path not found: ${path.slice(0, i + 1).join('.')}`);
      }
      current = current[key];
    }

    const lastKey = path[path.length - 1];

    switch (op.op) {
      case 'add':
        if (Array.isArray(current) && typeof lastKey === 'number') {
          current.splice(lastKey, 0, value);
        } else {
          current[lastKey] = value;
        }
        break;

      case 'remove':
        if (Array.isArray(current) && typeof lastKey === 'number') {
          current.splice(lastKey, 1);
        } else {
          delete current[lastKey];
        }
        break;

      case 'replace':
        current[lastKey] = value;
        break;

      default:
        throw new Error(`Unknown patch operation: ${op.op}`);
    }
  }

  private pushToUndoStack(patch: Patch): void {
    this.undoStack.push(patch);

    // Trim stack if it exceeds max size
    if (this.undoStack.length > this.maxUndoStackSize) {
      this.undoStack.shift();
    }

    // Clear redo stack on new command
    this.redoStack = [];

    this.notifyListeners();
  }

  private async runSideEffects(
    patch: Patch,
    command: Command,
    context: CommandContext
  ): Promise<void> {
    for (const effect of this.sideEffects) {
      // Check if effect should run
      if (effect.shouldRun && !effect.shouldRun(patch, command)) {
        continue;
      }

      try {
        await effect.afterPatch(patch, command, context);
      } catch (error) {
        // Log but don't throw - side effects shouldn't break the mutation
        console.error(`Side effect "${effect.name}" failed:`, error);
      }
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let controllerInstance: ProjectController | null = null;

/**
 * Get the singleton ProjectController instance.
 * This should be used outside of React components (e.g., in slice code).
 */
export function getProjectController(): ProjectController {
  if (!controllerInstance) {
    controllerInstance = new ProjectController();
  }
  return controllerInstance;
}

/**
 * Initialize the controller with handlers and side effects.
 * Should be called once at app startup.
 */
export function initializeController(controller: ProjectController): void {
  controllerInstance = controller;
}

/**
 * Reset the controller instance (for testing).
 */
export function resetController(): void {
  controllerInstance = null;
}
