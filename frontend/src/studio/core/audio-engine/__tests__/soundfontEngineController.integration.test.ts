import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { SoundfontEngineController } from '../soundfontEngineController';
import { MidiSoundfontPlayer } from '../midiSoundfontPlayer/midiSoundfontPlayer';
import { MidiManager } from '../../midi/MidiManagerNew';
import { Note } from '../../../../types/note';

// Mock dependencies
vi.mock('../midiSoundfontPlayer/midiSoundfontPlayer');
vi.mock('../../db/dexie-client');
vi.mock('../../soundfont/soundfontManager', () => ({
    default: {
        getInstance: vi.fn().mockReturnValue({
            getSoundfont: vi.fn()
        })
    }
}));

describe('SoundfontEngineController - Integration Tests', () => {
    let controller: SoundfontEngineController;
    let mockMidiPlayer: MidiSoundfontPlayer;
    let mockMidiManager: MidiManager;
    let mockGetSoundfont: Mock;

    // Test data for multiple tracks
    const tracks = {
        drums: {
            id: 'drums-track',
            instrumentId: 'drums-inst',
            notes: [
                { id: 'd1', pitch: 36, start: 0, duration: 250, velocity: 127 }, // Kick
                { id: 'd2', pitch: 38, start: 500, duration: 250, velocity: 100 }, // Snare
                { id: 'd3', pitch: 42, start: 250, duration: 100, velocity: 80 }, // Hi-hat
                { id: 'd4', pitch: 42, start: 750, duration: 100, velocity: 80 }  // Hi-hat
            ],
            soundfontData: new ArrayBuffer(2048)
        },
        bass: {
            id: 'bass-track',
            instrumentId: 'bass-inst',
            notes: [
                { id: 'b1', pitch: 36, start: 0, duration: 1000, velocity: 90 },
                { id: 'b2', pitch: 40, start: 1000, duration: 1000, velocity: 90 }
            ],
            soundfontData: new ArrayBuffer(1024)
        },
        piano: {
            id: 'piano-track',
            instrumentId: 'piano-inst',
            notes: [
                { id: 'p1', pitch: 60, start: 0, duration: 500, velocity: 80 },
                { id: 'p2', pitch: 64, start: 500, duration: 500, velocity: 75 },
                { id: 'p3', pitch: 67, start: 1000, duration: 500, velocity: 70 }
            ],
            soundfontData: new ArrayBuffer(4096)
        }
    };

    beforeEach(async () => {
        vi.clearAllMocks();

        // Setup mock MidiSoundfontPlayer
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

        // Setup mock MidiManager
        mockMidiManager = {
            hasTrack: vi.fn(),
            createTrack: vi.fn(),
            getTrackNotes: vi.fn(),
            subscribeToTrackChanges: vi.fn().mockReturnValue(() => {})
        } as any;

        // Mock constructor
        (MidiSoundfontPlayer as any).mockImplementation(() => mockMidiPlayer);

        // Setup soundfont manager mock
        const { default: SoundfontManager } = await import('../../soundfont/soundfontManager');
        mockGetSoundfont = vi.fn();
        (SoundfontManager.getInstance as Mock).mockReturnValue({
            getSoundfont: mockGetSoundfont
        });

        controller = new SoundfontEngineController();
    });

    afterEach(() => {
        controller.dispose();
    });

    describe('Multi-Track Workflow', () => {
        it('should handle multiple tracks with different instruments', async () => {
            // Setup mocks for each track
            Object.values(tracks).forEach(track => {
                mockMidiManager.hasTrack.mockReturnValueOnce(false);
                mockMidiManager.getTrackNotes.mockReturnValueOnce(track.notes);
                mockGetSoundfont.mockResolvedValueOnce({
                    data: track.soundfontData,
                    storage_key: `${track.instrumentId}-key`
                });
            });

            // Simulate track IDs being added progressively
            mockMidiPlayer.getTrackIds
                .mockReturnValueOnce([])
                .mockReturnValueOnce([tracks.drums.id])
                .mockReturnValueOnce([tracks.drums.id])
                .mockReturnValueOnce([tracks.drums.id, tracks.bass.id])
                .mockReturnValueOnce([tracks.drums.id, tracks.bass.id])
                .mockReturnValueOnce([tracks.drums.id, tracks.bass.id, tracks.piano.id]);

            // Connect all tracks
            for (const track of Object.values(tracks)) {
                await controller.connectTrackToSoundfont(track.id, track.instrumentId, mockMidiManager);
            }

            // Verify all tracks were created and added
            expect(mockMidiManager.createTrack).toHaveBeenCalledTimes(3);
            expect(mockMidiPlayer.addTrack).toHaveBeenCalledTimes(3);
            
            // Verify each track was added with correct data
            expect(mockMidiPlayer.addTrack).toHaveBeenCalledWith(
                tracks.drums.id,
                tracks.drums.notes,
                tracks.drums.soundfontData
            );
            expect(mockMidiPlayer.addTrack).toHaveBeenCalledWith(
                tracks.bass.id,
                tracks.bass.notes,
                tracks.bass.soundfontData
            );
            expect(mockMidiPlayer.addTrack).toHaveBeenCalledWith(
                tracks.piano.id,
                tracks.piano.notes,
                tracks.piano.soundfontData
            );
        });

        it('should handle complex playback control sequence', async () => {
            // Setup and connect a track
            mockMidiManager.hasTrack.mockReturnValue(true);
            mockMidiManager.getTrackNotes.mockReturnValue(tracks.piano.notes);
            mockGetSoundfont.mockResolvedValue({
                data: tracks.piano.soundfontData,
                storage_key: 'piano-key'
            });
            mockMidiPlayer.getTrackIds.mockReturnValue([tracks.piano.id]);

            await controller.connectTrackToSoundfont(
                tracks.piano.id,
                tracks.piano.instrumentId,
                mockMidiManager
            );

            // Complex playback sequence
            await controller.setGlobalBPM(120);
            await controller.setTrackVolume(tracks.piano.id, 75);
            controller.setTrackOffset(tracks.piano.id, 100);
            await controller.play(2.5); // Start at 2.5 seconds
            
            mockMidiPlayer.isPlayerPlaying.mockReturnValue(true);
            mockMidiPlayer.getCurrentTick.mockReturnValue(2500);
            
            await controller.pause();
            
            await controller.seek(5000); // Jump to 5 seconds
            await controller.play(); // Resume from new position
            
            controller.muteTrack(tracks.piano.id, true);
            await controller.setTrackVolume(tracks.piano.id, 50);
            
            await controller.stop();

            // Verify the sequence
            expect(mockMidiPlayer.setGlobalBPM).toHaveBeenCalledWith(120);
            expect(mockMidiPlayer.setTrackVolume).toHaveBeenCalledWith(tracks.piano.id, 95); // 75% of 127
            expect(mockMidiPlayer.setTrackOffset).toHaveBeenCalledWith(tracks.piano.id, 100);
            expect(mockMidiPlayer.seek).toHaveBeenCalledWith(2500);
            expect(mockMidiPlayer.play).toHaveBeenCalledTimes(2);
            expect(mockMidiPlayer.pause).toHaveBeenCalledTimes(1);
            expect(mockMidiPlayer.seek).toHaveBeenCalledWith(5000);
            expect(mockMidiPlayer.muteTrack).toHaveBeenCalledWith(tracks.piano.id, true);
            expect(mockMidiPlayer.stop).toHaveBeenCalledTimes(1);
        });
    });

    describe('Dynamic Track Updates', () => {
        it('should handle live note updates during playback', async () => {
            let updateCallbacks: Map<string, (notes: Note[]) => void> = new Map();
            
            // Capture update callbacks
            mockMidiManager.subscribeToTrackChanges.mockImplementation((trackId, callback) => {
                updateCallbacks.set(trackId, callback);
                return () => updateCallbacks.delete(trackId);
            });

            // Setup initial state
            mockMidiManager.hasTrack.mockReturnValue(true);
            mockMidiManager.getTrackNotes.mockReturnValue(tracks.piano.notes);
            mockGetSoundfont.mockResolvedValue({
                data: tracks.piano.soundfontData,
                storage_key: 'piano-key'
            });
            mockMidiPlayer.getTrackIds.mockReturnValue([tracks.piano.id]);

            // Connect track
            await controller.connectTrackToSoundfont(
                tracks.piano.id,
                tracks.piano.instrumentId,
                mockMidiManager
            );

            // Start playback
            await controller.play();
            mockMidiPlayer.isPlayerPlaying.mockReturnValue(true);

            // Simulate multiple updates during playback
            const updates = [
                // Add a new note
                [...tracks.piano.notes, { id: 'p4', pitch: 72, start: 1500, duration: 500, velocity: 85 }],
                // Remove a note
                tracks.piano.notes.filter(n => n.id !== 'p2'),
                // Change note properties
                tracks.piano.notes.map(n => n.id === 'p1' ? { ...n, velocity: 100 } : n)
            ];

            for (const updatedNotes of updates) {
                const callback = updateCallbacks.get(tracks.piano.id);
                expect(callback).toBeDefined();
                callback!(updatedNotes);
                
                // Each update should remove and re-add the track
                expect(mockMidiPlayer.removeTrack).toHaveBeenCalledWith(tracks.piano.id);
                expect(mockMidiPlayer.addTrack).toHaveBeenCalledWith(
                    tracks.piano.id,
                    updatedNotes,
                    tracks.piano.soundfontData
                );
            }

            // Verify total calls
            expect(mockMidiPlayer.removeTrack).toHaveBeenCalledTimes(3);
            expect(mockMidiPlayer.addTrack).toHaveBeenCalledTimes(4); // 1 initial + 3 updates
        });

        it('should handle track removal and re-addition', async () => {
            // Setup
            mockMidiManager.hasTrack.mockReturnValue(true);
            mockMidiManager.getTrackNotes.mockReturnValue(tracks.bass.notes);
            mockGetSoundfont.mockResolvedValue({
                data: tracks.bass.soundfontData,
                storage_key: 'bass-key'
            });

            // Connect track
            await controller.connectTrackToSoundfont(
                tracks.bass.id,
                tracks.bass.instrumentId,
                mockMidiManager
            );

            // Remove track
            controller.removeTrack(tracks.bass.id);
            expect(mockMidiPlayer.removeTrack).toHaveBeenCalledWith(tracks.bass.id);

            // Re-add with different instrument
            const newBassData = new ArrayBuffer(2048);
            mockGetSoundfont.mockResolvedValue({
                data: newBassData,
                storage_key: 'synth-bass-key'
            });

            await controller.connectTrackToSoundfont(
                tracks.bass.id,
                'synth-bass-inst',
                mockMidiManager
            );

            // Should have been added again with new soundfont
            expect(mockMidiPlayer.addTrack).toHaveBeenLastCalledWith(
                tracks.bass.id,
                tracks.bass.notes,
                newBassData
            );
        });
    });

    describe('Error Recovery Scenarios', () => {
        it('should recover from partial initialization failure', async () => {
            // First two tracks succeed, third fails
            const trackOrder = [tracks.drums, tracks.bass, tracks.piano];
            
            trackOrder.forEach((track, index) => {
                mockMidiManager.hasTrack.mockReturnValueOnce(true);
                mockMidiManager.getTrackNotes.mockReturnValueOnce(track.notes);
                
                if (index < 2) {
                    mockGetSoundfont.mockResolvedValueOnce({
                        data: track.soundfontData,
                        storage_key: `${track.instrumentId}-key`
                    });
                } else {
                    mockGetSoundfont.mockResolvedValueOnce(null); // Fail on piano
                }
            });

            // Connect first two successfully
            for (let i = 0; i < 2; i++) {
                await controller.connectTrackToSoundfont(
                    trackOrder[i].id,
                    trackOrder[i].instrumentId,
                    mockMidiManager
                );
            }

            // Third should fail
            await expect(
                controller.connectTrackToSoundfont(
                    tracks.piano.id,
                    tracks.piano.instrumentId,
                    mockMidiManager
                )
            ).rejects.toThrow('No soundfont data found');

            // But the first two should still be playable
            expect(mockMidiPlayer.addTrack).toHaveBeenCalledTimes(2);
            
            // Should be able to play with partial tracks
            await controller.play();
            expect(mockMidiPlayer.play).toHaveBeenCalled();
        });

        it('should handle concurrent track operations', async () => {
            // Setup all tracks
            Object.values(tracks).forEach(track => {
                mockMidiManager.hasTrack.mockReturnValue(true);
                mockMidiManager.getTrackNotes.mockReturnValue(track.notes);
                mockGetSoundfont.mockResolvedValue({
                    data: track.soundfontData,
                    storage_key: `${track.instrumentId}-key`
                });
            });

            // Connect all tracks concurrently
            const connectPromises = Object.values(tracks).map(track =>
                controller.connectTrackToSoundfont(track.id, track.instrumentId, mockMidiManager)
            );

            await Promise.all(connectPromises);

            // All tracks should be added
            expect(mockMidiPlayer.addTrack).toHaveBeenCalledTimes(3);
            
            // Perform concurrent operations
            await Promise.all([
                controller.setTrackVolume(tracks.drums.id, 90),
                controller.setTrackVolume(tracks.bass.id, 80),
                controller.setTrackVolume(tracks.piano.id, 70),
                controller.setGlobalBPM(140)
            ]);

            expect(mockMidiPlayer.setTrackVolume).toHaveBeenCalledTimes(3);
            expect(mockMidiPlayer.setGlobalBPM).toHaveBeenCalledWith(140);
        });
    });

    describe('Performance and Resource Management', () => {
        it('should handle rapid play/pause cycles', async () => {
            // Quick succession of play/pause
            for (let i = 0; i < 10; i++) {
                await controller.play();
                await controller.pause();
            }

            expect(mockMidiPlayer.play).toHaveBeenCalledTimes(10);
            expect(mockMidiPlayer.pause).toHaveBeenCalledTimes(10);
        });

        it('should properly clean up resources with multiple tracks', async () => {
            const unsubscribes: (() => void)[] = [];
            
            // Setup subscriptions
            mockMidiManager.subscribeToTrackChanges.mockImplementation(() => {
                const unsub = vi.fn();
                unsubscribes.push(unsub);
                return unsub;
            });

            // Connect multiple tracks
            for (const track of Object.values(tracks)) {
                mockMidiManager.hasTrack.mockReturnValueOnce(true);
                mockMidiManager.getTrackNotes.mockReturnValueOnce(track.notes);
                mockGetSoundfont.mockResolvedValueOnce({
                    data: track.soundfontData,
                    storage_key: `${track.instrumentId}-key`
                });
                
                await controller.connectTrackToSoundfont(
                    track.id,
                    track.instrumentId,
                    mockMidiManager
                );
            }

            // Dispose should call all unsubscribe functions
            controller.dispose();

            unsubscribes.forEach(unsub => {
                expect(unsub).toHaveBeenCalledTimes(1);
            });
            
            expect(mockMidiPlayer.dispose).toHaveBeenCalledTimes(1);
        });

        it('should handle memory pressure scenarios', async () => {
            // Simulate loading many large soundfonts
            const largeSoundfontData = new ArrayBuffer(10 * 1024 * 1024); // 10MB
            
            for (let i = 0; i < 5; i++) {
                const trackId = `track-${i}`;
                mockMidiManager.hasTrack.mockReturnValueOnce(false);
                mockMidiManager.getTrackNotes.mockReturnValueOnce([
                    { id: `n${i}`, pitch: 60 + i, start: 0, duration: 1000, velocity: 100 }
                ]);
                mockGetSoundfont.mockResolvedValueOnce({
                    data: largeSoundfontData,
                    storage_key: `large-sf-${i}`
                });

                await controller.connectTrackToSoundfont(
                    trackId,
                    `instrument-${i}`,
                    mockMidiManager
                );
            }

            // Should handle all without errors
            expect(mockMidiPlayer.addTrack).toHaveBeenCalledTimes(5);
        });
    });

    describe('Edge Case Scenarios', () => {
        it('should handle extremely long notes', async () => {
            const longNotes: Note[] = [
                { id: 'long1', pitch: 60, start: 0, duration: 60000, velocity: 80 }, // 1 minute
                { id: 'long2', pitch: 64, start: 30000, duration: 120000, velocity: 75 } // 2 minutes
            ];

            mockMidiManager.hasTrack.mockReturnValue(true);
            mockMidiManager.getTrackNotes.mockReturnValue(longNotes);
            mockGetSoundfont.mockResolvedValue({
                data: new ArrayBuffer(1024),
                storage_key: 'ambient-key'
            });

            await controller.connectTrackToSoundfont('ambient-track', 'ambient-inst', mockMidiManager);

            expect(mockMidiPlayer.addTrack).toHaveBeenCalledWith(
                'ambient-track',
                longNotes,
                expect.any(ArrayBuffer)
            );
        });

        it('should handle tracks with no notes', async () => {
            mockMidiManager.hasTrack.mockReturnValue(true);
            mockMidiManager.getTrackNotes.mockReturnValue([]);
            mockGetSoundfont.mockResolvedValue({
                data: new ArrayBuffer(1024),
                storage_key: 'empty-key'
            });

            await controller.connectTrackToSoundfont('empty-track', 'some-inst', mockMidiManager);

            expect(mockMidiPlayer.addTrack).toHaveBeenCalledWith(
                'empty-track',
                [],
                expect.any(ArrayBuffer)
            );
        });

        it('should handle rapid seek operations', async () => {
            const seekPositions = [0, 1000, 500, 2000, 100, 5000, 3000];
            
            for (const position of seekPositions) {
                await controller.seek(position);
            }

            expect(mockMidiPlayer.seek).toHaveBeenCalledTimes(seekPositions.length);
            seekPositions.forEach((pos, index) => {
                expect(mockMidiPlayer.seek).toHaveBeenNthCalledWith(index + 1, pos);
            });
        });
    });
});