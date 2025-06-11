import React, { forwardRef, memo, useRef } from 'react';
import { Box, IconButton, Typography, TextField, Tooltip, useTheme } from '@mui/material';
// Import components
import BPMControl from './BPMControl';
import TimeSignatureDisplay from './TimeSignatureDisplay';
import { TimeDisplay, TimeDisplayHandle } from './TimeDisplay';
import KeySelector from './KeySelector';
import { SaveProjectButton } from './SaveProjectButton';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { useStudioStore } from '../../stores/studioStore';
import { IconPlayerPlayFilled, IconPlayerSkipBackFilled, IconPlayerPauseFilled, IconArrowForwardUp, IconArrowBackUp, IconZoomIn, IconZoomOut, IconInputAi, IconChevronsRight, IconArrowLeft } from '@tabler/icons-react';
import { IconSettings } from '@tabler/icons-react';
import { CropFree as SelectIcon, Edit as PenIcon, Highlight as HighlighterIcon, Delete as EraserIcon, GridOn as GridIcon } from '@mui/icons-material';
import { Tool } from '../../shared/interactions';

interface StudioControlBarProps {
    canUndo: boolean;
    canRedo: boolean;
    bpm: number;
    timeSignature: [number, number];
    keySignature: string;
    isPlaying: boolean;
    projectTitle: string;
    zoomLevel: number;
    currentTime: number;
    isChatOpen: boolean;
    existingProjectId: string | null;
    tracks: any[]; // You might want to properly type this based on your track type
    
    // Auto-save status
    autoSaveStatus?: 'idle' | 'saving' | 'saved' | 'error';
    autoSaveMessage?: string;
    
    // Tool system props
    selectedTool?: Tool;
    snapToGrid?: boolean;
    showToolbar?: boolean;

    // Handlers
    onUndo: () => void;
    onRedo: () => void;
    onBpmChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onTimeSignatureChange: (numerator?: number, denominator?: number) => void;
    onKeySignatureChange: (key: string) => void;
    onPlayPause: () => void;
    onStop: () => void;
    onTitleChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onChatToggle: () => void;
    onSettingsToggle: () => void;
    onAutoSaveRetry?: () => void;
    onToolChange?: (tool: Tool) => void;
    onToggleSnapToGrid?: () => void;
}

