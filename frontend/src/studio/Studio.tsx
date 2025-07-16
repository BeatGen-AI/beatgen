import React, { useEffect, useRef, useState, useMemo, useLayoutEffect, useCallback } from 'react';
import { Box, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';

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
import { useAppTheme } from '../platform/theme/ThemeContext';
import { studioLightTheme, studioDarkTheme } from '../platform/theme/ThemeContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { IconChevronLeftPipe, IconChevronRightPipe } from '@tabler/icons-react';
import { GridSnapOption } from './components/piano-roll2/gridConstants';

// Studio Component Props
interface StudioProps {
  projectId?: string;
  initialTrackId?: string;
  initialTrackType?: 'audio' | 'midi' | 'sampler' | 'drum';
}

const COLLAPSED_SIDEBAR_WIDTH = '40px'; // Width of the sidebar when collapsed

// Main Studio Component
function Studio({ projectId, initialTrackId, initialTrackType }: StudioProps) {
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
      // Update URL to include the new project ID
      const newUrl = `/studio?projectId=${projectId}`;
      window.history.replaceState({}, '', newUrl);
    }
  });

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
  }, [initializeAudio, existingProjectId, projectId, loadProject]);

  // Handle initial track loading when opening studio with a specific track
  useEffect(() => {
    if (initialTrackId && initialTrackType && isInitialized && !projectId) {
      console.log(`Loading initial track: ${initialTrackId} (${initialTrackType})`);
      
      const loadInitialTrack = async () => {
        try {
          // Import the API functions dynamically to avoid circular dependencies
          const { getSound, getMidiTrack, getSamplerTrack, getDrumTrack } = await import('../platform/api/sounds');
          
          // Fetch the full track data from the API first
          let trackData: any;
          if (initialTrackType === 'audio') {
            trackData = await getSound(initialTrackId);
          } else if (initialTrackType === 'midi') {
            trackData = await getMidiTrack(initialTrackId);
          } else if (initialTrackType === 'sampler') {
            trackData = await getSamplerTrack(initialTrackId);
          } else if (initialTrackType === 'drum') {
            trackData = await getDrumTrack(initialTrackId);
          }
          
          if (!trackData) {
            throw new Error(`Track not found: ${initialTrackId}`);
          }
          
          console.log('Fetched track data:', trackData);
          
          // Create payload with the full track data
          let payload: any = {};
          if (initialTrackType === 'audio') {
            payload = { audioTrackData: trackData };
          } else if (initialTrackType === 'midi') {
            // For MIDI tracks, we need to extract the instrument info
            payload = {
              instrumentId: trackData.instrument_id,
              instrumentName: trackData.instrument_file?.name || trackData.instrument_name || 'Unknown Instrument',
              instrumentStorageKey: trackData.instrument_file?.storage_key || trackData.instrument_storage_key,
              midiTrackData: trackData // Also pass the full track data for notes, etc.
            };
          } else if (initialTrackType === 'sampler') {
            // For sampler tracks, we need to pass the track data properly
            payload = { 
              audioTrackData: trackData,
              isSampler: true,
              samplerTrackData: trackData // Pass full sampler track data
            };
          } else if (initialTrackType === 'drum') {
            // For drum tracks, we might need to pass samples
            payload = { 
              samples: trackData.sampler_tracks || [],
              drumTrackData: trackData
            };
          }
          
          const createdTrack = await handleAddTrack(initialTrackType.toUpperCase() as any, payload);
          console.log(`Successfully loaded initial track: ${initialTrackId}`);
          
          // For MIDI and Sampler tracks, load the notes into the MIDI manager
          if ((initialTrackType === 'midi' || initialTrackType === 'sampler') && trackData.midi_notes_json?.notes && createdTrack) {
            const midiManager = store?.getMidiManager();
            if (midiManager && midiManager.hasTrack(createdTrack.id)) {
              console.log(`Loading ${trackData.midi_notes_json.notes.length} MIDI notes for ${initialTrackType} track ${createdTrack.id}`);
              // Use updateInstanceNotes to set all notes at once
              midiManager.updateInstanceNotes(createdTrack.id, '', trackData.midi_notes_json.notes);
            }
          }
          
          // For sampler tracks, ensure audio file is properly cached
          if (initialTrackType === 'sampler' && trackData.audio_storage_key && createdTrack) {
            console.log(`Ensuring sampler audio file is cached for track ${createdTrack.id}`);
            // The audio file caching should be handled by the track creation logic above
          }
          
          // Clear the track parameters from URL after successful loading
          const newUrl = '/studio';
          window.history.replaceState({}, '', newUrl);
        } catch (error) {
          console.error('Failed to load initial track:', error);
        }
      };

      loadInitialTrack();
    }
  }, [initialTrackId, initialTrackType, isInitialized, projectId, handleAddTrack]);
  
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
        // Prevent zoom - only allow horizontal pan
        touchAction: 'pan-x',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
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
          gridSnapSize={gridSnapSize}
          onToolChange={setSelectedTool}
          onToggleSnapToGrid={toggleSnapToGrid}
          onGridSnapSizeChange={setGridSnapSize}
          onExportClick={() => setShowExportDialog(true)}
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
          <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
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
          </Box>
          
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
        
        {/* Export Dialog */}
        <ExportDialog 
          open={showExportDialog} 
          onClose={() => setShowExportDialog(false)} 
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