import { TrackInstance } from '../../../platform/types/dto/project_track';

/**
 * Viewport culling system for instance-based audio
 * Only schedules instances that are near the current playback position
 */
export class ViewportCuller {
    private viewportStartTicks: number = 0;
    private viewportEndTicks: number = 0;
    private cullMarginTicks: number = 1920; // 1 measure buffer on each side
    
    /**
     * Update viewport based on current transport position
     * @param currentTicks Current transport position in ticks
     * @param viewportWidthTicks Width of visible viewport in ticks
     * @param bpm Current BPM for calculating lookahead
     */
    updateViewport(
        currentTicks: number,
        viewportWidthTicks: number,
        bpm: number
    ): void {
        // Add margin for lookahead and smooth playback
        const lookaheadTicks = this.calculateLookaheadTicks(bpm);
        
        this.viewportStartTicks = Math.max(0, currentTicks - this.cullMarginTicks);
        this.viewportEndTicks = currentTicks + viewportWidthTicks + lookaheadTicks + this.cullMarginTicks;
    }
    
    /**
     * Check if an instance is within the active viewport
     * @param instance Track instance to check
     * @returns true if instance should be active
     */
    isInstanceInViewport(instance: TrackInstance): boolean {
        const instanceStart = instance.x_position;
        const instanceEnd = instance.x_position + 
            ((instance.trim_end_ticks || Infinity) - (instance.trim_start_ticks || 0));
        
        // Check if instance overlaps with viewport
        return instanceStart < this.viewportEndTicks && instanceEnd > this.viewportStartTicks;
    }
    
    /**
     * Filter instances to only those in viewport
     * @param instances All instances for a track
     * @returns Instances that should be active
     */
    cullInstances(instances: TrackInstance[]): TrackInstance[] {
        return instances.filter(instance => this.isInstanceInViewport(instance));
    }
    
    /**
     * Get instances that will enter viewport soon
     * Used for preloading
     * @param instances All instances
     * @param preloadMarginTicks How far ahead to look
     * @returns Instances that need preloading
     */
    getInstancesForPreload(
        instances: TrackInstance[],
        preloadMarginTicks: number = 3840 // 2 measures
    ): TrackInstance[] {
        const preloadStart = this.viewportEndTicks;
        const preloadEnd = this.viewportEndTicks + preloadMarginTicks;
        
        return instances.filter(instance => {
            const instanceStart = instance.x_position;
            return instanceStart >= preloadStart && instanceStart < preloadEnd;
        });
    }
    
    /**
     * Calculate lookahead based on BPM
     * Higher BPM needs more lookahead for smooth playback
     */
    private calculateLookaheadTicks(bpm: number): number {
        // Base lookahead of 2 beats, scaled by BPM
        const beatsLookahead = 2 + (bpm / 120); // More lookahead at higher BPMs
        const ticksPerBeat = 480; // Standard MIDI resolution
        return beatsLookahead * ticksPerBeat;
    }
    
    /**
     * Get viewport bounds
     */
    getViewportBounds(): { start: number; end: number } {
        return {
            start: this.viewportStartTicks,
            end: this.viewportEndTicks
        };
    }
    
    /**
     * Set custom cull margin
     */
    setCullMargin(marginTicks: number): void {
        this.cullMarginTicks = marginTicks;
    }
}

/**
 * Instance activation manager
 * Tracks which instances are active and manages activation/deactivation
 */
export class InstanceActivationManager {
    private activeInstances: Set<string> = new Set();
    private activationCallbacks: Map<string, () => void> = new Map();
    private deactivationCallbacks: Map<string, () => void> = new Map();
    
    /**
     * Register callbacks for instance lifecycle
     */
    registerInstance(
        instanceId: string,
        onActivate: () => void,
        onDeactivate: () => void
    ): void {
        this.activationCallbacks.set(instanceId, onActivate);
        this.deactivationCallbacks.set(instanceId, onDeactivate);
    }
    
    /**
     * Unregister instance
     */
    unregisterInstance(instanceId: string): void {
        if (this.activeInstances.has(instanceId)) {
            this.deactivateInstance(instanceId);
        }
        this.activationCallbacks.delete(instanceId);
        this.deactivationCallbacks.delete(instanceId);
    }
    
    /**
     * Activate instance if not already active
     */
    activateInstance(instanceId: string): void {
        if (!this.activeInstances.has(instanceId)) {
            this.activeInstances.add(instanceId);
            const callback = this.activationCallbacks.get(instanceId);
            if (callback) {
                callback();
            }
        }
    }
    
    /**
     * Deactivate instance if active
     */
    deactivateInstance(instanceId: string): void {
        if (this.activeInstances.has(instanceId)) {
            this.activeInstances.delete(instanceId);
            const callback = this.deactivationCallbacks.get(instanceId);
            if (callback) {
                callback();
            }
        }
    }
    
    /**
     * Update active instances based on viewport
     * @param visibleInstanceIds Instance IDs that should be active
     */
    updateActiveInstances(visibleInstanceIds: Set<string>): void {
        // Deactivate instances no longer visible
        const toDeactivate: string[] = [];
        this.activeInstances.forEach(instanceId => {
            if (!visibleInstanceIds.has(instanceId)) {
                toDeactivate.push(instanceId);
            }
        });
        
        toDeactivate.forEach(id => this.deactivateInstance(id));
        
        // Activate newly visible instances
        visibleInstanceIds.forEach(instanceId => {
            this.activateInstance(instanceId);
        });
    }
    
    /**
     * Get active instance count
     */
    getActiveCount(): number {
        return this.activeInstances.size;
    }
    
    /**
     * Get all active instance IDs
     */
    getActiveInstanceIds(): string[] {
        return Array.from(this.activeInstances);
    }
    
    /**
     * Clear all active instances
     */
    clear(): void {
        this.activeInstances.forEach(instanceId => {
            this.deactivateInstance(instanceId);
        });
        this.activeInstances.clear();
    }
}