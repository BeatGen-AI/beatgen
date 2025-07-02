/**
 * Performance monitoring utilities for the audio engine
 * Use these during development to track performance metrics
 */

export interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  unit: 'ms' | 'MB' | 'count' | 'fps';
}

export interface PerformanceReport {
  metrics: PerformanceMetric[];
  summary: {
    [key: string]: {
      avg: number;
      min: number;
      max: number;
      p50: number;
      p95: number;
      p99: number;
      count: number;
    };
  };
}

export class AudioEnginePerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private frameTimestamps: number[] = [];
  private lastFrameTime: number = 0;
  private enabled: boolean = false;
  private maxMetrics: number = 10000; // Limit memory usage

  constructor(enabled: boolean = process.env.NODE_ENV === 'development') {
    this.enabled = enabled;
    if (this.enabled) {
      this.startFPSMonitoring();
    }
  }

  /**
   * Record a performance metric
   */
  record(name: string, value: number, unit: PerformanceMetric['unit'] = 'ms'): void {
    if (!this.enabled) return;

    this.metrics.push({
      name,
      value,
      timestamp: performance.now(),
      unit
    });

    // Prevent unbounded growth
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics / 2);
    }
  }

  /**
   * Measure the duration of an operation
   */
  async measure<T>(name: string, operation: () => T | Promise<T>): Promise<T> {
    if (!this.enabled) return operation();

    const start = performance.now();
    try {
      const result = await operation();
      const duration = performance.now() - start;
      this.record(name, duration, 'ms');
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.record(`${name}_error`, duration, 'ms');
      throw error;
    }
  }

  /**
   * Measure memory usage
   */
  recordMemoryUsage(label: string = 'memory'): void {
    if (!this.enabled) return;

    const memory = this.getMemoryUsage();
    if (memory) {
      this.record(label, memory / 1024 / 1024, 'MB');
    }
  }

  /**
   * Start monitoring FPS
   */
  private startFPSMonitoring(): void {
    const measureFPS = (timestamp: number) => {
      if (!this.enabled) return;

      if (this.lastFrameTime) {
        const delta = timestamp - this.lastFrameTime;
        this.frameTimestamps.push(delta);

        // Keep only last 60 frames
        if (this.frameTimestamps.length > 60) {
          this.frameTimestamps.shift();
        }

        // Calculate FPS every second
        if (this.frameTimestamps.length === 60) {
          const avgDelta = this.frameTimestamps.reduce((a, b) => a + b, 0) / this.frameTimestamps.length;
          const fps = 1000 / avgDelta;
          this.record('fps', fps, 'fps');
        }
      }

      this.lastFrameTime = timestamp;
      requestAnimationFrame(measureFPS);
    };

    requestAnimationFrame(measureFPS);
  }

  /**
   * Get memory usage in bytes
   */
  private getMemoryUsage(): number | undefined {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    if (typeof window !== 'undefined' && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return undefined;
  }

  /**
   * Generate a performance report
   */
  generateReport(since?: number): PerformanceReport {
    const relevantMetrics = since 
      ? this.metrics.filter(m => m.timestamp >= since)
      : this.metrics;

    const grouped = relevantMetrics.reduce((acc, metric) => {
      if (!acc[metric.name]) {
        acc[metric.name] = [];
      }
      acc[metric.name].push(metric);
      return acc;
    }, {} as { [key: string]: PerformanceMetric[] });

    const summary: PerformanceReport['summary'] = {};

    Object.entries(grouped).forEach(([name, metrics]) => {
      const values = metrics.map(m => m.value).sort((a, b) => a - b);
      const count = values.length;

      if (count === 0) return;

      summary[name] = {
        avg: values.reduce((a, b) => a + b, 0) / count,
        min: values[0],
        max: values[count - 1],
        p50: values[Math.floor(count * 0.5)],
        p95: values[Math.floor(count * 0.95)],
        p99: values[Math.floor(count * 0.99)],
        count
      };
    });

    return {
      metrics: relevantMetrics,
      summary
    };
  }

  /**
   * Log performance summary to console
   */
  logSummary(since?: number): void {
    if (!this.enabled) return;

    const report = this.generateReport(since);
    
    console.group('🎵 Audio Engine Performance Summary');
    
    Object.entries(report.summary).forEach(([name, stats]) => {
      console.log(
        `${name}: avg=${stats.avg.toFixed(2)}, p95=${stats.p95.toFixed(2)}, max=${stats.max.toFixed(2)} (n=${stats.count})`
      );
    });
    
    console.groupEnd();
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = [];
    this.frameTimestamps = [];
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled && this.frameTimestamps.length === 0) {
      this.startFPSMonitoring();
    }
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(): string {
    return JSON.stringify(this.metrics, null, 2);
  }

  /**
   * Create a performance mark for browser DevTools
   */
  mark(name: string): void {
    if (!this.enabled || typeof window === 'undefined') return;
    
    try {
      performance.mark(`audio-engine-${name}`);
    } catch (e) {
      // Ignore errors in environments that don't support performance.mark
    }
  }

  /**
   * Measure between two marks
   */
  measureMark(name: string, startMark: string, endMark: string): void {
    if (!this.enabled || typeof window === 'undefined') return;
    
    try {
      performance.measure(
        `audio-engine-${name}`,
        `audio-engine-${startMark}`,
        `audio-engine-${endMark}`
      );
      
      const measure = performance.getEntriesByName(`audio-engine-${name}`)[0];
      if (measure) {
        this.record(name, measure.duration, 'ms');
      }
    } catch (e) {
      // Ignore errors
    }
  }
}

