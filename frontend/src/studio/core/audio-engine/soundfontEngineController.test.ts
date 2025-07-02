// import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// import { SoundfontEngineController } from './soundfontEngineController';
// import { MidiSoundfontPlayer } from './midiSoundfontPlayer/midiSoundfontPlayer';
// import { 
//   createMockAudioContext,
//   createMockSoundfontData
// } from '../../../test/mocks/audioMocks';
// import { 
//   generateTestNotes,
//   createMockMidiManager,
//   createMockDb,
//   spyOnConsole,
//   waitForCondition
// } from '../../../test/utils/testHelpers';

// // Mock the dynamic import
// vi.mock('../soundfont/soundfontManager', () => ({
//   default: {
//     getInstance: vi.fn().mockReturnValue({
//       getSoundfont: vi.fn().mockResolvedValue({
//         data: new ArrayBuffer(1024),
//         storage_key: 'test-soundfont-key'
//       })
//     })
//   }
// }));

// // Mock MidiSoundfontPlayer
// vi.mock('./midiSoundfontPlayer/midiSoundfontPlayer', () => ({
//   MidiSoundfontPlayer: vi.fn().mockImplementation(() => ({
//     initSynthesizer: vi.fn().mockResolvedValue(undefined),
//     waitForInitialization: vi.fn().mockResolvedValue(undefined),
//     addTrack: vi.fn().mockResolvedValue(undefined),
//     removeTrack: vi.fn(),
//     play: vi.fn().mockResolvedValue(undefined),
//     pause: vi.fn(),
//     stop: vi.fn().mockResolvedValue(undefined),
//     seek: vi.fn().mockResolvedValue(undefined),
//     muteTrack: vi.fn(),
//     setTrackVolume: vi.fn(),
//     setTrackOffset: vi.fn(),
//     setGlobalBPM: vi.fn().mockResolvedValue(undefined),
//     getTrackIds: vi.fn().mockReturnValue([]),
//     getTrack: vi.fn(),
//     isPlayerPlaying: vi.fn().mockReturnValue(false),
//     getCurrentTick: vi.fn().mockReturnValue(0),
//     dispose: vi.fn()
//   }))
// }));

// describe('SoundfontEngineController', () => {
//   let controller: SoundfontEngineController;
//   let mockAudioContext: any;
//   let mockMidiManager: ReturnType<typeof createMockMidiManager>;
//   let mockMidiPlayer: any;
//   let consoleSpy: ReturnType<typeof spyOnConsole>;
//   let mockDb: any;

//   beforeEach(() => {
//     vi.clearAllMocks();
//     mockAudioContext = createMockAudioContext();
//     mockMidiManager = createMockMidiManager();
//     mockDb = createMockDb();
//     consoleSpy = spyOnConsole();
    
//     controller = new SoundfontEngineController();
//     mockMidiPlayer = vi.mocked(MidiSoundfontPlayer).mock.results[0]?.value;
//   });

//   afterEach(() => {
//     controller.dispose();
//     consoleSpy.restore();
//     mockMidiManager._reset();
//   });

//   describe('Constructor and Initialization', () => {
//     it('should create MidiSoundfontPlayer instance', () => {
//       expect(MidiSoundfontPlayer).toHaveBeenCalled();
//     });

//     it('should initialize with AudioContext', async () => {
//       await controller.initialize(mockAudioContext);
      
//       expect(mockMidiPlayer.initSynthesizer).toHaveBeenCalledWith(mockAudioContext);
//       expect(consoleSpy.hasLog('SoundfontEngineController initialized successfully')).toBe(true);
//     });

//     it('should handle initialization failure', async () => {
//       mockMidiPlayer.initSynthesizer.mockRejectedValueOnce(new Error('Init failed'));
      
//       await expect(controller.initialize(mockAudioContext)).rejects.toThrow('Init failed');
//       expect(consoleSpy.hasError('Failed to initialize SoundfontEngineController')).toBe(true);
//     });
//   });

//   describe('Transport Methods', () => {
//     beforeEach(async () => {
//       await controller.initialize(mockAudioContext);
//     });

//     describe('play', () => {
//       it('should start playback', async () => {
//         await controller.play();
        
