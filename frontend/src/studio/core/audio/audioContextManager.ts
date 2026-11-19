import * as Tone from 'tone';

class AudioContextManager {
    private _context: AudioContext | null = null;
    private _initializationPromise: Promise<AudioContext> | null = null;

    /**
     * Initializes the AudioContext. Ensures Tone.start() is called (requires user gesture)
     * and necessary AudioWorklet modules are added. Only runs the core logic once.
     * Returns the initialized AudioContext.
     */
    public initialize(): Promise<AudioContext> {
        if (!this._initializationPromise) {
            this._initializationPromise = (async () => {
                console.log("AudioContextManager: Initializing...");
                try {
                    // Ensure Tone.js context is started/resumed (requires user gesture)
                    await Tone.start();
                    console.log("AudioContextManager: Tone.start() successful.");

                    const toneContext = Tone.getContext();
                    const rawCtx = toneContext.rawContext;

                    console.log("AudioContextManager: Tone.js context details", {
                        toneContextType: typeof toneContext,
                        rawContextType: typeof rawCtx,
                        rawContextConstructor: rawCtx.constructor.name,
                        sampleRate: rawCtx.sampleRate,
                        state: rawCtx.state
                    });

                    // Create a fresh AudioContext that matches Tone.js settings
                    // This ensures js-synthesizer gets a proper AudioContext instance
                    this._context = new AudioContext({
                        latencyHint: 'interactive',
                        sampleRate: rawCtx.sampleRate
                    });

                    console.log("AudioContextManager: Created fresh AudioContext", {
                        constructor: this._context.constructor.name,
                        hasDestination: !!this._context.destination,
                        hasAudioWorklet: !!this._context.audioWorklet,
                        state: this._context.state,
                        sampleRate: this._context.sampleRate,
                        isBaseAudioContext: this._context instanceof BaseAudioContext,
                        isAudioContext: this._context instanceof AudioContext
                    });

                    // Resume the new context to ensure it's active
                    if (this._context.state === 'suspended') {
                        await this._context.resume();
                        console.log("AudioContextManager: Fresh context resumed");
                    }

                    // Load required AudioWorklet modules
                    await this.loadWorkletModules();

                    console.log("AudioContextManager: Initialization complete.");
                    return this._context;

                } catch (err) {
                    console.error("AudioContextManager: Initialization failed.", err);
                    this._initializationPromise = null; // Allow retry on next call
                    throw err; // Re-throw the error
                }
            })();
        }
        return this._initializationPromise;
    }

    /**
     * Loads the required AudioWorklet modules for js-synthesizer
     * @throws {Error} If context is not initialized or module loading fails
     * @private
     */
    private async loadWorkletModules(): Promise<void> {
        if (!this._context) {
            throw new Error("AudioContextManager: Context not initialized");
        }

        console.log("AudioContextManager: Adding required AudioWorklet modules...");
        try {
            await this._context.audioWorklet.addModule('/js-synthesizer/libfluidsynth-2.4.6.js');
            await this._context.audioWorklet.addModule('/js-synthesizer/js-synthesizer.worklet.js');
            // Add other worklets if needed here
            console.log("AudioContextManager: AudioWorklet modules added.");
        } catch (error) {
            console.error("AudioContextManager: Failed to load AudioWorklet modules:", error);
            throw error;
        }
    }

    /**
     * Ensures both Tone.js and js-synthesizer audio contexts are resumed and ready for playback.
     * This should be called before any audio playback operations.
     * 
     * @returns Promise that resolves when both contexts are running
     */
    public async ensureContextsResumed(): Promise<void> {
        if (!this._context) {
            throw new Error("AudioContextManager: Context not initialized. Call initialize() first.");
        }

        console.log("AudioContextManager: Ensuring both contexts are resumed...");
        
        try {
            // First ensure Tone.js context is started/resumed
            await Tone.start();
            console.log("AudioContextManager: Tone.js context resumed");

            // Then ensure the js-synthesizer context is also resumed
            // Since we now use separate contexts, we need to resume both
            if (this._context.state === 'suspended') {
                await this._context.resume();
                console.log("AudioContextManager: js-synthesizer context resumed");
            }

            console.log("AudioContextManager: Both contexts are now running", {
                toneState: Tone.getContext().state,
                synthState: this._context.state
            });
        } catch (error) {
            console.error("AudioContextManager: Failed to resume contexts:", error);
            throw error;
        }
    }

    /**
     * Gets the initialized AudioContext. Throws an error if initialize() hasn't been called successfully.
     */
    public getContext(): AudioContext {
        if (!this._context) {
            throw new Error("AudioContextManager: Context not initialized. Call initialize() first.");
        }
        return this._context;
    }

     /**
     * Checks if the audio context has been successfully initialized.
     */
    public isInitialized(): boolean {
        return !!this._context;
    }

    /**
     * Checks if both contexts are in a running state (not suspended)
     */
    public areContextsRunning(): boolean {
        if (!this._context) return false;
        
        const toneContext = Tone.getContext();
        return toneContext.state === 'running' && this._context.state === 'running';
    }
}

// Export a singleton instance
export const audioContextManager = new AudioContextManager(); 