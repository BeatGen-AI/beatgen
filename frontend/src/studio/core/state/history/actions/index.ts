// Re-export base action classes
export { BaseAction, TrackAction, NoteAction } from './BaseAction';
export type { Action } from './BaseAction';
export { GroupAction } from './GroupAction';

// Re-export all action modules
export { ProjectActions } from './ProjectActions';
export { TrackActions } from './TrackActions'; 
export { NoteActions } from './NoteActions';
export { InstanceActions } from './InstanceActions';

// Re-export action types constants
export const ACTION_TYPES = {
    // Project actions
    BPM_CHANGE: 'BPM_CHANGE',
    TIME_SIGNATURE_CHANGE: 'TIME_SIGNATURE_CHANGE',
    KEY_SIGNATURE_CHANGE: 'KEY_SIGNATURE_CHANGE',
    
    // Track actions
    TRACK_POSITION_CHANGE: 'TRACK_POSITION_CHANGE',
    TRACK_ADD: 'TRACK_ADD',
    TRACK_DELETE: 'TRACK_DELETE',
    TRACK_VOLUME_CHANGE: 'TRACK_VOLUME_CHANGE',
    TRACK_PAN_CHANGE: 'TRACK_PAN_CHANGE',
    TRACK_MUTE_TOGGLE: 'TRACK_MUTE_TOGGLE',
    TRACK_SOLO_TOGGLE: 'TRACK_SOLO_TOGGLE',
    TRACK_RESIZE: 'TRACK_RESIZE',
    TRACK_MOVE: 'TRACK_MOVE',
    
    // Note actions
    NOTE_ADD: 'NOTE_ADD',
    NOTE_DELETE: 'NOTE_DELETE',
    NOTE_MOVE: 'NOTE_MOVE',
    NOTE_RESIZE: 'NOTE_RESIZE',

    // Drum Track actions
    DRUM_TRACK_SAMPLER_UPDATE: 'DRUM_TRACK_SAMPLER_UPDATE',
    
    // Instance actions
    INSTANCE_MOVE: 'INSTANCE_MOVE',
    INSTANCE_RESIZE: 'INSTANCE_RESIZE',
    INSTANCE_ADD: 'INSTANCE_ADD',
    INSTANCE_DELETE: 'INSTANCE_DELETE',
    
    // Group action
    GROUP_ACTION: 'GROUP_ACTION',
} as const;

// Export action type for type checking
export type ActionType = typeof ACTION_TYPES[keyof typeof ACTION_TYPES];

// Export the unified action object
import { ProjectActions } from './ProjectActions';
import { TrackActions } from './TrackActions';
import { NoteActions } from './NoteActions';
import { InstanceActions } from './InstanceActions';
import { GroupAction } from './GroupAction';

/**
 * Unified actions object for easy access to all action types
 */
export const Actions = {
    // Project actions
    ...ProjectActions,
    
    // Track actions
    ...TrackActions,
    
    // Note actions
    ...NoteActions,
    
    // Instance actions
    ...InstanceActions,
    
    // Group action
    GroupAction: GroupAction
};

// Maintain backwards compatibility
export const DirectActions = Actions;
