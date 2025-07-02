// import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// import AudioFilePlayer from './audioEngine';
// import { 
//   createMockAudioFile,
//   mockTone
// } from '../../../../test/mocks/audioMocks';
// import { spyOnConsole } from '../../../../test/utils/testHelpers';
// import * as audioProcessing from '../../../utils/audioProcessing';

// // Mock the audio processing utils
// vi.mock('../../../utils/audioProcessing', () => ({
//   convertVolumeToDecibels: vi.fn((volume: number, muted: boolean) => {
//     if (muted) return -Infinity;
//     // Simple mock conversion
//     return (volume - 80) * 0.5;
//   })
// }));

// describe('AudioFilePlayer', () => {
//   let player: AudioFilePlayer;
//   let consoleSpy: ReturnType<typeof spyOnConsole>;

//   // Helper to reset singleton
//   const resetSingleton = () => {
//     // Access private static instance and reset it
//     (AudioFilePlayer as any).instance = undefined;
//   };

//   beforeEach(() => {
//     vi.clearAllMocks();
//     resetSingleton();
//     consoleSpy = spyOnConsole();
//     player = AudioFilePlayer.getInstance();
//   });

//   afterEach(() => {
//     consoleSpy.restore();
//     resetSingleton();
//   });

//   describe('Singleton Pattern', () => {
//     it('should return same instance', () => {
//       const instance1 = AudioFilePlayer.getInstance();
//       const instance2 = AudioFilePlayer.getInstance();
      
//       expect(instance1).toBe(instance2);
//     });

//     it('should create new instance after reset', () => {
//       const instance1 = AudioFilePlayer.getInstance();
//       resetSingleton();
//       const instance2 = AudioFilePlayer.getInstance();
      
//       expect(instance1).not.toBe(instance2);
//     });
//   });

//   describe('initialize', () => {
//     it('should initialize successfully', async () => {
//       await player.initialize();
      
//       expect(consoleSpy.hasLog('AudioEngine: Starting Tone.js')).toBe(true);
//       expect(consoleSpy.hasLog('AudioEngine: Tone.js started successfully')).toBe(true);
//     });

//     it('should initialize successfully even when Tone.start is commented out', async () => {
//       // Since Tone.start() is commented out in the implementation,
//       // this test just verifies the logs
//       await player.initialize();
      
//       expect(consoleSpy.hasLog('AudioEngine: Starting Tone.js')).toBe(true);
//       expect(consoleSpy.hasLog('AudioEngine: Tone.js started successfully')).toBe(true);
//     });
//   });

//   describe('createTrack', () => {
//     it('should create track without audio file', async () => {
//       const track = await player.createTrack('track1', 'Test Track');
      
//       expect(track.id).toBe('track1');
//       expect(track.name).toBe('Test Track');
//       expect(track.volume).toBe(80); // Default volume
//       expect(track.pan).toBe(0);
//       expect(track.muted).toBe(false);
//       expect(track.soloed).toBe(false);
//       expect(track.player).toBeUndefined();
//     });

//     it('should create track with audio file', async () => {
//       const audioFile = createMockAudioFile('test.mp3');
      
//       const track = await player.createTrack('track1', 'Audio Track', audioFile);
      
//       expect(track.player).toBeDefined();
//       expect(mockTone.Player).toHaveBeenCalledWith({
//         url: 'blob:mock-url',
//         loop: false,
//         autostart: false
//       });
//       expect(track.player.connect).toHaveBeenCalledWith(track.channel);
//       expect(mockTone.loaded).toHaveBeenCalled();
//     });

//     it('should clean up existing track before creating new one', async () => {
//       const track1 = await player.createTrack('track1', 'Track 1');
//       const channel1 = track1.channel;
      
//       const track2 = await player.createTrack('track1', 'Track 2');
      
//       expect(channel1.dispose).toHaveBeenCalled();
//       expect(track2.id).toBe('track1');
//       expect(track2.name).toBe('Track 2');
//     });

//     it('should set default volume correctly', async () => {
//       const track = await player.createTrack('track1', 'Test Track');
      
//       expect(vi.mocked(audioProcessing.convertVolumeToDecibels)).toHaveBeenCalledWith(80, false);
//       expect(track.channel.volume.value).toBe(0); // (80-80)*0.5 = 0
//     });
//   });

