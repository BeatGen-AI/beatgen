import React, { useEffect, useRef, useState, useMemo, useLayoutEffect, useCallback } from 'react';
import { Box, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';

// Import components
import TrackControlsSidebar from './components/sidebar/TrackControlsSidebar';
import { KonvaTimeline, KonvaTimelineRef } from './components/timeline/KonvaTimeline';
import { CombinedTrack } from '../platform/types/project';
import AddTrackMenu from './components/sidebar/AddTrackMenu';
import { GRID_CONSTANTS, pixelsToTicks, ticksToPixels } from './constants/gridConstants';
import { useStudioStore } from './stores/studioStore';
import { 
  createInstance, 
  updateInstance, 
  deleteInstance, 
  updateMultipleInstances,
  splitInstance,
  getInstanceWidth 
} from './utils/trackInstanceUtils';

// Import piano roll components
import PianoRollWindows from './components/piano-roll-new/PianoRollWindows';

// Import custom hooks
import { useStudioDBSession } from './hooks/useStudioDBSession';
import { useHistorySync } from './hooks/useHistorySync';
import { useAutoSave } from './hooks/useAutoSave';

import StudioControlBar from './components/control-bar/ControlBar';
import { DEFAULT_MEASURE_WIDTH, useGridStore } from './core/state/gridStore';
import ChatWindow from './components/ai-assistant/ChatWindow';
import DrumMachineWindows from './components/drum-machine/DrumMachineWindows';
import { StudioSettingsModal } from './components/modals/StudioSettingsModal';
import { useAppTheme } from '../platform/theme/ThemeContext';
import { studioLightTheme, studioDarkTheme } from '../platform/theme/ThemeContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { IconChevronLeftPipe, IconChevronRightPipe } from '@tabler/icons-react';
import { GridSnapOption } from './components/piano-roll2/gridConstants';

// Studio Component Props
interface StudioProps {
  projectId?: string;
}

const COLLAPSED_SIDEBAR_WIDTH = '40px'; // Width of the sidebar when collapsed

// Main Studio Component
function Studio({ projectId }: StudioProps) {
  // Add console log here
  console.log('>>> Studio Component Rendering <<<'); 

  // Initialize DB session management
  useStudioDBSession();
  
  // Setup history state sync
  useHistorySync();
  
  // Ref and state for Control Bar height
  const controlBarRef = useRef<HTMLDivElement>(null);
  const [controlBarHeight, setControlBarHeight] = useState(0);
  
  // Get studioMode from theme context
  const { studioMode } = useAppTheme();
  
  // Get state and actions from Zustand store
  const {
    store,
    tracks,
    isPlaying,
    currentTime,
    bpm,
    timeSignature,
    keySignature,
    zoomLevel,
    projectTitle,
    canUndo,
    canRedo,
    measureCount,
    isInitialized,
    addMenuAnchor,
    autoSaveStatus,
    autoSaveMessage,
    selectedTrackIds,
    
    // Tool state
    selectedTool,
    snapToGrid,
    setSelectedTool,
    toggleSnapToGrid,
    
    // Actions
    initializeAudio,
    loadProject,
    setZoomLevel,
    handleProjectParamChange,
    playPause,
    stop,
    setCurrentTime,
    setMeasureCount,
    undo,
    redo,
    setAutoSaveStatus,
    setSelectedTrackIds,
    handleTrackVolumeChange,
    handleTrackPanChange,
    handleTrackMuteToggle,
    handleTrackSoloToggle,
    handleTrackDelete,
    handleAddTrack,
    handleTrackPositionChange,
    handleTrackResizeEnd,
    handleTrackNameChange,
    handleInstrumentChange,
    // Group operations for clipboard functionality
    duplicateTrack,
    duplicateMultipleTracks,
    deleteMultipleTracks,
    updateMultipleTrackPositions,
    resizeMultipleTracks,
    uploadAudioFile,
    setAddMenuAnchor,
    openDrumMachines,
    closeDrumMachine,
    setDrumPattern,
    addSamplerTrackToDrumTrack,
    removeSamplerTrack,
    selectDrumTrackById,
    selectSamplerTracksForDrumTrack,
    // Fetch MIDI actions
    addMidiNote,
    removeMidiNote,
    updateMidiNote,
    replaceTrackAudioFile,
    // Instance handlers
    handleInstancePositionChange,
    handleInstanceResizeEnd,
    updateMultipleInstancePositions,
    resizeMultipleInstances,
    // Track update function
    updateTrack,
  } = useStudioStore();
  
  const scrollRef = useRef<KonvaTimelineRef>(null);
  
  // Custom instance handlers that work with instance_metadata
  const handleInstanceCreate = useCallback((
    trackId: string, 
    x: number, 
    y: number,
    trim_start_ticks = 0,
    trim_end_ticks = 0
  ) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    
    const updatedTrack = createInstance(track, x, y, trim_start_ticks, trim_end_ticks);
    // Only update instance_metadata to avoid overwriting other fields
    updateTrack(trackId, {
      instance_metadata: updatedTrack.instance_metadata
    });
  }, [tracks, updateTrack]);

  const handleInstanceUpdate = useCallback((
    trackId: string,
    instanceId: number,
    updates: Partial<{ x: number; y: number; trim_start_ticks: number; trim_end_ticks: number }>
  ) => {
    console.log('[Studio] handleInstanceUpdate called:', { trackId, instanceId, updates });
    const track = tracks.find(t => t.id === trackId);
    if (!track) {
      console.error('[Studio] Track not found:', trackId);
      return;
    }
    
    const updatedTrack = updateInstance(track, instanceId, updates);
    console.log('[Studio] Updated track with new instance data:', updatedTrack);
    
    // Only update instance_metadata to avoid overwriting other fields
    updateTrack(trackId, {
      instance_metadata: updatedTrack.instance_metadata
    });
  }, [tracks, updateTrack]);

  const handleInstanceDelete = useCallback((
    trackId: string,
    instanceId: number
  ) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    
    const updatedTrack = deleteInstance(track, instanceId);
    // Only update instance_metadata to avoid overwriting other fields
    updateTrack(trackId, {
      instance_metadata: updatedTrack.instance_metadata
    });
  }, [tracks, updateTrack]);

  const handleBatchInstanceUpdate = useCallback((
    updates: Map<string, Array<{ id: number; changes: Partial<{ x: number; y: number; trim_start_ticks: number; trim_end_ticks: number }> }>>
  ) => {
    console.log('[Studio] handleBatchInstanceUpdate called with:', updates);
    
    // Check if this is a resize operation (has trim changes)
    let isResize = false;
    const instanceUpdatesArray: Array<{trackId: string, instanceId: string, widthDelta: number, anchor: 'left' | 'right'}> = [];
    const positionUpdatesArray: Array<{trackId: string, instanceId: string, deltaX: number, deltaY: number}> = [];
    
    updates.forEach((instanceUpdates, trackId) => {
      const track = tracks.find(t => t.id === trackId);
      if (!track || !track.instance_metadata) return;
      
      instanceUpdates.forEach(update => {
        const instance = track.instance_metadata?.instances.find(i => i.id === update.id);
        if (!instance) return;
        
        if (update.changes.trim_start_ticks !== undefined || update.changes.trim_end_ticks !== undefined) {
          isResize = true;
          
          // Calculate width delta for resize
          if (update.changes.trim_start_ticks !== undefined && update.changes.x !== undefined) {
            // Left resize
            const deltaX = update.changes.x - instance.x;
            const widthDelta = -ticksToPixels(deltaX, bpm, timeSignature); // Negative because left resize decreases width
            instanceUpdatesArray.push({
              trackId,
              instanceId: String(update.id),
              widthDelta,
              anchor: 'left'
            });
          } else if (update.changes.trim_end_ticks !== undefined) {
            // Right resize
            const oldWidth = ticksToPixels(getInstanceWidth(instance, track.duration_ticks), bpm, timeSignature);
            const newTrimEnd = update.changes.trim_end_ticks;
            const newWidth = ticksToPixels(track.duration_ticks - instance.trim_start_ticks - newTrimEnd, bpm, timeSignature);
            const widthDelta = newWidth - oldWidth;
            instanceUpdatesArray.push({
              trackId,
              instanceId: String(update.id),
              widthDelta,
              anchor: 'right'
            });
          }
        } else if (update.changes.x !== undefined || update.changes.y !== undefined) {
          // Position change
          const deltaX = (update.changes.x || instance.x) - instance.x;
          const deltaY = (update.changes.y || instance.y) - instance.y;
          positionUpdatesArray.push({
            trackId,
            instanceId: String(update.id),
            deltaX,
            deltaY
          });
        }
      });
    });
    
    if (isResize && instanceUpdatesArray.length > 0) {
      // Use the resize action with history
      resizeMultipleInstances(instanceUpdatesArray);
    } else if (positionUpdatesArray.length > 0) {
      // Use the position update action with history
      updateMultipleInstancePositions(positionUpdatesArray);
    }
  }, [tracks, updateMultipleInstancePositions, resizeMultipleInstances, bpm, timeSignature]);

  const handleInstanceSplit = useCallback((
    trackId: string,
    instanceId: number,
    splitPosition: number
  ) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    
    const updatedTrack = splitInstance(track, instanceId, splitPosition);
    // Only update instance_metadata to avoid overwriting other fields
    updateTrack(trackId, {
      instance_metadata: updatedTrack.instance_metadata
    });
  }, [tracks, updateTrack]);
  const animationFrameRef = useRef<number | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Default to open
  const [existingProjectId, setExistingProjectId] = useState<string | null>(projectId || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [trackIdForFileUpload, setTrackIdForFileUpload] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [gridSnapSize, setGridSnapSize] = useState(GridSnapOption.STEP);

  const handleChatToggle = () => {
    setIsChatOpen(prev => !prev);
  };

  const handleSettingsToggle = () => {
    setIsSettingsModalOpen(prev => !prev);
  };

  // Note: instance_metadata is now ensured in processTrack during project loading
  // This prevents race conditions and unnecessary re-renders

  // Test function for debugging undo/redo
  useEffect(() => {
    // @ts-ignore - for debugging
    window.testUndoRedo = async () => {
      console.log('=== Testing Undo/Redo with Fixed State References ===');
      const state = useStudioStore.getState();
      console.log('Initial state:', { 
        canUndo: state.canUndo, 
        canRedo: state.canRedo, 
        tracks: state.tracks.length,
        trackNames: state.tracks.map(t => t.name)
      });
      
      // Test 1: Simple track duplication
      if (state.tracks.length > 0) {
        const firstTrack = state.tracks[0];
        console.log(`\n--- Test 1: Duplicating track "${firstTrack.name}" ---`);
        
        await state.duplicateTrack(firstTrack.id);
        
        // Check state after duplication
        await new Promise(resolve => setTimeout(resolve, 100));
        const afterDup = useStudioStore.getState();
        console.log('After duplicate:', { 
          canUndo: afterDup.canUndo, 
          canRedo: afterDup.canRedo, 
          tracks: afterDup.tracks.length,
          trackNames: afterDup.tracks.map(t => t.name)
        });
        
        // Test undo
        console.log('\nCalling undo...');
        await afterDup.undo();
        
        await new Promise(resolve => setTimeout(resolve, 100));
        const afterUndo = useStudioStore.getState();
        console.log('After undo:', { 
          canUndo: afterUndo.canUndo, 
          canRedo: afterUndo.canRedo, 
          tracks: afterUndo.tracks.length,
          trackNames: afterUndo.tracks.map(t => t.name)
        });
        
        // Test redo
        console.log('\nCalling redo...');
        await afterUndo.redo();
        
        await new Promise(resolve => setTimeout(resolve, 100));
        const afterRedo = useStudioStore.getState();
        console.log('After redo:', { 
          canUndo: afterRedo.canUndo, 
          canRedo: afterRedo.canRedo, 
          tracks: afterRedo.tracks.length,
          trackNames: afterRedo.tracks.map(t => t.name)
        });
      }
      
      // Test 2: Track instance operations
      const currentState = useStudioStore.getState();
      if (currentState.tracks.length > 0) {
        const track = currentState.tracks[0];
        console.log(`\n--- Test 2: Adding instance to track "${track.name}" ---`);
        
        const instanceId = await currentState.addTrackInstance(track.id, { x: 500, y: 0 });
        console.log('Added instance:', instanceId);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        const afterAdd = useStudioStore.getState();
        const trackAfterAdd = afterAdd.tracks.find(t => t.id === track.id);
        console.log('Instances after add:', trackAfterAdd?.instance_metadata?.instances.length);
        
        // Test undo instance add
        console.log('\nUndoing instance add...');
        await afterAdd.undo();
        
        await new Promise(resolve => setTimeout(resolve, 100));
        const afterInstanceUndo = useStudioStore.getState();
        const trackAfterUndo = afterInstanceUndo.tracks.find(t => t.id === track.id);
        console.log('Instances after undo:', trackAfterUndo?.instance_metadata?.instances.length);
      }
      
      console.log('\n=== Test Complete ===');
    };
  }, []);

  // Initialize auto-save
  const autoSave = useAutoSave({
    projectId: existingProjectId || undefined,
    onStatusChange: (status, message) => {
      setAutoSaveStatus(status, message);
    },
    onSaveSuccess: (project) => {
      console.log('Auto-save success:', project);
      // Update project ID if this was a new project
      if (!existingProjectId && project.id) {
        setExistingProjectId(project.id);
      }
    },
    onSaveError: (error, willRetry) => {
      console.error('Auto-save error:', error, 'willRetry:', willRetry);
    },
    onProjectIdUpdate: (projectId) => {
      console.log('Studio: Updating project ID from auto-save:', projectId);
      setExistingProjectId(projectId);
      // Update URL to include the new project ID
      const newUrl = `/studio?projectId=${projectId}`;
      window.history.replaceState({}, '', newUrl);
    }
  });

  // Add keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if we're in an input field
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Cmd/Ctrl + Z for undo
      if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (canUndo) {
          console.log('Keyboard shortcut: Undo');
          undo();
        }
      }
      // Cmd/Ctrl + Shift + Z for redo
      else if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'z') {
        event.preventDefault();
        if (canRedo) {
          console.log('Keyboard shortcut: Redo');
          redo();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [canUndo, canRedo, undo, redo]);

  // Effect to measure control bar height
  useLayoutEffect(() => {
    if (controlBarRef.current) {
      const height = controlBarRef.current.offsetHeight;
      setControlBarHeight(height);
      console.log('Control Bar Height:', height);
    }
  }, []); // Empty dependency array to run once on mount

  // Initialize audio engine
  useEffect(() => {
    console.log('>>> Studio useEffect <<<');
    // Always favor prop projectId over existingProjectId state
    const projectToLoad = projectId || existingProjectId;
    
    // If we have a project ID, load the project instead of just initializing
    if (projectToLoad) {
      console.log(`Studio initialized with existing project ID: ${projectToLoad}`);
      loadProject(projectToLoad)
        .then(() => {
          console.log(`Successfully loaded project: ${projectToLoad}`);
          // Update existingProjectId state if it was from props
          if (projectId && projectId !== existingProjectId) {
            setExistingProjectId(projectId);
          }
        })
        .catch(error => {
          console.error('Failed to load project:', error);
          // Fall back to initializing an empty project
          initializeAudio();
        });
    } else {
      console.log('Studio initialized with new project');
      initializeAudio();
    }
    
    return () => {
      // Cleanup on unmount
      delete (window as any).storeInstance;
    };
  }, [initializeAudio, existingProjectId, projectId, loadProject]);
  
  // Handlers
  const handleBpmChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newBpm = parseInt(event.target.value, 10);
    if (!isNaN(newBpm) && newBpm > 0 && newBpm <= 999) {
      // Use handleProjectParamChange instead of setBpm
      handleProjectParamChange('bpm', newBpm);
    }
  };

  const handleTimeSignatureChange = (numerator?: number, denominator?: number) => {
    const [currentNumerator, currentDenominator] = timeSignature;
    // Use handleProjectParamChange for both numerator and denominator
    // Note: This assumes handleProjectParamChange can handle updating nested state or the store handles this logic.
    // If it needs separate updates, this needs adjustment.
    // For now, let's update them individually if provided.
    if (numerator !== undefined) {
      handleProjectParamChange('timeSignature', [numerator, currentDenominator]);
    }
    if (denominator !== undefined) {
      // Get the potentially updated numerator before setting denominator
      const updatedNumerator = numerator !== undefined ? numerator : currentNumerator;
      handleProjectParamChange('timeSignature', [updatedNumerator, denominator]);
    }
  };

  const handleZoomIn = () => {
    setZoomLevel(Math.min(zoomLevel + GRID_CONSTANTS.studioZoomStep, GRID_CONSTANTS.studioZoomMax));
    // Update measureWidth in gridStore based on zoom level
    const newMeasureWidth = DEFAULT_MEASURE_WIDTH * (Math.min(zoomLevel + GRID_CONSTANTS.studioZoomStep, GRID_CONSTANTS.studioZoomMax));
    useGridStore.getState().setMidiMeasurePixelWidth(newMeasureWidth);
    useGridStore.getState().setAudioMeasurePixelWidth(newMeasureWidth);
  };

  const handleZoomOut = () => {
    setZoomLevel(Math.max(zoomLevel - GRID_CONSTANTS.studioZoomStep, GRID_CONSTANTS.studioZoomMin));
    // Update measureWidth in gridStore based on zoom level
    const newMeasureWidth = DEFAULT_MEASURE_WIDTH * (Math.max(zoomLevel - GRID_CONSTANTS.studioZoomStep, GRID_CONSTANTS.studioZoomMin));
    useGridStore.getState().setMidiMeasurePixelWidth(newMeasureWidth);
    useGridStore.getState().setAudioMeasurePixelWidth(newMeasureWidth);
  };

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleProjectParamChange('projectTitle', event.target.value);
  };

  // Handler to trigger file input for replacing track audio
  const handleLoadAudioFile = (trackId: string) => {
    if (fileInputRef.current) {
      setTrackIdForFileUpload(trackId);
      fileInputRef.current.click();
    }
  };

  // Handler for when a file is selected via the hidden input
  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && trackIdForFileUpload) {
      console.log(`File selected for track ${trackIdForFileUpload}:`, file.name);
      replaceTrackAudioFile(trackIdForFileUpload, file);
    }
    event.target.value = '';
    setTrackIdForFileUpload(null);
  };

  // Control playback cursor directly when playback state changes
  useEffect(() => {
    if (!scrollRef.current?.playbackCursor) {
      return;
    }
    if (!store) {
      throw new Error('No store available');
    }

    const cursor = scrollRef.current.playbackCursor;

    if (isPlaying) {
      cursor.play();
    } else {
      // isPlaying is false. This could be a pause or a stop.
      if (currentTime < 0.01) { // Check if time is (near) zero, indicating a stop
        cursor.stop();
      } else {
        cursor.pause();
      }
    }
    
    // Clean up any stray animation frames
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, currentTime, store]); // Added currentTime to dependencies

  // Handle infinite scrolling for the timeline
  const handleScroll = React.useCallback(() => {
    if (!scrollRef.current) return;

    // KonvaTimeline uses viewport-based scrolling
    const viewport = scrollRef.current.getViewport();
    const totalWidth = measureCount * GRID_CONSTANTS.measureWidth * zoomLevel;

    if (viewport.x + viewport.width >= totalWidth - 100) {
      setMeasureCount(measureCount + 20);
    }
  }, [measureCount, setMeasureCount, zoomLevel]);

  // Since KonvaTimeline handles its own scrolling, we don't need the scroll event listener
  // The viewport changes are handled internally by KonvaTimeline

  // Clipboard operation handlers
  const handleCopyTracks = useCallback((tracks: CombinedTrack[]) => {
    console.log('Copying tracks:', tracks.map(t => t.name));
    // The interaction manager handles the clipboard state
  }, []);

  const handleCutTracks = useCallback((tracks: CombinedTrack[]) => {
    console.log('Cutting tracks:', tracks.map(t => t.name));
    // For cut operation, the interaction manager handles the clipboard state
    // We don't delete here - deletion happens on paste if it's a cut operation
    // The useClipboard hook manages this internally
  }, []);

  const handlePasteTracks = useCallback((tracks: CombinedTrack[], position?: { x: number; y: number }) => {
    console.log('Pasting tracks:', tracks.map(t => t.name), 'at position:', position);
    
    // For paste operation, we need to duplicate the tracks
    const trackIds = tracks.map(t => t.id);
    
    // Calculate offset for pasting
    let offsetX = 0;
    if (position) {
      // Calculate the leftmost position of the tracks being pasted
      const minX = Math.min(...tracks.map(t => t.x_position));
      offsetX = position.x - minX;
    } else {
      // No position provided (e.g., keyboard paste)
      // Default offset to place copies after the originals
      offsetX = 0;
    }
    
    // Use duplicateMultipleTracks which handles the GroupAction
    duplicateMultipleTracks(trackIds, offsetX);
  }, [duplicateMultipleTracks]);

  const handleDeleteTracks = useCallback((trackIds: string[]) => {
    console.log('Deleting tracks:', trackIds);
    deleteMultipleTracks(trackIds);
    // Clear selection after delete
    setSelectedTrackIds([]);
  }, [deleteMultipleTracks, setSelectedTrackIds]);

  const handleDuplicateTracks = useCallback((trackIds: string[]) => {
    console.log('Duplicating tracks:', trackIds);
    duplicateMultipleTracks(trackIds);
  }, [duplicateMultipleTracks]);
  
  // Handle track resize - Timeline already handles group resize logic
  const handleTrackResize = useCallback((trackId: string, deltaPixels: number, direction: 'left' | 'right') => {
    // Timeline's interaction manager handles group resize internally
    // We just need to pass through to the single track handler
    console.log('Track resize:', trackId, 'delta:', deltaPixels, 'direction:', direction);
    handleTrackResizeEnd(trackId, deltaPixels, direction);
  }, [handleTrackResizeEnd]);

  // Determine the theme for the studio based on studioMode
  const currentStudioTheme = useMemo(() => {
    return studioMode === 'light' ? studioLightTheme : studioDarkTheme;
  }, [studioMode]);

  return (
    <MuiThemeProvider theme={currentStudioTheme}>
      <Box sx={{ 
        height: '100vh', 
        bgcolor: 'background.default',
        color: 'text.primary',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <StudioControlBar
          ref={controlBarRef}
          canUndo={canUndo}
          canRedo={canRedo}
          bpm={bpm}
          timeSignature={timeSignature}
          keySignature={keySignature}
          isPlaying={isPlaying}
          projectTitle={projectTitle}
          zoomLevel={zoomLevel}
          currentTime={currentTime}
          isChatOpen={isChatOpen}
          existingProjectId={existingProjectId}
          tracks={tracks}
          autoSaveStatus={autoSaveStatus}
          autoSaveMessage={autoSaveMessage}
          onUndo={undo}
          onRedo={redo}
          onBpmChange={handleBpmChange}
          onTimeSignatureChange={handleTimeSignatureChange}
          onKeySignatureChange={(newKey) => handleProjectParamChange('keySignature', newKey)}
          onPlayPause={playPause}
          onStop={stop}
          onTitleChange={handleTitleChange}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onChatToggle={handleChatToggle}
          onSettingsToggle={handleSettingsToggle}
          onAutoSaveRetry={() => autoSave.forceSave()}
          selectedTool={selectedTool}
          snapToGrid={snapToGrid}
          showToolbar={true}
          gridSnapSize={gridSnapSize}
          onToolChange={setSelectedTool}
          onToggleSnapToGrid={toggleSnapToGrid}
          onGridSnapSizeChange={setGridSnapSize}
        />

        {/* Main Content Area */}
        <Box sx={{ 
          display: 'flex', 
          flex: 1, 
          overflow: 'visible',
          position: 'relative',
          paddingTop: `${controlBarHeight}px`
        }}>
          {/* Left Sidebar - Fixed position */}
          <Box sx={{ 
            width: isSidebarOpen ? GRID_CONSTANTS.sidebarWidth : COLLAPSED_SIDEBAR_WIDTH,
            transition: 'width 0.3s ease-in-out',
            borderRight: `${GRID_CONSTANTS.borderWidth} solid ${GRID_CONSTANTS.borderColor}`,
            bgcolor: 'background.paper',
            display: 'flex',
            flexDirection: 'column',
            position: 'fixed',
            left: 0,
            top: `${controlBarHeight}px`,
            height: `calc(100vh - ${controlBarHeight}px)`,
            overflowX: 'hidden', // Prevent horizontal overflow during transition
            zIndex: 10
          }}>
            {/* Header section with Add Track button */}
            <Box sx={{
              height: GRID_CONSTANTS.headerHeight,
              minHeight: GRID_CONSTANTS.headerHeight, // Ensure header height is maintained
              borderBottom: `${GRID_CONSTANTS.borderWidth} solid ${GRID_CONSTANTS.borderColor}`,
              display: 'flex',
              alignItems: 'center',
              p: 0, // User's update
              boxSizing: 'border-box',
              overflow: 'hidden', // Prevent content spill during transition
            }}>
              <Box sx={{ 
                position: 'relative', 
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                padding: '0 4px', // Add some padding for content within header
              }}>
                {isSidebarOpen && (
                  <Button
                      size="small"
                      color="inherit"
                      onClick={() => {
                         setIsSidebarOpen(false);
                      }}
                      sx={{
                          borderRadius: '8px',
                          minWidth: 'auto',
                          width: '28px',
                          padding: '4px',
                          marginRight: '8px', // Space between close button and Add Track
                          '&:hover': {
                              backgroundColor: currentStudioTheme.palette.action.hover,
                          },
                      }}
                  >
                      <IconChevronLeftPipe size={20} />
                  </Button>
                )}
                {isSidebarOpen && (
                  <Button
                    startIcon={<AddIcon />}
                    variant="contained"
                    onClick={(e) => setAddMenuAnchor(e.currentTarget)}
                    sx={{
                      height: 24,
                      textTransform: 'none',
                      flexGrow: 1, 
                      display: 'flex',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      minWidth: 0, // Allow shrinking
                      overflow: 'hidden', // Prevent text overflow
                      textOverflow: 'ellipsis', // Add ellipsis for overflow
                      whiteSpace: 'nowrap', // Prevent wrapping
                    }}
                  >
                    Add Track
                  </Button>
                )}
                {/* Placeholder for right side balance when sidebar is open */}
                {isSidebarOpen && (
                  <Box
                    sx={{
                      width: '28px',
                      minWidth: '28px',
                      marginLeft: '8px', // Match marginRight of the left chevron
                    }}
                  />
                )}
                {!isSidebarOpen && (
                  <Button
                      size="small"
                      color="inherit"
                      onClick={() => {
                           setIsSidebarOpen(true);
                      }}
                      sx={{
                          borderRadius: '8px',
                          minWidth: 'auto',
                          width: '28px',
                          padding: '4px',
                          margin: 'auto', // Center the button when sidebar is collapsed
                          '&:hover': {
                              backgroundColor: currentStudioTheme.palette.action.hover,
                          },
                      }}
                  >
                      <IconChevronRightPipe size={20} />
                  </Button>
                )}
                {isSidebarOpen && (
                  <AddTrackMenu
                    isOpen={Boolean(addMenuAnchor)}
                    anchorEl={addMenuAnchor}
                    onClose={() => setAddMenuAnchor(null)}
                    onAddTrack={handleAddTrack}
                    onFileUpload={uploadAudioFile}
                  />
                )}
              </Box>
            </Box>

            {/* Track controls section */}
            {isSidebarOpen && (
              <Box sx={{ 
                flex: 1, 
                overflowY: 'auto', // Allow scrolling for track controls only when open
                overflowX: 'hidden',
              }}>
                <TrackControlsSidebar 
                  tracks={tracks}
                  onVolumeChange={handleTrackVolumeChange}
                  onPanChange={handleTrackPanChange}
                  onMuteToggle={handleTrackMuteToggle}
                  onSoloToggle={handleTrackSoloToggle}
                  onTrackDelete={handleTrackDelete}
                  onTrackNameChange={handleTrackNameChange}
                  onInstrumentChange={handleInstrumentChange}
                  onLoadAudioFile={handleLoadAudioFile}
                />
              </Box>
            )}
          </Box>
          
          {/* Spacer to maintain layout with fixed sidebar */}
          <Box sx={{ 
            width: isSidebarOpen ? GRID_CONSTANTS.sidebarWidth : COLLAPSED_SIDEBAR_WIDTH,
            flexShrink: 0,
            transition: 'width 0.3s ease-in-out', // Match transition for smoothness
          }} />

          {/* Timeline Area */}
          <KonvaTimeline
            tracks={tracks}
            currentTime={currentTime}
            isPlaying={isPlaying}
            measureCount={measureCount}
            zoomLevel={zoomLevel}
            bpm={bpm}
            timeSignature={timeSignature}
            showToolbar={false}
            gridSnapSize={gridSnapSize}
            onTrackPositionChange={handleTrackPositionChange}
            onZoomChange={setZoomLevel}
            onTimeChange={(newTime) => {
              // Update global state only when user explicitly changes time
              setCurrentTime(newTime);
              
              // Update transport position
              if (store && store.getTransport()) {
                store.getTransport().setPosition(newTime);
              }
              
              // Use imperative API to update cursor position
              if (scrollRef.current?.playbackCursor) {
                scrollRef.current.playbackCursor.seek(newTime);
              }
            }}
            selectedTrackIds={selectedTrackIds}
            onTrackSelect={(instanceIds) => {
              // Convert instance IDs to track IDs for the store
              // Instance IDs follow the pattern: trackId_instanceNumber
              const trackIds = [...new Set(instanceIds.map(instanceId => {
                // Handle both string and number types
                const idStr = String(instanceId);
                // Extract track ID from instance ID
                const parts = idStr.split('_');
                // Remove the last part (instance number) and join the rest
                parts.pop();
                return parts.join('_'); // The track ID is everything before the last underscore
              }))];
              setSelectedTrackIds(trackIds);
            }}
            onTrackDelete={handleTrackDelete}
            onTrackResizeEnd={handleTrackResize}
            selectedTool={selectedTool}
            onToolChange={setSelectedTool}
            onCopyTracks={handleCopyTracks}
            onCutTracks={handleCutTracks}
            onPasteTracks={handlePasteTracks}
            onDeleteTracks={handleDeleteTracks}
            onDuplicateTracks={handleDuplicateTracks}
            updateMultipleTrackPositions={updateMultipleTrackPositions}
            resizeMultipleTracks={resizeMultipleTracks}
            onInstancePositionChange={handleInstancePositionChange}
            onInstanceResizeEnd={(trackId, instanceId, deltaPixels, direction) => {
              console.log('[Studio] onInstanceResizeEnd called:', { trackId, instanceId, deltaPixels, direction });
              
              // Convert string instanceId to number
              const instanceIdNum = typeof instanceId === 'string' ? parseInt(instanceId.split('_').pop() || '0') : instanceId;
              const track = tracks.find(t => t.id === trackId);
              if (!track) {
                console.error('[Studio] Track not found:', trackId);
                return;
              }
              
              const instance = track.instance_metadata?.instances.find(i => i.id === instanceIdNum);
              if (!instance) {
                console.error('[Studio] Instance not found:', instanceIdNum, 'in track:', track);
                return;
              }
              
              // Convert deltaPixels to ticks
              const deltaTicks = pixelsToTicks(deltaPixels, bpm, timeSignature);
              console.log('[Studio] Delta pixels:', deltaPixels, 'Delta ticks:', deltaTicks);
              
              // Calculate new trim values based on resize direction
              if (direction === 'right') {
                // Right resize: adjust trim_end_ticks
                // When dragging right (positive delta), we want to decrease trim_end (show more)
                // When dragging left (negative delta), we want to increase trim_end (show less)
                const newTrimEnd = Math.max(0, instance.trim_end_ticks - deltaTicks);
                const maxTrimEnd = track.duration_ticks - instance.trim_start_ticks - 1; // Ensure at least 1 tick width
                const clampedTrimEnd = Math.min(Math.max(0, newTrimEnd), maxTrimEnd);
                
                console.log('[Studio] Right resize debug:', {
                  deltaPixels,
                  deltaTicks,
                  oldTrimEnd: instance.trim_end_ticks,
                  newTrimEnd,
                  clampedTrimEnd,
                  trackDuration: track.duration_ticks,
                  trimStart: instance.trim_start_ticks,
                  maxTrimEnd,
                  resultingWidth: track.duration_ticks - instance.trim_start_ticks - clampedTrimEnd
                });
                
                handleInstanceUpdate(trackId, instanceIdNum, { trim_end_ticks: clampedTrimEnd });
              } else {
                // Left resize: adjust x position and trim_start_ticks
                const newX = instance.x + deltaTicks;
                const newTrimStart = instance.trim_start_ticks + deltaTicks;
                console.log('[Studio] Left resize - old x:', instance.x, 'new x:', newX, 'old trim_start:', instance.trim_start_ticks, 'new trim_start:', newTrimStart);
                handleInstanceUpdate(trackId, instanceIdNum, { 
                  x: newX, 
                  trim_start_ticks: Math.max(0, newTrimStart)
                });
              }
            }}
            updateMultipleInstancePositions={updateMultipleInstancePositions}
            resizeMultipleInstances={resizeMultipleInstances}
            onInstanceCreate={handleInstanceCreate}
            onInstanceDelete={handleInstanceDelete}
            onBatchInstanceUpdate={handleBatchInstanceUpdate}
            onInstanceSplit={handleInstanceSplit}
            ref={scrollRef}
          />
          
          {/* AI Assistant Chat Window - slides in from right */}
          <ChatWindow 
            isOpen={isChatOpen}
            onClose={handleChatToggle}
          />
          
          {/* Render the new piano roll windows directly in Studio */}
          <PianoRollWindows />
          <DrumMachineWindows />

        </Box>
        
        {/* Studio Settings Modal */}
        <StudioSettingsModal
          open={isSettingsModalOpen}
          onClose={handleSettingsToggle}
        />

        {/* Hidden file input for replacing track audio */}
        <input 
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelected}
          accept="audio/*" 
          style={{ display: 'none' }}
        />
      </Box>
    </MuiThemeProvider>
  );
}

// Always wrap with PianoRollModule for backward compatibility
const StudioWithPianoRoll = (props: StudioProps) => {
  return (
      <Studio {...props} />
  );
};

export default StudioWithPianoRoll;