//         expect(mockMidiPlayer.play).toHaveBeenCalled();
//         expect(consoleSpy.hasLog('Starting playback')).toBe(true);
//       });

//       it('should seek before playing if startTime provided', async () => {
//         await controller.play(5);
        
//         expect(mockMidiPlayer.seek).toHaveBeenCalledWith(5000); // seconds to ms
//         expect(mockMidiPlayer.play).toHaveBeenCalled();
//       });

//       it('should seek to 0 if startTime is 0', async () => {
//         await controller.play(0);
        
//         expect(mockMidiPlayer.seek).toHaveBeenCalledWith(0); // Will seek to 0ms
//         expect(mockMidiPlayer.play).toHaveBeenCalled();
//       });
//     });

//     describe('pause', () => {
//       it('should pause playback', async () => {
//         mockMidiPlayer.getTrackIds.mockReturnValue(['track1', 'track2']);
//         mockMidiPlayer.isPlayerPlaying.mockReturnValue(true);
//         mockMidiPlayer.getCurrentTick.mockReturnValue(1000);
        
//         await controller.pause();
        
//         expect(mockMidiPlayer.pause).toHaveBeenCalled();
//         expect(consoleSpy.hasLog('SoundfontEngineController: Pausing playback')).toBe(true);
//         expect(consoleSpy.hasLog('MidiPlayer detailed state:')).toBe(true);
//       });
//     });

//     describe('stop', () => {
//       it('should stop playback', async () => {
//         await controller.stop();
        
//         expect(mockMidiPlayer.stop).toHaveBeenCalled();
//         expect(consoleSpy.hasLog('Stopping playback')).toBe(true);
//       });
//     });

//     describe('seek', () => {
//       it('should seek to position', async () => {
//         await controller.seek(3000);
        
//         expect(mockMidiPlayer.seek).toHaveBeenCalledWith(3000);
//         expect(consoleSpy.hasLog('Seeking to 3000ms')).toBe(true);
//       });
//     });
//   });

//   describe('Track Operations', () => {
//     beforeEach(async () => {
//       await controller.initialize(mockAudioContext);
//     });

//     describe('addTrack', () => {
//       it('should add track to player', async () => {
//         const notes = generateTestNotes(5);
//         const soundfontData = createMockSoundfontData();
        
//         await controller.addTrack('track1', notes, soundfontData);
        
//         expect(mockMidiPlayer.addTrack).toHaveBeenCalledWith('track1', notes, soundfontData);
//         expect(consoleSpy.hasLog('Track track1 added to player')).toBe(true);
//       });

//       it('should handle add track failure', async () => {
//         mockMidiPlayer.addTrack.mockRejectedValueOnce(new Error('Add failed'));
//         const notes = generateTestNotes(5);
//         const soundfontData = createMockSoundfontData();
        
//         await expect(controller.addTrack('track1', notes, soundfontData))
//           .rejects.toThrow('Add failed');
//         expect(consoleSpy.hasError('Failed to add track track1')).toBe(true);
//       });
//     });

//     describe('removeTrack', () => {
//       it('should remove track from player', () => {
//         controller.removeTrack('track1');
        
//         expect(mockMidiPlayer.removeTrack).toHaveBeenCalledWith('track1');
//         expect(consoleSpy.hasLog('Removing track track1')).toBe(true);
//       });
//     });

//     describe('muteTrack', () => {
//       it('should mute track', () => {
//         controller.muteTrack('track1', true);
        
//         expect(mockMidiPlayer.muteTrack).toHaveBeenCalledWith('track1', true);
//         expect(consoleSpy.hasLog('Muting track track1')).toBe(true);
//       });

//       it('should unmute track', () => {
//         controller.muteTrack('track1', false);
        
//         expect(mockMidiPlayer.muteTrack).toHaveBeenCalledWith('track1', false);
//         expect(consoleSpy.hasLog('Unmuting track track1')).toBe(true);
//       });
//     });

//     describe('setTrackVolume', () => {
//       it('should set track volume with MIDI conversion', async () => {
//         await controller.setTrackVolume('track1', 80);
        
//         // 80/100 * 127 = 101.6 → 102
//         expect(mockMidiPlayer.setTrackVolume).toHaveBeenCalledWith('track1', 102);
//         expect(consoleSpy.hasLog('Setting track track1 volume to 80 (102 in MIDI)')).toBe(true);
//       });

