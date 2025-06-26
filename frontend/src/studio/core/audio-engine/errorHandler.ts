/**
 * Error types for the instance-based audio system
 */
export enum AudioEngineErrorType {
    BUFFER_LOAD_FAILED = 'BUFFER_LOAD_FAILED',
    INSTANCE_NOT_FOUND = 'INSTANCE_NOT_FOUND',
    TRACK_NOT_FOUND = 'TRACK_NOT_FOUND',
    PLAYBACK_FAILED = 'PLAYBACK_FAILED',
    SYNC_FAILED = 'SYNC_FAILED',
    INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
    RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
    INVALID_CONFIGURATION = 'INVALID_CONFIGURATION'
}

/**
 * Custom error class for audio engine errors
 */
export class AudioEngineError extends Error {
    public readonly type: AudioEngineErrorType;
    public readonly trackId?: string;
    public readonly instanceId?: string;
    public readonly details?: any;
    public readonly recoverable: boolean;
    
    constructor(
        type: AudioEngineErrorType,
        message: string,
        options?: {
            trackId?: string;
            instanceId?: string;
            details?: any;
            recoverable?: boolean;
            cause?: Error;
        }
    ) {
        super(message);
        this.name = 'AudioEngineError';
        this.type = type;
        this.trackId = options?.trackId;
        this.instanceId = options?.instanceId;
        this.details = options?.details;
        this.recoverable = options?.recoverable ?? true;
        
        // Set cause if provided
        if (options?.cause) {
            (this as any).cause = options.cause;
        }
    }
}

/**
 * Error recovery strategies
 */
export interface ErrorRecoveryStrategy {
    canRecover(error: AudioEngineError): boolean;
    recover(error: AudioEngineError): Promise<void>;
}

/**
 * Buffer load recovery strategy
 */
export class BufferLoadRecoveryStrategy implements ErrorRecoveryStrategy {
    private retryAttempts: Map<string, number> = new Map();
    private maxRetries: number = 3;
    
    canRecover(error: AudioEngineError): boolean {
        if (error.type !== AudioEngineErrorType.BUFFER_LOAD_FAILED) return false;
        
        const fileId = error.details?.fileId;
        if (!fileId) return false;
        
        const attempts = this.retryAttempts.get(fileId) || 0;
        return attempts < this.maxRetries;
    }
    
    async recover(error: AudioEngineError): Promise<void> {
        const fileId = error.details?.fileId;
        const url = error.details?.url;
        
        if (!fileId || !url) {
            throw new Error('Cannot recover: missing file information');
        }
        
        const attempts = this.retryAttempts.get(fileId) || 0;
        this.retryAttempts.set(fileId, attempts + 1);
        
        console.log(`Retrying buffer load for ${fileId}, attempt ${attempts + 1}/${this.maxRetries}`);
        
        // Implement exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempts), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Recovery logic would go here - retry loading the buffer
        // This would typically call back into the AudioBufferManager
    }
    
    reset(): void {
        this.retryAttempts.clear();
    }
}

/**
 * Playback recovery strategy
 */
export class PlaybackRecoveryStrategy implements ErrorRecoveryStrategy {
    canRecover(error: AudioEngineError): boolean {
        return error.type === AudioEngineErrorType.PLAYBACK_FAILED && error.recoverable;
    }
    
    async recover(error: AudioEngineError): Promise<void> {
        console.log(`Attempting to recover playback for track ${error.trackId}, instance ${error.instanceId}`);
        
        // Recovery strategies:
        // 1. Stop and restart the specific instance
        // 2. Reinitialize the player
        // 3. Clear scheduled events and reschedule
        
        // This would typically interact with the transport controller
    }
}

/**
 * Central error handler for the audio engine
 */
export class AudioEngineErrorHandler {
    private errorCallbacks: Array<(error: AudioEngineError) => void> = [];
    private recoveryStrategies: ErrorRecoveryStrategy[] = [];
    private errorLog: AudioEngineError[] = [];
    private maxErrorLogSize: number = 100;
    
