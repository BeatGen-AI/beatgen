import React, { useState, useEffect, useRef } from 'react';
import {IconX} from '@tabler/icons-react';
import { IconAi } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import GenerationPromptControl from '../shared/GenerationPromptControl';
import { cn } from '@/lib/utils';
import { useAppTheme } from '../../../lib/theme-provider';
import { 
  interactWithAssistant,
  cancelAssistantRequest,
  StreamCallbacks,
} from '../../../platform/api/assistant';
import { historyManager } from '../../core/state/history/HistoryManager';
import { useStudioStore } from '../../stores/studioStore';
import ChatModeMenu from './ChatModeMenu';
import AddContextMenu from './AddContextMenu';
import MenuChip from './MenuChip';
import AddContextChip from './AddContextChip';
import AssistantChatBubble from './AssistantChatBubble';
import UserChatBubble from './UserChatBubble';
import StepRenderer from './StepRenderer';
import { StepManager, Step } from './StepManager';
import { GRID_CONSTANTS } from '../../constants/gridConstants';
import { CombinedTrack } from '../../../platform/types/project';
import ReactMarkdown from 'react-markdown'
import { MidiTrackPayload } from '../../stores/types';
import { MidiTrackRead } from 'src/platform/types/dto/track_models/midi_track';
import { SamplerTrackRead } from 'src/platform/types/dto/track_models/sampler_track';
import { DrumTrackRead } from 'src/platform/types/dto/track_models/drum_track';
import { AudioTrackRead } from 'src/platform/types/dto/track_models/audio_track';
import ChatModelMenu from './ChatModelMenu';
import AudioGenerationModelMenu from './AudioGenerationModelMenu';
import { getAudioModelInfo, getAvailableAudioModels } from '../../config/audioModels';
import { MUSIC_CONSTANTS } from '@/studio/constants/musicConstants';
import { createDefaultInstance } from '../../utils/instanceHelpers';
import { getProjectMessages } from '../../../platform/api/projects';
import { transformDatabaseMessagesToChat } from './messageUtils';

interface Message {
  type: 'user' | 'assistant' | 'steps';
  text?: string;
  isUser?: boolean; // Keep for backward compatibility
  mode?: string;
  selectedTrack?: {
    id: string;
    name: string;
  } | null;
  action?: string;
  actionData?: any;
  isStreaming?: boolean; // Flag to indicate this message is currently streaming
  messageId?: string; // Unique identifier for the message
  steps?: Step[]; // For step-based messages
}

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  controlBarHeight?: number;
  projectId?: string;
}

// Define available AI models (placeholder)
const AVAILABLE_MODELS = ["Gemini Pro 2.5", "Gemini Flash 2.5", "Deepseek R1", "Deepseek V3", "Claude 4 Sonnet", "Claude 4 Opus", "Claude 3.7 Sonnet",  "GPT-4.1", "GPT-4o", "o3", "o3-mini", "Llama 4 Maverick", "Llama 4 Scout"];

// Get available audio generation models from config
const AVAILABLE_AUDIO_MODELS = getAvailableAudioModels();

// UI Constants
const CHAT_WINDOW_WIDTH = 350;
const ANIMATION_DURATION = 225; // ms
const DOT_ANIMATION_INTERVAL = 500; // ms