//       it('should handle volume > 100 as MIDI value', async () => {
//         await controller.setTrackVolume('track1', 120);
        
//         expect(mockMidiPlayer.setTrackVolume).toHaveBeenCalledWith('track1', 120);
//       });
//     });

//     describe('setTrackOffset', () => {
//       it('should set track offset', () => {
//         controller.setTrackOffset('track1', 1000);
        
//         expect(mockMidiPlayer.setTrackOffset).toHaveBeenCalledWith('track1', 1000);
//         expect(consoleSpy.hasLog('Setting track track1 offset to 1000ms')).toBe(true);
//       });
//     });

//     describe('setGlobalBPM', () => {
//       it('should set global BPM', async () => {
//         await controller.setGlobalBPM(140);
        
//         expect(mockMidiPlayer.setGlobalBPM).toHaveBeenCalledWith(140);
//         expect(consoleSpy.hasLog('Setting global BPM to 140')).toBe(true);
//       });
//     });
//   });

//   describe('TrackPlayer Interface Methods', () => {
//     it('should implement setTrackMute', async () => {
//       await controller.setTrackMute('track1', true);
      
//       expect(mockMidiPlayer.muteTrack).toHaveBeenCalledWith('track1', true);
//       expect(consoleSpy.hasLog('Setting mute for track track1 to true')).toBe(true);
//     });

//     it('should log but not implement setTrackPositionTicks', async () => {
//       await controller.setTrackPositionTicks('track1', 1000);
      
//       expect(consoleSpy.hasLog('Setting position for track track1 to 1000')).toBe(true);
//     });

//     it('should log but not implement setTrackTrimStartTicks', async () => {
//       await controller.setTrackTrimStartTicks('track1', 500);
      
//       expect(consoleSpy.hasLog('Setting trim start for track track1 to 500')).toBe(true);
//     });

//     it('should throw for unimplemented methods', () => {
//       expect(() => controller.setTrackPan('track1', 50))
//         .toThrow('Method not implemented');
      
//       expect(() => controller.setTrackTrimEndTicks('track1', 1000))
//         .toThrow('Method not implemented');
//     });
//   });

//   describe('connectTrackToSoundfont', () => {
//     beforeEach(async () => {
//       await controller.initialize(mockAudioContext);
//     });

//     it('should connect track successfully', async () => {
//       mockMidiManager.hasTrack.mockReturnValue(true);
//       mockMidiManager.getTrackNotes.mockReturnValue(generateTestNotes(5));
//       mockMidiPlayer.getTrackIds.mockReturnValue(['track1']);
      
//       await controller.connectTrackToSoundfont('track1', 'piano', mockMidiManager);
      
//       expect(mockMidiPlayer.addTrack).toHaveBeenCalledWith(
//         'track1',
//         expect.any(Array),
//         expect.any(ArrayBuffer)
//       );
//       expect(consoleSpy.hasLog('Successfully connected track track1 to soundfont piano')).toBe(true);
//     });

//     it('should create track if it does not exist', async () => {
//       mockMidiManager.hasTrack.mockReturnValue(false);
//       mockMidiManager.getTrackNotes.mockReturnValue([]);
      
//       await controller.connectTrackToSoundfont('track1', 'piano', mockMidiManager);
      
//       expect(mockMidiManager.createTrack).toHaveBeenCalledWith('track1', 'piano');
//       expect(consoleSpy.hasLog('Track track1 not found in MidiManager, creating it now')).toBe(true);
//     });

//     it('should fail if player not initialized', async () => {
//       // Create a new controller instance that will have its own mocked player
//       const uninitializedController = new SoundfontEngineController();
      
//       // The mock should reject waitForInitialization by default for new instances
//       // But since the mock returns a resolved promise by default, we need to update the mock
//       const uninitializedMockPlayer = vi.mocked(MidiSoundfontPlayer).mock.results[1].value;
//       uninitializedMockPlayer.waitForInitialization = vi.fn().mockRejectedValueOnce(
//         new Error('Synthesizer initialization not started')
//       );
      
