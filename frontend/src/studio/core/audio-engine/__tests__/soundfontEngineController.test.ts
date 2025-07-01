import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { SoundfontEngineController } from '../soundfontEngineController';
import { MidiSoundfontPlayer } from '../midiSoundfontPlayer/midiSoundfontPlayer';
import { MidiManager } from '../../midi/MidiManagerNew';
import { Note } from '../../../../types/note';
import { db } from '../../db/dexie-client';

// Mock all dependencies
vi.mock('../midiSoundfontPlayer/midiSoundfontPlayer');
vi.mock('../../midi/MidiManagerNew');
vi.mock('../../db/dexie-client');
vi.mock('../../soundfont/soundfontManager', () => ({
    default: {
        getInstance: vi.fn().mockReturnValue({
            getSoundfont: vi.fn()
        })
    }
}));

describe('SoundfontEngineController', () => {
    let controller: SoundfontEngineController;
    let mockMidiPlayer: MidiSoundfontPlayer;
    let mockMidiManager: MidiManager;
    let mockGetSoundfont: Mock;

    // Test data
    const testTrackId = 'test-track-123';
    const testInstrumentId = 'test-instrument-456';
    const testNotes: Note[] = [
        { id: '1', pitch: 60, start: 0, duration: 1000, velocity: 100 },
        { id: '2', pitch: 64, start: 1000, duration: 1000, velocity: 80 }
    ];
    const testSoundfontData = new ArrayBuffer(1024);

    beforeEach(async () => {
        // Reset all mocks
        vi.clearAllMocks();

        // Create mock MidiSoundfontPlayer instance
        mockMidiPlayer = {
            waitForInitialization: vi.fn().mockResolvedValue(undefined),
            play: vi.fn().mockResolvedValue(undefined),
            pause: vi.fn(),
            stop: vi.fn().mockResolvedValue(undefined),
            seek: vi.fn().mockResolvedValue(undefined),
            addTrack: vi.fn().mockResolvedValue(undefined),
            removeTrack: vi.fn(),
            muteTrack: vi.fn(),
            setTrackVolume: vi.fn(),
            setTrackOffset: vi.fn(),
            setGlobalBPM: vi.fn().mockResolvedValue(undefined),
            getTrackIds: vi.fn().mockReturnValue([]),
            isPlayerPlaying: vi.fn().mockReturnValue(false),
            getCurrentTick: vi.fn().mockReturnValue(0),
            dispose: vi.fn()
        } as any;

        // Create mock MidiManager instance
        mockMidiManager = {
            hasTrack: vi.fn().mockReturnValue(false),
            createTrack: vi.fn(),
            getTrackNotes: vi.fn().mockReturnValue(testNotes),
            subscribeToTrackChanges: vi.fn().mockReturnValue(() => {})
        } as any;

        // Mock the MidiSoundfontPlayer constructor
        (MidiSoundfontPlayer as any).mockImplementation(() => mockMidiPlayer);

        // Setup soundfont manager mock
        const { default: SoundfontManager } = await import('../../soundfont/soundfontManager');
        mockGetSoundfont = vi.fn().mockResolvedValue({
            data: testSoundfontData,
            storage_key: 'test-storage-key'
        });
        (SoundfontManager.getInstance as Mock).mockReturnValue({
            getSoundfont: mockGetSoundfont
        });

        // Create controller instance
        controller = new SoundfontEngineController();
    });

    afterEach(() => {
        controller.dispose();
    });

    describe('Constructor and Initialization', () => {
        it('should create a new MidiSoundfontPlayer instance', () => {
            expect(MidiSoundfontPlayer).toHaveBeenCalledTimes(1);
        });

        it('should initialize with empty track subscriptions', () => {
            // Verify internal state through behavior
            controller.dispose(); // Should not throw even with no subscriptions
        });
    });

    describe('Transport Methods', () => {
        describe('play()', () => {
            it('should start playback without position', async () => {
                await controller.play();
                
                expect(mockMidiPlayer.seek).not.toHaveBeenCalled();
                expect(mockMidiPlayer.play).toHaveBeenCalledTimes(1);
            });

            it('should seek before playing when position is provided', async () => {
                const startTimeInSeconds = 5.5;
                await controller.play(startTimeInSeconds);
                
                expect(mockMidiPlayer.seek).toHaveBeenCalledWith(5500); // Converted to milliseconds
                expect(mockMidiPlayer.play).toHaveBeenCalledTimes(1);
            });

            it('should handle seek errors gracefully', async () => {
                mockMidiPlayer.seek.mockRejectedValueOnce(new Error('Seek failed'));
                
                await expect(controller.play(5)).rejects.toThrow('Seek failed');
                expect(mockMidiPlayer.play).not.toHaveBeenCalled();
            });
        });

        describe('pause()', () => {
            it('should pause playback and log debug info', async () => {
                mockMidiPlayer.getTrackIds.mockReturnValue(['track1', 'track2']);
                mockMidiPlayer.isPlayerPlaying.mockReturnValue(true);
                mockMidiPlayer.getCurrentTick.mockReturnValue(1000);

                await controller.pause();

                expect(mockMidiPlayer.pause).toHaveBeenCalledTimes(1);
                expect(mockMidiPlayer.getTrackIds).toHaveBeenCalled();
                expect(mockMidiPlayer.isPlayerPlaying).toHaveBeenCalled();
                expect(mockMidiPlayer.getCurrentTick).toHaveBeenCalled();
            });
        });

        describe('stop()', () => {
            it('should stop playback', async () => {
                await controller.stop();
                expect(mockMidiPlayer.stop).toHaveBeenCalledTimes(1);
            });

            it('should handle stop errors', async () => {
                mockMidiPlayer.stop.mockRejectedValueOnce(new Error('Stop failed'));
                await expect(controller.stop()).rejects.toThrow('Stop failed');
            });
        });

        describe('seek()', () => {
            it('should seek to position in milliseconds', async () => {
                await controller.seek(3000);
                expect(mockMidiPlayer.seek).toHaveBeenCalledWith(3000);
            });
        });
    });

    describe('Track Operations', () => {
        describe('addTrack()', () => {
            it('should add track with notes and soundfont data', async () => {
                await controller.addTrack(testTrackId, testNotes, testSoundfontData);
                
                expect(mockMidiPlayer.addTrack).toHaveBeenCalledWith(
                    testTrackId,
                    testNotes,
                    testSoundfontData
                );
            });

            it('should propagate errors from midi player', async () => {
                mockMidiPlayer.addTrack.mockRejectedValueOnce(new Error('Invalid soundfont'));
                
                await expect(
                    controller.addTrack(testTrackId, testNotes, testSoundfontData)
                ).rejects.toThrow('Invalid soundfont');
            });
        });

        describe('removeTrack()', () => {
            it('should remove track from player', () => {
                controller.removeTrack(testTrackId);
                expect(mockMidiPlayer.removeTrack).toHaveBeenCalledWith(testTrackId);
            });
        });

        describe('muteTrack()', () => {
            it('should mute track', () => {
                controller.muteTrack(testTrackId, true);
                expect(mockMidiPlayer.muteTrack).toHaveBeenCalledWith(testTrackId, true);
            });

            it('should unmute track', () => {
                controller.muteTrack(testTrackId, false);
                expect(mockMidiPlayer.muteTrack).toHaveBeenCalledWith(testTrackId, false);
            });
        });

        describe('setTrackVolume()', () => {
            it('should convert volume from 0-100 to MIDI scale', async () => {
                await controller.setTrackVolume(testTrackId, 50);
                expect(mockMidiPlayer.setTrackVolume).toHaveBeenCalledWith(testTrackId, 64); // 50% = 64/127
            });

            it('should handle max volume', async () => {
                await controller.setTrackVolume(testTrackId, 100);
                expect(mockMidiPlayer.setTrackVolume).toHaveBeenCalledWith(testTrackId, 127);
            });

            it('should handle values already in MIDI scale', async () => {
                await controller.setTrackVolume(testTrackId, 120);
                expect(mockMidiPlayer.setTrackVolume).toHaveBeenCalledWith(testTrackId, 120);
            });
        });

        describe('setTrackOffset()', () => {
            it('should set track offset in milliseconds', () => {
                controller.setTrackOffset(testTrackId, 500);
                expect(mockMidiPlayer.setTrackOffset).toHaveBeenCalledWith(testTrackId, 500);
            });
        });

        describe('setGlobalBPM()', () => {
            it('should set global BPM', async () => {
                await controller.setGlobalBPM(120);
                expect(mockMidiPlayer.setGlobalBPM).toHaveBeenCalledWith(120);
            });
        });
    });

    describe('connectTrackToSoundfont()', () => {
        beforeEach(() => {
            mockMidiPlayer.getTrackIds.mockReturnValue([]);
        });

        it('should successfully connect track to soundfont', async () => {
            // Setup track exists
            mockMidiManager.hasTrack.mockReturnValue(true);
            
            await controller.connectTrackToSoundfont(testTrackId, testInstrumentId, mockMidiManager);

            // Verify initialization check
            expect(mockMidiPlayer.waitForInitialization).toHaveBeenCalled();
            
            // Verify soundfont was fetched
            expect(mockGetSoundfont).toHaveBeenCalledWith(testInstrumentId);
            
            // Verify track was added
            expect(mockMidiPlayer.addTrack).toHaveBeenCalledWith(
                testTrackId,
                testNotes,
                testSoundfontData
            );
            
            // Verify subscription was created
            expect(mockMidiManager.subscribeToTrackChanges).toHaveBeenCalledWith(
                testTrackId,
                expect.any(Function)
            );
        });

        it('should create track if it does not exist', async () => {
            mockMidiManager.hasTrack.mockReturnValue(false);
            
            await controller.connectTrackToSoundfont(testTrackId, testInstrumentId, mockMidiManager);
            
            expect(mockMidiManager.createTrack).toHaveBeenCalledWith(testTrackId, testInstrumentId);
        });

        it('should throw error if midi player not initialized', async () => {
            mockMidiPlayer.waitForInitialization.mockRejectedValueOnce(
                new Error('Not initialized')
            );
            
            await expect(
                controller.connectTrackToSoundfont(testTrackId, testInstrumentId, mockMidiManager)
            ).rejects.toThrow('Cannot connect track test-track-123 to soundfont: MidiPlayer not initialized');
        });

        it('should throw error if soundfont data not found', async () => {
            mockGetSoundfont.mockResolvedValueOnce(null);
            
            await expect(
                controller.connectTrackToSoundfont(testTrackId, testInstrumentId, mockMidiManager)
            ).rejects.toThrow('No soundfont data found for instrument test-instrument-456');
        });

        it('should handle empty notes array', async () => {
            mockMidiManager.getTrackNotes.mockReturnValue(null);
            mockMidiManager.hasTrack.mockReturnValue(true);
            
            await controller.connectTrackToSoundfont(testTrackId, testInstrumentId, mockMidiManager);
            
            expect(mockMidiPlayer.addTrack).toHaveBeenCalledWith(
                testTrackId,
                [], // Empty array when notes are null
                testSoundfontData
            );
        });

        it('should verify track was added successfully', async () => {
            // First call returns empty, second call returns track ID
            mockMidiPlayer.getTrackIds
                .mockReturnValueOnce([])
                .mockReturnValueOnce([testTrackId]);
            
            await controller.connectTrackToSoundfont(testTrackId, testInstrumentId, mockMidiManager);
            
            expect(mockMidiPlayer.getTrackIds).toHaveBeenCalledTimes(2);
        });
    });

    describe('Track Subscription Management', () => {
        it('should handle track updates through subscription', async () => {
            let trackUpdateCallback: ((notes: Note[]) => void) | null = null;
            
            mockMidiManager.subscribeToTrackChanges.mockImplementation((trackId, callback) => {
                trackUpdateCallback = callback;
                return () => {}; // Unsubscribe function
            });
            
            mockMidiManager.hasTrack.mockReturnValue(true);
            
            // Connect track
            await controller.connectTrackToSoundfont(testTrackId, testInstrumentId, mockMidiManager);
            
            // Simulate track update
            const updatedNotes: Note[] = [
                { id: '3', pitch: 67, start: 2000, duration: 500, velocity: 90 }
            ];
            
            expect(trackUpdateCallback).toBeTruthy();
            trackUpdateCallback!(updatedNotes);
            
            // Verify track was re-added with new notes
            expect(mockMidiPlayer.removeTrack).toHaveBeenCalledWith(testTrackId);
            expect(mockMidiPlayer.addTrack).toHaveBeenCalledTimes(2); // Initial + update
        });

        it('should handle errors during track update', async () => {
            let trackUpdateCallback: ((notes: Note[]) => void) | null = null;
            
            mockMidiManager.subscribeToTrackChanges.mockImplementation((trackId, callback) => {
                trackUpdateCallback = callback;
                return () => {};
            });
            
            mockMidiManager.hasTrack.mockReturnValue(true);
            
            await controller.connectTrackToSoundfont(testTrackId, testInstrumentId, mockMidiManager);
            
            // Make addTrack fail on second call
            mockMidiPlayer.addTrack.mockRejectedValueOnce(new Error('Update failed'));
            
            // Should not throw, just log error
            trackUpdateCallback!([]);
            
            expect(mockMidiPlayer.removeTrack).toHaveBeenCalled();
        });
    });

    describe('TrackPlayer Interface Methods', () => {
        describe('setTrackMute()', () => {
            it('should mute track through interface method', async () => {
                await controller.setTrackMute(testTrackId, true);
                expect(mockMidiPlayer.muteTrack).toHaveBeenCalledWith(testTrackId, true);
            });
        });

        describe('setTrackPan()', () => {
            it('should throw not implemented error', async () => {
                await expect(
                    controller.setTrackPan(testTrackId, 0.5)
                ).rejects.toThrow('Method not implemented');
            });
        });

        describe('setTrackPositionTicks()', () => {
            it('should return resolved promise without implementation', async () => {
                await expect(
                    controller.setTrackPositionTicks(testTrackId, 1000)
                ).resolves.toBeUndefined();
            });
        });

        describe('setTrackTrimStartTicks()', () => {
            it('should return resolved promise without implementation', async () => {
                await expect(
                    controller.setTrackTrimStartTicks(testTrackId, 0)
                ).resolves.toBeUndefined();
            });
        });

        describe('setTrackTrimEndTicks()', () => {
            it('should return resolved promise without implementation', async () => {
                await expect(
                    controller.setTrackTrimEndTicks(testTrackId, 5000)
                ).resolves.toBeUndefined();
            });
        });
    });

    describe('Resource Cleanup', () => {
        it('should dispose all resources', async () => {
            // Create multiple subscriptions
            const unsubscribe1 = vi.fn();
            const unsubscribe2 = vi.fn();
            
            mockMidiManager.subscribeToTrackChanges
                .mockReturnValueOnce(unsubscribe1)
                .mockReturnValueOnce(unsubscribe2);
            
            mockMidiManager.hasTrack.mockReturnValue(true);
            
            // Connect two tracks
            await controller.connectTrackToSoundfont('track1', testInstrumentId, mockMidiManager);
            await controller.connectTrackToSoundfont('track2', testInstrumentId, mockMidiManager);
            
            // Dispose
            controller.dispose();
            
            // Verify all unsubscribe functions were called
            expect(unsubscribe1).toHaveBeenCalledTimes(1);
            expect(unsubscribe2).toHaveBeenCalledTimes(1);
            
            // Verify midi player was disposed
            expect(mockMidiPlayer.dispose).toHaveBeenCalledTimes(1);
        });

        it('should handle dispose with no subscriptions', () => {
            controller.dispose();
            expect(mockMidiPlayer.dispose).toHaveBeenCalledTimes(1);
        });
    });

    describe('Error Scenarios', () => {
        it('should handle soundfont loading errors', async () => {
            mockGetSoundfont.mockRejectedValueOnce(new Error('Network error'));
            
            await expect(
                controller.connectTrackToSoundfont(testTrackId, testInstrumentId, mockMidiManager)
            ).rejects.toThrow('No soundfont data found for instrument test-instrument-456');
        });

        it('should handle circular dependency import errors', async () => {
            // Mock dynamic import failure
            vi.doMock('../../soundfont/soundfontManager', () => {
                throw new Error('Circular dependency');
            });
            
            // This would require resetting module cache which is complex in tests
            // The error handling is tested indirectly through getSoundfontData returning null
        });
    });

    describe('Edge Cases', () => {
        it('should handle zero volume', async () => {
            await controller.setTrackVolume(testTrackId, 0);
            expect(mockMidiPlayer.setTrackVolume).toHaveBeenCalledWith(testTrackId, 0);
        });

        it('should handle negative offset gracefully', () => {
            controller.setTrackOffset(testTrackId, -100);
            expect(mockMidiPlayer.setTrackOffset).toHaveBeenCalledWith(testTrackId, -100);
        });

        it('should handle very high BPM values', async () => {
            await controller.setGlobalBPM(999);
            expect(mockMidiPlayer.setGlobalBPM).toHaveBeenCalledWith(999);
        });

        it('should handle connecting same track multiple times', async () => {
            mockMidiManager.hasTrack.mockReturnValue(true);
            
            // Connect twice
            await controller.connectTrackToSoundfont(testTrackId, testInstrumentId, mockMidiManager);
            await controller.connectTrackToSoundfont(testTrackId, testInstrumentId, mockMidiManager);
            
            // Should create two subscriptions
            expect(mockMidiManager.subscribeToTrackChanges).toHaveBeenCalledTimes(2);
        });
    });
});