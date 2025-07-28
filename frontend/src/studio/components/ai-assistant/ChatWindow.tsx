import React, { useState, useEffect, useRef } from 'react';
import {IconX} from '@tabler/icons-react';
import { IconAi } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
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
import { MUSIC_CONSTANTS } from '@/studio/constants/musicConstants';
import { createDefaultInstance } from '../../utils/instanceHelpers';

interface Message {
  text: string;
  isUser: boolean;
  mode?: string;
  selectedTrack?: {
    id: string;
    name: string;
  } | null;
  action?: string;
  actionData?: any;
  isStreaming?: boolean; // Flag to indicate this message is currently streaming
  messageId?: string; // Unique identifier for the message
}

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

// Define available AI models (placeholder)
const AVAILABLE_MODELS = ["Gemini Pro 2.5", "Gemini Flash 2.5", "Deepseek R1", "Deepseek V3", "Claude 4 Sonnet", "Claude 4 Opus", "Claude 3.7 Sonnet",  "GPT-4.1", "GPT-4o", "o3", "o3-mini", "Llama 4 Maverick", "Llama 4 Scout"];

// UI Constants
const CHAT_WINDOW_WIDTH = 350;
const ANIMATION_DURATION = 225; // ms
const DOT_ANIMATION_INTERVAL = 500; // ms

// Generation choice buttons component
interface GenerationChoiceButtonsProps {
  onMidiChoice: () => void;
  onAudioChoice: () => void;
}

const GenerationChoiceButtons: React.FC<GenerationChoiceButtonsProps> = ({ onMidiChoice, onAudioChoice }) => {
  return (
    <Card className="p-4 border mb-2">
      <p className="text-sm text-muted-foreground mb-4">
        Choose your generation method:
      </p>
      <div className="flex flex-col gap-2">
        <Button onClick={onMidiChoice}>
          Generate Midi Melody
        </Button>
        <Button onClick={onAudioChoice}>
          Generate Audio Melody
        </Button>
      </div>
    </Card>
  );
};