//   describe('removeTrack', () => {
//     beforeEach(async () => {
//       const audioFile = createMockAudioFile('test.mp3');
//       await player.createTrack('track1', 'Test Track', audioFile);
//     });

//     it('should remove existing track', () => {
//       player.removeTrack('track1');
      
//       const tracks = player.getAllTracks();
//       expect(tracks).toHaveLength(0);
//     });

//     it('should dispose player resources', () => {
//       const track = player.getAllTracks()[0];
//       const playerDispose = vi.spyOn(track.player!, 'dispose');
      
//       player.removeTrack('track1');
      
//       expect(track.player!.stop).toHaveBeenCalled();
//       expect(playerDispose).toHaveBeenCalled();
//       expect(track.channel.dispose).toHaveBeenCalled();
//     });

//     it('should handle non-existent track', () => {
//       player.removeTrack('non-existent');
      
//       // Should not throw
//       expect(player.getAllTracks()).toHaveLength(1);
//     });
//   });

//   describe('Track Controls', () => {
//     let trackId: string;

//     beforeEach(async () => {
//       trackId = 'track1';
//       await player.createTrack(trackId, 'Test Track');
//     });

//     describe('setTrackVolume', () => {
//       it('should set track volume', async () => {
//         await player.setTrackVolume(trackId, 90);
        
//         const track = player.getAllTracks()[0];
//         expect(track.volume).toBe(90);
//         expect(vi.mocked(audioProcessing.convertVolumeToDecibels)).toHaveBeenCalledWith(90, false);
//         expect(track.channel.volume.value).toBe(5); // (90-80)*0.5 = 5
//       });

//       it('should handle muted track volume', async () => {
//         const track = player.getAllTracks()[0];
//         track.muted = true;
        
//         await player.setTrackVolume(trackId, 100);
        
//         expect(vi.mocked(audioProcessing.convertVolumeToDecibels)).toHaveBeenCalledWith(100, true);
//         expect(track.channel.volume.value).toBe(-Infinity);
//       });

//       it('should update player volume if exists', async () => {
//         const audioFile = createMockAudioFile('test.mp3');
//         await player.createTrack('track2', 'Audio Track', audioFile);
        
//         await player.setTrackVolume('track2', 70);
        
//         const track = player.getAllTracks().find(t => t.id === 'track2');
//         expect(track!.player!.volume.value).toBe(-5); // (70-80)*0.5 = -5
//       });
//     });

//     describe('setTrackPan', () => {
//       it('should set track pan', async () => {
//         await player.setTrackPan(trackId, 50);
        
//         const track = player.getAllTracks()[0];
//         expect(track.pan).toBe(50);
//         expect(track.channel.pan.value).toBe(0.5); // 50/100 = 0.5
//       });

//       it('should handle negative pan values', async () => {
//         await player.setTrackPan(trackId, -100);
        
//         const track = player.getAllTracks()[0];
//         expect(track.pan).toBe(-100);
//         expect(track.channel.pan.value).toBe(-1);
//       });
//     });

//     describe('setTrackMute', () => {
//       it('should mute track', async () => {
//         await player.setTrackMute(trackId, true);
        
//         const track = player.getAllTracks()[0];
//         expect(track.muted).toBe(true);
//         expect(track.channel.volume.value).toBe(-Infinity);
//       });

//       it('should unmute track', async () => {
//         await player.setTrackMute(trackId, true);
//         await player.setTrackMute(trackId, false);
        
//         const track = player.getAllTracks()[0];
//         expect(track.muted).toBe(false);
//         expect(track.channel.volume.value).toBe(0); // Back to default
//       });

//       it('should update player volume on mute', async () => {
//         const audioFile = createMockAudioFile('test.mp3');
//         await player.createTrack('track2', 'Audio Track', audioFile);
        
//         await player.setTrackMute('track2', true);
        
//         const track = player.getAllTracks().find(t => t.id === 'track2');
//         expect(track!.player!.volume.value).toBe(-Infinity);
//       });
//     });

//     describe('setTrackName', () => {
//       it('should update track name', () => {
//         player.setTrackName(trackId, 'New Name');
        
//         const track = player.getAllTracks()[0];
//         expect(track.name).toBe('New Name');
//       });
//     });

//     describe('setTrackPosition', () => {
//       it('should set track position', () => {
//         player.setTrackPosition(trackId, 100, 200);
        
