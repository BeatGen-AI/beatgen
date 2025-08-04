/**
 * Message transformation utilities for loading and reconstructing chat history
 */

import { AssistantMessage } from '../../../platform/api/projects';
import { Step, StepEvent } from './StepManager';

// Types for ChatWindow messages
export interface ChatMessage {
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
  isStreaming?: boolean;
  messageId?: string;
  steps?: Step[];
}

// Generation step mapping using proper ENUM values
const GENERATION_STEPS = [
  { id: 1, name: "Researching Musical Context" },
  { id: 2, name: "Determine Musical Parameters" },
  { id: 3, name: "Instrument Selection" },
  { id: 4, name: "Drum Selection" },
  { id: 5, name: "Drum Beat Generation" },
  { id: 6, name: "Chord Generation" },
  { id: 7, name: "Melody Generation" }
];

const STEP_NAME_TO_ID_MAP = new Map([
  ["RESEARCH_MUSICAL_CONTEXT", 1],
  ["DETERMINE_MUSICAL_PARAMS", 2],
  ["INSTRUMENT_SELECTION", 3],
  ["DRUM_SELECTION", 4], 
  ["DRUM_BEAT_GENERATION", 5],
  ["CHORD_GENERATION", 6],
  ["MELODY_GENERATION", 7]
  // Tool steps are excluded - we don't render _TOOL steps
  // COMPLETE step is excluded - we don't want to show it
]);

// Steps that should show completion message instead of actual content
const GENERATION_CONTENT_STEPS = new Set([
  5, // DRUM_BEAT_GENERATION
  6, // CHORD_GENERATION  
  7  // MELODY_GENERATION
]);

/**
 * Check if a string is JSON data that shouldn't be displayed to users
 */
function isJsonString(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  
  const trimmed = str.trim();
  if (!trimmed) return false;
  
  // Check if it starts and ends with JSON delimiters
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  
  // Check for obvious JSON patterns but be more conservative
  // Only hide content that's clearly structured JSON data
  if (trimmed.includes('"id":') && trimmed.includes('"name":') && 
      (trimmed.includes('"type":') || trimmed.includes('"value":'))) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      // Only hide if it actually parses as JSON
      return false;
    }
  }
  
  return false;
}

/**
 * Get a user-friendly completion message for steps that only have JSON data
 */
function getStepCompletionMessage(stepId: number): string {
  const messages = {
    1: "Completed research on musical context and style",
    2: "Determined musical parameters and structure", 
    3: "Selected appropriate instruments for the composition",
    4: "Chose drum sounds and kit configuration",
    5: "Generated drum patterns and beats",
    6: "Created chord progressions and harmonic structure",
    7: "Composed melody lines and musical phrases"
  };
  
  return messages[stepId as keyof typeof messages] || "Completed step processing";
}

/**
 * Transform a database assistant message to a ChatWindow message format
 */
export function transformAssistantMessageToChat(dbMessage: AssistantMessage): ChatMessage {
  try {
    const chatMessage: ChatMessage = {
      type: dbMessage.role === 'user' ? 'user' : 'assistant',
      text: dbMessage.content || '',
      messageId: dbMessage.id,
      mode: dbMessage.mode,
      isStreaming: false,
    };

    // Handle actions from metadata - safely access nested properties
    if (dbMessage.message_metadata && 
        typeof dbMessage.message_metadata === 'object' && 
        dbMessage.message_metadata.action_type) {
      chatMessage.action = dbMessage.message_metadata.action_type;
      chatMessage.actionData = dbMessage.message_metadata.action_data;
    }

    return chatMessage;
  } catch (error) {
    console.error('MessageUtils: Error transforming message to chat format:', error, dbMessage);
    // Return a fallback message
    return {
      type: 'assistant',
      text: '[Error loading message]',
      messageId: dbMessage.id || 'error',
      isStreaming: false,
    };
  }
}

/**
 * Transform database messages with steps into Step objects for StepManager
 */
