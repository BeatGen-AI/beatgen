import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleTrackVolumeChange,
  handleTrackPanChange,
  handleTrackMuteToggle,
  handleTrackSoloToggle,
  handleTrackPositionChange,
} from '../commands/TrackCommands';
import {
  CommandContext,
  TrackVolumeChangeCommand,
  TrackPanChangeCommand,
  TrackMuteToggleCommand,
  TrackSoloToggleCommand,
  TrackPositionChangeCommand,
} from '../types';

// Mock audio engine
const mockAudioEngine = {
  initialize: vi.fn(),
  setState: vi.fn(),
};

describe('TrackCommands', () => {
  const createMockContext = (tracks: any[]): CommandContext => ({
    getState: () => ({
      tracks,
      isPlaying: false,
      bpm: 120,
      store: { getMidiManager: () => null },
    } as any),
    audioEngine: mockAudioEngine as any,
    midiManager: null,
  });

  describe('handleTrackVolumeChange', () => {
    it('should generate correct patch for volume change', () => {
      const tracks = [
        { id: 'track-1', volume: 0.8, dirty: false, track_type: 'MIDI' },
        { id: 'track-2', volume: 0.5, dirty: false, track_type: 'AUDIO' },
      ];
      const context = createMockContext(tracks);

      const command: TrackVolumeChangeCommand = {
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.6 },
      };

      const patch = handleTrackVolumeChange(command, context);

      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'volume'],
        value: 0.6,
      });
      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'dirty'],
        value: true,
      });
      expect(patch.inverse).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'volume'],
        value: 0.8,
      });
      expect(patch.affectedPaths).toContain('tracks');
    });

    it('should propagate volume change to child sampler tracks for drum tracks', () => {
      const tracks = [
        { id: 'drum-1', volume: 0.8, dirty: false, track_type: 'DRUM', track: {} },
        {
          id: 'sampler-1',
          volume: 0.8,
          dirty: false,
          track_type: 'SAMPLER',
          track: { drum_track_id: 'drum-1' }
        },
        {
          id: 'sampler-2',
          volume: 0.8,
          dirty: false,
          track_type: 'SAMPLER',
          track: { drum_track_id: 'drum-1' }
        },
        {
          id: 'sampler-3',
          volume: 0.5,
          dirty: false,
          track_type: 'SAMPLER',
          track: { drum_track_id: 'other-drum' }
        },
      ];
      const context = createMockContext(tracks);

      const command: TrackVolumeChangeCommand = {
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'drum-1', volume: 0.6 },
      };

      const patch = handleTrackVolumeChange(command, context);

      // Should update drum track
      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'volume'],
        value: 0.6,
      });

      // Should update child sampler tracks
      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 1, 'volume'],
        value: 0.6,
      });
      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 2, 'volume'],
        value: 0.6,
      });

      // Should NOT update unrelated sampler track
      const samplerOps = patch.operations.filter(
        (op) => op.path[1] === 3 && op.path[2] === 'volume'
      );
      expect(samplerOps).toHaveLength(0);

      // Inverse should restore original values
      expect(patch.inverse).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'volume'],
        value: 0.8,
      });
      expect(patch.inverse).toContainEqual({
        op: 'replace',
        path: ['tracks', 1, 'volume'],
        value: 0.8,
      });
    });

    it('should throw when track not found', () => {
      const context = createMockContext([]);

      const command: TrackVolumeChangeCommand = {
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'nonexistent', volume: 0.6 },
      };

      expect(() => handleTrackVolumeChange(command, context)).toThrow(
        'Track not found: nonexistent'
      );
    });
  });

  describe('handleTrackPanChange', () => {
    it('should generate correct patch for pan change', () => {
      const tracks = [
        { id: 'track-1', pan: 0, dirty: false },
      ];
      const context = createMockContext(tracks);

      const command: TrackPanChangeCommand = {
        type: 'TRACK_PAN_CHANGE',
        payload: { trackId: 'track-1', pan: -0.5 },
      };

      const patch = handleTrackPanChange(command, context);

      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'pan'],
        value: -0.5,
      });
      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'dirty'],
        value: true,
      });
      expect(patch.inverse).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'pan'],
        value: 0,
      });
    });

    it('should throw when track not found', () => {
      const context = createMockContext([]);

      const command: TrackPanChangeCommand = {
        type: 'TRACK_PAN_CHANGE',
        payload: { trackId: 'nonexistent', pan: 0 },
      };

      expect(() => handleTrackPanChange(command, context)).toThrow(
        'Track not found: nonexistent'
      );
    });
  });

  describe('handleTrackMuteToggle', () => {
    it('should generate correct patch for mute toggle', () => {
      const tracks = [
        { id: 'track-1', mute: false, muted: false, dirty: false, track_type: 'MIDI' },
      ];
      const context = createMockContext(tracks);

      const command: TrackMuteToggleCommand = {
        type: 'TRACK_MUTE_TOGGLE',
        payload: { trackId: 'track-1', muted: true },
      };

      const patch = handleTrackMuteToggle(command, context);

      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'mute'],
        value: true,
      });
      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'muted'],
        value: true,
      });
      expect(patch.inverse).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'mute'],
        value: false,
      });
    });

    it('should propagate mute toggle to child sampler tracks for drum tracks', () => {
      const tracks = [
        { id: 'drum-1', mute: false, muted: false, dirty: false, track_type: 'DRUM', track: {} },
        {
          id: 'sampler-1',
          mute: false,
          muted: false,
          dirty: false,
          track_type: 'SAMPLER',
          track: { drum_track_id: 'drum-1' }
        },
      ];
      const context = createMockContext(tracks);

      const command: TrackMuteToggleCommand = {
        type: 'TRACK_MUTE_TOGGLE',
        payload: { trackId: 'drum-1', muted: true },
      };

      const patch = handleTrackMuteToggle(command, context);

      // Should update drum track
      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'mute'],
        value: true,
      });

      // Should update child sampler track
      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 1, 'mute'],
        value: true,
      });
    });
  });

  describe('handleTrackSoloToggle', () => {
    it('should generate correct patch for solo toggle', () => {
      const tracks = [
        { id: 'track-1', solo: false, soloed: false, mute: false },
        { id: 'track-2', solo: false, soloed: false, mute: false },
      ];
      const context = createMockContext(tracks);

      const command: TrackSoloToggleCommand = {
        type: 'TRACK_SOLO_TOGGLE',
        payload: { trackId: 'track-1', soloed: true },
      };

      const patch = handleTrackSoloToggle(command, context);

      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'solo'],
        value: true,
      });
      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'soloed'],
        value: true,
      });
      expect(patch.inverse).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'solo'],
        value: false,
      });
    });

    it('should correctly toggle solo off', () => {
      const tracks = [
        { id: 'track-1', solo: true, soloed: true, mute: false },
      ];
      const context = createMockContext(tracks);

      const command: TrackSoloToggleCommand = {
        type: 'TRACK_SOLO_TOGGLE',
        payload: { trackId: 'track-1', soloed: false },
      };

      const patch = handleTrackSoloToggle(command, context);

      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'solo'],
        value: false,
      });
      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'soloed'],
        value: false,
      });
    });
  });

  describe('handleTrackPositionChange', () => {
    it('should generate correct patch for position change', () => {
      const tracks = [
        {
          id: 'track-1',
          position: { x: 0, y: 0 },
          x_position: 0,
          y_position: 0,
          dirty: false,
          instances: [],
        },
      ];
      const context = createMockContext(tracks);

      const command: TrackPositionChangeCommand = {
        type: 'TRACK_POSITION_CHANGE',
        payload: {
          trackId: 'track-1',
          oldPosition: { x: 0, y: 0 },
          newPosition: { x: 100, y: 50 },
        },
      };

      const patch = handleTrackPositionChange(command, context);

      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'position'],
        value: { x: 100, y: 50 },
      });
      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'x_position'],
        value: 100,
      });
      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'y_position'],
        value: 50,
      });
      expect(patch.inverse).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'position'],
        value: { x: 0, y: 0 },
      });
    });

    it('should update first instance position if instances exist', () => {
      const tracks = [
        {
          id: 'track-1',
          position: { x: 0, y: 0 },
          x_position: 0,
          y_position: 0,
          dirty: false,
          instances: [
            { id: 'instance-1', x_position: 0, y_position: 0 },
          ],
        },
      ];
      const context = createMockContext(tracks);

      const command: TrackPositionChangeCommand = {
        type: 'TRACK_POSITION_CHANGE',
        payload: {
          trackId: 'track-1',
          oldPosition: { x: 0, y: 0 },
          newPosition: { x: 100, y: 50 },
        },
      };

      const patch = handleTrackPositionChange(command, context);

      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'instances', 0, 'x_position'],
        value: 100,
      });
      expect(patch.inverse).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'instances', 0, 'x_position'],
        value: 0,
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle track with undefined values gracefully', () => {
      const tracks = [
        { id: 'track-1', volume: undefined, pan: undefined, dirty: false },
      ];
      const context = createMockContext(tracks);

      const command: TrackVolumeChangeCommand = {
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-1', volume: 0.5 },
      };

      const patch = handleTrackVolumeChange(command, context);

      expect(patch.inverse).toContainEqual({
        op: 'replace',
        path: ['tracks', 0, 'volume'],
        value: undefined,
      });
    });

    it('should find correct track by id regardless of position', () => {
      const tracks = [
        { id: 'track-1', volume: 0.5, dirty: false },
        { id: 'track-2', volume: 0.6, dirty: false },
        { id: 'track-3', volume: 0.7, dirty: false },
      ];
      const context = createMockContext(tracks);

      const command: TrackVolumeChangeCommand = {
        type: 'TRACK_VOLUME_CHANGE',
        payload: { trackId: 'track-2', volume: 0.9 },
      };

      const patch = handleTrackVolumeChange(command, context);

      expect(patch.operations).toContainEqual({
        op: 'replace',
        path: ['tracks', 1, 'volume'],
        value: 0.9,
      });
      expect(patch.inverse).toContainEqual({
        op: 'replace',
        path: ['tracks', 1, 'volume'],
        value: 0.6,
      });
    });
  });
});