//       await expect(uninitializedController.connectTrackToSoundfont('track1', 'piano', mockMidiManager))
//         .rejects.toThrow('Cannot connect track track1 to soundfont: MidiPlayer not initialized');
      
//       uninitializedController.dispose();
//     });

//     it('should fail if soundfont data not found', async () => {
//       const SoundfontManager = (await import('../soundfont/soundfontManager')).default;
//       vi.mocked(SoundfontManager.getInstance).mockReturnValueOnce({
//         getSoundfont: vi.fn().mockResolvedValue(null)
//       } as any);
      
//       await expect(controller.connectTrackToSoundfont('track1', 'piano', mockMidiManager))
//         .rejects.toThrow('No soundfont data found for instrument piano');
//     });

//     it('should verify track was added successfully', async () => {
//       mockMidiManager.hasTrack.mockReturnValue(true);
//       mockMidiManager.getTrackNotes.mockReturnValue(generateTestNotes(5));
//       mockMidiPlayer.getTrackIds
//         .mockReturnValueOnce([]) // Before adding
//         .mockReturnValueOnce(['track1']) // After adding
//         .mockReturnValueOnce(['track1']); // Verification check
      
//       await controller.connectTrackToSoundfont('track1', 'piano', mockMidiManager);
      
//       expect(mockMidiPlayer.getTrackIds).toHaveBeenCalledTimes(3);
//     });

//     it('should handle errors during track addition', async () => {
//       mockMidiManager.hasTrack.mockReturnValue(true);
//       mockMidiPlayer.addTrack.mockRejectedValueOnce(new Error('Track add failed'));
      
//       await expect(controller.connectTrackToSoundfont('track1', 'piano', mockMidiManager))
//         .rejects.toThrow('Track add failed');
//       expect(consoleSpy.hasError('Failed to connect track track1')).toBe(true);
//     });
//   });

//   describe('Track Subscription', () => {
//     beforeEach(async () => {
//       await controller.initialize(mockAudioContext);
//     });

//     it('should register track subscription', () => {
//       const unsubscribeFn = vi.fn();
//       mockMidiManager.subscribeToTrack.mockReturnValue(unsubscribeFn);
      
//       controller.registerTrackSubscription('track1', mockMidiManager);
      
//       expect(mockMidiManager.subscribeToTrack).toHaveBeenCalledWith(
//         'track1',
//         expect.any(Function)
//       );
//       expect(consoleSpy.hasLog('Subscription for track track1 registered successfully')).toBe(true);
//     });

//     it('should unsubscribe from previous subscription', () => {
//       const unsubscribe1 = vi.fn();
//       const unsubscribe2 = vi.fn();
      
//       mockMidiManager.subscribeToTrack
//         .mockReturnValueOnce(unsubscribe1)
//         .mockReturnValueOnce(unsubscribe2);
      
//       controller.registerTrackSubscription('track1', mockMidiManager);
//       controller.registerTrackSubscription('track1', mockMidiManager);
      
//       expect(unsubscribe1).toHaveBeenCalled();
//       expect(consoleSpy.hasLog('Removing previous subscription for track track1')).toBe(true);
//     });

//     it('should update existing track on note changes', async () => {
//       // Setup mock track in player
//       const mockTrack = {
//         updateWithNotes: vi.fn(),
//         getChannel: 5
//       };
//       mockMidiPlayer.getTrack.mockReturnValue(mockTrack);
      
//       // Register subscription
//       controller.registerTrackSubscription('track1', mockMidiManager);
      
//       // Get the callback that was registered
//       const callback = mockMidiManager.subscribeToTrack.mock.calls[0][1];
      
//       // Simulate note update
//       const newNotes = generateTestNotes(10);
//       await callback('track1', newNotes);
      
//       expect(mockTrack.updateWithNotes).toHaveBeenCalledWith(newNotes);
//       expect(consoleSpy.hasLog('Directly updated sequencer for track track1 with 10 notes')).toBe(true);
//     });

//     it('should warn when track does not exist in sequencer', async () => {
//       mockMidiPlayer.getTrack.mockReturnValue(undefined);
      
//       controller.registerTrackSubscription('track1', mockMidiManager);
      
//       const callback = mockMidiManager.subscribeToTrack.mock.calls[0][1];
//       await callback('track1', generateTestNotes(5));
      