// Wrap with forwardRef and memo
const StudioControlBar = memo(forwardRef<HTMLDivElement, StudioControlBarProps>((
{
    canUndo,
    canRedo,
    bpm,
    timeSignature,
    keySignature,
    isPlaying,
    projectTitle,
    zoomLevel,
    currentTime,
    isChatOpen,
    existingProjectId,
    tracks,
    autoSaveStatus,
    autoSaveMessage,
    selectedTool = 'select',
    snapToGrid = true,
    showToolbar = true,
    onUndo,
    onRedo,
    onBpmChange,
    onTimeSignatureChange,
    onKeySignatureChange,
    onPlayPause,
    onStop,
    onTitleChange,
    onZoomIn,
    onZoomOut,
    onChatToggle,
    onSettingsToggle,
    onAutoSaveRetry,
    onToolChange,
    onToggleSnapToGrid,
}, ref) => {
    const theme = useTheme();
    const timeDisplayRef = useRef<TimeDisplayHandle>(null);

    const handlePlayPause = () => {
        if (isPlaying) {
            timeDisplayRef.current?.pause();
        } else {
            timeDisplayRef.current?.play();
        }
        onPlayPause();
    };

    const handleStop = () => {
        timeDisplayRef.current?.reset(0);
        onStop();
    };

    return (
        <Box 
            sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 1300,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(18, 18, 18, 0.8)' : 'rgba(240, 240, 240, 0.1)',
                borderBottom: `1px solid ${theme.palette.divider}`,
                overflowX: 'auto',
                overflowY: 'hidden'
            }}
        >
            <Box 
                ref={ref}
                sx={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                alignItems: 'center',
                width: '100%',
                minWidth: 'fit-content',
                gap: 2,
                p: 1,
                color: 'text.primary'
            }}>
            {/* Left section */}
            <Box sx={{ 
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                justifySelf: 'start',
            }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title="Go back to Projects" arrow>
                        <IconButton
                            size="small"
                            color="inherit"
                            onClick={() => {
                                window.location.href = '/home';
                            }}
                            sx={{
                                borderRadius: '8px',
                                '&:hover': {
                                    backgroundColor: theme.palette.action.hover,
                                },
                            }}
                            disableRipple
                        >
                            <IconArrowLeft />
                        </IconButton>
                    </Tooltip>
                    <IconButton
                        size="small"
                        color="inherit"
                        onClick={onUndo}
                        disabled={!canUndo}
                        title="Undo"
                        sx={{
                            borderRadius: '8px',
                            '&:hover': {
                                backgroundColor: theme.palette.action.hover,
                            },
                        }}
                        disableRipple
                    >
                        <IconArrowBackUp />
                    </IconButton>
                    <IconButton
                        size="small"
                        color="inherit"
                        onClick={onRedo}
                        disabled={!canRedo}
                        title="Redo"
                        sx={{
                            borderRadius: '8px',
                            '&:hover': {
                                backgroundColor: theme.palette.action.hover,
                            },
                        }}
                        disableRipple
                    >
                        <IconArrowForwardUp />
                    </IconButton>
                </Box>

                {/* Tool Icons */}
                {showToolbar && (
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <IconButton
                            size="small"
                            color="inherit"
                            onClick={() => onToolChange?.('select')}
                            sx={{
                                borderRadius: '8px',
                                backgroundColor: selectedTool === 'select' ? theme.palette.action.selected : 'transparent',
                                '&:hover': {
                                    backgroundColor: theme.palette.action.hover,
                                },
                            }}
                            title="Select Tool"
                            disableRipple
                        >
                            <SelectIcon />
                        </IconButton>
                        <IconButton
                            size="small"
                            color="inherit"
                            onClick={() => onToolChange?.('pen')}
                            sx={{
                                borderRadius: '8px',
                                backgroundColor: selectedTool === 'pen' ? theme.palette.action.selected : 'transparent',
                                '&:hover': {
                                    backgroundColor: theme.palette.action.hover,
                                },
                            }}
                            title="Pen Tool"
                            disableRipple
                        >
                            <PenIcon />
                        </IconButton>
                        <IconButton
                            size="small"
                            color="inherit"
                            onClick={() => onToolChange?.('highlighter')}
                            sx={{
                                borderRadius: '8px',
                                backgroundColor: selectedTool === 'highlighter' ? theme.palette.action.selected : 'transparent',
                                '&:hover': {
                                    backgroundColor: theme.palette.action.hover,
                                },
                            }}
                            title="Highlighter Tool"
                            disableRipple
                        >
                            <HighlighterIcon />
                        </IconButton>
                        <IconButton
                            size="small"
                            color="inherit"
                            onClick={() => onToolChange?.('eraser')}
                            sx={{
                                borderRadius: '8px',
                                backgroundColor: selectedTool === 'eraser' ? theme.palette.action.selected : 'transparent',
                                '&:hover': {
                                    backgroundColor: theme.palette.action.hover,
                                },
                            }}
                            title="Eraser Tool"
                            disableRipple
                        >
                            <EraserIcon />
                        </IconButton>
                        <IconButton
                            size="small"
                            color="inherit"
                            onClick={() => onToggleSnapToGrid?.()}
                            sx={{
                                borderRadius: '8px',
                                backgroundColor: snapToGrid ? theme.palette.action.selected : 'transparent',
                                '&:hover': {
                                    backgroundColor: theme.palette.action.hover,
                                },
                            }}
                            title="Toggle Grid Snap"
                            disableRipple
                        >
                            <GridIcon />
                        </IconButton>
                    </Box>
                )}

                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                    borderRadius: 1,
                    px: 2,
                    py: 0.5,
                    gap: 1,
                }}>
                    <BPMControl bpm={bpm} onBpmChange={onBpmChange} />
                </Box>

                {/* <TimeSignatureDisplay
                    topNumber={timeSignature[0]}
                    bottomNumber={timeSignature[1]}
                    onTopNumberChange={(value) => onTimeSignatureChange(value, undefined)}
                    onBottomNumberChange={(value) => onTimeSignatureChange(undefined, value)}
                /> */}

                <KeySelector
                    selectedKey={keySignature}
                    onKeyChange={onKeySignatureChange}
                />

                <Box sx={{ display: 'flex', gap: 1 }}>
                    <IconButton
                        size="small"
                        color="inherit"
                        onClick={handlePlayPause}
                        sx={{
                            borderRadius: '8px',
                            '&:hover': {
                                backgroundColor: theme.palette.action.hover,
                            },
                        }}
                        disableRipple
                    >
                        {isPlaying ? <IconPlayerPauseFilled /> : <IconPlayerPlayFilled />}
                    </IconButton>
                    <IconButton
                        size="small"
                        color="inherit"
                        onClick={handleStop}
                        sx={{
                            borderRadius: '8px',
                            '&:hover': {
                                backgroundColor: theme.palette.action.hover,
                            },
                        }}
                        disableRipple
                    >
                        <IconPlayerSkipBackFilled />
                    </IconButton>
                </Box>
            </Box>

            {/* Center section - Project Title */}
            <Box sx={{ 
                display: 'flex', 
                justifyContent: 'center',
                justifySelf: 'center',
            }}>
                <TextField
                    variant="standard"
                    value={projectTitle}
                    onChange={onTitleChange}
                    InputProps={{ disableUnderline: true }} 
                    inputProps={{ style: { textAlign: 'center' } }} 
                    sx={{
                        width: '100%',
                        maxWidth: 300,
                        '& .MuiInputBase-input': { 
                           color: theme.palette.text.primary
                        }
                    }}
                />
            </Box>

            {/* Right section */}
            <Box sx={{
                justifySelf: 'end',
            }}>
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1
                }}>
                    <IconButton
                        size="small"
                        color="inherit"
                        onClick={onZoomIn}
                        sx={{
                            borderRadius: '8px',
                            '&:hover': {
                                backgroundColor: theme.palette.action.hover,
                            },
                        }}
                        disableRipple
                    >
                        <IconZoomIn />
                    </IconButton>
                    <Box sx={{ 
                        color: "text.primary",
                        fontWeight: "bold", 
                        bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
                        minWidth: 40, 
                        textAlign: "center", 
                        border: `1px solid ${theme.palette.divider}`,
                        padding: "4px 4px", 
                        borderRadius: "6px" 
                    }}>
                        {zoomLevel.toFixed(1)}x
                    </Box>
                    <IconButton
                        size="small"
                        color="inherit"
                        onClick={onZoomOut}
                        sx={{
                            borderRadius: '8px',
                            '&:hover': {
                                backgroundColor: theme.palette.action.hover,
                            },
                        }}
                        disableRipple
                    >
                        <IconZoomOut />
                    </IconButton>
                    <TimeDisplay
                        ref={timeDisplayRef}
                        initialTime={currentTime}
                    />
                    <SaveProjectButton
                        projectTitle={projectTitle}
                        bpm={bpm}
                        timeSignature={timeSignature}
                        tracks={tracks}
                        projectId={existingProjectId || ""}
                        keySignature={keySignature}
                        onSaved={(project) => {
                            console.log('Project saved:', project);
                        }}
                    />
                    <SaveStatusIndicator
                        status={autoSaveStatus || 'idle'}
                        message={autoSaveMessage}
                        onRetryClick={onAutoSaveRetry}
                    />
                    <IconButton
                        size="small"
                        color="inherit"
                        onClick={onChatToggle}
                        sx={{
                            borderRadius: '8px',
                            '&:hover': {
                                backgroundColor: theme.palette.action.hover,
                            },
                        }}
                        disableRipple
                    >
                        {isChatOpen ? <IconChevronsRight /> : <IconInputAi />}
                    </IconButton>
                    <IconButton
                        size="small"
                        color="inherit"
                        onClick={onSettingsToggle}
                        sx={{
                            borderRadius: '8px',
                            '&:hover': {
                                backgroundColor: theme.palette.action.hover,
                            },
                        }}
                        disableRipple
                    >
                        <IconSettings />
                    </IconButton>
                </Box>
            </Box>
            </Box>
        </Box>
    );
}));

export default StudioControlBar;