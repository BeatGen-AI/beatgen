import { AudioWorkletNodeSynthesizer } from 'js-synthesizer';
import { Note } from '../../../../types/note';
import { SequencerWrapper } from './sequencerWrapper';

/**
 * Represents an independently controllable MIDI instance
 */
export interface MidiInstance {
  id: string;
  sequencer: SequencerWrapper;
  channel: number;
  isPlaying: boolean;
  isPaused: boolean;
  startOffset: number; // Offset in ticks when this instance should start
  currentTick: number;
}

/**
 * Enhanced MIDI player that supports independent instance playback.
 * Each instance gets its own sequencer and channel, but shares the synthesizer.
 */
export class EnhancedMidiPlayer {
  private synth: AudioWorkletNodeSynthesizer;
  private audioNode: AudioWorkletNode | null = null;
  private instances: Map<string, MidiInstance> = new Map();
  private channelPool: Set<number> = new Set();
  private bpm: number;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private globalProcessingInterval: ReturnType<typeof setInterval> | null = null;
  private readonly PROCESS_INTERVAL_MS = 10;
  private readonly MAX_CHANNELS = 16;
  
  constructor(bpm: number = 120) {
    this.synth = new AudioWorkletNodeSynthesizer();
    this.bpm = bpm;
    
    // Initialize channel pool (1-15, reserve 0 for special use)
    for (let i = 1; i < this.MAX_CHANNELS; i++) {
      this.channelPool.add(i);
    }
  }
  
