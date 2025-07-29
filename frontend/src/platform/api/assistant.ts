import { apiClient } from './client';
import { EventSourcePolyfill } from 'event-source-polyfill';
import { AssistantAction } from '@/platform/types/dto/assistant';

// Base context interface
interface BaseContext {
  project_id?: string;
  track_id?: string;
  selected_region?: {
    start_bar: number;
    end_bar: number;
  };
  source?: string;
  auto_create_project?: boolean;
  model?: string;
  // Musical context for better AI generation
  bpm?: number;
  time_signature?: {
    numerator: number;
    denominator: number;
  };
  key_signature?: string;
  project_title?: string;
  generation_type?: 'midi' | 'audio';
  tracks?: Array<{
    id: string;
    name: string;
    type: string;
    volume: number;
    pan: number;
    muted: boolean;
    soloed: boolean;
    instrument: string;
  }>;
}

// Extended context for audio generation
interface AudioGenerationContext extends BaseContext {
  bars?: number;
  duration?: number;
}

// Types for request/response
export interface AssistantRequestOptions {
  mode: 'chat' | 'generate' | 'edit' | 'generate-audio';
  prompt: string;
  model: string;
  context?: BaseContext | AudioGenerationContext;
}

export interface RequestCreationResponse {
  request_id: string;
  message: string;
}

export interface MessageStatus {
  id: string;
  status: 'pending' | 'streaming' | 'complete' | 'error';
  content?: string;
  error?: string;
}

export interface StreamingMessage {
  id: string;
  content: string;
  isComplete: boolean;
}

export interface ChatResponse {
  response: string;
}

export interface TrackData {
  type: 'midi' | 'audio' | 'drum' | 'sampler';
  id: string;
  name: string;
  [key: string]: any;
}

export interface GenerateResponse {
  response: string;
  tracks: TrackData[];
  actions?: AssistantAction[];
}

export interface EditResponse {
  response: string;
  track: TrackData;
  actions?: AssistantAction[];
}

/**
 * Stream event callbacks interface
 */
export interface StreamCallbacks {
  onConnected?: () => void;
  onStage?: (stage: { name: string, description: string }) => void;
  onStatus?: (status: { message: string, details?: string }) => void;
  onToolCall?: (toolCall: any) => void;
  onAction?: (action: AssistantAction) => void;
  onComplete?: (response: any) => void;
  onError?: (error: any) => void;
  onCancelled?: () => void;
  onHeartbeat?: () => void;
  onEvent?: (eventType: string, data: any) => void;
}

// Add MessageEvent type for SSE events
interface StreamEvent extends MessageEvent {
  data: string;
}

/**
 * Create a new assistant request and get a request ID
 * 
 * This is the first step in the POST-then-SSE pattern.
 * After getting a request ID, use streamAssistantResponse() to get streaming updates.
 * 
 * @param options Options for the assistant request
 * @returns Request creation response with request ID
 */
export const requestAssistant = async (
  options: AssistantRequestOptions
): Promise<RequestCreationResponse> => {
  try {
    // Make API call
    const response = await apiClient.post('/assistant/request', options);
    return response.data;
  } catch (error) {
    console.error('Error creating assistant request:', error);
    throw error;
  }
};

/**
 * Stream assistant response using Server-Sent Events
 * 
 * This is the second step in the POST-then-SSE pattern.
 * Use this after getting a request ID from requestAssistant().
 * 
 * @param requestId Request ID from requestAssistant()
 * @param callbacks Callbacks for handling different event types
 * @returns Object with close function to stop streaming
 */
