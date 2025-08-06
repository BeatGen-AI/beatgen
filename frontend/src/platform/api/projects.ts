import { uploadFileWithProgress } from '../../studio/utils/audioProcessing';
import { processAudioFile } from '../../studio/utils/audioProcessing';
import { apiClient } from './client';
import { ApiError } from './types';
import { createDrumTrackRecord, createMidiFileRecord, createSamplerTrackRecord, createSoundRecord, getUploadUrl } from './sounds';
import { 
  Project,
  ProjectCreate, 
  ProjectRead, 
  ProjectUpdate, 
  ProjectWithTracks,
  ProjectWithTracksEntity,
  ProjectWithTrackPreviews,
  CombinedTrack 
} from '../types/project';

// Assistant message types
export interface AssistantMessage {
  id: string;
  project_id: string;
  request_id?: string;
  role: 'user' | 'assistant';
  content?: string;
  mode?: string;
  step?: string;
  message_metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}
import { AudioTrack, AudioTrackRead } from '../types/dto/track_models/audio_track';
import { SamplerTrack } from '../types/dto/track_models/sampler_track';
import { MidiTrack } from '../types/dto/track_models/midi_track';
import { db } from '../../studio/core/db/dexie-client';
import { DrumTrack } from '../types/dto/track_models/drum_track';
import { Page } from '../types/pagination';

export const getProjects = async (page: number = 1, size: number = 10): Promise<Page<ProjectWithTrackPreviews>> => {
  const response = await apiClient.get<Page<ProjectWithTrackPreviews>>('/projects', {
    params: { page, size }
  });
  return response.data;
};

export const getProject = async (id: string): Promise<Project> => {
  const response = await apiClient.get(`/projects/${id}`);
  return response.data;
};

export const createProject = async (project: ProjectCreate): Promise<Project> => {
  const response = await apiClient.post('/projects', project);
  return response.data;
};

export const updateProject = async (id: string, updates: ProjectWithTracksEntity): Promise<Project> => {
  try {
    // Map instances to instance_metadata if tracks are present
    const updatesForBackend = { ...updates };
    if (updates.tracks) {
      updatesForBackend.tracks = updates.tracks.map(track => {
        const { instances, ...trackData } = track;
        return {
          ...trackData
        };
      });
    }
    
    const response = await apiClient.patch(`/projects/${id}`, updatesForBackend);
    return response.data;
  } catch (error: any) {
    // Handle specific conflict errors with more detail
    if (error.response?.status === 409) {
      const conflictError = new Error(
        error.response.data?.detail || 
        'Save conflict detected. The project may have been modified by another user or process.'
      ) as ApiError;
      conflictError.status = 409;
      throw conflictError;
    }
    throw error;
  }
};

export const deleteProject = async (id: string): Promise<void> => {
  await apiClient.delete(`/projects/${id}`);
};

export const getProjectMessages = async (projectId: string, limit: number = 50): Promise<AssistantMessage[]> => {
  const response = await apiClient.get<AssistantMessage[]>(`/projects/${projectId}/messages`, {
    params: { limit }
  });
  return response.data;
};

export const addTrack = async (projectId: string, track: Omit<CombinedTrack, 'id'>): Promise<Project> => {
  const response = await apiClient.post(`/projects/${projectId}/tracks`, track);
  return response.data;
};

export const updateTrack = async (projectId: string, trackId: string, track: Partial<CombinedTrack>): Promise<Project> => {
  const response = await apiClient.patch(`/projects/${projectId}/tracks/${trackId}`, track);
  return response.data;
};

export const deleteTrack = async (projectId: string, trackId: string): Promise<Project> => {
  const response = await apiClient.delete(`/projects/${projectId}/tracks/${trackId}`);
  return response.data;
};

/**
 * Save a project with all its audio and MIDI tracks
 * This handles uploading files and creating the project structure
 */