//         const track = player.getAllTracks()[0];
//         expect(track.position).toEqual({ x: 100, y: 200 });
//         expect(consoleSpy.hasLog('AudioEngine: Set track track1 position to x:100, y:200')).toBe(true);
//       });
//     });

//     describe('setTrackSolo', () => {
//       beforeEach(async () => {
//         await player.createTrack('track2', 'Track 2');
//         await player.createTrack('track3', 'Track 3');
//       });

//       it('should solo track and mute others', () => {
//         player.setTrackSolo('track1', true);
        
//         const tracks = player.getAllTracks();
//         expect(tracks[0].soloed).toBe(true);
//         expect(tracks[1].channel.volume.value).toBe(-Infinity);
//         expect(tracks[2].channel.volume.value).toBe(-Infinity);
//       });

//       it('should unsolo track and restore others', () => {
//         player.setTrackSolo('track1', true);
//         player.setTrackSolo('track1', false);
        
//         const tracks = player.getAllTracks();
//         expect(tracks[0].soloed).toBe(false);
//         expect(tracks[1].channel.volume.value).toBe(0); // Restored
//         expect(tracks[2].channel.volume.value).toBe(0); // Restored
//       });

//       it('should handle multiple soloed tracks', () => {
//         player.setTrackSolo('track1', true);
//         player.setTrackSolo('track2', true);
        
//         const tracks = player.getAllTracks();
//         expect(tracks[0].soloed).toBe(true);
//         expect(tracks[1].soloed).toBe(true);
//         expect(tracks[2].channel.volume.value).toBe(-Infinity); // Only track3 muted
//       });

//       it('should not unmute explicitly muted tracks when unsoloing', () => {
//         player.setTrackMute('track2', true);
//         player.setTrackSolo('track1', true);
//         player.setTrackSolo('track1', false);
        
//         const track2 = player.getAllTracks()[1];
//         expect(track2.channel.volume.value).toBe(-Infinity); // Still muted
//       });
//     });

//     describe('setTrackTrim', () => {
//       beforeEach(async () => {
//         const audioFile = createMockAudioFile('test.mp3');
//         await player.createTrack('audioTrack', 'Audio Track', audioFile);
//       });

//       it('should set track trim values', () => {
//         player.setTrackTrim('audioTrack', 480, 1920); // 1 beat to 4 beats at 120 BPM
        
//         const track = player.getAllTracks().find(t => t.id === 'audioTrack');
//         expect(track!.trimStartTicks).toBe(480);
//         expect(track!.trimEndTicks).toBe(1920);
//       });

//       it('should update player trim settings', () => {
//         // Mock Transport values
//         mockTone.Transport.bpm.value = 120;
//         mockTone.Transport.PPQ = 480;
        
//         // Make the mock player instance pass instanceof check
//         const track = player.getAllTracks().find(t => t.id === 'audioTrack');
//         Object.setPrototypeOf(track!.player, mockTone.Player.prototype);
        
//         player.setTrackTrim('audioTrack', 480, 1920);
        
//         const updatedTrack = player.getAllTracks().find(t => t.id === 'audioTrack');
//         const trackPlayer = updatedTrack!.player;
        
//         expect(trackPlayer!.loopStart).toBe(0.5); // 480 ticks = 0.5 seconds at 120 BPM
//         expect(trackPlayer!.loopEnd).toBe(2); // 1920 ticks = 2 seconds at 120 BPM
//         expect((trackPlayer as any)._trimSettings).toEqual({
//           trimStartSeconds: 0.5,
//           trimEndSeconds: 2,
//           trimEnabled: true
//         });
//       });

//       it('should clamp trim values to buffer duration', () => {
//         mockTone.Transport.bpm.value = 120;
//         mockTone.Transport.PPQ = 480;
        
//         const track = player.getAllTracks().find(t => t.id === 'audioTrack');
//         track!.player!.buffer = { duration: 1 } as any;
//         Object.setPrototypeOf(track!.player, mockTone.Player.prototype);
        
//         player.setTrackTrim('audioTrack', 0, 9600); // 10 seconds worth
        
//         expect(track!.player!.loopEnd).toBe(1); // Clamped to buffer duration
//       });

//       it('should handle track without player', () => {
//         player.setTrackTrim('track1', 480, 1920);
        
//         // Should not throw and should not set trim values without a player
//         const track = player.getAllTracks()[0];
//         expect(track.trimStartTicks).toBeUndefined();
//         expect(track.trimEndTicks).toBeUndefined();
//       });
//     });
//   });