  /**
   * Initialize the synthesizer with audio context
   */
  async initialize(audioContext: AudioContext): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    
    this.initPromise = this.performInitialization(audioContext);
    return this.initPromise;
  }
  
  private async performInitialization(audioContext: AudioContext): Promise<void> {
    try {
      console.log('[EnhancedMidiPlayer] Initializing synthesizer...');
      
      // Load worklet module if available
      if (audioContext.audioWorklet) {
        try {
          // The js-synthesizer library expects the worklet to be loaded via audioContext
          await audioContext.audioWorklet.addModule('/js-synthesizer/js-synthesizer.worklet.js');
          console.log('[EnhancedMidiPlayer] Worklet module loaded');
        } catch (workletError) {
          console.warn('[EnhancedMidiPlayer] Failed to load worklet module, continuing without it:', workletError);
        }
      }
      
      // Create audio node - the synthesizer will handle its own initialization
      this.audioNode = this.synth.createAudioNode(audioContext, {
        polyphony: 256
      });
      
      this.audioNode.connect(audioContext.destination);
      this.isInitialized = true;
      
      console.log('[EnhancedMidiPlayer] Synthesizer initialized successfully');
    } catch (error) {
      console.error('[EnhancedMidiPlayer] Failed to initialize:', error);
      this.initPromise = null;
      throw error;
    }
  }
  
  /**
   * Create a new instance with its own sequencer
   */
  async createInstance(
    instanceId: string, 
    notes: Note[], 
    soundfontData: ArrayBuffer
  ): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('EnhancedMidiPlayer not initialized');
    }
    
    // Remove existing instance if it exists
    if (this.instances.has(instanceId)) {
      await this.removeInstance(instanceId);
    }
    
    // Get a free channel
    const channel = this.acquireChannel();
    if (channel === null) {
      throw new Error('No available MIDI channels');
    }
    
    // Load soundfont for this channel
    const sfontId = await this.synth.loadSFont(soundfontData);
    console.log(`[EnhancedMidiPlayer] Loaded soundfont ${sfontId} for instance ${instanceId}`);
    
    // Create sequencer for this instance
    const sequencer = new SequencerWrapper(
      instanceId,
      channel,
      notes,
      this.bpm,
      this.synth
    );
    
    // Initialize the sequencer
    await sequencer.initialize();
    
    // Assign soundfont to channel
    this.synth.sfontBankSelect(0, sfontId, 0);
    this.synth.programChange(0, channel, 0);
    
    // Create instance object
    const instance: MidiInstance = {
      id: instanceId,
      sequencer,
      channel,
      isPlaying: false,
      isPaused: false,
      startOffset: 0,
      currentTick: 0
    };
    
    this.instances.set(instanceId, instance);
    console.log(`[EnhancedMidiPlayer] Created instance ${instanceId} on channel ${channel}`);
  }
  
  /**
   * Play a specific instance
   */
  async playInstance(instanceId: string, offsetTicks: number = 0): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }
    
    if (instance.isPlaying) {
      console.log(`[EnhancedMidiPlayer] Instance ${instanceId} already playing`);
      return;
    }
    
    instance.startOffset = offsetTicks;
    instance.currentTick = offsetTicks;
    instance.isPlaying = true;
    instance.isPaused = false;
    
    // Seek sequencer to offset
    instance.sequencer.seek(offsetTicks);
    
    // Start global processing if not already running
    this.startGlobalProcessing();
    
    console.log(`[EnhancedMidiPlayer] Started instance ${instanceId} at offset ${offsetTicks}`);
  }
  
  /**
   * Pause a specific instance
   */
  pauseInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    instance.isPaused = true;
    instance.isPlaying = false;
    
    // Send all notes off for this channel
    this.synth.allNotesOff(0, instance.channel);
    
    console.log(`[EnhancedMidiPlayer] Paused instance ${instanceId}`);
  }
  
  /**
   * Stop a specific instance
   */
  stopInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    instance.isPlaying = false;
    instance.isPaused = false;
    instance.currentTick = 0;
    
    // Send all notes off for this channel
    this.synth.allNotesOff(0, instance.channel);
    
    // Reset sequencer
    instance.sequencer.seek(0);
    
    console.log(`[EnhancedMidiPlayer] Stopped instance ${instanceId}`);
    
    // Check if we should stop global processing
    this.checkStopGlobalProcessing();
  }
  
  /**
   * Seek an instance to a specific position
   */
  seekInstance(instanceId: string, offsetTicks: number): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    instance.currentTick = offsetTicks;
    instance.sequencer.seek(offsetTicks);
    
    // Clear any playing notes
    this.synth.allNotesOff(0, instance.channel);
    
    console.log(`[EnhancedMidiPlayer] Seeked instance ${instanceId} to ${offsetTicks}`);
  }
  
  /**
   * Set volume for an instance
   */
  setInstanceVolume(instanceId: string, volume: number): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    // Convert 0-100 to 0-127 MIDI range
    const midiVolume = Math.round((volume / 100) * 127);
    this.synth.cc(0, instance.channel, 7, midiVolume); // CC 7 is volume
  }
  
  /**
   * Mute/unmute an instance
   */
  muteInstance(instanceId: string, muted: boolean): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    if (muted) {
      this.synth.cc(0, instance.channel, 7, 0); // Set volume to 0
    } else {
      this.synth.cc(0, instance.channel, 7, 100); // Restore volume
    }
  }
  
  /**
   * Remove an instance and free its resources
   */
  async removeInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;
    
    // Stop playback
    this.stopInstance(instanceId);
    
    // Release channel
    this.releaseChannel(instance.channel);
    
    // Dispose sequencer
    instance.sequencer.dispose();
    
    // Remove from map
    this.instances.delete(instanceId);
    
    console.log(`[EnhancedMidiPlayer] Removed instance ${instanceId}`);
  }
  
  /**
   * Start global processing loop
   */
  private startGlobalProcessing(): void {
    if (this.globalProcessingInterval) return;
    
    this.globalProcessingInterval = setInterval(() => {
      this.processAllInstances();
    }, this.PROCESS_INTERVAL_MS);
    
    console.log('[EnhancedMidiPlayer] Started global processing');
  }
  
  /**
   * Process all active instances
   */
  private processAllInstances(): void {
    const ticksPerInterval = this.calculateTicksPerInterval();
    
    for (const instance of this.instances.values()) {
      if (!instance.isPlaying || instance.isPaused) continue;
      
      // Advance this instance's tick
      instance.currentTick += ticksPerInterval;
      
      // Process the sequencer at this tick
      instance.sequencer.processTo(instance.currentTick);
    }
  }
  
  /**
   * Check if we should stop global processing
   */
  private checkStopGlobalProcessing(): void {
    // Check if any instances are still playing
    const hasActiveInstances = Array.from(this.instances.values())
      .some(inst => inst.isPlaying);
    
    if (!hasActiveInstances && this.globalProcessingInterval) {
      clearInterval(this.globalProcessingInterval);
      this.globalProcessingInterval = null;
      console.log('[EnhancedMidiPlayer] Stopped global processing');
    }
  }
  
  /**
   * Calculate ticks per processing interval
   */
  private calculateTicksPerInterval(): number {
    const beatsPerMinute = this.bpm;
    const beatsPerSecond = beatsPerMinute / 60;
    const ticksPerBeat = 480; // Standard MIDI PPQ
    const ticksPerSecond = beatsPerSecond * ticksPerBeat;
    const ticksPerMs = ticksPerSecond / 1000;
    return ticksPerMs * this.PROCESS_INTERVAL_MS;
  }
  
  /**
   * Acquire a free MIDI channel
   */
  private acquireChannel(): number | null {
    if (this.channelPool.size === 0) return null;
    
    const channel = this.channelPool.values().next().value;
    this.channelPool.delete(channel);
    return channel;
  }
  
  /**
   * Release a MIDI channel back to the pool
   */
  private releaseChannel(channel: number): void {
    this.channelPool.add(channel);
  }
  
  /**
   * Set global BPM
   */
  setBpm(bpm: number): void {
    this.bpm = bpm;
    
    // Update all sequencers
    for (const instance of this.instances.values()) {
      instance.sequencer.setBPM(bpm);
    }
  }
  
  /**
   * Get all active instance IDs
   */
  getActiveInstanceIds(): string[] {
    return Array.from(this.instances.keys());
  }
  
  /**
   * Check if an instance is playing
   */
  isInstancePlaying(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    return instance?.isPlaying || false;
  }
  
  /**
   * Dispose of all resources
   */
  dispose(): void {
    // Stop all instances
    for (const instanceId of this.instances.keys()) {
      this.stopInstance(instanceId);
    }
    
    // Clear processing interval
    if (this.globalProcessingInterval) {
      clearInterval(this.globalProcessingInterval);
      this.globalProcessingInterval = null;
    }
    
    // Dispose audio node
    if (this.audioNode) {
      this.audioNode.disconnect();
      this.audioNode = null;
    }
    
    // Clear instances
    this.instances.clear();
    
    console.log('[EnhancedMidiPlayer] Disposed');
  }
}