export const uploadAudioTrack = async (track: CombinedTrack): Promise<void> => {
  const audioTrack = track.track as AudioTrack;
  
  // Check if this is an existing track that was selected from AudioTracksModal
  // Existing tracks already have audio_file_storage_key, so no need to upload
  if (audioTrack.audio_file_storage_key) {
    console.log(`Skipping upload for existing track ${track.id} with storage key: ${audioTrack.audio_file_storage_key}`);
    return;
  }
  
  // Get the audio file first to determine the proper filename with extension
  const audioFile = await db.getAudioFile(audioTrack.id);
  if (!audioFile) {
    console.warn(`Audio file not found for audio track ${audioTrack.id}`);
    // If the track doesn't have a file in IndexedDB but has a storage key, it's already uploaded
    if (audioTrack.audio_file_storage_key) {
      console.log(`Audio track ${audioTrack.id} already has storage key, skipping upload`);
      return;
    }
    // Skip this track instead of throwing to allow other tracks to save
    console.error(`Audio track ${audioTrack.id} has no audio file and no storage key, skipping`);
    return;
  }
  
  // Determine the file extension from the audio file type or default to .wav
  const fileExtension = audioFile.data.type === 'audio/mpeg' ? '.mp3' : 
                       audioFile.data.type === 'audio/mp4' ? '.m4a' : 
                       audioFile.data.type === 'audio/ogg' ? '.ogg' : '.wav';
  
  // Ensure the filename has an extension
  const fileName = audioTrack.name.includes('.') ? 
                   audioTrack.name : 
                   `${audioTrack.name}${fileExtension}`;
  
  const { id, upload_url, storage_key } = await getUploadUrl(fileName, track.id, 'audio', true);
  if (!upload_url) {
    console.log("Audio track already exists, skipping upload");
    return
  }
  
  const file = new File([audioFile.data], fileName, {
    type: audioFile.data.type
  });
  
  await uploadFileWithProgress(file, upload_url, () => {});
  
  // Process the file to get metadata
  const metadata = await processAudioFile(file);

  const audioMetadata = track.track as AudioTrackRead;

  await createSoundRecord({
    id: audioTrack.id,
    name: track.name,
    audio_file_format: audioMetadata.audio_file_format,
    audio_file_duration: audioMetadata.audio_file_duration,
    audio_file_size: audioMetadata.audio_file_size,
    audio_file_sample_rate: audioMetadata.audio_file_sample_rate,
    audio_file_storage_key: storage_key,
    waveform_data: metadata.waveform
  })
}

export const uploadMidiTrack = async (track: CombinedTrack): Promise<void> => {
  console.log("Uploading MIDI track:", track);
  const midiTrack = track.track as MidiTrack;
  await createMidiFileRecord({
    id: midiTrack.id,
    name: midiTrack.name,
    instrument_id: midiTrack.instrument_id,
    midi_notes_json: midiTrack.midi_notes_json
  })
}