//   describe('updateTrack', () => {
//     beforeEach(async () => {
//       const audioFile = createMockAudioFile('test.mp3');
//       await player.createTrack('track1', 'Original Track', audioFile);
//     });

//     it('should update track properties', () => {
//       const updatedTrack = {
//         id: 'track1',
//         name: 'Updated Track',
//         volume: 90,
//         pan: -50,
//         muted: true,
//         soloed: false,
//         channel: {} as any, // Will be ignored
//         player: {} as any  // Will be ignored
//       };
      
//       player.updateTrack('track1', updatedTrack);
      
//       const track = player.getAllTracks()[0];
//       expect(track.name).toBe('Updated Track');
//       expect(track.volume).toBe(90);
//       expect(track.pan).toBe(-50);
//       expect(track.muted).toBe(true);
//     });

//     it('should preserve player and channel instances', () => {
//       const originalTrack = player.getAllTracks()[0];
//       const originalPlayer = originalTrack.player;
//       const originalChannel = originalTrack.channel;
      
//       player.updateTrack('track1', {
//         ...originalTrack,
//         name: 'Updated'
//       });
      
//       const updatedTrack = player.getAllTracks()[0];
//       expect(updatedTrack.player).toBe(originalPlayer);
//       expect(updatedTrack.channel).toBe(originalChannel);
//     });

//     it('should apply trim settings if provided', () => {
//       mockTone.Transport.bpm.value = 120;
//       mockTone.Transport.PPQ = 480;
      
//       // Make the mock player instance pass instanceof check
//       const track = player.getAllTracks()[0];
//       Object.setPrototypeOf(track.player, mockTone.Player.prototype);
      
//       player.updateTrack('track1', {
//         id: 'track1',
//         name: 'Track',
//         channel: {} as any,
//         volume: 80,
//         pan: 0,
//         muted: false,
//         soloed: false,
//         trimStartTicks: 480,
//         trimEndTicks: 1920
//       });
      
//       const updatedTrack = player.getAllTracks()[0];
//       expect(updatedTrack.trimStartTicks).toBe(480);
//       expect(updatedTrack.trimEndTicks).toBe(1920);
//       expect(updatedTrack.player!.loopStart).toBe(0.5);
//       expect(updatedTrack.player!.loopEnd).toBe(2);
//     });

//     it('should handle non-existent track', () => {
//       player.updateTrack('non-existent', {
//         id: 'non-existent',
//         name: 'Ghost Track',
//         channel: {} as any,
//         volume: 80,
//         pan: 0,
//         muted: false,
//         soloed: false
//       });
      
//       // Should not throw or add new track
//       expect(player.getAllTracks()).toHaveLength(1);
//     });
//   });

//   describe('Master Controls', () => {
//     it('should set master volume', () => {
//       player.setMasterVolume(-10);
      
//       const tracks = player.getAllTracks();
//       expect(tracks).toHaveLength(0); // No tracks affected, just master
//       // Can't directly test mainOutput volume as it's private
//     });
//   });

//   describe('Playback Controls', () => {
//     beforeEach(async () => {
//       const audioFile1 = createMockAudioFile('test1.mp3');
//       const audioFile2 = createMockAudioFile('test2.mp3');
//       await player.createTrack('track1', 'Track 1', audioFile1);
//       await player.createTrack('track2', 'Track 2', audioFile2);
//     });

//     describe('stopAllPlayback', () => {
//       it('should stop all playing tracks', () => {
//         const tracks = player.getAllTracks();
//         tracks[0].player!.state = 'started';
//         tracks[1].player!.state = 'started';
        
//         player.stopAllPlayback();
        
//         expect(tracks[0].player!.stop).toHaveBeenCalled();
//         expect(tracks[1].player!.stop).toHaveBeenCalled();
//         expect(consoleSpy.hasLog('Stopping all playback (full stop)')).toBe(true);
//       });

//       it('should not stop already stopped tracks', () => {
//         const tracks = player.getAllTracks();
//         tracks[0].player!.state = 'stopped';
//         tracks[1].player!.state = 'started';
        
//         player.stopAllPlayback();
        
//         expect(tracks[0].player!.stop).not.toHaveBeenCalled();
//         expect(tracks[1].player!.stop).toHaveBeenCalled();
//       });
//     });

