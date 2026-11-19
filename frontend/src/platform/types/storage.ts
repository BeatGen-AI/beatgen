import { getSupabaseStorageBaseUrl } from '../config/supabase';

/**
 * Storage type enum matching the backend PostgreSQL enum
 */
export enum StorageType {
  USER_AUDIO = 'USER_AUDIO',
  USER_SAMPLE = 'USER_SAMPLE',
  PUBLIC_DRUM = 'PUBLIC_DRUM',
  PUBLIC_SOUNDFONT = 'PUBLIC_SOUNDFONT'
}

/**
 * Get the full storage URL for a file
 * Uses storage type to determine the correct bucket and path
 * @param storageKey The storage key (path within the bucket)
 * @param storageType Optional storage type to determine the bucket
 * @returns The full URL to access the file
 */
export function getStorageUrl(storageKey: string, storageType?: StorageType): string {
  const baseUrl = getSupabaseStorageBaseUrl();
  
  // Check if storageKey is empty or undefined
  if (!storageKey) {
    throw new Error('Storage key cannot be empty');
  }
  
  // Validate against path traversal attacks
  if (storageKey.includes('../') || storageKey.includes('..\\')) {
    throw new Error('Invalid storage key: path traversal detected');
  }
  
  // Remove leading slash from storage key if present
  let cleanKey = storageKey.startsWith('/') ? storageKey.slice(1) : storageKey;
  
  // Remove any existing prefix from the storage key
  // This handles cases where the key already includes the prefix
  const prefixesToRemove = ['audio/', 'samples/', 'drum_samples/', 'soundfonts/', 'drum_samples_public/', 'soundfonts_public/'];
  for (const prefixToRemove of prefixesToRemove) {
    if (cleanKey.startsWith(prefixToRemove)) {
      cleanKey = cleanKey.slice(prefixToRemove.length);
      break;
    }
  }
  
  // Determine the appropriate path based on storage type or key content
  let prefix = 'storage/v1/object/public/tracks/audio'; // Default for all user audio
  
  if (storageType) {
    // Use storage type if provided
    switch (storageType) {
      case StorageType.USER_AUDIO:
      case StorageType.USER_SAMPLE:
        // Both user audio and samples go to tracks/audio
        prefix = 'storage/v1/object/public/tracks/audio';
        break;
      case StorageType.PUBLIC_DRUM:
        prefix = 'storage/v1/object/public/assets/drum_samples_public';
        break;
      case StorageType.PUBLIC_SOUNDFONT:
        prefix = 'storage/v1/object/public/assets/soundfonts_public';
        break;
    }
  }
  // If no storage type provided, use default (USER_AUDIO)
  
  // Construct the final URL
  const url = `${baseUrl}/${prefix}/${cleanKey}`;
  return url;
}