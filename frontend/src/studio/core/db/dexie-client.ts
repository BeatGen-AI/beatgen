import Dexie, { Table } from 'dexie';

// Interface for audio file entries
export interface AudioFile {
    id: string;
    name: string;
    data: Blob;
    type: string;
    size: number;
    duration?: number;
    sampleRate?: number;
    format?: string;
    createdAt: Date;
    updatedAt: Date;
    tags?: string[];
}
// Interface for Soundfont entries
export interface SoundfontFile {
    id: string;           // Use the ID from the API
    name: string;         // Internal name
    displayName: string;  // User-friendly name to display
    category: string;     // Instrument category
    data: ArrayBuffer;    // The actual soundfont data
    dateAdded: Date;      // When it was added to the DB
    size: number;         // Size in bytes
    storage_key?: string; // Storage key for the soundfont (for persistent references)
}

// Database class
export class BeatGenDB extends Dexie {
    audioFiles!: Table<AudioFile, string>;
    soundfonts!: Table<SoundfontFile, string>; // Primary key is the string ID

    constructor() {
        super('BeatGenDB');

        this.version(1).stores({
            audioFiles: 'id, name, type',
            soundfonts: 'id, name, category'
        });

        // Log database open
        console.log('🗄️ Database initialized:', this.name);
    }

    private logOperation(operation: string, details: any) {
        const timestamp = new Date().toISOString();
        console.log(`🗄️ [${timestamp}] ${operation}:`, details);
    }

    private async logDbState() {
        const audioFiles = await this.audioFiles.toArray();
        const soundfonts = await this.soundfonts.toArray();
        console.log('📊 Current DB State:', {
            audioFiles: audioFiles,
            soundfonts: soundfonts
        });
    }

    // Utility function to create file metadata
    private createFileMetadata(file: File, additionalData: Partial<AudioFile | SoundfontFile> = {}) {
        const metadata = {
            name: file.name,
            type: file.type,
            size: file.size,
            data: file,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...additionalData
        };
        this.logOperation('Creating file metadata', {
            name: metadata.name,
            type: metadata.type,
            size: metadata.size,
            additionalData
        });
        return metadata;
    }

    // Audio File Operations
    async addAudioFile(id: string, file: File, duration?: number): Promise<string> {
        console.log(`Adding audio file ${file.name} with id ${id}`);
        this.logOperation('Adding audio file', {
            id: id,
            name: file.name,
            type: file.type,
            size: file.size,
            duration: duration
        });
        
        // Get metadata, ensuring only AudioFile compatible props are added initially
        const metadataBase = this.createFileMetadata(file, { duration });
        
        // Fix: Cast the result of createFileMetadata to ensure compatibility before adding id
        const audioSpecificMetadata = metadataBase as Omit<AudioFile, 'id'>;

        // Create the full object including the string id
        const audioFileData: AudioFile = {
            ...audioSpecificMetadata,
            id: id // Explicitly set the string ID
        };
        
        // Call add with just the object
        await this.audioFiles.add(audioFileData); 
        
        await this.logDbState();
        return id;
    }

    async upsertAudioFile(id: string, file: File, duration?: number): Promise<string> {
        console.log(`Upserting audio file ${file.name} with id ${id}`);
        this.logOperation('Upserting audio file', {
            id: id,
            name: file.name,
            type: file.type,
            size: file.size,
            duration: duration
        });
        
        // Get metadata, ensuring only AudioFile compatible props are added initially
        const metadataBase = this.createFileMetadata(file, { duration });
        
        // Fix: Cast the result of createFileMetadata to ensure compatibility before adding id
        const audioSpecificMetadata = metadataBase as Omit<AudioFile, 'id'>;

        // Create the full object including the string id
        const audioFileData: AudioFile = {
            ...audioSpecificMetadata,
            id: id // Explicitly set the string ID
        };
        
        // Use put instead of add to handle existing keys
        await this.audioFiles.put(audioFileData); 
        
        await this.logDbState();
        return id;
    }

    async getAudioFile(id: string): Promise<AudioFile | undefined> {
        this.logOperation('Getting audio file', { id });
        const file = await this.audioFiles.get(id);
        this.logOperation('Retrieved audio file', {
            id,
            found: !!file,
            name: file?.name
        });
        return file;
    }

    async getAllAudioFiles(): Promise<AudioFile[]> {
        this.logOperation('Getting all audio files', {});
        const files = await this.audioFiles.toArray();
        this.logOperation('Retrieved all audio files', {
            count: files.length,
            names: files.map(f => f.name)
        });
        return files;
    }

    async updateAudioFile(id: string, updates: Partial<AudioFile>): Promise<number> {
        this.logOperation('Updating audio file', { id, updates });
        updates.updatedAt = new Date();
        const count = await this.audioFiles.update(id, updates);
        this.logOperation('Updated audio file', { id, success: count > 0 });
        await this.logDbState();
        return count;
    }

    async deleteAudioFile(id: string): Promise<void> {
        this.logOperation('Deleting audio file', { id });
        await this.audioFiles.delete(id);
        await this.logDbState();
    }

    // Search Operations
    async searchAudioFiles(query: string): Promise<AudioFile[]> {
        this.logOperation('Searching audio files', { query });
        const files = await this.audioFiles
            .where('name')
            .startsWithIgnoreCase(query)
            .or('tags')
            .anyOfIgnoreCase(query)
            .toArray();
        this.logOperation('Search results for audio files', {
            query,
            count: files.length,
            names: files.map(f => f.name)
        });
        return files;
    }

    // Utility function to get audio duration
    async getAudioDuration(file: File): Promise<number> {
        this.logOperation('Getting audio duration', { name: file.name });
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            const objectUrl = URL.createObjectURL(file);
            
            audio.addEventListener('loadedmetadata', () => {
                URL.revokeObjectURL(objectUrl);
                this.logOperation('Got audio duration', {
                    name: file.name,
                    duration: audio.duration
                });
                resolve(audio.duration);
            });
            
            audio.addEventListener('error', () => {
                URL.revokeObjectURL(objectUrl);
                this.logOperation('Error getting audio duration', {
                    name: file.name,
                    error: audio.error
                });
                reject(new Error('Error loading audio file'));
            });
            
            audio.src = objectUrl;
        });
    }

    // Database cleanup
    async clearAllFiles(): Promise<void> {
        this.logOperation('Clearing all files from database', {});
        
        try {
            await this.transaction('rw', this.audioFiles, this.soundfonts, async () => {
                await this.audioFiles.clear();
                await this.soundfonts.clear();
            });
            
            this.logOperation('Successfully cleared all files', {});
            await this.logDbState();
        } catch (error) {
            this.logOperation('Failed to clear files', { error });
            throw error;
        }
    }

    async getSoundfontFile(id: string): Promise<SoundfontFile | undefined> {
        return await this.soundfonts.get(id);
    }
}

// Export a singleton instance
export const db = new BeatGenDB();
