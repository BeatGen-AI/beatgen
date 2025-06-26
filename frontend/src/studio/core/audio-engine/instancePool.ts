import * as Tone from 'tone';
import { InstancePlayer } from './instancePlayer';
import { AudioBufferManager } from './audioBufferManager';

/**
 * Object pool for instance players to reduce GC pressure
 * Reuses player instances instead of creating new ones
 */
export class InstancePlayerPool {
    private availablePlayers: InstancePlayer[] = [];
    private activePlayers: Map<string, InstancePlayer> = new Map();
    private bufferManager: AudioBufferManager;
    private maxPoolSize: number = 50;
    
    constructor() {
        this.bufferManager = AudioBufferManager.getInstance();
    }
    
    /**
     * Get a player from the pool or create a new one
     */
    async acquire(
        instanceId: string,
        trackId: string,
        fileId: string,
        buffer: Tone.ToneAudioBuffer,
        channel: Tone.Channel
    ): Promise<InstancePlayer> {
        let player: InstancePlayer;
        
        // Check if we have an available player in the pool
        if (this.availablePlayers.length > 0) {
            player = this.availablePlayers.pop()!;
            // Reinitialize with new data
            await player.reinitialize(instanceId, trackId, fileId, buffer, channel);
        } else {
            // Create new player
            player = new InstancePlayer(instanceId, trackId, fileId, buffer, channel);
        }
        
        // Track active player
        this.activePlayers.set(instanceId, player);
        
        return player;
    }
    
    /**
     * Return a player to the pool
     */
    release(instanceId: string): void {
        const player = this.activePlayers.get(instanceId);
        if (!player) return;
        
        // Remove from active
        this.activePlayers.delete(instanceId);
        
        // Reset player state
        player.reset();
        
        // Add to pool if not at capacity
        if (this.availablePlayers.length < this.maxPoolSize) {
            this.availablePlayers.push(player);
        } else {
            // Dispose if pool is full
            player.dispose();
        }
    }
    
    /**
     * Get active player by instance ID
     */
    getPlayer(instanceId: string): InstancePlayer | undefined {
        return this.activePlayers.get(instanceId);
    }
    
    /**
     * Release all players for a track
     */
    releaseTrack(trackId: string): void {
        const instancesToRelease: string[] = [];
        
        // Find all instances for this track
        this.activePlayers.forEach((player, instanceId) => {
            if (player.getTrackId() === trackId) {
                instancesToRelease.push(instanceId);
            }
        });
        
        // Release them
        instancesToRelease.forEach(instanceId => {
            this.release(instanceId);
        });
    }
    
    /**
     * Clear the pool and dispose all players
     */
    dispose(): void {
        // Dispose active players
        this.activePlayers.forEach(player => {
            player.dispose();
        });
        this.activePlayers.clear();
        
        // Dispose pooled players
        this.availablePlayers.forEach(player => {
            player.dispose();
        });
        this.availablePlayers = [];
    }
    
    /**
     * Get pool statistics
     */
    getStats(): { active: number; available: number; total: number } {
        return {
            active: this.activePlayers.size,
            available: this.availablePlayers.length,
            total: this.activePlayers.size + this.availablePlayers.length
        };
    }
}

/**
 * Global instance player pool
 */
let globalPool: InstancePlayerPool | null = null;

export function getInstancePlayerPool(): InstancePlayerPool {
    if (!globalPool) {
        globalPool = new InstancePlayerPool();
    }
    return globalPool;
}