    constructor() {
        // Register default recovery strategies
        this.recoveryStrategies.push(new BufferLoadRecoveryStrategy());
        this.recoveryStrategies.push(new PlaybackRecoveryStrategy());
    }
    
    /**
     * Handle an error
     */
    async handleError(error: AudioEngineError): Promise<void> {
        // Log the error
        this.logError(error);
        
        // Notify callbacks
        this.notifyError(error);
        
        // Attempt recovery if possible
        if (error.recoverable) {
            await this.attemptRecovery(error);
        }
    }
    
    /**
     * Create and handle an error
     */
    async createAndHandleError(
        type: AudioEngineErrorType,
        message: string,
        options?: {
            trackId?: string;
            instanceId?: string;
            details?: any;
            recoverable?: boolean;
            cause?: Error;
        }
    ): Promise<void> {
        const error = new AudioEngineError(type, message, options);
        await this.handleError(error);
    }
    
    /**
     * Register error callback
     */
    onError(callback: (error: AudioEngineError) => void): () => void {
        this.errorCallbacks.push(callback);
        
        // Return unsubscribe function
        return () => {
            const index = this.errorCallbacks.indexOf(callback);
            if (index > -1) {
                this.errorCallbacks.splice(index, 1);
            }
        };
    }
    
    /**
     * Add custom recovery strategy
     */
    addRecoveryStrategy(strategy: ErrorRecoveryStrategy): void {
        this.recoveryStrategies.push(strategy);
    }
    
    /**
     * Get error log
     */
    getErrorLog(): AudioEngineError[] {
        return [...this.errorLog];
    }
    
    /**
     * Get errors by type
     */
    getErrorsByType(type: AudioEngineErrorType): AudioEngineError[] {
        return this.errorLog.filter(error => error.type === type);
    }
    
    /**
     * Clear error log
     */
    clearErrorLog(): void {
        this.errorLog = [];
    }
    
    /**
     * Log error
     */
    private logError(error: AudioEngineError): void {
        this.errorLog.push(error);
        
        // Maintain log size
        if (this.errorLog.length > this.maxErrorLogSize) {
            this.errorLog.shift();
        }
        
        // Console logging
        console.error(`[AudioEngine] ${error.type}: ${error.message}`, {
            trackId: error.trackId,
            instanceId: error.instanceId,
            details: error.details
        });
    }
    
    /**
     * Notify error callbacks
     */
    private notifyError(error: AudioEngineError): void {
        this.errorCallbacks.forEach(callback => {
            try {
                callback(error);
            } catch (e) {
                console.error('Error in error callback:', e);
            }
        });
    }
    
    /**
     * Attempt recovery
     */
    private async attemptRecovery(error: AudioEngineError): Promise<void> {
        for (const strategy of this.recoveryStrategies) {
            if (strategy.canRecover(error)) {
                try {
                    await strategy.recover(error);
                    console.log(`Successfully recovered from ${error.type}`);
                    return;
                } catch (recoveryError) {
                    console.error(`Recovery failed for ${error.type}:`, recoveryError);
                }
            }
        }
        
        console.warn(`No recovery strategy available for ${error.type}`);
    }
}

/**
 * Global error handler instance
 */
let globalErrorHandler: AudioEngineErrorHandler | null = null;

export function getAudioEngineErrorHandler(): AudioEngineErrorHandler {
    if (!globalErrorHandler) {
        globalErrorHandler = new AudioEngineErrorHandler();
    }
    return globalErrorHandler;
}

/**
 * Error boundary wrapper for async operations
 */
export async function withErrorHandling<T>(
    operation: () => Promise<T>,
    context: {
        type: AudioEngineErrorType;
        message: string;
        trackId?: string;
        instanceId?: string;
        recoverable?: boolean;
    }
): Promise<T | null> {
    try {
        return await operation();
    } catch (error) {
        const errorHandler = getAudioEngineErrorHandler();
        await errorHandler.createAndHandleError(
            context.type,
            context.message,
            {
                trackId: context.trackId,
                instanceId: context.instanceId,
                recoverable: context.recoverable ?? true,
                cause: error as Error,
                details: { originalError: error }
            }
        );
        return null;
    }
}