//     describe('pauseAllPlayback', () => {
//       it('should log pause for synced tracks', () => {
//         const tracks = player.getAllTracks();
//         tracks[0].player!.state = 'started';
//         tracks[1].player!.state = 'started';
        
//         player.pauseAllPlayback();
        
//         expect(consoleSpy.hasLog('Pausing all playback (maintain position)')).toBe(true);
//         expect(consoleSpy.hasLog('Track track1 player synced with paused transport')).toBe(true);
//         expect(consoleSpy.hasLog('Track track2 player synced with paused transport')).toBe(true);
//       });

//       it('should not call stop on players', () => {
//         const tracks = player.getAllTracks();
//         tracks[0].player!.state = 'started';
        
//         player.pauseAllPlayback();
        
//         expect(tracks[0].player!.stop).not.toHaveBeenCalled();
//       });
//     });
//   });

//   describe('getAllTracks', () => {
//     it('should return empty array initially', () => {
//       expect(player.getAllTracks()).toEqual([]);
//     });

//     it('should return all tracks', async () => {
//       await player.createTrack('track1', 'Track 1');
//       await player.createTrack('track2', 'Track 2');
//       await player.createTrack('track3', 'Track 3');
      
//       const tracks = player.getAllTracks();
//       expect(tracks).toHaveLength(3);
//       expect(tracks.map(t => t.id)).toEqual(['track1', 'track2', 'track3']);
//     });
//   });

//   describe('Unimplemented TrackPlayer Methods', () => {
//     it('should throw for setTrackPositionTicks', () => {
//       expect(() => player.setTrackPositionTicks('track1', 1000))
//         .toThrow('Method not implemented');
//     });

//     it('should throw for setTrackTrimStartTicks', () => {
//       expect(() => player.setTrackTrimStartTicks('track1', 500))
//         .toThrow('Method not implemented');
//     });

//     it('should throw for setTrackTrimEndTicks', () => {
//       expect(() => player.setTrackTrimEndTicks('track1', 1500))
//         .toThrow('Method not implemented');
//     });

//     it('should throw for play', () => {
//       expect(() => player.play(0))
//         .toThrow('Method not implemented');
//     });

//     it('should throw for pause', () => {
//       expect(() => player.pause())
//         .toThrow('Method not implemented');
//     });

//     it('should throw for stop', () => {
//       expect(() => player.stop())
//         .toThrow('Method not implemented');
//     });
//   });

//   describe('Edge Cases', () => {
//     it('should handle rapid track creation/removal', async () => {
//       for (let i = 0; i < 10; i++) {
//         await player.createTrack(`track${i}`, `Track ${i}`);
//       }
      
//       for (let i = 0; i < 10; i++) {
//         player.removeTrack(`track${i}`);
//       }
      
//       expect(player.getAllTracks()).toHaveLength(0);
//     });

//     it('should handle extreme volume values', async () => {
//       await player.createTrack('track1', 'Test Track');
      
//       await player.setTrackVolume('track1', 0);
//       await player.setTrackVolume('track1', 100);
//       await player.setTrackVolume('track1', 200); // Out of normal range
      
//       const track = player.getAllTracks()[0];
//       expect(track.volume).toBe(200);
//     });

//     it('should handle extreme pan values', async () => {
//       await player.createTrack('track1', 'Test Track');
      
//       await player.setTrackPan('track1', -200);
//       let track = player.getAllTracks()[0];
//       expect(track.channel.pan.value).toBe(-2);
      
//       await player.setTrackPan('track1', 200);
//       track = player.getAllTracks()[0];
//       expect(track.channel.pan.value).toBe(2);
//     });

//     it('should handle concurrent operations', async () => {
//       const promises = [];
      
//       for (let i = 0; i < 5; i++) {
//         promises.push(player.createTrack(`track${i}`, `Track ${i}`));
//       }
      
//       await Promise.all(promises);
      
//       const volumePromises = [];
//       for (let i = 0; i < 5; i++) {
//         volumePromises.push(player.setTrackVolume(`track${i}`, 50 + i * 10));
//       }
      
//       await Promise.all(volumePromises);
      
//       const tracks = player.getAllTracks();
//       expect(tracks).toHaveLength(5);
//       expect(tracks[0].volume).toBe(50);
//       expect(tracks[4].volume).toBe(90);
//     });
//   });
// });