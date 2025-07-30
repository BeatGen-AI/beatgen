/**
 * StepManager - Manages music generation steps for client-side ordering
 * 
 * Receives step events from backend in completion order, displays in logical order
 */

export interface StepEvent {
  id: string;
  stepId: number;
  stepName: string;
  type: 'explanation' | 'stage' | 'status' | 'action';
  timestamp: number;
  content?: string;
  title?: string;
  actionType?: string;
  actionData?: any;
  isStreaming?: boolean;
  streamingContent?: string;
}

export interface Step {
  id: number;
  name: string;
  status: 'pending' | 'in_progress' | 'completed';
  events: StepEvent[];
  startTime?: number;
  endTime?: number;
}

export class StepManager {
  private steps = new Map<number, Step>();
  private events: StepEvent[] = [];
  private listeners: ((steps: Step[]) => void)[] = [];
  private streamingEvent: StepEvent | null = null;

  constructor() {
    this.initializeMusicGeneration();
  }

  /**
   * Initialize the 7 expected music generation steps
   */
  initializeMusicGeneration() {
    const expectedSteps = [
      { id: 0, name: "Researching Musical Context" },
      { id: 1, name: "Determine Musical Parameters" },
      { id: 2, name: "Instrument Selection" },
      { id: 3, name: "Drum Selection" },
      { id: 4, name: "Drum Beat Generation" },
      { id: 5, name: "Chord Generation" },
      { id: 6, name: "Melody Generation" }
    ];

    this.steps.clear();
    this.events = [];

    expectedSteps.forEach(stepDef => {
      this.steps.set(stepDef.id, {
        id: stepDef.id,
        name: stepDef.name,
        status: 'pending',
        events: []
      });
    });

    console.log('StepManager: Initialized 7 music generation steps');
  }

  /**
   * Add an event from the backend (arrives in completion order)
   */
  addEvent(eventData: {
    step_id: number;
    step_name: string;
    event_type: string;
    content?: string;
    title?: string;
    action_type?: string;
    action_data?: any;
    timestamp: string;
  }) {
    const event: StepEvent = {
      id: `${eventData.step_id}-${Date.now()}-${Math.random()}`,
      stepId: eventData.step_id,
      stepName: eventData.step_name,
      type: eventData.event_type as StepEvent['type'],
      timestamp: new Date(eventData.timestamp).getTime(),
      content: eventData.content,
      title: eventData.title,
      actionType: eventData.action_type,
      actionData: eventData.action_data
    };

    // Add to events list
    this.events.push(event);

    // Update step status and add event
    const step = this.steps.get(eventData.step_id);
    if (step) {
      step.events.push(event);
      
      // Update step status based on event type
      if (event.type === 'stage' && step.status === 'pending') {
        step.status = 'in_progress';
        step.startTime = event.timestamp;
      } else if (event.type === 'status' && event.content?.includes('completed')) {
        step.status = 'completed';
        step.endTime = event.timestamp;
      }
    }

    console.log(`StepManager: Added ${event.type} event for step ${eventData.step_id}`);
    
    // Notify listeners
    this.notifyListeners();
  }

  /**
   * Get all steps in logical order (0 → 6) for display
   */
  getOrderedSteps(): Step[] {
    return Array.from(this.steps.values()).sort((a, b) => a.id - b.id);
  }

  /**
   * Get all events in display order (by step ID, then by timestamp within step)
   */
  getOrderedEvents(): StepEvent[] {
    return this.events.sort((a, b) => {
      // Primary sort: step ID  
      if (a.stepId !== b.stepId) return a.stepId - b.stepId;
      
      // Secondary sort: type priority within step
      const typePriority = { stage: 0, explanation: 1, action: 2, status: 3 };
      const aPriority = typePriority[a.type] ?? 999;
      const bPriority = typePriority[b.type] ?? 999;
      if (aPriority !== bPriority) return aPriority - bPriority;
      
      // Tertiary sort: timestamp
      return a.timestamp - b.timestamp;
    });
  }

  /**
   * Get events for a specific step
   */
  getEventsForStep(stepId: number): StepEvent[] {
    return this.events.filter(e => e.stepId === stepId);
  }

  /**
   * Add listener for step updates
   */
  addListener(listener: (steps: Step[]) => void) {
    this.listeners.push(listener);
  }

  /**
   * Remove listener
   */
  removeListener(listener: (steps: Step[]) => void) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of step changes
   */
  private notifyListeners() {
    const orderedSteps = this.getOrderedSteps();
    this.listeners.forEach(listener => listener(orderedSteps));
  }

  /**
   * Get summary stats
   */
  getStats() {
    const steps = this.getOrderedSteps();
    const completed = steps.filter(s => s.status === 'completed').length;
    const inProgress = steps.filter(s => s.status === 'in_progress').length;
    const pending = steps.filter(s => s.status === 'pending').length;

    return {
      total: steps.length,
      completed,
      inProgress,
      pending,
      totalEvents: this.events.length
    };
  }

  /**
   * Start streaming content for the currently active step
   */
  startStreaming(title?: string): string | null {
    // Find the step that's currently in progress
    const activeStep = Array.from(this.steps.values()).find(step => step.status === 'in_progress');
    
    if (!activeStep) {
      console.warn('StepManager: No active step found for streaming');
      return null;
    }

    // Create a streaming event
    const streamingEvent: StepEvent = {
      id: `${activeStep.id}-streaming-${Date.now()}`,
      stepId: activeStep.id,
      stepName: activeStep.name,
      type: 'explanation',
      timestamp: Date.now(),
      title: title,
      content: '',
      isStreaming: true,
      streamingContent: ''
    };

    // Add to step events and track as current streaming event
    activeStep.events.push(streamingEvent);
    this.events.push(streamingEvent);
    this.streamingEvent = streamingEvent;

    console.log(`StepManager: Started streaming for step ${activeStep.id} (${activeStep.name})`);
    
    // Notify listeners
    this.notifyListeners();
    
    return streamingEvent.id;
  }

  /**
   * Append a chunk to the current streaming event
   */
  appendChunk(chunk: string): void {
    if (!this.streamingEvent) {
      console.warn('StepManager: No active streaming event to append chunk to');
      return;
    }

    this.streamingEvent.streamingContent = (this.streamingEvent.streamingContent || '') + chunk;
    
    // Notify listeners for real-time updates
    this.notifyListeners();
  }

  /**
   * Finalize the current streaming event
   */
  finalizeStreaming(): void {
    if (!this.streamingEvent) {
      return;
    }

    // Move streaming content to regular content and mark as not streaming
    this.streamingEvent.content = this.streamingEvent.streamingContent || '';
    this.streamingEvent.isStreaming = false;
    this.streamingEvent.streamingContent = undefined;

    console.log(`StepManager: Finalized streaming event ${this.streamingEvent.id}`);
    
    this.streamingEvent = null;
    
    // Notify listeners
    this.notifyListeners();
  }

  /**
   * Get the currently active (in_progress) step
   */
  getActiveStep(): Step | null {
    return Array.from(this.steps.values()).find(step => step.status === 'in_progress') || null;
  }

  /**
   * Check if there's currently an active streaming event
   */
  get hasActiveStream(): boolean {
    return this.streamingEvent !== null;
  }

  /**
   * Reset for new generation
   */
  reset() {
    this.streamingEvent = null;
    this.initializeMusicGeneration();
    this.notifyListeners();
  }
}