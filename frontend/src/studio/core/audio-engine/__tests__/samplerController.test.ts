import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { SamplerController } from '../samplerController';
import MidiSampler from '../midiSamplePlayer/sampler';
import { MidiManager } from '../../midi/MidiManagerNew';
import { Note } from '../../../../types/note';
import * as Tone from 'tone';

// Mock the MidiSampler module
vi.mock('../midiSamplePlayer/sampler');
vi.mock('tone', () => ({
    Transport: {
        pause: vi.fn(),
        cancel: vi.fn(),
    },
    GrainPlayer: vi.fn(),
    Gain: vi.fn(() => ({
        toDestination: vi.fn(),
        dispose: vi.fn(),
        disposed: false,
    })),
    now: vi.fn(() => 0),
    gainToDb: vi.fn((gain: number) => gain),
    dbToGain: vi.fn((db: number) => db),
    Frequency: vi.fn(() => ({ toNote: vi.fn(() => 'C4') })),
}));

describe('SamplerController', () => {
    let samplerController: SamplerController;
    let mockMidiManager: Partial<MidiManager>;
    let mockMidiSampler: Partial<MidiSampler>;
    let mockFile: File;
    let consoleLogSpy: Mock;
    let consoleWarnSpy: Mock;
    let consoleErrorSpy: Mock;

    // Helper function to create mock notes
    const createMockNotes = (count: number = 3): Note[] => {
        return Array.from({ length: count }, (_, i) => ({
            id: i,
            row: 60 + i, // C4, C#4, D4
            column: i * 4,
            length: 4,
            velocity: 0.8,
        }));
    };

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Create console spies
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Create mock MidiSampler instance
        mockMidiSampler = {
            initialize: vi.fn().mockResolvedValue(undefined),
            loadAudioFile: vi.fn().mockResolvedValue(undefined),
            setBaseNote: vi.fn(),
            setNotes: vi.fn(),
            getNotes: vi.fn().mockReturnValue([]),
            playNote: vi.fn(),
            playMidi: vi.fn(),
            stopPlayback: vi.fn(),
            dispose: vi.fn(),
            setGrainSize: vi.fn(),
            setOverlap: vi.fn(),
            setOffset: vi.fn(),
            setVolume: vi.fn(),
            setMute: vi.fn(),
            buffer: true,
        };

        // Mock the MidiSampler constructor
        (MidiSampler as unknown as Mock).mockImplementation(() => mockMidiSampler);

        // Create mock MidiManager
        mockMidiManager = {
            hasTrack: vi.fn().mockReturnValue(true),
            createTrack: vi.fn(),
            subscribeToTrack: vi.fn().mockReturnValue(() => {}), // Return unsubscribe function
            getTrackNotes: vi.fn().mockReturnValue([]),
        };

        // Create mock File
        mockFile = new File(['audio content'], 'test.wav', { type: 'audio/wav' });

        // Create SamplerController instance
        samplerController = new SamplerController();
    });

    afterEach(() => {
        // Dispose of the controller to clean up resources
        samplerController.dispose();
        
        // Restore console methods
        consoleLogSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    describe('Constructor and Initialization', () => {
        it('should initialize with empty maps', () => {
            expect(samplerController.getActiveSamplerIds()).toEqual([]);
            expect(samplerController.hasSampler('test-track')).toBe(false);
        });

        it('should log initialization message', () => {
            new SamplerController();
            expect(consoleLogSpy).toHaveBeenCalledWith('SamplerController initialized');
        });
    });

    describe('Sampler Management', () => {
        describe('initializeSampler', () => {
            it('should initialize a sampler with file', async () => {
                await samplerController.initializeSampler('track-1', mockFile, 60, 0.1, 0.1);

                expect(MidiSampler).toHaveBeenCalledTimes(1);
                expect(mockMidiSampler.initialize).toHaveBeenCalled();
                expect(mockMidiSampler.setBaseNote).toHaveBeenCalledWith(60);
                expect(mockMidiSampler.loadAudioFile).toHaveBeenCalledWith(mockFile, 0.1, 0.1);
                expect(samplerController.hasSampler('track-1')).toBe(true);
            });

            it('should initialize an empty sampler without file', async () => {
                await samplerController.initializeSampler('track-1', undefined, 60, 0.1, 0.1);

                expect(MidiSampler).toHaveBeenCalledTimes(1);
                expect(mockMidiSampler.initialize).toHaveBeenCalled();
                expect(mockMidiSampler.setBaseNote).toHaveBeenCalledWith(60);
                expect(mockMidiSampler.loadAudioFile).not.toHaveBeenCalled();
                expect(samplerController.hasSampler('track-1')).toBe(true);
            });

            it('should use default values when not provided', async () => {
                await samplerController.initializeSampler('track-1', mockFile);

                expect(mockMidiSampler.setBaseNote).toHaveBeenCalledWith(60); // Default base note
                expect(mockMidiSampler.loadAudioFile).toHaveBeenCalledWith(mockFile, 0.1, 0.1); // Default grain size and overlap
            });

            it('should clean up existing sampler before creating new one', async () => {
                // Initialize first sampler
                await samplerController.initializeSampler('track-1', mockFile);
                const firstSampler = mockMidiSampler;

                // Create new mock for second sampler
                const secondMockSampler = {
                    ...mockMidiSampler,
                    initialize: vi.fn().mockResolvedValue(undefined),
                    loadAudioFile: vi.fn().mockResolvedValue(undefined),
                };
                (MidiSampler as unknown as Mock).mockImplementation(() => secondMockSampler);

                // Initialize second sampler with same track ID
                await samplerController.initializeSampler('track-1', mockFile);

                expect(firstSampler.dispose).toHaveBeenCalled();
                expect(samplerController.hasSampler('track-1')).toBe(true);
            });

            it('should handle initialization errors', async () => {
                mockMidiSampler.initialize = vi.fn().mockRejectedValue(new Error('Init failed'));

                await expect(samplerController.initializeSampler('track-1', mockFile))
                    .rejects.toThrow('Init failed');
                
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    'Failed to initialize sampler for track track-1:',
                    expect.any(Error)
                );
            });
        });

        describe('removeSampler', () => {
            beforeEach(async () => {
                await samplerController.initializeSampler('track-1', mockFile);
                samplerController.registerTrackSubscription('track-1', mockMidiManager as MidiManager);
            });

            it('should remove sampler and clean up resources', () => {
                samplerController.removeSampler('track-1');

                expect(mockMidiSampler.dispose).toHaveBeenCalled();
                expect(samplerController.hasSampler('track-1')).toBe(false);
                expect(consoleLogSpy).toHaveBeenCalledWith('Removed sampler for track track-1');
            });

            it('should unsubscribe from MIDI updates', () => {
                const unsubscribeFn = vi.fn();
                mockMidiManager.subscribeToTrack = vi.fn().mockReturnValue(unsubscribeFn);
                
                samplerController.registerTrackSubscription('track-1', mockMidiManager as MidiManager);
                samplerController.removeSampler('track-1');

                expect(unsubscribeFn).toHaveBeenCalled();
            });

            it('should handle removal of non-existent sampler gracefully', () => {
                samplerController.removeSampler('non-existent');
                expect(consoleLogSpy).toHaveBeenCalledWith('Removed sampler for track non-existent');
            });
        });

        describe('getSampler', () => {
            it('should return sampler instance if exists', async () => {
                await samplerController.initializeSampler('track-1', mockFile);
                const sampler = samplerController.getSampler('track-1');
                expect(sampler).toBe(mockMidiSampler);
            });

            it('should return undefined for non-existent sampler', () => {
                const sampler = samplerController.getSampler('non-existent');
                expect(sampler).toBeUndefined();
            });
        });

        describe('hasSampler', () => {
            it('should return true for existing sampler', async () => {
                await samplerController.initializeSampler('track-1', mockFile);
                expect(samplerController.hasSampler('track-1')).toBe(true);
            });

            it('should return false for non-existent sampler', () => {
                expect(samplerController.hasSampler('non-existent')).toBe(false);
            });
        });

        describe('getActiveSamplerIds', () => {
            it('should return array of active sampler IDs', async () => {
                await samplerController.initializeSampler('track-1', mockFile);
                await samplerController.initializeSampler('track-2', mockFile);
                
                const ids = samplerController.getActiveSamplerIds();
                expect(ids).toHaveLength(2);
                expect(ids).toContain('track-1');
                expect(ids).toContain('track-2');
            });

            it('should return empty array when no samplers', () => {
                expect(samplerController.getActiveSamplerIds()).toEqual([]);
            });
        });
    });

    describe('MIDI Subscription Management', () => {
        describe('registerTrackSubscription', () => {
            beforeEach(async () => {
                await samplerController.initializeSampler('track-1', mockFile);
            });

            it('should subscribe to MIDI updates for track', () => {
                samplerController.registerTrackSubscription('track-1', mockMidiManager as MidiManager);

                expect(mockMidiManager.subscribeToTrack).toHaveBeenCalledWith(
                    'track-1',
                    expect.any(Function)
                );
                expect(consoleLogSpy).toHaveBeenCalledWith(
                    'Successfully subscribed to MIDI updates for sampler track track-1'
                );
            });

            it('should update sampler notes when MIDI data changes', () => {
                const mockNotes = createMockNotes();
                let trackUpdateCallback: any;

                mockMidiManager.subscribeToTrack = vi.fn().mockImplementation((trackId, callback) => {
                    trackUpdateCallback = callback;
                    return () => {};
                });

                samplerController.registerTrackSubscription('track-1', mockMidiManager as MidiManager);
                
                // Simulate MIDI update
                trackUpdateCallback('track-1', mockNotes);

                expect(mockMidiSampler.setNotes).toHaveBeenCalledWith(mockNotes);
            });

            it('should unsubscribe from previous subscription before creating new one', () => {
                const unsubscribe1 = vi.fn();
                const unsubscribe2 = vi.fn();

                mockMidiManager.subscribeToTrack = vi.fn()
                    .mockReturnValueOnce(unsubscribe1)
                    .mockReturnValueOnce(unsubscribe2);

                samplerController.registerTrackSubscription('track-1', mockMidiManager as MidiManager);
                samplerController.registerTrackSubscription('track-1', mockMidiManager as MidiManager);

                expect(unsubscribe1).toHaveBeenCalled();
                expect(unsubscribe2).not.toHaveBeenCalled();
            });

            it('should warn if no sampler exists for track', () => {
                samplerController.registerTrackSubscription('non-existent', mockMidiManager as MidiManager);

                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'No sampler found for track non-existent, cannot subscribe to MIDI updates'
                );
                expect(mockMidiManager.subscribeToTrack).not.toHaveBeenCalled();
            });
        });

        describe('connectTrackToSampler', () => {
            it('should initialize sampler and register subscription', async () => {
                await samplerController.connectTrackToSampler(
                    'track-1',
                    mockFile,
                    mockMidiManager as MidiManager,
                    60,
                    0.1,
                    0.1
                );

                expect(mockMidiSampler.initialize).toHaveBeenCalled();
                expect(mockMidiSampler.loadAudioFile).toHaveBeenCalled();
                expect(mockMidiManager.subscribeToTrack).toHaveBeenCalled();
            });

            it('should create track if it does not exist in MidiManager', async () => {
                mockMidiManager.hasTrack = vi.fn().mockReturnValue(false);

                await samplerController.connectTrackToSampler(
                    'track-1',
                    mockFile,
                    mockMidiManager as MidiManager
                );

                expect(mockMidiManager.createTrack).toHaveBeenCalledWith('track-1', 'sampler');
            });

            it('should handle connection errors', async () => {
                mockMidiSampler.initialize = vi.fn().mockRejectedValue(new Error('Connection failed'));

                await expect(samplerController.connectTrackToSampler(
                    'track-1',
                    mockFile,
                    mockMidiManager as MidiManager
                )).rejects.toThrow('Connection failed');

                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    'Failed to connect track track-1 to sampler:',
                    expect.any(Error)
                );
            });
        });
    });

    describe('Playback Control', () => {
        describe('playNote', () => {
            beforeEach(async () => {
                await samplerController.initializeSampler('track-1', mockFile);
            });

            it('should play a single note with default parameters', () => {
                samplerController.playNote('track-1', 64);

                expect(mockMidiSampler.playNote).toHaveBeenCalledWith(64, 0.5, 0.8);
            });

            it('should play a note with custom parameters', () => {
                samplerController.playNote('track-1', 64, 1.0, 0.5);

                expect(mockMidiSampler.playNote).toHaveBeenCalledWith(64, 1.0, 0.5);
            });

            it('should warn if sampler does not exist', () => {
                samplerController.playNote('non-existent', 64);

                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'No sampler found for track non-existent, cannot play note'
                );
                expect(mockMidiSampler.playNote).not.toHaveBeenCalled();
            });
        });

        describe('Transport Integration', () => {
            beforeEach(async () => {
                await samplerController.initializeSampler('track-1', mockFile);
                await samplerController.initializeSampler('track-2', mockFile);
            });

            describe('play', () => {
                it('should start playback for all active samplers', async () => {
                    await samplerController.play(5, 120);

                    expect(mockMidiSampler.playMidi).toHaveBeenCalledTimes(2);
                    expect(mockMidiSampler.playMidi).toHaveBeenCalledWith(120, 5);
                });

                it('should handle playback errors gracefully', async () => {
                    mockMidiSampler.playMidi = vi.fn().mockImplementation(() => {
                        throw new Error('Playback failed');
                    });

                    await samplerController.play(0, 120);

                    expect(consoleErrorSpy).toHaveBeenCalledWith(
                        expect.stringContaining('Error starting playback for track'),
                        expect.any(Error)
                    );
                });
            });

            describe('pause', () => {
                it('should pause all active samplers', async () => {
                    await samplerController.pause();

                    expect(mockMidiSampler.stopPlayback).toHaveBeenCalledTimes(2);
                });
            });

            describe('stop', () => {
                it('should stop all active samplers', async () => {
                    await samplerController.stop();

                    expect(mockMidiSampler.stopPlayback).toHaveBeenCalledTimes(2);
                });

                it('should handle stop errors gracefully', async () => {
                    mockMidiSampler.stopPlayback = vi.fn().mockImplementation(() => {
                        throw new Error('Stop failed');
                    });

                    await samplerController.stop();

                    expect(consoleErrorSpy).toHaveBeenCalledWith(
                        expect.stringContaining('Error stopping playback for track'),
                        expect.any(Error)
                    );
                });
            });

            describe('seek', () => {
                it('should stop and restart playback at new position', async () => {
                    await samplerController.seek(10, 120);

                    // Should stop first
                    expect(mockMidiSampler.stopPlayback).toHaveBeenCalledTimes(2);
                    
                    // Then start from new position
                    expect(mockMidiSampler.playMidi).toHaveBeenCalledTimes(2);
                    expect(mockMidiSampler.playMidi).toHaveBeenCalledWith(120, 10);
                });
            });
        });
    });

    describe('Parameter Control', () => {
        beforeEach(async () => {
            await samplerController.initializeSampler('track-1', mockFile);
        });

        describe('setBaseMidiNote', () => {
            it('should set base MIDI note for sampler', () => {
                samplerController.setBaseMidiNote('track-1', 72);

                expect(mockMidiSampler.setBaseNote).toHaveBeenCalledWith(72);
            });

            it('should warn if sampler does not exist', () => {
                samplerController.setBaseMidiNote('non-existent', 72);

                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'No sampler found for track non-existent, cannot set base MIDI note'
                );
            });

            it('should handle errors gracefully', () => {
                mockMidiSampler.setBaseNote = vi.fn().mockImplementation(() => {
                    throw new Error('Invalid note');
                });

                samplerController.setBaseMidiNote('track-1', 72);

                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    'SamplerController: Error setting base MIDI note for track track-1:',
                    expect.any(Error)
                );
            });
        });

        describe('setGrainSize', () => {
            it('should set grain size for sampler', () => {
                samplerController.setGrainSize('track-1', 0.2);

                expect(mockMidiSampler.setGrainSize).toHaveBeenCalledWith(0.2);
            });

            it('should warn if sampler does not exist', () => {
                samplerController.setGrainSize('non-existent', 0.2);

                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'No sampler found for track non-existent, cannot set grain size'
                );
            });
        });

        describe('setOverlap', () => {
            it('should set overlap for sampler', () => {
                samplerController.setOverlap('track-1', 0.5);

                expect(mockMidiSampler.setOverlap).toHaveBeenCalledWith(0.5);
            });

            it('should warn if sampler does not exist', () => {
                samplerController.setOverlap('non-existent', 0.5);

                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'No sampler found for track non-existent, cannot set overlap'
                );
            });
        });

        describe('setTrackOffset', () => {
            it('should set track offset in milliseconds', () => {
                samplerController.setTrackOffset('track-1', 1000);

                expect(mockMidiSampler.setOffset).toHaveBeenCalledWith(1000);
            });

            it('should warn if sampler does not exist', () => {
                samplerController.setTrackOffset('non-existent', 1000);

                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'Cannot set offset: no sampler found for track non-existent'
                );
            });
        });

        describe('setTrackVolume', () => {
            it('should set track volume', async () => {
                await samplerController.setTrackVolume('track-1', 75);

                expect(mockMidiSampler.setVolume).toHaveBeenCalledWith(75);
            });

            it('should warn if sampler does not exist', async () => {
                await samplerController.setTrackVolume('non-existent', 75);

                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'Cannot set volume: no sampler found for track non-existent'
                );
            });
        });

        describe('setTrackMute', () => {
            it('should set track mute state', async () => {
                await samplerController.setTrackMute('track-1', true);

                expect(mockMidiSampler.setMute).toHaveBeenCalledWith(true);
            });

            it('should handle non-existent sampler gracefully', async () => {
                await samplerController.setTrackMute('non-existent', true);

                expect(mockMidiSampler.setMute).not.toHaveBeenCalled();
            });
        });

        describe('muteTrack (deprecated)', () => {
            it('should mute track using legacy method', () => {
                samplerController.muteTrack('track-1', true);

                expect(mockMidiSampler.setMute).toHaveBeenCalledWith(true);
            });

            it('should unmute track using legacy method', () => {
                samplerController.muteTrack('track-1', false);

                expect(mockMidiSampler.setMute).toHaveBeenCalledWith(false);
            });
        });
    });

    describe('Resource Cleanup', () => {
        describe('dispose', () => {
            beforeEach(async () => {
                await samplerController.initializeSampler('track-1', mockFile);
                await samplerController.initializeSampler('track-2', mockFile);
                
                const unsubscribe1 = vi.fn();
                const unsubscribe2 = vi.fn();
                mockMidiManager.subscribeToTrack = vi.fn()
                    .mockReturnValueOnce(unsubscribe1)
                    .mockReturnValueOnce(unsubscribe2);
                
                samplerController.registerTrackSubscription('track-1', mockMidiManager as MidiManager);
                samplerController.registerTrackSubscription('track-2', mockMidiManager as MidiManager);
            });

            it('should dispose all samplers when no trackId provided', () => {
                samplerController.dispose();

                expect(mockMidiSampler.dispose).toHaveBeenCalledTimes(2);
                expect(samplerController.getActiveSamplerIds()).toEqual([]);
            });

            it('should dispose specific sampler when trackId provided', () => {
                samplerController.dispose('track-1');

                expect(mockMidiSampler.dispose).toHaveBeenCalledTimes(1);
                expect(samplerController.hasSampler('track-1')).toBe(false);
                expect(samplerController.hasSampler('track-2')).toBe(true);
            });

            it('should clear all maps when disposing all', () => {
                samplerController.dispose();

                expect(samplerController.getActiveSamplerIds()).toEqual([]);
                expect(consoleLogSpy).toHaveBeenCalledWith('All samplers disposed');
            });
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle multiple rapid initializations', async () => {
            const promises = [
                samplerController.initializeSampler('track-1', mockFile),
                samplerController.initializeSampler('track-1', mockFile),
                samplerController.initializeSampler('track-1', mockFile),
            ];

            await Promise.all(promises);

            // Should only have one sampler for the track
            expect(samplerController.hasSampler('track-1')).toBe(true);
            expect(samplerController.getActiveSamplerIds()).toHaveLength(1);
        });

        it('should handle concurrent operations on different tracks', async () => {
            const promises = [
                samplerController.initializeSampler('track-1', mockFile),
                samplerController.initializeSampler('track-2', mockFile),
                samplerController.initializeSampler('track-3', mockFile),
            ];

            await Promise.all(promises);

            expect(samplerController.getActiveSamplerIds()).toHaveLength(3);
        });

        it('should handle operations on disposed controller gracefully', () => {
            samplerController.dispose();

            // These should not throw
            samplerController.playNote('track-1', 60);
            samplerController.setBaseMidiNote('track-1', 60);
            samplerController.removeSampler('track-1');
        });
    });

    describe('TrackPlayer Interface Implementation', () => {
        it('should implement all required TrackPlayer methods', () => {
            expect(samplerController.play).toBeDefined();
            expect(samplerController.pause).toBeDefined();
            expect(samplerController.stop).toBeDefined();
            expect(samplerController.setTrackVolume).toBeDefined();
            expect(samplerController.setTrackPan).toBeDefined();
            expect(samplerController.setTrackMute).toBeDefined();
            expect(samplerController.setTrackPositionTicks).toBeDefined();
            expect(samplerController.setTrackTrimStartTicks).toBeDefined();
            expect(samplerController.setTrackTrimEndTicks).toBeDefined();
        });

        it('should throw for unimplemented methods', async () => {
            await expect(() => samplerController.setTrackPan('track-1', 0))
                .toThrow('Method not implemented.');
            await expect(() => samplerController.setTrackPositionTicks('track-1', 0))
                .toThrow('Method not implemented.');
            await expect(() => samplerController.setTrackTrimStartTicks('track-1', 0))
                .toThrow('Method not implemented.');
            await expect(() => samplerController.setTrackTrimEndTicks('track-1', 0))
                .toThrow('Method not implemented.');
        });
    });
});