const ChatWindow: React.FC<ChatWindowProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [animatedDots, setAnimatedDots] = useState(''); // New state for animated dots
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState('Generate');
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const [selectedTrack, setSelectedTrack] = useState<CombinedTrack | null>(null);
  
  // State for AI model selection
  const [selectedModel, setSelectedModel] = useState<string>(AVAILABLE_MODELS[0]); // Default to the first model
  
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
  
  // Generation choice state
  const [showGenerationChoiceButtons, setShowGenerationChoiceButtons] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [pendingUserMessage, setPendingUserMessage] = useState<Message | null>(null);
  const [selectedGenerationType, setSelectedGenerationType] = useState<'midi' | 'audio' | null>(null);
  
  
  // Access the store for executing actions and project context
  const { 
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
  
  // Initialize with welcome message when first opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        { 
          text: "Hi! I'm your AI assistant. How can I help with your music project today?", 
          isUser: false 
        }
      ]);
    }
  }, [isOpen, messages.length]);
  
  // Listen to step manager updates
  useEffect(() => {
    const handleStepUpdate = (updatedSteps: Step[]) => {
      setSteps(updatedSteps);
    };

    stepManager.addListener(handleStepUpdate);
    return () => {
      stepManager.removeListener(handleStepUpdate);
    };
  }, [stepManager]);

  // Debug log for streaming state changes
  useEffect(() => {
    console.log('🔄 STREAMING STATE CHANGED:', { 
      isStreaming, 
      streamingText, 
      currentMessageId,
      isLoading,
      messagesCount: messages.length,
      lastMessage: messages.length > 0 ? messages[messages.length - 1] : null
    });
  }, [isStreaming, streamingText, currentMessageId, isLoading, messages]);
  
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
        setMessages(prev => [
          ...prev, 
          { 
            text: '', 
            isUser: false,
            action: action.type,
            actionData: action.data
          }
        ]);
      },
      
      // New handlers for streaming text
      onEvent: (eventType, data) => {
        console.log(`⭐⭐⭐ RECEIVED CUSTOM EVENT: ${eventType}`, data);
        
        // Handle step events for music generation
        if (eventType === 'step_event') {
          console.log('🎵🎵🎵 STEP EVENT RECEIVED:', data);
          console.log('🎵🎵🎵 Current isStepMode:', isStepMode);
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
          
          // Only add a message if we don't have any assistant messages yet
          setMessages(prev => {
            // Check if we already have any non-user messages at the end
            const lastIndex = prev.length - 1;
            if (lastIndex >= 0 && !prev[lastIndex].isUser) {
              // Just update the existing message to be streaming
              return prev.map((msg, i) => 
                i === lastIndex ? { ...msg, isStreaming: true, messageId } : msg
              );
            }
            
            // Add a new message if needed
            return [
              ...prev,
              { 
                text: '',
                isUser: false,
                isStreaming: true,
                messageId
              }
            ];
          });
        }
        else if (eventType === 'response_chunk') {
          console.log('🟡 STREAMING CHUNK - Received chunk:', { 
            chunk: data.chunk, 
            messageId: data.message_id,
            isStepMode: isStepMode
          });
          
          // If we're in step mode, route streaming to the step system
          if (isStepMode) {
            console.log('🎵 Routing chunk to step system');
            
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
            
            console.log('🟡 Current messages state:', { 
              messagesCount: updatedMessages.length,
              lastMessage: lastMessageIndex >= 0 ? updatedMessages[lastMessageIndex] : null
            });
            
            // Check if the last message is a streaming message
            if (lastMessageIndex >= 0 && updatedMessages[lastMessageIndex].isStreaming) {
              console.log('🟢 Found streaming message at index:', lastMessageIndex);
              
              // Add the chunk to the existing text
              const existingText = updatedMessages[lastMessageIndex].text || '';
              const newText = existingText + data.chunk;
              
              console.log('🟢 Updating text:', { 
                oldText: existingText, 
                chunk: data.chunk, 
                newText 
              });
              
              // Create a new message object to ensure React detects the change
              updatedMessages[lastMessageIndex] = {
                ...updatedMessages[lastMessageIndex],
                text: newText
              };
              
              // Also update streamingText state separately
              setStreamingText(newText);
            } else {
              console.warn('⚠️ No streaming message found to update. Creating one now.');
              
              // If no streaming message exists (which shouldn't happen),
              // create one as a fallback
              updatedMessages.push({
                text: data.chunk,
                isUser: false,
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
              console.log('🎵 Finalizing step streaming');
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
        
        // Only add the assistant's response if we're not already streaming it
        if (!isStreaming) {
          setMessages(prev => [
            ...prev, 
            { text: response.response, isUser: false }
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
            text: `Sorry, I encountered an error: ${error.message || 'Unknown error'}`, 
            isUser: false 
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
      if (mode === 'Generate Audio') {
        apiMode = 'generate-audio';
      } else {
        apiMode = mode.toLowerCase() as 'generate' | 'edit' | 'chat' | 'generate-audio';
      }
      
      // Initialize step mode for generate requests
      if (apiMode === 'generate') {
        setIsStepMode(true);
        stepManager.reset(); // Reset for new generation
        console.log('🎵 Initialized step mode for music generation');
      } else {
        setIsStepMode(false);
      }
      
      // Get track ID if selected
      const trackId = selectedTrack ? selectedTrack.id : undefined;
      
      // Use the new POST-then-SSE pattern with interactWithAssistant
      const { requestId, close } = await interactWithAssistant(
        {
          prompt: promptText,
          mode: apiMode,
          model: selectedModel,
          context: { // Pass musical context for better AI generation
            model: selectedModel,
            track_id: trackId,
            bpm: bpm,
            time_signature: {
              numerator: timeSignature[0],
              denominator: timeSignature[1]
            },
            key_signature: keySignature,
            project_title: projectTitle,
            generation_type: generationType || 'midi'
          }
        },
        setupStreamCallbacks()
      );
      
      // Store request ID and connection for potential cancellation
      setCurrentRequestId(requestId);
      setStreamConnection({ close });
      
    } catch (error) {
      console.error('Error starting assistant interaction:', error);
      setMessages(prev => [...prev, { 
        text: "Sorry, I encountered an error processing your request.", 
        isUser: false 
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
    
    // Check if this is Generate mode and we need to show choice buttons
    if (mode === 'Generate' && !selectedGenerationType) {
      // Add user message to chat with current mode and selected track
      const userMessage: Message = { 
        text: prompt, 
        isUser: true,
        mode: mode,
        selectedTrack: selectedTrack
      };
      setMessages(prev => [...prev, userMessage]);
      
      // Store pending data and show choice buttons
      setPendingPrompt(prompt);
      setPendingUserMessage(userMessage);
      setShowGenerationChoiceButtons(true);
      setPrompt(''); // Clear input
      return;
    }
    
    // For non-Generate mode or when generation type is already selected, proceed normally
    const userMessage: Message = { 
      text: selectedGenerationType ? pendingPrompt : prompt, 
      isUser: true,
      mode: mode,
      selectedTrack: selectedTrack
    };
    
    // Only add user message if we haven't already (for choice flow)
    if (!selectedGenerationType) {
      setMessages(prev => [...prev, userMessage]);
    }
    
    // Clear input and start interaction
    setPrompt('');
    await startAssistantInteraction(
      selectedGenerationType ? pendingPrompt : prompt,
      selectedGenerationType || undefined
    );
    
    // Reset choice state after completion or error
    setShowGenerationChoiceButtons(false);
    setSelectedGenerationType(null);
    setPendingPrompt('');
    setPendingUserMessage(null);
  };
  
  // Handle generation choice selection
  const handleGenerationChoice = async (generationType: 'midi' | 'audio') => {
    setSelectedGenerationType(generationType);
    setShowGenerationChoiceButtons(false);
    
    // Start the assistant interaction directly
    await startAssistantInteraction(pendingPrompt, generationType);
    
    // Reset choice state after starting generation
    setSelectedGenerationType(null);
    setPendingPrompt('');
    setPendingUserMessage(null);
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
                    store.getAudioEngine().setTrackMute(track.id, true);
                    useStudioStore.setState({
                      tracks: useStudioStore.getState().tracks.map(t => 
                        t.id === track.id ? { ...t, muted: true } : t
                      )
                    });
                  },
                  undo: async () => {
                    console.log(`Unmuting existing track ${track.id}`);
                    store.getAudioEngine().setTrackMute(track.id, false);
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
        if (actionData?.trackId) {
          const track = tracks.find(t => t.id === actionData.trackId);
          if (track) {
            console.log(`Updating track ${track.name}`);
            // Using existing track update functionality
            // This will be handled by separate actions in the store
          } else {
            console.log(`Track ${actionData.trackId} not found`);
          }
        }
        break;
      case 'adjust_volume':
        if (actionData?.trackId && typeof actionData?.value === 'number') {
          handleTrackVolumeChange(actionData.trackId, actionData.value);
        }
        break;
      case 'toggle_mute':
        if (actionData?.trackId && typeof actionData?.muted === 'boolean') {
          handleTrackMuteToggle(actionData.trackId, actionData.muted);
        }
        break;
      case 'change_time_signature':
        if (typeof actionData?.numerator === 'number' && typeof actionData?.denominator === 'number') {
          handleProjectParamChange('timeSignature', [actionData.numerator, actionData.denominator]);
        }
        break;
      case 'move_track':
        console.log('Moving track:', actionData);
        if (actionData?.trackId && typeof actionData?.position?.x === 'number' && typeof actionData?.position?.y === 'number') {
          handleTrackPositionChange(actionData.trackId, {
            x: actionData.position.x,
            y: actionData.position.y
          }, true);
        }
        break;
      default:
        console.warn(`Unknown AI action type: ${action}`);
    }
  };
  
  
  // Handle pressing Enter key in the input field
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleModeSelect = (newMode: string) => {
    // Handle special case for "generate-audio" to display as "Generate Audio"
    if (newMode.toLowerCase() === 'generate-audio') {
      setMode('Generate Audio');
    } else {
      setMode(newMode.charAt(0).toUpperCase() + newMode.slice(1).toLowerCase());
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


  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newPosition = e.target.selectionStart;
    
    setPrompt(newValue);
    setCursorPosition(newPosition);
  };


  // Handler for AI Model selection
  const handleModelSelect = (newModel: string) => {
    setSelectedModel(newModel);
  };

  return (
    <div
      className={cn(
        "fixed right-0 top-[50px] bottom-0 z-[1200]",
        isVisible ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      <div
        className={cn(
          "h-full bg-background/95 text-foreground flex flex-col border-l transition-transform duration-[225ms] ease-[cubic-bezier(0,0,0.2,1)] shadow-lg",
          isOpen ? "translate-x-0" : "translate-x-full",
          isVisible ? "visible" : "invisible"
        )}
        style={{ width: CHAT_WINDOW_WIDTH }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-2 border-b bg-background/90 shrink-0"
          style={{ height: GRID_CONSTANTS.headerHeight }}
        >
          <div className="flex items-center px-1">
            <IconAi size={28} />
            <h3 className="text-base font-medium ml-2">
              Assistant
            </h3>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-auto p-1 rounded-md hover:bg-accent"
            aria-label="Close assistant"
          >
            <IconX size={12} />
          </Button>
        </div>
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 px-2 flex flex-col gap-3">
          {isStepMode && steps.length > 0 ? (
            // Step-based rendering for music generation
            <>
              {/* Show user message */}
              {messages.filter(msg => msg.isUser).map((msg, index) => (
                <UserChatBubble 
                  key={index} 
                  text={msg.text}
                  mode={msg.mode}
                  selectedTrack={msg.selectedTrack}
                />
              ))}
              
              {/* Show step progress */}
              <StepRenderer 
                steps={steps}
                onActionClick={handleAction}
              />
            </>
          ) : (
            // Legacy message rendering for chat/edit modes
            messages.map((msg, index) => 
              msg.isUser ? (
                <UserChatBubble 
                  key={index} 
                  text={msg.text}
                  mode={msg.mode}
                  selectedTrack={msg.selectedTrack}
                />
              ) : (
                <AssistantChatBubble 
                  key={index} 
                  text={msg.text}
                  action={msg.action}
                  onActionClick={msg.action && msg.actionData ? 
                      () => handleAction(msg.action!, msg.actionData) : 
                      undefined}
                  />
              )
            )
          )}
          
          {/* Generation choice buttons */}
          {showGenerationChoiceButtons && (
            <GenerationChoiceButtons 
              onMidiChoice={() => handleGenerationChoice('midi')}
              onAudioChoice={() => handleGenerationChoice('audio')}
            />
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 flex border-t bg-background/90">
          <div className="relative w-full">
            {/* Chips Box */}
            <div className="absolute top-1 left-2 flex gap-2 z-10 mt-2">
              <ChatModeMenu
                triggerLabel={mode}
                onSelect={handleModeSelect}
                selectedMode={mode.toLowerCase().replace(' ', '-')}
              />
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

            {/* TextField */}
            <Textarea
              placeholder={isLoading ? `Generating${animatedDots}` : "Ask me anything about your project..."}
              value={prompt}
              onChange={handleTextChange}
              onKeyDown={handleKeyPress}
              disabled={isLoading}
              className={cn(
                "w-full bg-background/80 border-border pt-5 pb-4 min-h-[20px] resize-none",
                "hover:border-muted-foreground focus-visible:border-primary",
                "border-0 focus-visible:border focus-visible:ring-0"
              )}
            />

            {/* Bottom Box with Send Button */}
            <div className="absolute bottom-0 left-0 right-0 h-9 flex items-center justify-between px-2 gap-2">
              {/* Model Selector Chip - Bottom Left (hidden for Generate Audio mode) */}
              {mode !== 'Generate Audio' ? (
                <ChatModelMenu
                  triggerLabel={selectedModel}
                  onSelect={handleModelSelect}
                  models={AVAILABLE_MODELS}
                  selectedModel={selectedModel}
                />
              ) : (
                <div className="flex-1" />
              )}

              {/* Send/Cancel Chip - Bottom Right */}
              <MenuChip 
                label={isLoading ? "Cancel" : "Send"}
                onClick={isLoading ? handleCancel : handleSend}
                disabled={!prompt.trim() && !isLoading}
                color={isLoading ? 'secondary' : 'primary'}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;