// Singleton instance for global monitoring
let globalMonitor: AudioEnginePerformanceMonitor | null = null;

export function getGlobalPerformanceMonitor(): AudioEnginePerformanceMonitor {
  if (!globalMonitor) {
    globalMonitor = new AudioEnginePerformanceMonitor();
  }
  return globalMonitor;
}

// Decorator for automatic performance monitoring
export function monitored(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  const monitor = getGlobalPerformanceMonitor();

  descriptor.value = async function (...args: any[]) {
    return monitor.measure(`${target.constructor.name}.${propertyKey}`, () => {
      return originalMethod.apply(this, args);
    });
  };

  return descriptor;
}

// React hook for performance monitoring
export function usePerformanceMonitor(componentName: string) {
  const monitor = getGlobalPerformanceMonitor();
  
  // Measure render time
  const renderStart = performance.now();
  
  // Use effect to measure after render
  if (typeof window !== 'undefined') {
    requestAnimationFrame(() => {
      const renderDuration = performance.now() - renderStart;
      monitor.record(`${componentName}_render`, renderDuration, 'ms');
    });
  }
  
  return {
    measure: (operation: string, fn: () => any) => {
      return monitor.measure(`${componentName}_${operation}`, fn);
    },
    record: (metric: string, value: number, unit?: PerformanceMetric['unit']) => {
      monitor.record(`${componentName}_${metric}`, value, unit);
    }
  };
}

// Performance assertions for tests
export class PerformanceAssertions {
  static assertDuration(
    operation: () => void | Promise<void>,
    maxDuration: number,
    message?: string
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const start = performance.now();
      try {
        await operation();
        const duration = performance.now() - start;
        
        if (duration > maxDuration) {
          reject(new Error(
            message || `Operation took ${duration.toFixed(2)}ms, expected less than ${maxDuration}ms`
          ));
        } else {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  static async assertMemoryUsage(
    operation: () => void | Promise<void>,
    maxMemoryIncreaseMB: number,
    message?: string
  ): Promise<void> {
    // Force GC if available
    if (global.gc) {
      global.gc();
    }
    
    const monitor = new AudioEnginePerformanceMonitor(true);
    const memoryBefore = monitor['getMemoryUsage']() || 0;
    
    await operation();
    
    // Force GC again
    if (global.gc) {
      global.gc();
    }
    
    const memoryAfter = monitor['getMemoryUsage']() || 0;
    const memoryIncreaseMB = (memoryAfter - memoryBefore) / 1024 / 1024;
    
    if (memoryIncreaseMB > maxMemoryIncreaseMB) {
      throw new Error(
        message || `Memory increased by ${memoryIncreaseMB.toFixed(2)}MB, expected less than ${maxMemoryIncreaseMB}MB`
      );
    }
  }

  static async assertFPS(
    operation: () => void | Promise<void>,
    minFPS: number,
    duration: number = 1000,
    message?: string
  ): Promise<void> {
    const frames: number[] = [];
    let lastTime = performance.now();
    let running = true;
    
    const measureFrames = () => {
      if (!running) return;
      
      const now = performance.now();
      const delta = now - lastTime;
      frames.push(delta);
      lastTime = now;
      
      requestAnimationFrame(measureFrames);
    };
    
    measureFrames();
    
    // Run operation
    const operationPromise = operation();
    
    // Measure for specified duration
    await new Promise(resolve => setTimeout(resolve, duration));
    running = false;
    
    await operationPromise;
    
    // Calculate average FPS
    const avgDelta = frames.reduce((a, b) => a + b, 0) / frames.length;
    const avgFPS = 1000 / avgDelta;
    
    if (avgFPS < minFPS) {
      throw new Error(
        message || `Average FPS was ${avgFPS.toFixed(2)}, expected at least ${minFPS}`
      );
    }
  }
}