export function transformMessagesToSteps(dbMessages: AssistantMessage[]): Step[] {
  const stepMap = new Map<number, Step>();
  
  // Initialize all expected steps
  GENERATION_STEPS.forEach(stepTemplate => {
    stepMap.set(stepTemplate.id, {
      id: stepTemplate.id,
      name: stepTemplate.name,
      status: 'pending',
      events: [],
    });
  });

  // Process messages and add events to steps
  dbMessages.forEach((message, index) => {
    try {
      if (message.role === 'assistant' && message.step && message.content) {
        let stepId: number | undefined;
        let isToolMessage = false;
        
        // Handle tool steps - use them to mark the base step as completed
        if (message.step.endsWith('_TOOL')) {
          isToolMessage = true;
          const baseStepName = message.step.replace('_TOOL', '');
          stepId = STEP_NAME_TO_ID_MAP.get(baseStepName);
          console.log(`MessageUtils: Tool message ${message.step} → base step ${baseStepName} → stepId ${stepId}`);
        } else {
          stepId = STEP_NAME_TO_ID_MAP.get(message.step);
          console.log(`MessageUtils: Regular message ${message.step} → stepId ${stepId}`);
        }
        
        if (stepId !== undefined) {
          const step = stepMap.get(stepId);
          if (step) {
            // Parse timestamp safely
            let timestamp: number;
            try {
              timestamp = new Date(message.created_at).getTime();
              if (isNaN(timestamp)) {
                throw new Error('Invalid timestamp');
              }
            } catch (timestampError) {
              console.warn(`MessageUtils: Invalid timestamp in message ${message.id}: ${message.created_at}`);
              timestamp = Date.now(); // Fallback to current time
            }

            // For tool messages, create completion event and mark step as completed
            if (isToolMessage) {
              // Tool message - create a completion event with meaningful message
              const completionMessage = `${step.name} completed`;
              
              const event: StepEvent = {
                id: message.id,
                stepId: stepId,
                stepName: step.name,
                type: 'explanation',
                timestamp: timestamp,
                content: completionMessage,
                isStreaming: false,
              };

              step.events.push(event);
              step.status = 'completed';
              console.log(`MessageUtils: Created completion event for tool message ${message.step} → step ${stepId}`);
              
              if (!step.startTime) {
                step.startTime = timestamp;
              }
              step.endTime = timestamp;
              return; // Tool message processing complete
            }
            
            // Create event from message with proper content handling
            let displayContent = message.content;
            
            // For generation content steps, always show completion message (don't show actual content)
            if (GENERATION_CONTENT_STEPS.has(stepId)) {
              displayContent = getStepCompletionMessage(stepId);
            }
            // For other steps, only replace JSON with meaningful content
            else if (isJsonString(message.content)) {
              displayContent = getStepCompletionMessage(stepId);
            }
            // If content is empty or just whitespace, provide a meaningful message
            else if (!message.content?.trim()) {
              displayContent = getStepCompletionMessage(stepId);
            }
            
            const event: StepEvent = {
              id: message.id,
              stepId: stepId,
              stepName: step.name,
              type: 'explanation',
              timestamp: timestamp,
              content: displayContent,
              isStreaming: false,
            };

            // Add action data if present - safely access metadata
            if (message.message_metadata && 
                typeof message.message_metadata === 'object' && 
                message.message_metadata.action_type) {
              event.type = 'action';
              event.actionType = message.message_metadata.action_type;
              event.actionData = message.message_metadata.action_data;
            }

            step.events.push(event);
            
            // Any step that has a message associated with it should be marked as completed
            // This ensures all steps with data appear as green/completed
            step.status = 'completed';
            
            if (!step.startTime) {
              step.startTime = event.timestamp;
            }
            step.endTime = event.timestamp;
          }
        } else {
          // Log unrecognized step names for debugging
          console.warn(`MessageUtils: Unrecognized step name in historical message: ${message.step}`);
        }
      }
    } catch (error) {
      console.error(`MessageUtils: Error processing step message at index ${index}:`, error, message);
    }
  });

  // Return all steps in order to maintain complete sequence
  // Steps with events will show as completed, steps without will show as pending
  const allSteps = Array.from(stepMap.values()).sort((a, b) => a.id - b.id);
  
  // Auto-complete research step if other steps are present
  const researchStep = allSteps.find(step => step.id === 1);
  const hasOtherCompletedSteps = allSteps.some(step => step.id > 1 && step.status === 'completed');
  
  if (researchStep && researchStep.status === 'pending' && hasOtherCompletedSteps) {
    researchStep.status = 'completed';
    researchStep.startTime = Math.min(...allSteps.filter(s => s.startTime).map(s => s.startTime!));
    researchStep.endTime = researchStep.startTime;
    
    // Add a completion event for the research step
    researchStep.events.push({
      id: 'auto-research-completion',
      stepId: 1,
      stepName: researchStep.name,
      type: 'explanation',
      timestamp: researchStep.startTime,
      content: 'Researching Musical Context completed',
      isStreaming: false,
    });
    
    console.log('MessageUtils: Auto-completed research step based on other completed steps');
  }
  
  // Debug: Log the final step statuses
  console.log('MessageUtils: Final step statuses:');
  allSteps.forEach(step => {
    console.log(`  Step ${step.id} (${step.name}): status=${step.status}, events=${step.events.length}`);
  });
  
  // Debug: Log all processed messages with their steps
  console.log('MessageUtils: All processed messages:');
  dbMessages.forEach((message, index) => {
    if (message.step) {
      console.log(`  Message ${index}: role=${message.role}, step=${message.step}, content_preview=${message.content?.substring(0, 50)}...`);
    }
  });
  
  // Always return all steps - the UI will handle showing pending vs completed states
  return allSteps;
}