const ChatWindow: React.FC<ChatWindowProps> = ({ isOpen, onClose, controlBarHeight = 50, projectId }) => {
  const { studioMode } = useAppTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [animatedDots, setAnimatedDots] = useState(''); // New state for animated dots
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState('Compose');
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const [selectedTrack, setSelectedTrack] = useState<CombinedTrack | null>(null);
  
  // State for AI model selection
  const [selectedModel, setSelectedModel] = useState<string>(AVAILABLE_MODELS[0]); // Default to the first model
  
  // State for generation type (audio/midi) for Compose mode
  const [generationType, setGenerationType] = useState<'audio' | 'midi'>('audio');
  const [selectedAudioModel, setSelectedAudioModel] = useState<string>('stability/stable-audio-2');
  
  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const [streamConnection, setStreamConnection] = useState<{ close: () => void } | null>(null);
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  
  // Step-based rendering state
  const [stepManager] = useState(() => new StepManager());
  const [steps, setSteps] = useState<Step[]>([]);
  const [isStepMode, setIsStepMode] = useState(true);
  const [currentStepMessageId, setCurrentStepMessageId] = useState<string | null>(null);
  const currentStepMessageIdRef = useRef<string | null>(null);
  
  // Message loading state
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | undefined>(projectId);
  
  
  
  // Access the store for executing actions and project context
  const { 
    store,
    handleAddTrack, 
    handleTrackVolumeChange,
    handleTrackMuteToggle,
    handleTrackPositionChange,
    handleProjectParamChange,
    loadTrack,
    loadDrumTrack,
    tracks,
    updateTrackState,
    // Add project context for musical parameters
    bpm,
    timeSignature,
    keySignature,
    projectTitle
  } = useStudioStore();
  
  // Add state to handle visibility after animation
  const [isVisible, setIsVisible] = useState(isOpen);
  
  // Handle visibility changes
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      // Wait for slide animation to complete before hiding
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, ANIMATION_DURATION);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);
  
  // Cleanup resources when component unmounts
  useEffect(() => {
    return () => {
      // Close any active connection
      if (streamConnection) {
        streamConnection.close();
      }
      
      // Cancel any active request on the server
      if (currentRequestId) {
        cancelAssistantRequest(currentRequestId).catch(err => {
          console.error('Error cancelling request during cleanup:', err);
        });
      }
    };
  }, [streamConnection, currentRequestId]);
  
  // Load project messages when project ID changes
  const loadProjectMessages = async (projectId: string) => {
    if (isLoadingMessages) return; // Prevent double loading
    
    setIsLoadingMessages(true);
    try {
      console.log('Loading messages for project:', projectId);
      const dbMessages = await getProjectMessages(projectId);
      
      if (dbMessages.length > 0) {
        console.log('Loaded', dbMessages.length, 'messages from database');
        
        // Reset step manager before loading historical messages to avoid conflicts
        stepManager.reset();
        
        const chatMessages = transformDatabaseMessagesToChat(dbMessages);
        setMessages(chatMessages);
        setMessagesLoaded(true);
      } else {
        // No messages found, show welcome message
        setMessages([
          { 
            type: 'assistant',
            text: "Hi! I'm your AI assistant. How can I help with your music project today?"
          }
        ]);
        setMessagesLoaded(true);
      }
    } catch (error) {
      console.error('Failed to load project messages:', error);
      
      // Check if it's a network error vs parsing error
      const isNetworkError = error && (error as any).response?.status;
      const errorMessage = isNetworkError 
        ? "Hi! I'm your AI assistant. I couldn't load our previous conversation, but I'm ready to help with your music project today!"
        : "Hi! I'm your AI assistant. How can I help with your music project today?";
      
      // On error, show welcome message with context
      setMessages([
        { 
          type: 'assistant',
          text: errorMessage
        }
      ]);
      setMessagesLoaded(true);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // Handle project ID changes - only clear when switching between different projects
  useEffect(() => {
    if (projectId !== currentProjectId) {
      // Only clear messages if we're switching between two different actual project IDs
      // Don't clear when going from undefined to a project ID (that's just the project getting saved)
      const isActualProjectSwitch = currentProjectId && projectId && currentProjectId !== projectId;
      
      setCurrentProjectId(projectId);
      
      if (isActualProjectSwitch) {
        setMessagesLoaded(false);
        setMessages([]); // Clear current messages only when switching projects
        console.log(`ChatWindow: Switching from project ${currentProjectId} to ${projectId}`);
      } else {
        console.log(`ChatWindow: Project ID updated to ${projectId} (not clearing messages)`);
      }
    }
  }, [projectId, currentProjectId]);

  // Initialize messages when chat opens
  useEffect(() => {
    if (isOpen && !messagesLoaded && !isLoadingMessages) {
      if (currentProjectId) {
        loadProjectMessages(currentProjectId);
      } else {
        // No project ID, show welcome message
        setMessages([
          { 
            type: 'assistant',
            text: "Hi! I'm your AI assistant. How can I help with your music project today?"
          }
        ]);
        setMessagesLoaded(true);
      }
    }
  }, [isOpen, messagesLoaded, isLoadingMessages]);
  
  // Listen to step manager updates
  useEffect(() => {
    const handleStepUpdate = (updatedSteps: Step[]) => {
      setSteps(updatedSteps);
      
      // Update the specific step message in the messages array
      const stepMessageId = currentStepMessageIdRef.current;
      if (stepMessageId !== null) {
        setMessages(prev => {
          return prev.map(msg => 
            msg.messageId === stepMessageId 
              ? { ...msg, steps: updatedSteps }
              : msg
          );
        });
      }
    };

    stepManager.addListener(handleStepUpdate);
    return () => {
      stepManager.removeListener(handleStepUpdate);
    };
  }, [stepManager]);

  // Scroll to bottom of messages whenever messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // Effect for animating dots in placeholder when loading
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (isLoading) {
      const dotStates = ['', '.', '..', '...'];
      let currentStateIndex = 0;
      setAnimatedDots(dotStates[currentStateIndex]); // Initial state

      intervalId = setInterval(() => {
        currentStateIndex = (currentStateIndex + 1) % dotStates.length;
        setAnimatedDots(dotStates[currentStateIndex]);
      }, DOT_ANIMATION_INTERVAL);
    } else {
      setAnimatedDots(''); // Reset dots when not loading
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isLoading]);
  
  // Set up callbacks for streaming
  const setupStreamCallbacks = (): StreamCallbacks => {
    return {
      onConnected: () => {
        console.log('Streaming connection established');
        // Update status but don't add a message yet
        setIsStreaming(true);
        setStreamingText('');
        setCurrentMessageId(null);
      },
      
      onStage: (stage) => {
        console.log('Stream stage update:', stage);
        // Could show stage information in the UI if desired
      },
      
      onStatus: (status) => {
        console.log('Status update:', status);
        // Could display status updates in the UI if desired
      },
      
      onToolCall: (toolCall) => {
        console.log('Tool call:', toolCall);
        // Could display tool calls in the UI if desired
      },
      
      onAction: (action) => {
        console.log('Action received:', action);
        // Process the action right away
        handleAction(action.type, action.data);
        
        // Add action message
        // setMessages(prev => [
        //   ...prev, 
        //   { 
        //     type: 'assistant',
        //     text: '', 
        //     action: action.type,
        //     actionData: action.data
        //   }
        // ]);
      },
      
      // New handlers for streaming text
      onEvent: (eventType, data) => {
        
        // Handle step events for music generation
        if (eventType === 'step_event') {
          stepManager.addEvent(data);
          
          // Execute actions immediately when they arrive
          if (data.event_type === 'action' && data.action_type) {
            handleAction(data.action_type, data.action_data);
          }
          return;
        }
        
        // Handle response streaming events
        if (eventType === 'response_start') {
          console.log('🔴 STREAMING START - Starting response stream', data);
          
          // Create a message ID for this streaming session
          const messageId = data.message_id;
          setCurrentMessageId(messageId);
          setIsStreaming(true);
          
          // Only add assistant message if NOT in step mode
          if (!isStepMode) {
            setMessages(prev => {
              // Check if we already have any assistant messages at the end
              const lastIndex = prev.length - 1;
              if (lastIndex >= 0 && prev[lastIndex].type === 'assistant') {
                // Just update the existing message to be streaming
                return prev.map((msg, i) => 
                  i === lastIndex ? { ...msg, isStreaming: true, messageId } : msg
                );
              }
              
              // Add a new message if needed
              return [
                ...prev,
                { 
                  type: 'assistant',
                  text: '',
                  isStreaming: true,
                  messageId
                }
              ];
            });
          }
        }
        else if (eventType === 'response_chunk') {
          
          // If we're in step mode, route streaming to the step system
          if (isStepMode) {
            // If this is the first chunk, start streaming
            if (!stepManager.hasActiveStream) {
              stepManager.startStreaming();
            }
            
            // Append the chunk to the active step
            stepManager.appendChunk(data.chunk);
            return;
          }
          
          // Legacy message-based streaming for non-step modes
          setMessages(prev => {
            // Copy the messages array to avoid mutation
            const updatedMessages = [...prev];
            const lastMessageIndex = updatedMessages.length - 1;
            
            
            // Check if the last message is a streaming message
            if (lastMessageIndex >= 0 && updatedMessages[lastMessageIndex].isStreaming) {
              // Add the chunk to the existing text
              const existingText = updatedMessages[lastMessageIndex].text || '';
              const newText = existingText + data.chunk;
              
              // Create a new message object to ensure React detects the change
              updatedMessages[lastMessageIndex] = {
                ...updatedMessages[lastMessageIndex],
                text: newText
              };
              
              // Also update streamingText state separately
              setStreamingText(newText);
            } else {
              // If no streaming message exists (which shouldn't happen),
              // create one as a fallback
              updatedMessages.push({
                type: 'assistant',
                text: data.chunk,
                isStreaming: true,
                messageId: data.message_id
              });
              
              setStreamingText(data.chunk);
              setCurrentMessageId(data.message_id);
              setIsStreaming(true);
            }
            
            return updatedMessages;
          });
        }
        else if (eventType === 'response_end') {
          if (data.message_id === currentMessageId) {
            // Finalize streaming
            setIsStreaming(false);
            
            // If we're in step mode, finalize the step streaming
            if (isStepMode) {
              stepManager.finalizeStreaming();
            } else {
              // Legacy message-based streaming finalization
              setMessages(prev => {
                const updatedMessages = [...prev];
                const lastMessageIndex = updatedMessages.length - 1;
                
                if (lastMessageIndex >= 0 && updatedMessages[lastMessageIndex].isStreaming) {
                  updatedMessages[lastMessageIndex] = {
                    ...updatedMessages[lastMessageIndex],
                    isStreaming: false
                  };
                }
                
                return updatedMessages;
              });
            }
            
            setCurrentMessageId(null);
          }
        }
      },
      
      onComplete: (response) => {
        console.log('Stream complete with response:', response);
        setIsLoading(false);
        
        // Only add the assistant's response if we're not already streaming it AND not in step mode
        if (!isStreaming && !isStepMode) {
          setMessages(prev => [
            ...prev, 
            { type: 'assistant', text: response.response }
          ]);
        }
        
        // We'll skip processing actions in onComplete because they should
        // have already been processed by the onAction handler during streaming
        
        // Clean up
        setStreamConnection(null);
      },
      
      onError: (error) => {
        console.error('Stream error:', error);
        setIsLoading(false);
        setIsStreaming(false);
        
        // Add error message
        setMessages(prev => [
          ...prev, 
          { 
            type: 'assistant',
            text: `Sorry, I encountered an error: ${error.message || 'Unknown error'}`
          }
        ]);
        
        // Clean up
        setStreamConnection(null);
      },
      
      onCancelled: () => {
        console.log('Stream cancelled');
        setIsLoading(false);
        setIsStreaming(false);
        
        // Clean up
        setStreamConnection(null);
      }
    };
  };

  const handleCancel = async () => {
    if (currentRequestId) {
      try {
        await cancelAssistantRequest(currentRequestId);
        setCurrentRequestId(null);
      } catch (err) {
        console.error('Error cancelling request:', err);
      }
    }
  }
  
  // Common function to start assistant interaction
  const startAssistantInteraction = async (promptText: string, generationType?: 'midi' | 'audio') => {
    setIsLoading(true);
    
    try {
      // Determine the appropriate mode (lowercase for API)
      let apiMode: 'generate' | 'edit' | 'chat' | 'generate-audio';
      if (mode === 'Add Track') {
        apiMode = 'generate-audio';
      } else if (mode === 'Compose') {
        apiMode = 'generate';
      } else if (mode === 'Edit & Mix') {
        apiMode = 'edit';
      } else {
        apiMode = mode.toLowerCase() as 'generate' | 'edit' | 'chat' | 'generate-audio';
      }
      
      // Initialize step mode for generate requests
      if (apiMode === 'generate') {
        setIsStepMode(true);
        
        // Add a step message to the messages array
        const stepMessageId = messages.length.toString();
        setMessages(prev => {
          const stepMessage: Message = {
            type: 'steps',
            steps: [],
            messageId: stepMessageId
          };
          return [...prev, stepMessage];
        });
        
        // Set the current step message ID (both state and ref)
        setCurrentStepMessageId(stepMessageId);
        currentStepMessageIdRef.current = stepMessageId;
        
        // Reset the step manager (this will trigger step updates)
        stepManager.reset();
      } else {
        setIsStepMode(false);
      }
      
      // Get track ID if selected
      const trackId = selectedTrack ? selectedTrack.id : undefined;
      
      // Prepare context with proper model selection
      const context: any = {
        project_id: store?.projectManager.getCurrentProject()?.id,
        model: selectedModel,
        track_id: trackId,
        bpm: bpm,
        time_signature: {
          numerator: timeSignature[0],
          denominator: timeSignature[1]
        },
        key_signature: keySignature,
        project_title: projectTitle,
        generation_type: generationType || 'midi',
        tracks: tracks.map(track => ({
          id: track.id,
          name: track.name,
          type: track.track_type,
          volume: track.volume,
          pan: track.pan,
          muted: track.mute,
          soloed: track.soloed,
          instrument: (track.track as MidiTrackRead)?.instrument_file?.display_name || track.name
        }))
      };

      // Add audio generation model for Compose + Audio Melody mode
      if (mode === 'Compose' && generationType === 'audio') {
        context.audio_generation_model = selectedAudioModel;
        console.log('🎵 Audio generation request:', {
          mode: apiMode,
          chatModel: selectedModel,
          audioModel: selectedAudioModel,
          generationType,
          contextAudioModel: context.audio_generation_model
        });
      }

      // Use the new POST-then-SSE pattern with interactWithAssistant
      const { requestId, close } = await interactWithAssistant(
        {
          prompt: promptText,
          mode: apiMode,
          model: selectedModel,
          context
        },
        setupStreamCallbacks()
      );
      
      // Store request ID and connection for potential cancellation
      setCurrentRequestId(requestId);
      setStreamConnection({ close });
      
    } catch (error) {
      console.error('Error starting assistant interaction:', error);
      setMessages(prev => [...prev, { 
        type: 'assistant',
        text: "Sorry, I encountered an error processing your request."
      }]);
      setIsLoading(false);
    }
  };

  // Handle sending message to the AI
  const handleSend = async () => {
    setSelectedTrack(null);
    if (!prompt.trim()) return;
    
    // First check if we need to cancel an active stream
    if (streamConnection) {
      streamConnection.close();
      setStreamConnection(null);
      setIsLoading(false);
      setIsStreaming(false);
      
      // Also cancel the request on the server if we have a request ID
      if (currentRequestId) {
        handleCancel();
      }
      return;
    }
    
    // No longer need generation choice buttons since we have submenu
    
    // Add user message and start interaction
    const userMessage: Message = { 
      type: 'user',
      text: prompt, 
      mode: mode,
      selectedTrack: selectedTrack
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Clear input and start interaction
    setPrompt('');
    await startAssistantInteraction(prompt, generationType);
  };
  
  
  // Helper function to create a CombinedTrack with instance metadata
  const createCombinedTrack = (
    trackData: MidiTrackRead | SamplerTrackRead | DrumTrackRead | AudioTrackRead,
    trackType: 'MIDI' | 'SAMPLER' | 'DRUM' | 'AUDIO',
    isDirty: boolean = true  // AI-generated tracks should be marked as dirty by default
  ): CombinedTrack => {
    const defaultName = `New ${trackType.charAt(0) + trackType.slice(1).toLowerCase()} Track`;
    const trackCount = useStudioStore.getState().getVisibleTrackCount();
    
    return {
      id: trackData.id,
      name: trackData.name || defaultName,
      track_type: trackType,
      volume: 80,
      pan: 0,
      mute: false,
      dirty: isDirty,  // Set the dirty flag directly on creation
      duration_ticks: MUSIC_CONSTANTS.pulsesPerQuarterNote * 16,
      track_number: 0,
      instance_metadata: [createDefaultInstance(
        trackData.id, 
        { x: 0, y: trackCount * GRID_CONSTANTS.trackHeight}, 
        MUSIC_CONSTANTS.pulsesPerQuarterNote * 16
      )],
      instances: [createDefaultInstance(
        trackData.id, 
        { x: 0, y: trackCount * GRID_CONSTANTS.trackHeight}, 
        MUSIC_CONSTANTS.pulsesPerQuarterNote * 16
      )],
      track: trackData
    };
  };

  const handleAction = async (action: string, actionData: any) => {
    const { store, updateTrackState } = useStudioStore.getState();
    
    switch (action) {
      case 'change_bpm':
        if (typeof actionData?.value === 'number') {
          handleProjectParamChange('bpm', actionData.value);
        }
        break;
      case 'change_key':
        if (actionData?.value) {
          handleProjectParamChange('keySignature', actionData.value);
        }
        break;
      case 'change_project_name':
        if (actionData?.name) {
          handleProjectParamChange('projectTitle', actionData.name);
        }
        break;
      case 'add_drum_track':
        console.log('🟢 add_drum_track action received:', actionData);
        if (store) {
          try {
            const drumTrackData = actionData.track_data as DrumTrackRead;
            const combinedDrumTrack = createCombinedTrack(drumTrackData, 'DRUM');
            console.log('🟢 Constructed CombinedTrack:', combinedDrumTrack);
            console.log('🟢 Track dirty flag before load:', combinedDrumTrack.dirty);
            await loadDrumTrack(combinedDrumTrack);
            
            // Use a small delay to ensure tracks are fully loaded in state
            setTimeout(() => {
              // Mark the AI-generated track as dirty so it will be saved
              updateTrackState(combinedDrumTrack.id, { dirty: true });
              console.log('🟢 Track marked as dirty after load');
              
              // Also mark sampler tracks as dirty if this is a drum track
              if (drumTrackData.sampler_track_ids && drumTrackData.sampler_track_ids.length > 0) {
                console.log('🟢 Marking sampler tracks as dirty:', drumTrackData.sampler_track_ids);
                drumTrackData.sampler_track_ids.forEach((samplerId: string) => {
                  updateTrackState(samplerId, { dirty: true });
                });
              }
            }, 100);
          } catch (error) {
            console.error('Failed to add AI generated drum track:', error);
          }
        }
        break;
      case 'add_track':
        console.log('🟢 add_track action received:', actionData);
        // New action type for adding an individual generated track with notes
        if (store) {
          try {
            const trackType = actionData.type as 'MIDI' | 'SAMPLER' | 'DRUM' | 'AUDIO';
            const trackData = actionData.track_data;
            
            switch (trackType) {
              case 'MIDI':
                const midiTrack = createCombinedTrack(trackData as MidiTrackRead, 'MIDI');
                console.log('🟢 Constructed MIDI track:', midiTrack);
                console.log('🟢 Track dirty flag before load:', midiTrack.dirty);
                await loadTrack(midiTrack);
                
                // Use a small delay to ensure tracks are fully loaded in state
                setTimeout(() => {
                  // Mark the AI-generated track as dirty so it will be saved
                  updateTrackState(midiTrack.id, { dirty: true });
                  console.log('🟢 Track marked as dirty after load');
                }, 100);
                break;
                
              case 'SAMPLER':
                const samplerTrack = createCombinedTrack(trackData as SamplerTrackRead, 'SAMPLER');
                console.log('🟢 Constructed SAMPLER track:', samplerTrack);
                console.log('🟢 Track dirty flag before load:', samplerTrack.dirty);
                await loadTrack(samplerTrack);
                
                // Use a small delay to ensure tracks are fully loaded in state
                setTimeout(() => {
                  // Mark the AI-generated track as dirty so it will be saved
                  updateTrackState(samplerTrack.id, { dirty: true });
                  console.log('🟢 Track marked as dirty after load');
                }, 100);
                break;
                
              case 'DRUM':
                const drumTrack = createCombinedTrack(trackData as DrumTrackRead, 'DRUM');
                console.log('🟢 Constructed DRUM track:', drumTrack);
                console.log('🟢 Track dirty flag before load:', drumTrack.dirty);
                // For drum tracks, use loadDrumTrack instead of loadTrack
                await loadDrumTrack(drumTrack);
                
                // Use a small delay to ensure tracks are fully loaded in state
                setTimeout(() => {
                  // Mark the AI-generated track as dirty so it will be saved
                  updateTrackState(drumTrack.id, { dirty: true });
                  console.log('🟢 Track marked as dirty after load');
                  
                  // Also mark sampler tracks as dirty if this is a drum track
                  const drumTrackData = trackData as DrumTrackRead;
                  if (drumTrackData.sampler_track_ids && drumTrackData.sampler_track_ids.length > 0) {
                    console.log('🟢 Marking sampler tracks as dirty:', drumTrackData.sampler_track_ids);
                    drumTrackData.sampler_track_ids.forEach((samplerId: string) => {
                      updateTrackState(samplerId, { dirty: true });
                    });
                  }
                }, 100);
                break;
                
              case 'AUDIO':
                const audioTrack = createCombinedTrack(trackData as AudioTrackRead, 'AUDIO');
                console.log('🟢 Constructed AUDIO track:', audioTrack);
                console.log('🟢 Track dirty flag before load:', audioTrack.dirty);
                await loadTrack(audioTrack);
                
                // Use a small delay to ensure tracks are fully loaded in state
                setTimeout(() => {
                  // Mark the AI-generated track as dirty so it will be saved
                  updateTrackState(audioTrack.id, { dirty: true });
                  console.log('🟢 Audio track marked as dirty after load');
                }, 100);
                break;
                
              default:
                console.warn(`Unknown track type: ${trackType}`);
            }
          } catch (error) {
            console.error('Failed to add AI generated track:', error);
          }
        }
        break;
      case 'add_audio_track':
        console.log('🟢 add_audio_track action received:', actionData);
        if (store) {
          try {
            const audioTrackData = actionData.track_data as AudioTrackRead;
            const combinedAudioTrack = createCombinedTrack(audioTrackData, 'AUDIO');
            console.log('🟢 Constructed Audio CombinedTrack:', combinedAudioTrack);
            console.log('🟢 Track dirty flag before load:', combinedAudioTrack.dirty);
            await loadTrack(combinedAudioTrack);
            
            // Use a small delay to ensure tracks are fully loaded in state
            setTimeout(() => {
              // Mark the AI-generated track as dirty so it will be saved
              updateTrackState(combinedAudioTrack.id, { dirty: true });
              console.log('🟢 Audio track marked as dirty after load');
            }, 100);
          } catch (error) {
            console.error('Failed to add AI generated audio track:', error);
          }
        }
        break;
      case 'add_tracks':
        // For generating multiple tracks, we want to use a composite action
        if (typeof actionData?.count === 'number' && store) {
          try {
            console.log(`Adding ${actionData.count} tracks from AI assistant`);
            
            // Store current track states (for undo)
            const existingTracks = useStudioStore.getState().tracks;
            const previousTrackStates = existingTracks.map(track => ({
              trackId: track.id,
              wasMuted: track.mute
            }));
            
            // Create an array of actions
            const actions = [];
            
            // First, create mute actions for existing tracks
            for (const track of existingTracks) {
              if (!track.mute) {
                actions.push({
                  execute: async () => {
                    console.log(`Muting existing track ${track.id}`);
                    store.setTrackMute(track.id, true);
                    useStudioStore.setState({
                      tracks: useStudioStore.getState().tracks.map(t => 
                        t.id === track.id ? { ...t, muted: true } : t
                      )
                    });
                  },
                  undo: async () => {
                    console.log(`Unmuting existing track ${track.id}`);
                    store.setTrackMute(track.id, false);
                    useStudioStore.setState({
                      tracks: useStudioStore.getState().tracks.map(t => 
                        t.id === track.id ? { ...t, muted: false } : t
                      )
                    });
                  },
                  type: 'MUTE_TRACK'
                });
              }
            }
            
            // Add track creation actions
            for (let i = 0; i < actionData.count; i++) {
              const trackName = actionData.instrumentName
                ?.split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
              actions.push({
                execute: async () => {
                  console.log(`Adding AI track: ${trackName}`);
                  const payload: MidiTrackPayload = {
                    instrumentId: "instrumentId",
                    instrumentName: trackName,
                    instrumentStorageKey: "instrumentStorageKey"
                  }
                  await handleAddTrack('MIDI', payload);
                },
                undo: async () => {
                  const tracks = useStudioStore.getState().tracks;
                  const trackToRemove = tracks.find(t => t.name === trackName);
                  if (trackToRemove) {
                    console.log(`Removing AI track: ${trackName}`);
                    const { handleTrackDelete } = useStudioStore.getState();
                    await handleTrackDelete(trackToRemove.id);
                  }
                },
                type: 'ADD_AI_TRACK'
              });
            }
            
            // Create and execute the composite action
            //const compositeAction = new CompositeAction(actions, 'AI Assistant Generate');
            //await historyManager.executeAction(compositeAction);
            
            // Update history UI state
            useStudioStore.setState({
              canUndo: historyManager.canUndo(),
              canRedo: historyManager.canRedo()
            });
          } catch (error) {
            console.error('Failed to add AI generated tracks:', error);
          }
        }
        break;
      case 'update_track':
        if (actionData?.track_id) {
          const track = tracks.find(t => t.id === actionData.track_id);
          if (track) {
            console.log(`Updating track ${track.name}`);
            // Using existing track update functionality
            // This will be handled by separate actions in the store
          } else {
            console.log(`Track ${actionData.track_id} not found`);
          }
        }
        break;
      case 'adjust_volume':
        if (actionData?.track_id && typeof actionData?.value === 'number') {
          handleTrackVolumeChange(actionData.track_id, actionData.value);
        }
        break;
      case 'toggle_mute':
        if (actionData?.track_id && typeof actionData?.muted === 'boolean') {
          handleTrackMuteToggle(actionData.track_id, actionData.muted);
        }
        break;
      case 'adjust_pan':
        if (actionData?.track_id && typeof actionData?.value === 'number') {
          console.log(`Adjusting pan for track ${actionData.track_id} to ${actionData.value}`);
          // TODO: Implement handleTrackPanChange function
        }
        break;
      case 'toggle_solo':
        if (actionData?.track_id && typeof actionData?.soloed === 'boolean') {
          console.log(`Setting solo for track ${actionData.track_id} to ${actionData.soloed}`);
          // TODO: Implement handleTrackSoloToggle function
        }
        break;
      case 'change_time_signature':
        if (typeof actionData?.numerator === 'number' && typeof actionData?.denominator === 'number') {
          handleProjectParamChange('timeSignature', [actionData.numerator, actionData.denominator]);
        }
        break;
      case 'move_track':
        console.log('Moving track:', actionData);
        if (actionData?.track_id && typeof actionData?.position?.x === 'number' && typeof actionData?.position?.y === 'number') {
          handleTrackPositionChange(actionData.track_id, {
            x: actionData.position.x,
            y: actionData.position.y
          }, true);
        }
        break;
      default:
        console.warn(`Unknown AI action type: ${action}`);
    }
  };
  
  

  const handleModeSelect = (newMode: string, newGenerationType?: 'audio' | 'midi') => {
    // Map mode IDs to display labels
    const modeDisplayMap: Record<string, string> = {
      'generate': 'Compose',
      'generate-audio': 'Add Track',
      'edit': 'Edit & Mix'
    };
    
    setMode(modeDisplayMap[newMode] || newMode);
    
    // Update generation type if provided (for Compose mode)
    if (newGenerationType) {
      setGenerationType(newGenerationType);
    }
  };


  const handleContextSelect = (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      setSelectedTrack(track);
      
      // Find the position of the @ symbol
      const atSymbolPos = prompt.lastIndexOf('@', cursorPosition);
      if (atSymbolPos !== -1) {
        // Remove just the @ symbol
        const newText = 
          prompt.substring(0, atSymbolPos) + 
          prompt.substring(atSymbolPos + 1);  // Skip the @ character
        
        setPrompt(newText);
      }
    }
  };

  const handleRemoveContext = () => {
    setSelectedTrack(null);
  };


  // Handler for AI Model selection
  const handleModelSelect = (newModel: string) => {
    setSelectedModel(newModel);
  };

  // Handler for Audio Generation Model selection
  const handleAudioModelSelect = (newModel: string) => {
    setSelectedAudioModel(newModel);
  };

  return (
    <div
      className={cn(
        "fixed right-0 bottom-0",
        isVisible ? "pointer-events-auto" : "pointer-events-none"
      )}
      style={{
        top: `${controlBarHeight}px`
      }}
    >
      <div
        className={cn(
          "h-full flex flex-col transition-transform duration-[225ms] ease-[cubic-bezier(0,0,0.2,1)] shadow-lg",
          isOpen ? "translate-x-0" : "translate-x-full",
          isVisible ? "visible" : "invisible"
        )}
        style={{
          backgroundColor: studioMode === 'dark' ? '#0a0a0a' : '#f8fafc',
          color: studioMode === 'dark' ? '#ffffff' : '#000000',
          borderLeft: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
          width: CHAT_WINDOW_WIDTH
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-2 shrink-0"
          style={{ 
            height: GRID_CONSTANTS.headerHeight,
            backgroundColor: studioMode === 'dark' ? '#0a0a0a' : '#f8fafc',
            borderBottom: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`
          }}
        >
          <div className="flex items-center px-1">
            <IconAi size={28} />
            <h3 
              className="text-base font-medium ml-2"
              style={{ color: studioMode === 'dark' ? '#ffffff' : '#000000' }}
            >
              Assistant
            </h3>
          </div>
          
          <button
            onClick={onClose}
            className="h-auto p-1 rounded-md transition-colors"
            aria-label="Close assistant"
            style={{
              backgroundColor: 'transparent',
              color: studioMode === 'dark' ? '#ffffff' : '#000000',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <IconX size={12} />
          </button>
        </div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-2 px-6 flex flex-col gap-3">
          {/* Loading indicator */}
          {isLoadingMessages && (
            <div className="flex items-center justify-center py-4">
              <div className="text-sm opacity-60">
                Loading conversation history...
              </div>
            </div>
          )}
          
          {/* Show all conversation history */}
          {!isLoadingMessages && messages.map((msg, index) => {
            if (msg.type === 'user') {
              return (
                <UserChatBubble 
                  key={index} 
                  text={msg.text || ''}
                  mode={msg.mode}
                  selectedTrack={msg.selectedTrack}
                />
              );
            } else if (msg.type === 'assistant') {
              return (
                <AssistantChatBubble 
                  key={index} 
                  text={msg.text || ''}
                  action={msg.action}
                  onActionClick={msg.action && msg.actionData ? 
                      () => handleAction(msg.action!, msg.actionData) : 
                      undefined
                  }
                />
              );
            } else if (msg.type === 'steps') {
              return (
                <StepRenderer 
                  key={index}
                  steps={msg.steps || []}
                  onActionClick={handleAction}
                />
              );
            }
            return null;
          })}
          
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div 
          className="p-4"
          style={{
            backgroundColor: studioMode === 'dark' ? '#0a0a0a' : '#f8fafc',
            borderTop: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`
          }}
        >
          {/* Generation Prompt Control */}
          <GenerationPromptControl
            topComponent={
              (mode === 'Edit' && !selectedTrack) || selectedTrack ? (
                <div className="flex gap-2">
                  {mode === 'Edit' && !selectedTrack && (
                    <AddContextMenu
                      triggerLabel="@"
                      onSelect={handleContextSelect}
                      tracks={tracks.map(track => ({ id: track.id, name: track.name }))}
                    />
                  )}
                  {selectedTrack && (
                    <AddContextChip 
                      trackName={selectedTrack.name}
                      onDelete={handleRemoveContext}
                    />
                  )}
                </div>
              ) : undefined
            }
            prompt={prompt}
            onPromptChange={setPrompt}
            onGenerate={handleSend}
            isGenerating={isLoading}
            useStudioTheme={true}
            placeholder={isLoading ? `Generating${animatedDots}` : "Ask me anything about your project..."}
            maxLength={1000}
            showRandomButton={false}
            showSelect={false}
            submitButtonIcon={isLoading ? undefined : undefined}
            submitButtonAriaLabel={isLoading ? "Cancel" : "Send"}
            textareaTopLeftComponent={
              <ChatModeMenu
                triggerLabel={mode}
                onSelect={handleModeSelect}
                selectedMode={
                  mode === 'Compose' ? 'generate' :
                  mode === 'Add Track' ? 'generate-audio' :
                  mode === 'Edit & Mix' ? 'edit' :
                  mode.toLowerCase().replace(' ', '-').replace('&', '')
                }
                selectedGenerationType={generationType}
              />
            }
            textareaBottomLeftComponent={
              <div className="flex gap-2">
                <ChatModelMenu
                  triggerLabel={selectedModel}
                  onSelect={handleModelSelect}
                  models={AVAILABLE_MODELS}
                  selectedModel={selectedModel}
                />
                {mode === 'Compose' && generationType === 'audio' && (
                  <AudioGenerationModelMenu
                    triggerLabel={getAudioModelInfo(selectedAudioModel).description}
                    onSelect={handleAudioModelSelect}
                    models={AVAILABLE_AUDIO_MODELS}
                    selectedModel={selectedAudioModel}
                    themeMode={studioMode}
                  />
                )}
              </div>
            }
            textareaBottomRightComponent={
              isLoading ? (
                <MenuChip 
                  label="Cancel"
                  onClick={handleCancel}
                  disabled={false}
                  color="secondary"
                />
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;