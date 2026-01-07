import { SideEffect, Patch, Command, CommandContext, PatchOperation } from '../types';
import { AutoSaveService } from '../../auto-save/AutoSaveService';

/**
 * AutoSaveSideEffect - Triggers auto-save when tracks become dirty.
 *
 * This side effect replaces the scattered dirty tracking that was previously
 * handled directly in store mutations.
 *
 * The AutoSaveService handles debouncing and actual save logic - this side effect
 * just notifies it when changes occur.
 */
export class AutoSaveSideEffect implements SideEffect {
  name = 'AutoSave';

  private autoSaveService: AutoSaveService | null = null;

  /**
   * Set the AutoSaveService instance.
   * This should be called during initialization.
   */
  setAutoSaveService(service: AutoSaveService): void {
    this.autoSaveService = service;
  }

  /**
   * Determine if this side effect should run for the given patch/command.
   * Run for any change that sets dirty flag to true.
   */
  shouldRun(patch: Patch, _command: Command): boolean {
    // Check if any operation sets dirty to true
    return patch.operations.some((op: PatchOperation) => {
      const path = op.path;
      const lastKey = path[path.length - 1];
      return lastKey === 'dirty' && op.value === true;
    });
  }

  /**
   * Notify the AutoSaveService that tracks have changed.
   */
  afterPatch(
    _patch: Patch,
    _command: Command,
    _context: CommandContext
  ): void {
    if (!this.autoSaveService) {
      // AutoSaveService not set - this can happen during initialization
      // or if auto-save is disabled
      return;
    }

    // Notify service that tracks changed (it handles debouncing)
    this.autoSaveService.onTracksChanged();
  }
}
