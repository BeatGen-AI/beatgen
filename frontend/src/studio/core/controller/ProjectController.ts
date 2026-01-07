/**
 * ProjectController - Central orchestrator for track mutations with undo/redo.
 *
 * Stores serializable command data for future collaboration/persistence support,
 * while using efficient closures for immediate undo/redo execution.
 */

import { useStudioStore } from '../../stores/studioStore';
import { getAudioEngine } from '../audio-engine/AudioEngine';
import { buildPlaybackState } from '../playback/buildPlaybackState';

// ============================================================================
// TYPES - Serializable for future collab/persistence
// ============================================================================

type CommandType = 'volume' | 'pan' | 'mute' | 'solo' | 'position';

interface CommandData {
  type: CommandType;
  trackId: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
  // For drum track propagation
  childTrackIds?: string[];
  childOldValues?: unknown[];
}

interface UndoEntry {
  command: CommandData;  // Serializable data for future collab/persistence
  undo: () => void;      // Efficient closure for immediate execution
  redo: () => void;
}

type Listener = () => void;

// ============================================================================
// CONTROLLER
// ============================================================================

export class ProjectController {
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private listeners = new Set<Listener>();
  private maxStackSize = 100;

  // ==========================================================================
  // TRACK MUTATIONS
  // ==========================================================================

  changeVolume(trackId: string, volume: number): void {
    const state = useStudioStore.getState();
    const trackIndex = state.tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) throw new Error(`Track not found: ${trackId}`);

    const track = state.tracks[trackIndex];
    const oldVolume = track.volume;
    const childIndices = this.getChildSamplerIndices(trackId);
    const childTrackIds = childIndices.map(i => state.tracks[i].id);
    const oldChildVolumes = childIndices.map(i => state.tracks[i].volume);

    this.applyVolumeChange(trackIndex, volume, childIndices);

    this.pushUndo({
      command: {
        type: 'volume',
        trackId,
        oldValue: oldVolume,
        newValue: volume,
        timestamp: Date.now(),
        childTrackIds,
        childOldValues: oldChildVolumes,
      },
      undo: () => this.applyVolumeChange(trackIndex, oldVolume, childIndices, oldChildVolumes),
      redo: () => this.applyVolumeChange(trackIndex, volume, childIndices),
    });