describe('SamplerController Integration Tests', () => {
    let samplerController: SamplerController;
    let mockMidiManager: Partial<MidiManager>;
    let mockFile: File;

    beforeEach(() => {
        vi.clearAllMocks();
        samplerController = new SamplerController();
        
        mockMidiManager = {
            hasTrack: vi.fn().mockReturnValue(true),
            createTrack: vi.fn(),
            subscribeToTrack: vi.fn().mockImplementation((trackId, callback) => {
                // Simulate immediate callback with notes
                const notes = [
                    { id: 1, row: 60, column: 0, length: 4, velocity: 0.8 },
                    { id: 2, row: 64, column: 4, length: 4, velocity: 0.8 },
                    { id: 3, row: 67, column: 8, length: 4, velocity: 0.8 },
                ];
                setTimeout(() => callback(trackId, notes), 0);
                return () => {};
            }),
        };

        mockFile = new File(['audio content'], 'test.wav', { type: 'audio/wav' });
    });

    afterEach(() => {
        samplerController.dispose();
    });

    describe('Full Workflow Tests', () => {
        it('should handle complete track lifecycle', async () => {
            // 1. Connect track to sampler
            await samplerController.connectTrackToSampler(
                'track-1',
                mockFile,
                mockMidiManager as MidiManager,
                60,
                0.1,
                0.1
            );

            // 2. Verify sampler is initialized
            expect(samplerController.hasSampler('track-1')).toBe(true);

            // 3. Play some notes
            samplerController.playNote('track-1', 60);
            samplerController.playNote('track-1', 64);

            // 4. Adjust parameters
            samplerController.setBaseMidiNote('track-1', 48);
            samplerController.setGrainSize('track-1', 0.2);
            samplerController.setOverlap('track-1', 0.15);

            // 5. Control volume and mute
            await samplerController.setTrackVolume('track-1', 50);
            await samplerController.setTrackMute('track-1', true);
            await samplerController.setTrackMute('track-1', false);

            // 6. Transport control
            await samplerController.play(0, 120);
            await samplerController.pause();
            await samplerController.seek(5, 120);
            await samplerController.stop();

            // 7. Clean up
            samplerController.removeSampler('track-1');
            expect(samplerController.hasSampler('track-1')).toBe(false);
        });

        it('should manage multiple tracks independently', async () => {
            // Initialize multiple tracks
            await Promise.all([
                samplerController.connectTrackToSampler('track-1', mockFile, mockMidiManager as MidiManager),
                samplerController.connectTrackToSampler('track-2', mockFile, mockMidiManager as MidiManager),
                samplerController.connectTrackToSampler('track-3', mockFile, mockMidiManager as MidiManager),
            ]);

            // Verify all tracks are initialized
            expect(samplerController.getActiveSamplerIds()).toHaveLength(3);

            // Control tracks independently
            await samplerController.setTrackVolume('track-1', 100);
            await samplerController.setTrackVolume('track-2', 50);
            await samplerController.setTrackVolume('track-3', 25);

            await samplerController.setTrackMute('track-2', true);

            // Play all tracks
            await samplerController.play(0, 120);

            // Remove one track
            samplerController.removeSampler('track-2');
            expect(samplerController.getActiveSamplerIds()).toHaveLength(2);

            // Stop remaining tracks
            await samplerController.stop();

            // Clean up all
            samplerController.dispose();
            expect(samplerController.getActiveSamplerIds()).toHaveLength(0);
        });
    });
});