/**
 * Group related messages by request ID for conversation reconstruction
 */
export function groupMessagesByRequest(dbMessages: AssistantMessage[]): Map<string, AssistantMessage[]> {
  const grouped = new Map<string, AssistantMessage[]>();
  
  dbMessages.forEach((message, index) => {
    try {
      // Validate message structure
      if (!message.id || !message.created_at) {
        console.warn(`MessageUtils: Invalid message structure at index ${index}:`, message);
        return;
      }

      const requestId = message.request_id || `orphan-${message.id}`;
      if (!grouped.has(requestId)) {
        grouped.set(requestId, []);
      }
      grouped.get(requestId)!.push(message);
    } catch (error) {
      console.error(`MessageUtils: Error processing message at index ${index}:`, error, message);
    }
  });

  return grouped;
}

/**
 * Order messages chronologically and group conversations
 */
export function orderMessagesChronologically(dbMessages: AssistantMessage[]): ChatMessage[] {
  if (dbMessages.length === 0) {
    return [];
  }

  // Sort all messages by creation time - with safe timestamp parsing
  const sortedMessages = [...dbMessages].sort((a, b) => {
    try {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      
      // Handle invalid timestamps
      if (isNaN(timeA) && isNaN(timeB)) return 0;
      if (isNaN(timeA)) return 1; // Put invalid timestamps at end
      if (isNaN(timeB)) return -1;
      
      return timeA - timeB;
    } catch (error) {
      console.error('MessageUtils: Error sorting messages by timestamp:', error);
      return 0; // Maintain original order on error
    }
  });

  const chatMessages: ChatMessage[] = [];
  const groupedByRequest = groupMessagesByRequest(sortedMessages);
  
  // Sort request groups by their earliest message timestamp
  const sortedRequestGroups = Array.from(groupedByRequest.entries()).sort(([, messagesA], [, messagesB]) => {
    try {
      const timestampsA = messagesA.map(m => {
        const time = new Date(m.created_at).getTime();
        return isNaN(time) ? Date.now() : time;
      });
      const timestampsB = messagesB.map(m => {
        const time = new Date(m.created_at).getTime();
        return isNaN(time) ? Date.now() : time;
      });
      
      const earliestA = Math.min(...timestampsA);
      const earliestB = Math.min(...timestampsB);
      return earliestA - earliestB;
    } catch (error) {
      console.error('MessageUtils: Error sorting request groups:', error);
      return 0;
    }
  });
  
  // Process each request group in chronological order
  for (const [requestId, requestMessages] of sortedRequestGroups) {
    const sortedRequestMessages = requestMessages.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Find user message (should be first)
    const userMessage = sortedRequestMessages.find(m => m.role === 'user');
    if (userMessage) {
      chatMessages.push(transformAssistantMessageToChat(userMessage));
    }

    // Check if this is a generation request (has step messages)
    const stepMessages = sortedRequestMessages.filter(m => 
      m.role === 'assistant' && m.step && m.mode === 'generate'
    );

    if (stepMessages.length > 0) {
      // Create a steps message
      const steps = transformMessagesToSteps(stepMessages);
      if (steps.length > 0) {
        chatMessages.push({
          type: 'steps',
          steps: steps,
          messageId: requestId,
        });
      }
    } else {
      // Regular assistant messages (chat, edit mode, etc.)
      const assistantMessages = sortedRequestMessages.filter(m => 
        m.role === 'assistant' && !m.step // Exclude step messages from regular flow
      );
      assistantMessages.forEach(message => {
        chatMessages.push(transformAssistantMessageToChat(message));
      });
    }
  }

  console.log(`MessageUtils: Transformed ${dbMessages.length} DB messages into ${chatMessages.length} chat messages`);
  return chatMessages;
}

/**
 * Transform database messages to ChatWindow format with comprehensive error handling
 */
export function transformDatabaseMessagesToChat(dbMessages: AssistantMessage[]): ChatMessage[] {
  try {
    if (!Array.isArray(dbMessages)) {
      console.error('MessageUtils: dbMessages is not an array:', dbMessages);
      return [];
    }

    if (dbMessages.length === 0) {
      return [];
    }

    console.log(`MessageUtils: Starting transformation of ${dbMessages.length} database messages`);
    
    const result = orderMessagesChronologically(dbMessages);
    
    console.log(`MessageUtils: Successfully transformed ${dbMessages.length} database messages into ${result.length} chat messages`);
    return result;
  } catch (error) {
    console.error('MessageUtils: Critical error in transformDatabaseMessagesToChat:', error);
    console.error('MessageUtils: dbMessages data:', dbMessages);
    
    // Return empty array on critical error to prevent chat from breaking
    return [];
  }
}