import React, { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';
import { ProjectController, getProjectController } from '../ProjectController';
import { registerTrackCommands } from '../commands/TrackCommands';
import { AudioEngineSideEffect } from '../side-effects/AudioEngineSideEffect';
import { AutoSaveSideEffect } from '../side-effects/AutoSaveSideEffect';

// ============================================================================
// CONTEXT TYPES
// ============================================================================

export interface ProjectControllerContextValue {
  /** The ProjectController instance */
  controller: ProjectController;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Number of items in undo stack */
  undoStackSize: number;
  /** Number of items in redo stack */
  redoStackSize: number;
}

// ============================================================================
// CONTEXT
// ============================================================================

const ProjectControllerContext = createContext<ProjectControllerContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

export interface ProjectControllerProviderProps {
  children: ReactNode;
  /** Optional: provide a custom controller instance (for testing) */
  controller?: ProjectController;
}

/**
 * Provider that creates and configures the ProjectController.
 * Should be placed near the root of the Studio component tree.
 */
export function ProjectControllerProvider({
  children,
  controller: providedController,
}: ProjectControllerProviderProps) {
  // Create or use provided controller
  const [controller] = useState<ProjectController>(() => {
    const ctrl = providedController ?? getProjectController();

    // Register command handlers
    registerTrackCommands(ctrl);

    // Register side effects
    ctrl.registerSideEffect(new AudioEngineSideEffect());
    ctrl.registerSideEffect(new AutoSaveSideEffect());

    return ctrl;
  });

  // Track undo/redo state
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoStackSize, setUndoStackSize] = useState(0);
  const [redoStackSize, setRedoStackSize] = useState(0);

  // Subscribe to controller state changes
  useEffect(() => {
    const updateState = () => {
      setCanUndo(controller.canUndo());
      setCanRedo(controller.canRedo());
      setUndoStackSize(controller.getUndoStackSize());
      setRedoStackSize(controller.getRedoStackSize());
    };

    // Initial state
    updateState();

    // Subscribe to changes
    const unsubscribe = controller.subscribe(updateState);
    return unsubscribe;
  }, [controller]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<ProjectControllerContextValue>(
    () => ({
      controller,
      canUndo,
      canRedo,
      undoStackSize,
      redoStackSize,
    }),
    [controller, canUndo, canRedo, undoStackSize, redoStackSize]
  );

  return (
    <ProjectControllerContext.Provider value={contextValue}>
      {children}
    </ProjectControllerContext.Provider>
  );
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to access the ProjectController and undo/redo state.
 * Must be used within a ProjectControllerProvider.
 */
export function useProjectController(): ProjectControllerContextValue {
  const context = useContext(ProjectControllerContext);
  if (!context) {
    throw new Error(
      'useProjectController must be used within a ProjectControllerProvider'
    );
  }
  return context;
}

/**
 * Hook to access just the controller instance (convenience).
 */
export function useController(): ProjectController {
  const { controller } = useProjectController();
  return controller;
}

/**
 * Hook to get undo/redo callbacks bound to the controller.
 * Useful for keyboard shortcuts and undo/redo buttons.
 */
export function useUndoRedo() {
  const { controller, canUndo, canRedo } = useProjectController();

  const undo = useMemo(
    () => async () => {
      if (canUndo) {
        await controller.undo();
      }
    },
    [controller, canUndo]
  );

  const redo = useMemo(
    () => async () => {
      if (canRedo) {
        await controller.redo();
      }
    },
    [controller, canRedo]
  );

  return { undo, redo, canUndo, canRedo };
}
