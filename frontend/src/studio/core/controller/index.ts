// Core controller
export {
  ProjectController,
  getProjectController,
  initializeController,
  resetController,
} from './ProjectController';

// React integration
export {
  ProjectControllerProvider,
  useProjectController,
  useController,
  useUndoRedo,
} from './context';

// Command handlers
export { registerTrackCommands } from './commands';

// Side effects
export { AudioEngineSideEffect, AutoSaveSideEffect } from './side-effects';

// Types
export type {
  Command,
  CommandType,
  CommandMetadata,
  CommandHandler,
  CommandContext,
  Patch,
  PatchOperation,
  PatchOp,
  SideEffect,
  ControllerListener,
  Unsubscribe,
  // Specific command types
  TrackVolumeChangeCommand,
  TrackVolumeChangePayload,
  TrackPanChangeCommand,
  TrackPanChangePayload,
  TrackMuteToggleCommand,
  TrackMuteTogglePayload,
  TrackSoloToggleCommand,
  TrackSoloTogglePayload,
  TrackPositionChangeCommand,
  TrackPositionChangePayload,
  BpmChangeCommand,
  BpmChangePayload,
} from './types';

export type {
  ProjectControllerContextValue,
  ProjectControllerProviderProps,
} from './context';
