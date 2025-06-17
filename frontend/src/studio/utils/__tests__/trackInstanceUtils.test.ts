import { describe, it, expect } from 'vitest';
import { 
  getNextInstanceId, 
  createInstance, 
  updateInstance, 
  deleteInstance, 
  updateMultipleInstances,
  splitInstance,
  getDefaultInstance 
} from '../trackInstanceUtils';
import { CombinedTrack } from 'src/platform/types/project';

describe('trackInstanceUtils', () => {
  const mockTrack: CombinedTrack = {
    id: 'track-1',
    name: 'Test Track',
    type: 'AUDIO',
    x_position: 0,
    y_position: 0,
    duration_ticks: 3840,
    track: {} as any,
    instance_metadata: {
      instances: []
    }
  };

  describe('getNextInstanceId', () => {
    it('returns 1 for empty instances', () => {
      expect(getNextInstanceId(mockTrack)).toBe(1);
    });

    it('returns max ID + 1 for existing instances', () => {
      const trackWithInstances = {
        ...mockTrack,
        instance_metadata: {
          instances: [
            { id: 1, x: 0, width: 100 },
            { id: 3, x: 100, width: 100 },
            { id: 2, x: 200, width: 100 }
          ]
        }
      };
      expect(getNextInstanceId(trackWithInstances)).toBe(4);
    });
  });

  describe('createInstance', () => {
    it('creates a new instance with the correct ID', () => {
      const result = createInstance(mockTrack, 100, 200);
      
      expect(result.instance_metadata?.instances).toHaveLength(1);
      expect(result.instance_metadata?.instances[0]).toEqual({
        id: 1,
        x: 100,
        width: 200,
        name: 'Instance 1'
      });
      expect(result.dirty).toBe(true);
    });

    it('adds to existing instances', () => {
      const trackWithInstance = {
        ...mockTrack,
        instance_metadata: {
          instances: [{ id: 1, x: 0, width: 100, name: 'First' }]
        }
      };
      
      const result = createInstance(trackWithInstance, 200, 300);
      
      expect(result.instance_metadata?.instances).toHaveLength(2);
      expect(result.instance_metadata?.instances[1]).toEqual({
        id: 2,
        x: 200,
        width: 300,
        name: 'Instance 2'
      });
    });
  });

  describe('updateInstance', () => {
    it('updates the correct instance', () => {
      const trackWithInstances = {
        ...mockTrack,
        instance_metadata: {
          instances: [
            { id: 1, x: 0, width: 100, name: 'First' },
            { id: 2, x: 100, width: 200, name: 'Second' }
          ]
        }
      };
      
      const result = updateInstance(trackWithInstances, 2, { x: 150, width: 250 });
      
      expect(result.instance_metadata?.instances[1]).toEqual({
        id: 2,
        x: 150,
        width: 250,
        name: 'Second'
      });
      expect(result.dirty).toBe(true);
    });
  });

  describe('deleteInstance', () => {
    it('removes the correct instance', () => {
      const trackWithInstances = {
        ...mockTrack,
        instance_metadata: {
          instances: [
            { id: 1, x: 0, width: 100, name: 'First' },
            { id: 2, x: 100, width: 200, name: 'Second' },
            { id: 3, x: 200, width: 300, name: 'Third' }
          ]
        }
      };
      
      const result = deleteInstance(trackWithInstances, 2);
      
      expect(result.instance_metadata?.instances).toHaveLength(2);
      expect(result.instance_metadata?.instances.map(i => i.id)).toEqual([1, 3]);
      expect(result.dirty).toBe(true);
    });
  });

  describe('updateMultipleInstances', () => {
    it('updates multiple instances at once', () => {
      const trackWithInstances = {
        ...mockTrack,
        instance_metadata: {
          instances: [
            { id: 1, x: 0, width: 100, name: 'First' },
            { id: 2, x: 100, width: 200, name: 'Second' },
            { id: 3, x: 200, width: 300, name: 'Third' }
          ]
        }
      };
      
      const updates = [
        { id: 1, changes: { x: 50 } },
        { id: 3, changes: { width: 400 } }
      ];
      
      const result = updateMultipleInstances(trackWithInstances, updates);
      
      expect(result.instance_metadata?.instances[0].x).toBe(50);
      expect(result.instance_metadata?.instances[2].width).toBe(400);
      expect(result.instance_metadata?.instances[1]).toEqual({
        id: 2, x: 100, width: 200, name: 'Second'
      });
    });
  });

  describe('splitInstance', () => {
    it('splits an instance at the given position', () => {
      const trackWithInstance = {
        ...mockTrack,
        instance_metadata: {
          instances: [
            { id: 1, x: 0, width: 1000, name: 'Original' }
          ]
        }
      };
      
      const result = splitInstance(trackWithInstance, 1, 400);
      
      expect(result.instance_metadata?.instances).toHaveLength(2);
      expect(result.instance_metadata?.instances[0]).toEqual({
        id: 1,
        x: 0,
        width: 400,
        name: 'Original'
      });
      expect(result.instance_metadata?.instances[1]).toEqual({
        id: 2,
        x: 400,
        width: 600,
        name: 'Original (2)'
      });
    });

    it('returns unchanged track for invalid split position', () => {
      const trackWithInstance = {
        ...mockTrack,
        instance_metadata: {
          instances: [
            { id: 1, x: 100, width: 200, name: 'Original' }
          ]
        }
      };
      
      // Split position outside instance bounds
      const result1 = splitInstance(trackWithInstance, 1, 50);
      const result2 = splitInstance(trackWithInstance, 1, 350);
      
      expect(result1).toEqual(trackWithInstance);
      expect(result2).toEqual(trackWithInstance);
    });
  });

  describe('getDefaultInstance', () => {
    it('creates a default instance from track data', () => {
      const result = getDefaultInstance(mockTrack);
      
      expect(result).toEqual({
        id: 1,
        x: 0,
        width: 3840,
        name: 'Test Track'
      });
    });

    it('handles missing track data', () => {
      const emptyTrack = {
        ...mockTrack,
        x_position: null,
        duration_ticks: null
      };
      
      const result = getDefaultInstance(emptyTrack);
      
      expect(result).toEqual({
        id: 1,
        x: 0,
        width: 1920, // Default 1 bar
        name: 'Test Track'
      });
    });
  });
});