import { apiClient } from './client';
import { EventSourcePolyfill } from 'event-source-polyfill';

// Request/Response Types
export interface HomepageGenerationRequest {
  prompt: string;
  genre?: string;
  mood?: string;
  model?: string;
  auto_save?: boolean;
}

export interface HomepageGenerationResponse {
  request_id: string;
  status: string;
  project_id?: string;
  estimated_time?: number;
}

export interface GenerationResult {
  success: boolean;
  project_id?: string;
  project_name?: string;
  tempo?: number;
  key_signature?: string;
  tracks_created?: number;
  generation_time?: number;
  error?: string;
}

// Stream event callbacks interface
export interface HomepageStreamCallbacks {
  onConnected?: () => void;
  onStage?: (stage: { name: string, description: string }) => void;
  onStatus?: (status: { message: string, details?: string }) => void;
  onComplete?: (result: GenerationResult) => void;
  onError?: (error: any) => void;
  onCancelled?: () => void;
}

/**
 * Create a new homepage generation request
 */
export const createHomepageGeneration = async (
  request: HomepageGenerationRequest
): Promise<HomepageGenerationResponse> => {
  try {
    console.log('🚀 Creating homepage generation request:', request);
    
    const response = await apiClient.post('/api/homepage/generate-song', {
      prompt: request.prompt,
      genre: request.genre,
      mood: request.mood,
      model: request.model || 'Claude 3.7 Sonnet',
      auto_save: request.auto_save ?? true
    });
    
    console.log('✅ Homepage generation request created:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Failed to create homepage generation request:', error);
    throw error;
  }
};

/**
 * Stream homepage generation progress
 */
export const streamHomepageGeneration = (
  requestId: string,
  callbacks: HomepageStreamCallbacks
): { close: () => void } => {
  try {
    const baseUrl = apiClient.defaults.baseURL || '';
    const url = `${baseUrl}/api/homepage/stream/${requestId}`;
    
    console.log('🔷 Starting homepage generation stream:', { requestId, url });
    
    // Get auth token
    const token = localStorage.getItem('access_token');
    
    // Create EventSource with auth
    const eventSource = new EventSourcePolyfill(url, {
      withCredentials: true,
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });
    
    // Event handlers
    eventSource.addEventListener('connected', () => {
      console.log('🔗 Homepage generation stream connected');
      callbacks.onConnected?.();
    });
    
    eventSource.addEventListener('stage', (event: any) => {
      const data = JSON.parse(event.data);
      console.log('🎵 Generation stage:', data);
      callbacks.onStage?.(data);
    });
    
    eventSource.addEventListener('status', (event: any) => {
      const data = JSON.parse(event.data);
      console.log('📊 Generation status:', data);
      callbacks.onStatus?.(data);
    });
    
    eventSource.addEventListener('complete', (event: any) => {
      const data = JSON.parse(event.data);
      console.log('✅ Homepage generation complete:', data);
      callbacks.onComplete?.(data);
      eventSource.close();
    });
    
    eventSource.addEventListener('error', (event: any) => {
      const data = event.data ? JSON.parse(event.data) : { message: 'Unknown error' };
      console.error('❌ Homepage generation error:', data);
      callbacks.onError?.(data);
      eventSource.close();
    });
    
    eventSource.addEventListener('cancelled', () => {
      console.log('⏹️ Homepage generation cancelled');
      callbacks.onCancelled?.();
      eventSource.close();
    });
    
    return {
      close: () => {
        console.log('🔌 Closing homepage generation stream');
        eventSource.close();
      }
    };
    
  } catch (error) {
    console.error('❌ Failed to setup homepage generation stream:', error);
    callbacks.onError?.(error);
    return { close: () => {} };
  }
};

/**
 * Cancel a homepage generation request
 */
export const cancelHomepageGeneration = async (requestId: string): Promise<boolean> => {
  try {
    console.log('⏹️ Cancelling homepage generation:', requestId);
    
    await apiClient.delete(`/api/homepage/request/${requestId}`);
    
    console.log('✅ Homepage generation cancelled');
    return true;
  } catch (error) {
    console.error('❌ Failed to cancel homepage generation:', error);
    return false;
  }
};

/**
 * Combined function for homepage generation (create + stream)
 */
export const generateHomepageSong = async (
  request: HomepageGenerationRequest,
  callbacks: HomepageStreamCallbacks
): Promise<{ requestId: string, close: () => void }> => {
  try {
    // Step 1: Create the request
    const { request_id } = await createHomepageGeneration(request);
    
    // Step 2: Stream the response
    const { close } = streamHomepageGeneration(request_id, callbacks);
    
    return {
      requestId: request_id,
      close
    };
  } catch (error) {
    console.error('❌ Homepage generation failed:', error);
    callbacks.onError?.(error);
    return {
      requestId: '',
      close: () => {}
    };
  }
};