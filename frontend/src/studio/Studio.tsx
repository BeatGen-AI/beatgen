import React, { useEffect, useRef, useState, useMemo, useLayoutEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../components/ui/button';

// Import components
import TrackControlsSidebar from './components/sidebar/TrackControlsSidebar';
import { KonvaTimeline, KonvaTimelineRef } from './components/timeline/KonvaTimeline';
import { CombinedTrack } from '../platform/types/project';
import AddTrackMenu from './components/sidebar/AddTrackMenu';
import { GRID_CONSTANTS } from './constants/gridConstants';
import { useStudioStore } from './stores/studioStore';
import { usePianoRollStore } from './stores/usePianoRollStore';

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
import { ExportDialog } from './components/export/ExportDialog';
import { useAppTheme } from '../lib/theme-provider';
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
  // Initialize DB session management
  useStudioDBSession();
  
  // Setup history state sync
  useHistorySync();
  
  // Ref and state for Control Bar height
  const controlBarRef = useRef<HTMLDivElement>(null);
  const [controlBarHeight, setControlBarHeight] = useState(0);
  
  // Use manual theme styling instead of global theme application
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
    setProjectId,
    canUndo,
    canRedo,
    measureCount,
    isInitialized,
    addMenuAnchor,
    autoSaveStatus,
    autoSaveMessage,
    selectedTrackIds,
    showExportDialog,
    
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
    // New AudioEngine methods
    seekToSeconds,
    syncEngineState,
    // Group operations for clipboard functionality
    duplicateTrack,
    duplicateMultipleTracks,
    deleteMultipleTracks,
    updateMultipleTrackPositions,
    resizeMultipleTracks,
    uploadAudioFile,
    setAddMenuAnchor,
    openDrumMachines,
    openDrumMachine,
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
    deleteTrackInstance,
    deleteMultipleInstances,
    setShowExportDialog,
  } = useStudioStore();
  
  // Get piano roll functions
  const openPianoRoll = usePianoRollStore(state => state.openPianoRoll);
  
  const scrollRef = useRef<KonvaTimelineRef>(null);
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

      // Update Zustand store with the backend project ID
      setProjectId(projectId);
      console.log('Studio: Updated Zustand store with backend project ID:', projectId);

      // Update URL to include the new project ID
      const newUrl = `/studio?projectId=${projectId}`;
      window.history.replaceState({}, '', newUrl);
    }
  });

  // Real-time volume change handler (doesn't go through history)
  // Note: Live audio feedback during slider drag is not supported with the new AudioEngine.
  // Audio updates when slider is released (via history action -> store update -> syncEngineState).
  const handleTrackVolumeChangeLive = useCallback((_trackId: string, _volume: number) => {
    // No-op - new AudioEngine receives state via setState() only
    // Live feedback can be added in a future optimization
  }, []);

  // Real-time pan change handler (doesn't go through history)
  const handleTrackPanChangeLive = useCallback((_trackId: string, _pan: number) => {
    // No-op - new AudioEngine receives state via setState() only
  }, []);

  // Effect to measure control bar height
  useLayoutEffect(() => {
    if (controlBarRef.current) {
      const height = controlBarRef.current.offsetHeight;
      setControlBarHeight(height);
      console.log('Control Bar Height:', height);
    }
  }, []); // Empty dependency array to run once on mount

  // Prevent browser zoom when studio is mounted
  useEffect(() => {
    // Add styles to prevent zoom - only allow horizontal panning
    document.body.style.touchAction = 'pan-x';
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    //document.body.style.msUserSelect = 'none';
    
    // Add meta viewport tag to prevent zoom
    const metaViewport = document.querySelector('meta[name="viewport"]');
    const originalContent = metaViewport?.getAttribute('content') || '';
    
    if (metaViewport) {
      metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
    
    // Handle zoom with keyboard shortcuts
    const handleKeydown = (e: KeyboardEvent) => {
      // Handle Cmd/Ctrl + Plus/Minus/0
      if ((e.metaKey || e.ctrlKey) && (e.key === '+' || e.key === '-' || e.key === '0' || e.key === '=')) {
        e.preventDefault();
        
        let newZoom = zoomLevel;
        
        if (e.key === '+' || e.key === '=') {
          // Zoom in by 0.1
          newZoom = zoomLevel + 0.1;
        } else if (e.key === '-') {
          // Zoom out by 0.1
          newZoom = zoomLevel - 0.1;
        } else if (e.key === '0') {
          // Reset zoom
          newZoom = 1;
        }
        
        // Clamp zoom level
        const clampedZoom = Math.max(0.25, Math.min(4, newZoom));
        setZoomLevel(clampedZoom);
      }
    };
    
    // Prevent wheel zoom globally when Cmd/Ctrl is pressed
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    
    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      // Restore original body styles
      document.body.style.touchAction = '';
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      //document.body.style.msUserSelect = '';
      
      // Restore original viewport settings
      if (metaViewport && originalContent) {
        metaViewport.setAttribute('content', originalContent);
      }
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('wheel', handleWheel);
    };
  }, [zoomLevel, setZoomLevel]);

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
  }, [initializeAudio, loadProject]);
  
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
    // Grid store should maintain constant base measure width - zoom is applied by timeline components
  };

  const handleZoomOut = () => {
    setZoomLevel(Math.max(zoomLevel - GRID_CONSTANTS.studioZoomStep, GRID_CONSTANTS.studioZoomMin));
    // Grid store should maintain constant base measure width - zoom is applied by timeline components
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
  // NOTE: currentTime is intentionally NOT in the dependency array.
  // We only want to react to isPlaying changes, not every time update.
  // Time updates are handled by the cursor's internal animation loop.
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
      // Use a ref to check current time to avoid dependency issues
      const storeTime = useStudioStore.getState().currentTime;
      if (storeTime < 0.01) { // Check if time is (near) zero, indicating a stop
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
  }, [isPlaying, store]); // Removed currentTime - only react to play/pause state changes

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
      // Get minimum X position from first instances
      const minX = Math.min(...tracks.map(t => t.instances?.[0]?.x_position ?? 0));
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

  // Instance delete handlers
  const handleInstanceDelete = useCallback((trackId: string, instanceId: string) => {
    console.log('Deleting instance:', instanceId, 'from track:', trackId);
    deleteTrackInstance(trackId, instanceId);
  }, [deleteTrackInstance]);

  const handleDeleteInstances = useCallback((instances: Array<{trackId: string, instanceId: string}>) => {
    console.log('Deleting multiple instances:', instances);
    // Use the group action for multiple instance deletion
    deleteMultipleInstances(instances);
  }, [deleteMultipleInstances]);

  // Handle track click to open piano roll or drum machine
  const handleTrackClick = useCallback((trackId: string, instanceId: string) => {
    console.log('Track clicked:', trackId, 'Instance:', instanceId);
    
    // Find the track to check its type
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    
    
    // Open appropriate editor based on track type
    if (track.track_type === 'MIDI' || track.track_type === 'SAMPLER') {
      openPianoRoll(trackId);
    } else if (track.track_type === 'DRUM') {
      openDrumMachine(trackId);
    }
  }, [tracks, openPianoRoll, openDrumMachine]);

  return (
    <div 
      className="h-screen flex flex-col select-none"
      style={{
        touchAction: 'pan-x',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        backgroundColor: studioMode === 'dark' ? '#000000' : '#ffffff',
        color: studioMode === 'dark' ? '#ffffff' : '#000000'
      }}
    >
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
          gridSnapSize={gridSnapSize}
          onToolChange={setSelectedTool}
          onToggleSnapToGrid={toggleSnapToGrid}
          onGridSnapSizeChange={setGridSnapSize}
          onExportClick={() => setShowExportDialog(true)}
        />

        {/* Main Content Area */}
        <div 
          className="flex flex-1 overflow-visible relative"
          style={{ paddingTop: `${controlBarHeight}px` }}
        >
          {/* Left Sidebar - Fixed position */}
          <div 
            className="flex flex-col transition-all duration-300 ease-in-out fixed left-0 overflow-x-hidden z-10"
            style={{ 
              width: isSidebarOpen ? GRID_CONSTANTS.sidebarWidth : COLLAPSED_SIDEBAR_WIDTH,
              top: `${controlBarHeight}px`,
              height: `calc(100vh - ${controlBarHeight}px)`,
              backgroundColor: studioMode === 'dark' ? '#0a0a0a' : '#f8fafc',
              borderRight: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`
            }}
          >
            {/* Header section with Add Track button */}
            <div 
              className="flex items-center relative overflow-hidden px-1"
              style={{
                height: GRID_CONSTANTS.headerHeight,
                minHeight: GRID_CONSTANTS.headerHeight,
              }}
            >
              <div className="relative flex items-center w-full px-1">
                {isSidebarOpen && (
                  <button
                      onClick={() => {
                         setIsSidebarOpen(false);
                      }}
                      className="rounded-lg min-w-7 w-7 h-7 p-1 mr-2 transition-colors flex items-center justify-center"
                      style={{
                        backgroundColor: 'transparent',
                        color: studioMode === 'dark' ? '#ffffff' : '#000000',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                  >
                      <IconChevronLeftPipe size={24} />
                  </button>
                )}
                {isSidebarOpen && (
                  <AddTrackMenu
                    isOpen={Boolean(addMenuAnchor)}
                    onOpenChange={(open) => setAddMenuAnchor(open ? document.body : null)}
                    onAddTrack={handleAddTrack}
                    onFileUpload={uploadAudioFile}
                  >
                    <button
                      className="h-6 text-xs font-bold flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded transition-all duration-200 px-2 flex items-center justify-center"
                      style={{
                        background: 'linear-gradient(135deg, #e539a9, #c63ba6, #a93fbf, #8247d8, #6050e0, #4160e2)',
                        color: '#ffffff',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 0 12px rgba(229, 57, 169, 0.6), 0 0 24px rgba(129, 71, 216, 0.4), 0 4px 16px rgba(229, 57, 169, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Track
                    </button>
                  </AddTrackMenu>
                )}
                {/* Placeholder for right side balance when sidebar is open */}
                {isSidebarOpen && (
                  <div className="w-7 min-w-7" />
                )}
                {!isSidebarOpen && (
                  <button
                      onClick={() => {
                           setIsSidebarOpen(true);
                      }}
                      className="rounded-lg min-w-7 w-7 h-7 p-1 m-auto transition-colors flex items-center justify-center"
                      style={{
                        backgroundColor: 'transparent',
                        color: studioMode === 'dark' ? '#ffffff' : '#000000',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                  >
                      <IconChevronRightPipe size={24} />
                  </button>
                )}
              </div>
            </div>

            {/* Track controls section */}
            {isSidebarOpen && (
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                <TrackControlsSidebar 
                  tracks={tracks}
                  onVolumeChange={handleTrackVolumeChange}
                  onVolumeChangeLive={handleTrackVolumeChangeLive}
                  onPanChange={handleTrackPanChange}
                  onPanChangeLive={handleTrackPanChangeLive}
                  onMuteToggle={handleTrackMuteToggle}
                  onSoloToggle={handleTrackSoloToggle}
                  onTrackDelete={handleTrackDelete}
                  onTrackNameChange={handleTrackNameChange}
                  onInstrumentChange={handleInstrumentChange}
                  onLoadAudioFile={handleLoadAudioFile}
                />
              </div>
            )}
          </div>
          
          {/* Spacer to maintain layout with fixed sidebar */}
          <div 
            className="flex-shrink-0 transition-all duration-300 ease-in-out"
            style={{
              width: isSidebarOpen ? GRID_CONSTANTS.sidebarWidth : COLLAPSED_SIDEBAR_WIDTH
            }}
          />

          {/* Timeline Area */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <KonvaTimeline
              tracks={tracks}
              currentTime={currentTime}
              isPlaying={isPlaying}
              measureCount={measureCount}
              zoomLevel={zoomLevel}
              bpm={bpm}
              timeSignature={timeSignature}
              gridSnapSize={gridSnapSize}
              onTrackPositionChange={handleTrackPositionChange}
              onZoomChange={setZoomLevel}
              onTimeChange={(newTime) => {
                // Update global state only when user explicitly changes time
                setCurrentTime(newTime);

                // Seek the new AudioEngine to the new position (in seconds)
                seekToSeconds(newTime);

                // Use imperative API to update cursor position
                if (scrollRef.current?.playbackCursor) {
                  scrollRef.current.playbackCursor.seek(newTime);
                }
              }}
              selectedTrackIds={selectedTrackIds}
              onTrackSelect={(instanceIds) => {
                // Convert instance IDs to track IDs for the store
                // Instance IDs follow the pattern: trackId_instance_timestamp
                const trackIds = [...new Set(instanceIds.map(instanceId => {
                  // Extract track ID from instance ID
                  const parts = instanceId.split('_instance_');
                  return parts[0]; // The track ID is before '_instance_'
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
              onInstanceResizeEnd={handleInstanceResizeEnd}
              updateMultipleInstancePositions={updateMultipleInstancePositions}
              resizeMultipleInstances={resizeMultipleInstances}
              onInstanceDelete={handleInstanceDelete}
              onDeleteInstances={handleDeleteInstances}
              onTrackClick={handleTrackClick}
              ref={scrollRef}
            />
          </div>
          
          {/* AI Assistant Chat Window - slides in from right */}
          <ChatWindow 
            isOpen={isChatOpen}
            onClose={handleChatToggle}
            controlBarHeight={controlBarHeight}
            projectId={existingProjectId || undefined}
          />
          
          {/* Render the new piano roll windows directly in Studio */}
          <PianoRollWindows />
          <DrumMachineWindows />

        </div>
        
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
        
        {/* Export Dialog */}
        <ExportDialog 
          open={showExportDialog} 
          onClose={() => setShowExportDialog(false)} 
        />
      </div>
  );
}

export default Studio;