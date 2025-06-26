/**
 * Performance monitoring for instance-based audio system
 * Tracks resource usage and provides optimization hints
 */
export class PerformanceMonitor {
    private metrics: {
        activeInstances: number;
        totalBuffersLoaded: number;
        bufferMemoryUsage: number;
        scheduledEvents: number;
        cpuUsage: number;
        lastUpdateTime: number;
    } = {
        activeInstances: 0,
        totalBuffersLoaded: 0,
        bufferMemoryUsage: 0,
        scheduledEvents: 0,
        cpuUsage: 0,
        lastUpdateTime: Date.now()
    };
    
    private performanceThresholds = {
        maxActiveInstances: 100,
        maxBufferMemoryMB: 500,
        maxScheduledEvents: 1000,
        maxCpuUsage: 80
    };
    
    private warningCallbacks: Array<(warning: PerformanceWarning) => void> = [];
    
    /**
     * Update active instance count
     */
    updateActiveInstances(count: number): void {
        this.metrics.activeInstances = count;
        
        if (count > this.performanceThresholds.maxActiveInstances) {
            this.emitWarning({
                type: 'high-instance-count',
                message: `Active instances (${count}) exceed recommended maximum (${this.performanceThresholds.maxActiveInstances})`,
                severity: 'warning',
                suggestion: 'Consider implementing instance culling or LOD system'
            });
        }
    }
    
    /**
     * Update buffer memory usage
     */
    updateBufferMemory(bufferCount: number, totalSizeBytes: number): void {
        this.metrics.totalBuffersLoaded = bufferCount;
        this.metrics.bufferMemoryUsage = totalSizeBytes;
        
        const sizeMB = totalSizeBytes / (1024 * 1024);
        if (sizeMB > this.performanceThresholds.maxBufferMemoryMB) {
            this.emitWarning({
                type: 'high-memory-usage',
                message: `Buffer memory usage (${sizeMB.toFixed(2)}MB) exceeds recommended maximum (${this.performanceThresholds.maxBufferMemoryMB}MB)`,
                severity: 'error',
                suggestion: 'Implement more aggressive buffer eviction or use streaming for large files'
            });
        }
    }
    
    /**
     * Update scheduled events count
     */
    updateScheduledEvents(count: number): void {
        this.metrics.scheduledEvents = count;
        
        if (count > this.performanceThresholds.maxScheduledEvents) {
            this.emitWarning({
                type: 'high-event-count',
                message: `Scheduled events (${count}) exceed recommended maximum (${this.performanceThresholds.maxScheduledEvents})`,
                severity: 'warning',
                suggestion: 'Implement event batching or increase lookahead time'
            });
        }
    }
    
    /**
     * Estimate CPU usage (simplified)
     */
    estimateCpuUsage(): void {
        // Simple heuristic based on active instances and events
        const instanceLoad = (this.metrics.activeInstances / this.performanceThresholds.maxActiveInstances) * 40;
        const eventLoad = (this.metrics.scheduledEvents / this.performanceThresholds.maxScheduledEvents) * 30;
        const memoryLoad = (this.metrics.bufferMemoryUsage / (this.performanceThresholds.maxBufferMemoryMB * 1024 * 1024)) * 30;
        
        this.metrics.cpuUsage = Math.min(100, instanceLoad + eventLoad + memoryLoad);
        
        if (this.metrics.cpuUsage > this.performanceThresholds.maxCpuUsage) {
            this.emitWarning({
                type: 'high-cpu-usage',
                message: `Estimated CPU usage (${this.metrics.cpuUsage.toFixed(1)}%) is high`,
                severity: 'error',
                suggestion: 'Reduce active instances or implement quality settings'
            });
        }
    }
    
    /**
     * Get current metrics
     */
    getMetrics(): typeof this.metrics {
        return { ...this.metrics };
    }
    
    /**
     * Get optimization suggestions based on current metrics
     */
    getOptimizationSuggestions(): string[] {
        const suggestions: string[] = [];
        
        if (this.metrics.activeInstances > 50) {
            suggestions.push('Consider implementing viewport culling to reduce active instances');
        }
        
        if (this.metrics.bufferMemoryUsage > 200 * 1024 * 1024) {
            suggestions.push('Implement audio streaming for files larger than 10MB');
        }
        
        if (this.metrics.scheduledEvents > 500) {
            suggestions.push('Increase transport lookahead time to batch more events');
        }
        
        if (this.metrics.cpuUsage > 60) {
            suggestions.push('Add quality settings to reduce processing load on lower-end devices');
        }
        
        return suggestions;
    }
    
    /**
     * Register callback for performance warnings
     */
    onWarning(callback: (warning: PerformanceWarning) => void): () => void {
        this.warningCallbacks.push(callback);
        
        // Return unsubscribe function
        return () => {
            const index = this.warningCallbacks.indexOf(callback);
            if (index > -1) {
                this.warningCallbacks.splice(index, 1);
            }
        };
    }
    
    /**
     * Emit performance warning
     */
    private emitWarning(warning: PerformanceWarning): void {
        console.warn(`[PerformanceMonitor] ${warning.message}`);
        this.warningCallbacks.forEach(cb => cb(warning));
    }
    
    /**
     * Reset all metrics
     */
    reset(): void {
        this.metrics = {
            activeInstances: 0,
            totalBuffersLoaded: 0,
            bufferMemoryUsage: 0,
            scheduledEvents: 0,
            cpuUsage: 0,
            lastUpdateTime: Date.now()
        };
    }
}

/**
 * Performance warning type
 */
export interface PerformanceWarning {
    type: 'high-instance-count' | 'high-memory-usage' | 'high-event-count' | 'high-cpu-usage';
    message: string;
    severity: 'warning' | 'error';
    suggestion: string;
}

/**
 * Global performance monitor instance
 */
let globalMonitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
    if (!globalMonitor) {
        globalMonitor = new PerformanceMonitor();
    }
    return globalMonitor;
}