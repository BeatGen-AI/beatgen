import { Store } from '../../core/state/store';
import { RootState, SetFn, GetFn, StoreSliceCreator } from '../types';
import { getAudioEngine } from '../../core/audio-engine/AudioEngine';

// Define the state properties for this slice
export interface CoreSlice {
  store: Store | null;
  isInitialized: boolean;
  setStore: (store: Store) => void;
  setIsInitialized: (isInitialized: boolean) => void;
  initializeAudio: () => Promise<void>;
  ensureProjectExists: () => Promise<void>;
  // Reference to the generic state updater (will be provided by the root store creator)
  _updateState: <K extends keyof RootState>(
    key: K, 
    value: RootState[K] | ((prev: RootState[K]) => RootState[K])
  ) => void;
  _withErrorHandling: <T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    actionName: string
  ) => (...args: T) => Promise<R | null>;
}

// Create the slice function
export const createCoreSlice: StoreSliceCreator<CoreSlice> = (set, get) => {
  // Utility to directly set state within this slice
  const setCoreState = (partial: Partial<CoreSlice> | ((state: CoreSlice) => Partial<CoreSlice>)) => set(partial);

  // Initialize the audio engine with error handling
  const initializeAudio = async () => {
    const rootGet = get as GetFn; // Cast get to the RootState getter
    const { store, projectTitle, _withErrorHandling } = rootGet();
    
    const initLogic = async () => {
      if (!store) {
        console.error("Store instance is null during initialization");
        throw new Error("Store instance not available");
      }

      // Project state is now managed by Zustand (projectId, projectTitle, bpm, etc.)
      // No need for ProjectManager - Zustand state is initialized with defaults
      console.log('Initializing audio with project:', projectTitle);

      await store.initializeAudio();

      // Initialize the new AudioEngine (Phase 6 migration)
      // The new engine receives state via setState() instead of store getter
      const audioEngine = getAudioEngine();
      if (!audioEngine.isReady()) {
        await audioEngine.initialize();
        console.log('CoreSlice: New AudioEngine initialized');
      }

      // Set up engine event subscriptions (time updates, state changes, errors)
      // This connects the engine to the Zustand store so UI updates when engine state changes
      await rootGet().initializeAudioEngine();
      console.log('CoreSlice: AudioEngine subscriptions set up');

      setCoreState({ isInitialized: true });
      
      // Keep this for debugging if needed, but generally avoid window assignment
      // (window as any).storeInstance = store; 
    };

    // Wrap the initialization logic with error handling provided by the root store
    const safeInitializeAudio = _withErrorHandling(initLogic, 'initializeAudio');
    await safeInitializeAudio();
  };

  // Ensure project exists (for manual track addition)
  // Note: With Zustand as source of truth, project state is always initialized
  const ensureProjectExists = async () => {
    const rootGet = get as GetFn;
    const { store, projectTitle, _withErrorHandling } = rootGet();

    const ensureLogic = async () => {
      if (!store) {
        throw new Error("Store instance not available");
      }

      // Project state is managed by Zustand (projectId, projectTitle, bpm, etc.)
      // Zustand state is always initialized with defaults, so project always "exists"
      console.log('Project state ready for track addition:', projectTitle);
    };

    const safeEnsureProject = _withErrorHandling(ensureLogic, 'ensureProjectExists');
    await safeEnsureProject();
  };

  return {
    store: null, // Initialize store as null, it should be set externally or created on demand
    isInitialized: false,
    setStore: (newStore) => setCoreState({ store: newStore }),
    setIsInitialized: (isInitialized) => setCoreState({ isInitialized }),
    initializeAudio,
    ensureProjectExists,
    // Dummy implementations for placeholders, will be replaced by root store utilities
    _updateState: (key, value) => console.warn('_updateState called before initialization'),
    _withErrorHandling: <T extends unknown[], R>(
      fn: (...args: T) => Promise<R>,
      actionName: string
    ) => async (...args: T): Promise<R | null> => {
      console.warn('_withErrorHandling called before initialization for', actionName);
      try {
        return await fn(...args);
      } catch (error) {
        console.error(`Error in ${actionName} (uninitialized handler):`, error);
        return null;
      }
    },
  };
};