    this.syncAudioIfPlaying();
  }

  changePan(trackId: string, pan: number): void {
    const state = useStudioStore.getState();
    const trackIndex = state.tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) throw new Error(`Track not found: ${trackId}`);

    const oldPan = state.tracks[trackIndex].pan;

    useStudioStore.setState(s => {
      s.tracks[trackIndex].pan = pan;
      s.tracks[trackIndex].dirty = true;
    });

    this.pushUndo({
      command: {
        type: 'pan',
        trackId,
        oldValue: oldPan,
        newValue: pan,
        timestamp: Date.now(),
      },
      undo: () => useStudioStore.setState(s => { s.tracks[trackIndex].pan = oldPan; }),
      redo: () => useStudioStore.setState(s => { s.tracks[trackIndex].pan = pan; s.tracks[trackIndex].dirty = true; }),
    });

    this.syncAudioIfPlaying();
  }

  toggleMute(trackId: string, muted: boolean): void {
    const state = useStudioStore.getState();
    const trackIndex = state.tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) throw new Error(`Track not found: ${trackId}`);

    const track = state.tracks[trackIndex];
    const oldMuted = track.mute;
    const childIndices = this.getChildSamplerIndices(trackId);
    const childTrackIds = childIndices.map(i => state.tracks[i].id);
    const oldChildMuted = childIndices.map(i => state.tracks[i].mute);

    this.applyMuteChange(trackIndex, muted, childIndices);

    this.pushUndo({
      command: {
        type: 'mute',
        trackId,
        oldValue: oldMuted,
        newValue: muted,
        timestamp: Date.now(),
        childTrackIds,
        childOldValues: oldChildMuted,
      },
      undo: () => this.applyMuteChange(trackIndex, oldMuted, childIndices, oldChildMuted),
      redo: () => this.applyMuteChange(trackIndex, muted, childIndices),
    });

    this.syncAudioIfPlaying();
  }

  toggleSolo(trackId: string, soloed: boolean): void {
    const state = useStudioStore.getState();
    const trackIndex = state.tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) throw new Error(`Track not found: ${trackId}`);

    const oldSoloed = (state.tracks[trackIndex] as any).soloed ?? false;

    useStudioStore.setState(s => {
      s.tracks[trackIndex].solo = soloed;
      (s.tracks[trackIndex] as any).soloed = soloed;
    });

    this.pushUndo({
      command: {
        type: 'solo',
        trackId,
        oldValue: oldSoloed,
        newValue: soloed,
        timestamp: Date.now(),
      },
      undo: () => useStudioStore.setState(s => {
        s.tracks[trackIndex].solo = oldSoloed;
        (s.tracks[trackIndex] as any).soloed = oldSoloed;
      }),
      redo: () => useStudioStore.setState(s => {
        s.tracks[trackIndex].solo = soloed;
        (s.tracks[trackIndex] as any).soloed = soloed;
      }),
    });

    this.syncAudioIfPlaying();
  }

  changePosition(trackId: string, oldPos: { x: number; y: number }, newPos: { x: number; y: number }): void {
    const state = useStudioStore.getState();
    const trackIndex = state.tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) throw new Error(`Track not found: ${trackId}`);

    this.applyPositionChange(trackIndex, newPos);

    this.pushUndo({
      command: {
        type: 'position',
        trackId,
        oldValue: oldPos,
        newValue: newPos,
        timestamp: Date.now(),
      },
      undo: () => this.applyPositionChange(trackIndex, oldPos),
      redo: () => this.applyPositionChange(trackIndex, newPos),
    });
  }

  // ==========================================================================
  // UNDO / REDO
  // ==========================================================================

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;

    entry.undo();
    this.redoStack.push(entry);
    this.notifyListeners();
    this.syncAudioIfPlaying();
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;

    entry.redo();
    this.undoStack.push(entry);
    this.notifyListeners();
    this.syncAudioIfPlaying();
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }
  getUndoStackSize(): number { return this.undoStack.length; }
  getRedoStackSize(): number { return this.redoStack.length; }

  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notifyListeners();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ==========================================================================
  // SERIALIZATION (for future collab/persistence)
  // ==========================================================================

  /** Get serializable command history for persistence/sync */
  getCommandHistory(): CommandData[] {
    return this.undoStack.map(e => e.command);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private getChildSamplerIndices(drumTrackId: string): number[] {
    const state = useStudioStore.getState();
    const indices: number[] = [];
    state.tracks.forEach((track, index) => {
      if (track.track_type === 'SAMPLER' && track.track) {
        const samplerData = track.track as any;
        if (samplerData.drum_track_id === drumTrackId) {
          indices.push(index);
        }
      }
    });
    return indices;
  }

  private applyVolumeChange(trackIndex: number, volume: number, childIndices: number[], childVolumes?: number[]): void {
    useStudioStore.setState(s => {
      s.tracks[trackIndex].volume = volume;
      s.tracks[trackIndex].dirty = true;
      childIndices.forEach((ci, i) => {
        s.tracks[ci].volume = childVolumes ? childVolumes[i] : volume;
        s.tracks[ci].dirty = true;
      });
    });
  }

  private applyMuteChange(trackIndex: number, muted: boolean, childIndices: number[], childMuted?: boolean[]): void {
    useStudioStore.setState(s => {
      s.tracks[trackIndex].mute = muted;
      (s.tracks[trackIndex] as any).muted = muted;
      s.tracks[trackIndex].dirty = true;
      childIndices.forEach((ci, i) => {
        s.tracks[ci].mute = childMuted ? childMuted[i] : muted;
        (s.tracks[ci] as any).muted = childMuted ? childMuted[i] : muted;
        s.tracks[ci].dirty = true;
      });
    });
  }

  private applyPositionChange(trackIndex: number, pos: { x: number; y: number }): void {
    useStudioStore.setState(s => {
      const track = s.tracks[trackIndex] as any;
      track.position = { ...pos };
      track.x_position = pos.x;
      track.y_position = pos.y;
      track.dirty = true;
      if (track.instances?.length) {
        track.instances[0].x_position = pos.x;
      }
    });
  }

  private pushUndo(entry: UndoEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.notifyListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l());
  }

  private syncAudioIfPlaying(): void {
    const state = useStudioStore.getState();
    if (!state.isPlaying) return;

    const engine = getAudioEngine();
    if (!engine.isReady()) return;

    try {
      const playbackState = buildPlaybackState({
        tracks: state.tracks ?? [],
        midiManager: state.store?.getMidiManager() ?? null,
        bpm: state.bpm ?? 120,
        timeSignature: state.timeSignature ?? [4, 4],
        masterVolume: 100,
      });
      engine.setState(playbackState);
    } catch (error) {
      console.error('Controller: Error syncing audio state:', error);
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: ProjectController | null = null;

export function getProjectController(): ProjectController {
  if (!instance) {
    instance = new ProjectController();
  }
  return instance;
}

export function resetController(): void {
  instance = null;
}