export const streamAssistantResponse = (
  requestId: string,
  callbacks: StreamCallbacks
): { close: () => void } => {
  try {
    // Use the same backend URL logic as apiClient
    const isDev = import.meta.env.VITE_APP_ENV === 'dev' || import.meta.env.DEV;
    const API_URL = isDev 
      ? import.meta.env.VITE_LOCAL_BACKEND_URL || '' 
      : import.meta.env.VITE_PROD_BACKEND_BASE_URL || 'https://api.beatgen.com';
    
    const url = `${API_URL}/assistant/stream/${requestId}`;
    
    // Get auth token from localStorage with correct key
    const token = localStorage.getItem('access_token');
    
    // Create the EventSource with auth header using polyfill
    const eventSource = new EventSourcePolyfill(url, { 
      withCredentials: true,
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });
    
    // Event handlers
    eventSource.addEventListener('connected', (event: StreamEvent) => {
      callbacks.onConnected?.();
    });
    
    eventSource.addEventListener('stage', (event: StreamEvent) => {
      const data = JSON.parse(event.data);
      callbacks.onStage?.(data);
    });
    
    eventSource.addEventListener('status', (event: StreamEvent) => {
      const data = JSON.parse(event.data);
      callbacks.onStatus?.(data);
    });
    
    eventSource.addEventListener('tool_call', (event: StreamEvent) => {
      const data = JSON.parse(event.data);
      callbacks.onToolCall?.(data);
    });
    
    eventSource.addEventListener('action', (event: StreamEvent) => {
      const data = JSON.parse(event.data);
      callbacks.onAction?.(data);
    });
    
    eventSource.addEventListener('complete', (event: StreamEvent) => {
      const data = JSON.parse(event.data);
      callbacks.onComplete?.(data);
      eventSource.close();
    });
    
    eventSource.addEventListener('error', (event: StreamEvent) => {
      const data = event.data ? JSON.parse(event.data) : { message: 'Unknown error' };
      console.error('Assistant stream error:', data);
      callbacks.onError?.(data);
      eventSource.close();
    });
    
    eventSource.addEventListener('cancelled', (event: StreamEvent) => {
      callbacks.onCancelled?.();
      eventSource.close();
    });
    
    eventSource.addEventListener('heartbeat', (event: StreamEvent) => {
      // Just keep the connection alive, no need to log this
      callbacks.onHeartbeat?.();
    });
    
    // Add streaming text event handlers
    eventSource.addEventListener('response_start', (event: StreamEvent) => {
      const data = JSON.parse(event.data);
      callbacks.onEvent?.('response_start', data);
    });
    
    eventSource.addEventListener('response_chunk', (event: StreamEvent) => {
      const data = JSON.parse(event.data);
      callbacks.onEvent?.('response_chunk', data);
    });
    
    eventSource.addEventListener('response_end', (event: StreamEvent) => {
      const data = JSON.parse(event.data);
      callbacks.onEvent?.('response_end', data);
    });
    
    // Add step_event listener for music generation steps
    eventSource.addEventListener('step_event', (event: StreamEvent) => {
      const data = JSON.parse(event.data);
      callbacks.onEvent?.('step_event', data);
    });
    
    // Return a function to close the connection
    return {
      close: () => {
        eventSource.close();
      }
    };
  } catch (error) {
    console.error('Error setting up assistant stream:', error);
    callbacks.onError?.(error);
    return { close: () => {} };
  }
};

/**
 * Cancel an ongoing assistant request
 * 
 * @param requestId Request ID to cancel
 * @returns True if cancelled successfully
 */
export const cancelAssistantRequest = async (requestId: string): Promise<boolean> => {
  try {
    // Make API call
    const response = await apiClient.delete(`/assistant/request/${requestId}`);
    return true;
  } catch (error) {
    console.error('Error cancelling request:', error);
    return false;
  }
};

/**
 * Combined function to handle both steps of POST-then-SSE pattern
 * 
 * 1. Creates the request with requestAssistant()
 * 2. Streams the response with streamAssistantResponse()
 * 
 * @param options Options for the assistant request
 * @param callbacks Callbacks for streaming events
 * @returns Object with requestId and close function
 */
export const interactWithAssistant = async (
  options: AssistantRequestOptions,
  callbacks: StreamCallbacks
): Promise<{ requestId: string, close: () => void }> => {
  try {
    // Step 1: Create the request
    const { request_id } = await requestAssistant(options);
    
    // Step 2: Stream the response
    const { close } = streamAssistantResponse(request_id, callbacks);
    
    // Return both the request ID and close function
    return {
      requestId: request_id,
      close
    };
  } catch (error) {
    console.error('Error in assistant interaction:', error);
    callbacks.onError?.(error);
    throw error;
  }
};