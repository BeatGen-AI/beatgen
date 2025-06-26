import * as Tone from 'tone';

/**
 * Manages shared audio buffers across multiple track instances
 * to avoid memory duplication and improve performance.
 */
export class AudioBufferManager {
  private static instance: AudioBufferManager;
  
  // Map of fileId to buffer data with reference counting
  private buffers: Map<string, {
    buffer: Tone.ToneAudioBuffer;
    refCount: number;
    url: string;
    lastAccessed: number;
  }> = new Map();
  
  // Maximum cache size in bytes (500MB default)
  private readonly maxCacheSize = 500 * 1024 * 1024;
  
  // Track total cache size
  private currentCacheSize = 0;
  
  private constructor() {}
  
  /**
   * Get singleton instance
   */
  public static getInstance(): AudioBufferManager {
    if (!AudioBufferManager.instance) {
      AudioBufferManager.instance = new AudioBufferManager();
    }
    return AudioBufferManager.instance;
  }
  
  /**
   * Get or load an audio buffer for a file
   * @param fileId Unique identifier for the audio file
   * @param url URL or blob URL to load the audio from
   * @returns Shared audio buffer
   */
  async getBuffer(fileId: string, url: string): Promise<Tone.ToneAudioBuffer> {
    // Check if buffer already exists
    const existing = this.buffers.get(fileId);
    if (existing) {
      existing.refCount++;
      existing.lastAccessed = Date.now();
      console.log(`AudioBufferManager: Reusing buffer for ${fileId}, refCount: ${existing.refCount}`);
      return existing.buffer;
    }
    
    // Load new buffer
    console.log(`AudioBufferManager: Loading new buffer for ${fileId}`);
    try {
      const buffer = await Tone.ToneAudioBuffer.load(url);
      
      // Calculate buffer size (approximate)
      const bufferSize = buffer.length * buffer.numberOfChannels * 4; // 32-bit float per sample
      
      // Check cache size and evict if needed
      if (this.currentCacheSize + bufferSize > this.maxCacheSize) {
        this.evictLeastRecentlyUsed(bufferSize);
      }
      
      // Store buffer with metadata
      this.buffers.set(fileId, {
        buffer,
        refCount: 1,
        url,
        lastAccessed: Date.now()
      });
      
      this.currentCacheSize += bufferSize;
      console.log(`AudioBufferManager: Loaded buffer for ${fileId}, cache size: ${this.formatBytes(this.currentCacheSize)}`);
      
      return buffer;
    } catch (error) {
      console.error(`AudioBufferManager: Failed to load buffer for ${fileId}:`, error);
      throw error;
    }
  }
  
  /**
   * Release a reference to a buffer
   * @param fileId File identifier
   */
  releaseBuffer(fileId: string): void {
    const entry = this.buffers.get(fileId);
    if (!entry) {
      console.warn(`AudioBufferManager: Attempting to release non-existent buffer ${fileId}`);
      return;
    }
    
    entry.refCount--;
    console.log(`AudioBufferManager: Released buffer ${fileId}, refCount: ${entry.refCount}`);
    
    // Don't immediately dispose buffers with 0 refs - they might be reused soon
    // The LRU eviction will handle cleanup when cache is full
  }
  
  /**
   * Force disposal of a buffer regardless of reference count
   * @param fileId File identifier
   */
  forceDisposeBuffer(fileId: string): void {
    const entry = this.buffers.get(fileId);
    if (!entry) return;
    
    const bufferSize = entry.buffer.length * entry.buffer.numberOfChannels * 4;
    
    entry.buffer.dispose();
    this.buffers.delete(fileId);
    this.currentCacheSize -= bufferSize;
    
    console.log(`AudioBufferManager: Force disposed buffer ${fileId}, cache size: ${this.formatBytes(this.currentCacheSize)}`);
  }
  
  /**
   * Get buffer reference count
   * @param fileId File identifier
   * @returns Reference count or 0 if not found
   */
  getRefCount(fileId: string): number {
    return this.buffers.get(fileId)?.refCount || 0;
  }
  
  /**
   * Check if a buffer is cached
   * @param fileId File identifier
   */
  hasBuffer(fileId: string): boolean {
    return this.buffers.has(fileId);
  }
  
  /**
   * Evict least recently used buffers to make space
   * @param requiredSpace Space needed in bytes
   */
  private evictLeastRecentlyUsed(requiredSpace: number): void {
    console.log(`AudioBufferManager: Evicting buffers to free ${this.formatBytes(requiredSpace)}`);
    
    // Get buffers with 0 refs sorted by last access time
    const evictableCandidates = Array.from(this.buffers.entries())
      .filter(([_, entry]) => entry.refCount === 0)
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    let freedSpace = 0;
    
    for (const [fileId, entry] of evictableCandidates) {
      if (freedSpace >= requiredSpace) break;
      
      const bufferSize = entry.buffer.length * entry.buffer.numberOfChannels * 4;
      
      entry.buffer.dispose();
      this.buffers.delete(fileId);
      this.currentCacheSize -= bufferSize;
      freedSpace += bufferSize;
      
      console.log(`AudioBufferManager: Evicted buffer ${fileId}, freed ${this.formatBytes(bufferSize)}`);
    }
    
    if (freedSpace < requiredSpace) {
      console.warn(`AudioBufferManager: Could only free ${this.formatBytes(freedSpace)} of required ${this.formatBytes(requiredSpace)}`);
    }
  }
  
  /**
   * Clear all buffers with 0 references
   */
  clearUnusedBuffers(): void {
    let clearedCount = 0;
    let clearedSize = 0;
    
    for (const [fileId, entry] of this.buffers.entries()) {
      if (entry.refCount === 0) {
        const bufferSize = entry.buffer.length * entry.buffer.numberOfChannels * 4;
        
        entry.buffer.dispose();
        this.buffers.delete(fileId);
        this.currentCacheSize -= bufferSize;
        
        clearedCount++;
        clearedSize += bufferSize;
      }
    }
    
    console.log(`AudioBufferManager: Cleared ${clearedCount} unused buffers, freed ${this.formatBytes(clearedSize)}`);
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats() {
    const stats = {
      totalBuffers: this.buffers.size,
      totalSize: this.currentCacheSize,
      maxSize: this.maxCacheSize,
      buffers: Array.from(this.buffers.entries()).map(([fileId, entry]) => ({
        fileId,
        refCount: entry.refCount,
        size: entry.buffer.length * entry.buffer.numberOfChannels * 4,
        lastAccessed: new Date(entry.lastAccessed).toISOString()
      }))
    };
    
    return stats;
  }
  
  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Dispose all buffers and reset
   */
  dispose(): void {
    for (const [fileId, entry] of this.buffers.entries()) {
      entry.buffer.dispose();
    }
    
    this.buffers.clear();
    this.currentCacheSize = 0;
    
    console.log('AudioBufferManager: Disposed all buffers');
  }
}

export default AudioBufferManager;