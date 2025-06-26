import { TrackInstance } from '../../../platform/types/dto/project_track';
import { AudioEngineError, AudioEngineErrorType } from './errorHandler';

/**
 * Validation rules for audio engine operations
 */
export class AudioEngineValidator {
    /**
     * Validate track instance
     */
    static validateInstance(instance: TrackInstance): void {
        if (!instance.id) {
            throw new AudioEngineError(
                AudioEngineErrorType.INVALID_CONFIGURATION,
                'Instance must have an ID',
                { details: { instance } }
            );
        }
        
        if (instance.x_position < 0) {
            throw new AudioEngineError(
                AudioEngineErrorType.INVALID_CONFIGURATION,
                'Instance position cannot be negative',
                { instanceId: instance.id, details: { position: instance.x_position } }
            );
        }
        
        if (instance.trim_start_ticks !== undefined && instance.trim_end_ticks !== undefined) {
            if (instance.trim_start_ticks > instance.trim_end_ticks) {
                throw new AudioEngineError(
                    AudioEngineErrorType.INVALID_CONFIGURATION,
                    'Instance trim start cannot be after trim end',
                    { 
                        instanceId: instance.id, 
                        details: { 
                            trimStart: instance.trim_start_ticks,
                            trimEnd: instance.trim_end_ticks
                        }
                    }
                );
            }
        }
    }
    
    /**
     * Validate file for loading
     */
    static validateAudioFile(file: File): void {
        const validTypes = [
            'audio/mp3',
            'audio/mpeg',
            'audio/wav',
            'audio/wave',
            'audio/ogg',
            'audio/flac',
            'audio/m4a',
            'audio/mp4'
        ];
        
        if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|flac|m4a)$/i)) {
            throw new AudioEngineError(
                AudioEngineErrorType.INVALID_CONFIGURATION,
                `Unsupported audio file type: ${file.type || 'unknown'}`,
                { details: { fileName: file.name, fileType: file.type } }
            );
        }
        
        // Check file size (max 100MB)
        const maxSize = 100 * 1024 * 1024;
        if (file.size > maxSize) {
            throw new AudioEngineError(
                AudioEngineErrorType.INVALID_CONFIGURATION,
                `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB (max 100MB)`,
                { details: { fileName: file.name, fileSize: file.size } }
            );
        }
    }
    
    /**
     * Validate BPM
     */
    static validateBPM(bpm: number): void {
        if (bpm < 20 || bpm > 999) {
            throw new AudioEngineError(
                AudioEngineErrorType.INVALID_CONFIGURATION,
                `Invalid BPM: ${bpm} (must be between 20 and 999)`,
                { details: { bpm } }
            );
        }
    }
    
    /**
     * Validate time signature
     */
    static validateTimeSignature(numerator: number, denominator: number): void {
        const validNumerators = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
        const validDenominators = [1, 2, 4, 8, 16, 32];
        
        if (!validNumerators.includes(numerator)) {
            throw new AudioEngineError(
                AudioEngineErrorType.INVALID_CONFIGURATION,
                `Invalid time signature numerator: ${numerator}`,
                { details: { numerator, denominator } }
            );
        }
        
        if (!validDenominators.includes(denominator)) {
            throw new AudioEngineError(
                AudioEngineErrorType.INVALID_CONFIGURATION,
                `Invalid time signature denominator: ${denominator}`,
                { details: { numerator, denominator } }
            );
        }
    }
    
    /**
     * Validate track ID exists
     */
    static validateTrackExists(trackId: string, trackIds: Set<string>): void {
        if (!trackIds.has(trackId)) {
            throw new AudioEngineError(
                AudioEngineErrorType.TRACK_NOT_FOUND,
                `Track not found: ${trackId}`,
                { trackId }
            );
        }
    }
    
    /**
     * Validate instance exists
     */
    static validateInstanceExists(
        instanceId: string, 
        trackId: string,
        instances: Map<string, any>
    ): void {
        if (!instances.has(instanceId)) {
            throw new AudioEngineError(
                AudioEngineErrorType.INSTANCE_NOT_FOUND,
                `Instance not found: ${instanceId}`,
                { trackId, instanceId }
            );
        }
    }
    
    /**
     * Validate audio parameter
     */
    static validateAudioParameter(name: string, value: number, min: number, max: number): void {
        if (value < min || value > max) {
            throw new AudioEngineError(
                AudioEngineErrorType.INVALID_CONFIGURATION,
                `Invalid ${name}: ${value} (must be between ${min} and ${max})`,
                { details: { parameter: name, value, min, max } }
            );
        }
    }
    
    /**
     * Validate volume (0-100)
     */
    static validateVolume(volume: number): void {
        this.validateAudioParameter('volume', volume, 0, 100);
    }
    
    /**
     * Validate pan (-100 to 100)
     */
    static validatePan(pan: number): void {
        this.validateAudioParameter('pan', pan, -100, 100);
    }
    
    /**
     * Validate position in ticks
     */
    static validatePosition(positionTicks: number, maxTicks?: number): void {
        if (positionTicks < 0) {
            throw new AudioEngineError(
                AudioEngineErrorType.INVALID_CONFIGURATION,
                `Invalid position: ${positionTicks} (cannot be negative)`,
                { details: { position: positionTicks } }
            );
        }
        
        if (maxTicks !== undefined && positionTicks > maxTicks) {
            throw new AudioEngineError(
                AudioEngineErrorType.INVALID_CONFIGURATION,
                `Invalid position: ${positionTicks} (exceeds maximum ${maxTicks})`,
                { details: { position: positionTicks, max: maxTicks } }
            );
        }
    }
    
    /**
     * Validate MIDI note number (0-127)
     */
    static validateMidiNote(note: number): void {
        if (!Number.isInteger(note) || note < 0 || note > 127) {
            throw new AudioEngineError(
                AudioEngineErrorType.INVALID_CONFIGURATION,
                `Invalid MIDI note: ${note} (must be 0-127)`,
                { details: { note } }
            );
        }
    }
    
    /**
     * Validate instance array
     */
    static validateInstances(instances: TrackInstance[]): void {
        if (!Array.isArray(instances)) {
            throw new AudioEngineError(
                AudioEngineErrorType.INVALID_CONFIGURATION,
                'Instances must be an array',
                { details: { instances } }
            );
        }
        
        // Check for duplicate IDs
        const ids = new Set<string>();
        for (const instance of instances) {
            if (ids.has(instance.id)) {
                throw new AudioEngineError(
                    AudioEngineErrorType.INVALID_CONFIGURATION,
                    `Duplicate instance ID: ${instance.id}`,
                    { details: { duplicateId: instance.id } }
                );
            }
            ids.add(instance.id);
            
            // Validate each instance
            this.validateInstance(instance);
        }
    }
}

/**
 * Validation decorator for methods
 */
export function validateParams(validations: Array<(args: any[]) => void>) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = function (...args: any[]) {
            // Run validations
            for (const validation of validations) {
                validation(args);
            }
            
            // Call original method
            return originalMethod.apply(this, args);
        };
        
        return descriptor;
    };
}