//       expect(consoleSpy.hasWarning('No existing sequencer for track track1')).toBe(true);
//     });

//     it('should handle errors during update', async () => {
//       const mockTrack = {
//         updateWithNotes: vi.fn().mockImplementation(() => {
//           throw new Error('Update failed');
//         }),
//         getChannel: 0
//       };
//       mockMidiPlayer.getTrack.mockReturnValue(mockTrack);
      
//       controller.registerTrackSubscription('track1', mockMidiManager);
      
//       const callback = mockMidiManager.subscribeToTrack.mock.calls[0][1];
//       await callback('track1', generateTestNotes(5));
      
//       expect(consoleSpy.hasError('Failed to update MIDI playback for track track1')).toBe(true);
//     });
//   });

//   describe('dispose', () => {
//     it('should clean up all resources', async () => {
//       await controller.initialize(mockAudioContext);
      
//       // Register some subscriptions
//       const unsubscribe1 = vi.fn();
//       const unsubscribe2 = vi.fn();
//       mockMidiManager.subscribeToTrack
//         .mockReturnValueOnce(unsubscribe1)
//         .mockReturnValueOnce(unsubscribe2);
      
//       controller.registerTrackSubscription('track1', mockMidiManager);
//       controller.registerTrackSubscription('track2', mockMidiManager);
      
//       controller.dispose();
      
//       expect(unsubscribe1).toHaveBeenCalled();
//       expect(unsubscribe2).toHaveBeenCalled();
//       expect(mockMidiPlayer.dispose).toHaveBeenCalled();
//       expect(consoleSpy.hasLog('Disposing SoundfontEngineController')).toBe(true);
//       expect(consoleSpy.hasLog('Disposed MidiSoundfontPlayer')).toBe(true);
//     });
//   });

//   describe('Integration scenarios', () => {
//     beforeEach(async () => {
//       await controller.initialize(mockAudioContext);
//     });

//     it('should handle complete workflow', async () => {
//       // Setup
//       mockMidiManager.hasTrack.mockReturnValue(false);
//       const notes = generateTestNotes(10);
//       mockMidiManager.getTrackNotes.mockReturnValue(notes);
//       mockMidiPlayer.getTrackIds.mockReturnValue(['track1']);
      
//       // Connect track
//       await controller.connectTrackToSoundfont('track1', 'piano', mockMidiManager);
      
//       // Play
//       await controller.play();
      
//       // Update notes
//       const callback = mockMidiManager.subscribeToTrack.mock.calls[0][1];
//       const mockTrack = { updateWithNotes: vi.fn(), getChannel: 0 };
//       mockMidiPlayer.getTrack.mockReturnValue(mockTrack);
      
//       const newNotes = generateTestNotes(20);
//       await callback('track1', newNotes);
      
//       // Verify
//       expect(mockMidiManager.createTrack).toHaveBeenCalled();
//       expect(mockMidiPlayer.addTrack).toHaveBeenCalled();
//       expect(mockMidiPlayer.play).toHaveBeenCalled();
//       expect(mockTrack.updateWithNotes).toHaveBeenCalledWith(newNotes);
//     });

//     it('should handle multiple tracks', async () => {
//       const tracks = ['track1', 'track2', 'track3'];
      
//       for (const trackId of tracks) {
//         mockMidiManager.hasTrack.mockReturnValue(true);
//         mockMidiManager.getTrackNotes.mockReturnValue(generateTestNotes(5));
//         await controller.connectTrackToSoundfont(trackId, 'piano', mockMidiManager);
//       }
      
//       expect(mockMidiPlayer.addTrack).toHaveBeenCalledTimes(3);
//       expect(mockMidiManager.subscribeToTrack).toHaveBeenCalledTimes(3);
//     });

//     it('should handle track removal during playback', async () => {
//       mockMidiManager.hasTrack.mockReturnValue(true);
//       mockMidiManager.getTrackNotes.mockReturnValue(generateTestNotes(5));
      
//       await controller.connectTrackToSoundfont('track1', 'piano', mockMidiManager);
//       await controller.play();
      
//       controller.removeTrack('track1');
      
//       expect(mockMidiPlayer.removeTrack).toHaveBeenCalledWith('track1');
//     });
//   });
// });