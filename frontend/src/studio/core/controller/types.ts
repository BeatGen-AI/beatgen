import { AudioEngine } from '../audio-engine/AudioEngine';
import { MidiManager } from '../midi/MidiManagerNew';
import { RootState } from '../../stores/types';

// ============================================================================
// COMMAND TYPES
// ============================================================================

export type CommandType =
  // Track parameter commands (Phase 2.1)
  | 'TRACK_VOLUME_CHANGE'
  | 'TRACK_PAN_CHANGE'
  | 'TRACK_MUTE_TOGGLE'
  | 'TRACK_SOLO_TOGGLE'
  | 'TRACK_POSITION_CHANGE'
  // Project commands (Phase 2.2)
  | 'BPM_CHANGE'
  | 'TIME_SIGNATURE_CHANGE'
  | 'KEY_SIGNATURE_CHANGE'
  // Track lifecycle commands (Phase 2.3)
  | 'TRACK_ADD'
  | 'TRACK_DELETE'
  | 'TRACK_RESIZE'
  // Note commands (Phase 2.4)
  | 'NOTE_ADD'
  | 'NOTE_DELETE'
  | 'NOTE_MOVE'
  | 'NOTE_RESIZE'
  // Instance commands (Phase 2.4)
  | 'INSTANCE_ADD'
  | 'INSTANCE_DELETE'
  | 'INSTANCE_MOVE'
  | 'INSTANCE_RESIZE'
  // Composite commands
  | 'GROUP_COMMAND';

export interface CommandMetadata {
  /** Skip adding to undo/redo stack */
  skipHistory?: boolean;
  /** Skip running side effects (used during undo/redo) */
  skipSideEffects?: boolean;
  /** Group related commands for batch undo */
  batchId?: string;
  /** Human-readable description for undo UI */
  description?: string;
}

export interface Command<T extends CommandType = CommandType, P = unknown> {
  type: T;
  payload: P;
  metadata?: CommandMetadata;
}

// ============================================================================
// PATCH TYPES (Immer-compatible, JSON Patch RFC 6902 aligned)
// ============================================================================

export type PatchOp = 'add' | 'remove' | 'replace';

export interface PatchOperation {
  op: PatchOp;
  path: (string | number)[];
  value?: unknown;
}

export interface Patch {
  /** Operations to apply to state */
  operations: PatchOperation[];
  /** Inverse operations for undo */
  inverse: PatchOperation[];
  /** Top-level paths affected (e.g., ['tracks'], ['bpm']) for side effect filtering */
  affectedPaths: string[];
}

// ============================================================================
// COMMAND HANDLER
// ============================================================================

export interface CommandContext {
  /** Get current state snapshot */
  getState: () => RootState;
  /** Audio engine instance */
  audioEngine: AudioEngine;
  /** MIDI manager instance */
  midiManager: MidiManager | null;
}

export type CommandHandler<T extends Command = Command> = (
  command: T,
  context: CommandContext
) => Patch | Promise<Patch>;

// ============================================================================
// SIDE EFFECT
// ============================================================================

export interface SideEffect {
  /** Name for debugging */
  name: string;

  /** Called after patch is applied to state */
  afterPatch(
    patch: Patch,
    command: Command,
    context: CommandContext
  ): void | Promise<void>;

  /** Optional: filter which commands/patches this effect cares about */
  shouldRun?(patch: Patch, command: Command): boolean;
}

// ============================================================================
// CONTROLLER LISTENER
// ============================================================================

export type ControllerListener = () => void;
export type Unsubscribe = () => void;

// ============================================================================
// SPECIFIC COMMAND PAYLOADS
// ============================================================================

export interface TrackVolumeChangePayload {
  trackId: string;
  volume: number;
}

export interface TrackPanChangePayload {
  trackId: string;
  pan: number;
}

export interface TrackMuteTogglePayload {
  trackId: string;
  muted: boolean;
}

export interface TrackSoloTogglePayload {
  trackId: string;
  soloed: boolean;
}

export interface TrackPositionChangePayload {
  trackId: string;
  oldPosition: { x: number; y: number };
  newPosition: { x: number; y: number };
}

export interface BpmChangePayload {
  oldBpm: number;
  newBpm: number;
}

// ============================================================================
// TYPED COMMANDS
// ============================================================================

export type TrackVolumeChangeCommand = Command<'TRACK_VOLUME_CHANGE', TrackVolumeChangePayload>;
export type TrackPanChangeCommand = Command<'TRACK_PAN_CHANGE', TrackPanChangePayload>;
export type TrackMuteToggleCommand = Command<'TRACK_MUTE_TOGGLE', TrackMuteTogglePayload>;
export type TrackSoloToggleCommand = Command<'TRACK_SOLO_TOGGLE', TrackSoloTogglePayload>;
export type TrackPositionChangeCommand = Command<'TRACK_POSITION_CHANGE', TrackPositionChangePayload>;
export type BpmChangeCommand = Command<'BPM_CHANGE', BpmChangePayload>;
