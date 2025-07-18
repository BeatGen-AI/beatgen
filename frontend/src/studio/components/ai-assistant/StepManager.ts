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

  constructor() {
    this.initializeMusicGeneration();
  }

  /**
   * Initialize the 6 expected music generation steps
   */
  initializeMusicGeneration() {
    const expectedSteps = [
      { id: 1, name: "Instrument Selection" },
      { id: 2, name: "Drum Selection" },
      { id: 3, name: "Chord Generation" },
      { id: 4, name: "Melody Explanation" },
      { id: 5, name: "Melody Generation" },
      { id: 6, name: "Drum Beat Generation" }
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

    console.log('🎵 StepManager: Initialized 6 music generation steps');
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

    console.log(`📡 StepManager: Added ${event.type} event for step ${eventData.step_id} (${eventData.step_name})`);
    
    // Notify listeners
    this.notifyListeners();
  }

  /**
   * Get all steps in logical order (1 → 6) for display
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
   * Reset for new generation
   */
  reset() {
    this.initializeMusicGeneration();
    this.notifyListeners();
  }
}