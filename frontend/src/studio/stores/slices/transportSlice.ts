import { RefactoredStore } from '../../core/state/RefactoredStore';
import { RootState, SetFn, GetFn, StoreSliceCreator, PlaybackCommand } from '../types';
import * as Tone from 'tone';

// Define the state properties and actions for this slice
export interface TransportSlice {
  isPlaying: boolean;
  currentTime: number;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  handlePlaybackCommand: (command: PlaybackCommand, arg?: any) => Promise<void>;
  playPause: () => Promise<void>;
  stop: () => Promise<void>;
  seekToPosition: (position: number) => void;
}

// Create the slice function
export const createTransportSlice: StoreSliceCreator<TransportSlice> = (set, get) => {
  const rootGet = get as GetFn; // Helper for root state access
  let positionUpdateInterval: NodeJS.Timeout | null = null;

  // Utility to set state within this slice
  const setTransportState = (partial: Partial<TransportSlice> | ((state: TransportSlice) => Partial<TransportSlice>)) => set(partial);
  
  // Consolidated playback command handler (extracted from original store)
  const handlePlaybackCommand = async (command: PlaybackCommand, arg?: any) => {
    const { store, isPlaying, _withStore, _withErrorHandling } = rootGet();

    if (!_withStore || !_withErrorHandling) {
        console.error("_withStore or _withErrorHandling not available for playback command");
        return;
    }

    const commandLogic = async (store: RefactoredStore) => {
        const transport = store.getTransport();
        if (!transport) {
            console.error("Transport not available in store");
            return;
        }

        const currentIsPlaying = rootGet().isPlaying; // Get potentially updated state

        switch(command) {
            case 'play':
                if (!currentIsPlaying) {
                    // Pass tracks to enable instance-aware playback
                    const tracks = rootGet().tracks;
                    await transport.play(tracks);
                    setTransportState({ isPlaying: true });
                    
                    // Start position update loop
                    if (positionUpdateInterval) {
                        clearInterval(positionUpdateInterval);
                    }
                    positionUpdateInterval = setInterval(() => {
                        const currentPos = transport.position;
                        setTransportState({ currentTime: currentPos });
                    }, 50); // Update every 50ms for smooth cursor movement
                }
                break;
            case 'pause':
                if (currentIsPlaying) {
                    // Stop position update loop
                    if (positionUpdateInterval) {
                        clearInterval(positionUpdateInterval);
                        positionUpdateInterval = null;
                    }
                    
                    await transport.pause(); // Now async in RefactoredTransportController
                    const newCurrentTime = transport.position; // Get current time from TransportController
                    setTransportState({ isPlaying: false, currentTime: newCurrentTime });
                }
                break;
            case 'stop':
                // Stop position update loop
                if (positionUpdateInterval) {
                    clearInterval(positionUpdateInterval);
                    positionUpdateInterval = null;
                }
                
                await transport.stop();
                setTransportState({ isPlaying: false, currentTime: 0 });
                break;
            case 'seek':
                if (typeof arg === 'number') {
                    transport.setPosition(arg);
                    setTransportState({ currentTime: arg });
                } else {
                    console.error('Seek command requires a numeric argument (position)');
                }
                break;
            default:
                 console.error(`Unknown playback command: ${command}`);
        }
    };

    // Wrap the logic
    await _withErrorHandling(async () => _withStore(commandLogic)(), `handlePlaybackCommand: ${command}`)();
  };

  return {
    // Initial state
    isPlaying: false,
    currentTime: 0,
    
    // Basic setters
    setIsPlaying: (isPlaying) => setTransportState({ isPlaying }),
    setCurrentTime: (time) => setTransportState({ currentTime: time }),
    
    // Actions
    handlePlaybackCommand,
    playPause: async () => {
      // Read current isPlaying state *inside* the action
    //   if (Tone.getContext().state !== 'running') {
    //     await Tone.start();
    //   }
    //console.log('>>> Tone.getContext().state <<<', Tone.getContext().state);
      //await Tone.start();
      //await Tone.getTransport().start();
      //console.log('>>> Tone.getContext().state after start <<<', Tone.getContext().state);
      const currentlyPlaying = rootGet().isPlaying;
      await handlePlaybackCommand(currentlyPlaying ? 'pause' : 'play');
    },
    stop: () => handlePlaybackCommand('stop'),
    seekToPosition: (position) => handlePlaybackCommand('seek', position), // No need to await void
  };
};