export const uploadSamplerTrack = async (track: CombinedTrack): Promise<void> => {
  const samplerTrack = track.track as SamplerTrack;
  
  // For PUBLIC_DRUM samples, we need to create the record but not upload the file
  if (samplerTrack.storage_type === 'PUBLIC_DRUM' && samplerTrack.audio_storage_key) {
    console.log(`Creating sampler track record for PUBLIC_DRUM sample ${track.id}`);
    
    // Create the sampler track record with the existing storage key
    await createSamplerTrackRecord({
      id: samplerTrack.id,
      name: samplerTrack.name,
      audio_storage_key: samplerTrack.audio_storage_key,
      audio_file_format: samplerTrack.audio_file_format || 'wav',
      audio_file_size: samplerTrack.audio_file_size || 0,
      base_midi_note: samplerTrack.base_midi_note || 60,
      grain_size: samplerTrack.grain_size || 0.1,
      overlap: samplerTrack.overlap || 0,
      audio_file_name: samplerTrack.audio_file_name || samplerTrack.name,
      audio_file_duration: samplerTrack.audio_file_duration || 0,
      audio_file_sample_rate: samplerTrack.audio_file_sample_rate || 44100,
      storage_type: samplerTrack.storage_type,
      midi_notes_json: samplerTrack.midi_notes_json || { notes: [] },
      drum_track_id: samplerTrack.drum_track_id || null
    });
    return;
  }
  
  // Check if this sampler track already has a storage key (existing track from backend)
  if (samplerTrack.audio_storage_key) {
    console.log(`Sampler track ${track.id} already has storage key: ${samplerTrack.audio_storage_key}, skipping upload`);
    return;
  }
  
  // Get the audio file first to determine the proper filename with extension
  const audioFile = await db.getAudioFile(samplerTrack.id);
  if (!audioFile) {
    console.warn(`Audio file not found for sampler track ${samplerTrack.id}, checking if it's already uploaded`);
    // If the track doesn't have a file in IndexedDB but also doesn't have a storage key,
    // this is an error condition
    if (!samplerTrack.audio_storage_key) {
      console.error(`Sampler track ${samplerTrack.id} has no audio file and no storage key`);
      // Skip this track instead of throwing to allow other tracks to save
      return;
    }
    return;
  }
  
  // Ensure we have a proper filename with extension
  if (!samplerTrack.audio_file_name) {
    samplerTrack.audio_file_name = samplerTrack.name;
  }
  
  // Determine the file extension from the audio file type or default to .wav
  const fileExtension = audioFile.data.type === 'audio/mpeg' ? '.mp3' : 
                       audioFile.data.type === 'audio/mp4' ? '.m4a' : 
                       audioFile.data.type === 'audio/ogg' ? '.ogg' : '.wav';
  
  // Ensure the filename has an extension
  const fileName = samplerTrack.audio_file_name.includes('.') ? 
                   samplerTrack.audio_file_name : 
                   `${samplerTrack.audio_file_name}${fileExtension}`;
  
  const { id, upload_url, storage_key } = await getUploadUrl(fileName, track.id, 'audio', true, true); // is_sample=true
  if (!upload_url) {
    console.log("Sampler audio track already exists, skipping upload");
    return
  }
  
  const file = new File([audioFile.data], fileName, {
    type: audioFile.data.type
  });
  
  await uploadFileWithProgress(file, upload_url, () => {});
  // Process the file to get metadata
  const metadata = await processAudioFile(file);
  await createSamplerTrackRecord({
    id: samplerTrack.id,
    name: samplerTrack.name,
    audio_storage_key: storage_key,
    audio_file_format: metadata.format,
    audio_file_size: file.size,
    base_midi_note: samplerTrack.base_midi_note || 60,
    grain_size: samplerTrack.grain_size || 0.1,
    overlap: 0,
    audio_file_name: samplerTrack.audio_file_name,
    audio_file_duration: metadata.duration,
    audio_file_sample_rate: metadata.sampleRate,
    storage_type: samplerTrack.storage_type,  // Pass the storage_type
    midi_notes_json: samplerTrack.midi_notes_json,
    drum_track_id: samplerTrack.drum_track_id ? samplerTrack.drum_track_id : null
  })
}

export const uploadDrumTrack = async (track: CombinedTrack): Promise<void> => {
  const drumTrack = track.track as DrumTrack;
  await createDrumTrackRecord({
    id: drumTrack.id,
    name: drumTrack.name,
  })
}

export const saveProjectWithSounds = async (
  projectId: string, 
  projectData: ProjectUpdate,
  tracks: CombinedTrack[]
): Promise<Project> => {
  
  for (const track of tracks) {
    switch (track.track_type) {
      case 'AUDIO':
        await uploadAudioTrack(track);
        break;
      case 'MIDI':
        await uploadMidiTrack(track);
        break;
      case 'SAMPLER':
        await uploadSamplerTrack(track);
        break;
      case 'DRUM':
        await uploadDrumTrack(track);
        break;
    }
  }
  
  // 4. Update the project with all tracks
  try {
    // Map instances to instance_metadata for backend
    const tracksForBackend = tracks.map(track => {
      const { instances, ...trackData } = track;
      return {
        ...trackData,
        instance_metadata: instances as any || []
      };
    });
    
    const response = await apiClient.patch(`/projects/${projectId}`, {
      ...projectData,
      tracks: tracksForBackend
    });
    
    return response.data;
  } catch (error: any) {
    // Handle specific conflict errors with more detail
    if (error.response?.status === 409) {
      const conflictError = new Error(
        error.response.data?.detail || 
        'Save conflict detected. The project may have been modified by another user or process.'
      ) as ApiError;
      conflictError.status = 409;
      throw conflictError;
    }
    throw error;
  }
};