import React, { forwardRef, memo, useRef, useState } from 'react';
import { IconButton, Typography, TextField, Tooltip, Menu, MenuItem } from '@mui/material';
import { useTheme } from '../../../platform/theme/ThemeContext';
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
import { CropFree as SelectIcon, Edit as PenIcon, Highlight as HighlighterIcon, Delete as EraserIcon, GridOn as GridIcon, GridOff as GridOffIcon, Check as CheckIcon } from '@mui/icons-material';
import { Tool } from '../../shared/interactions';
import { GridSnapOption, getGridSnapOptionName } from '../piano-roll2/gridConstants';

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
    gridSnapSize?: GridSnapOption;

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
    onGridSnapSizeChange?: (size: GridSnapOption) => void;
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
    gridSnapSize = GridSnapOption.STEP,
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
    onGridSnapSizeChange,
}, ref) => {
    const theme = useTheme();
    const timeDisplayRef = useRef<TimeDisplayHandle>(null);
    const [gridMenuAnchor, setGridMenuAnchor] = useState<null | HTMLElement>(null);
    const gridMenuOpen = Boolean(gridMenuAnchor);

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

    const handleGridClick = (event: React.MouseEvent<HTMLElement>) => {
        setGridMenuAnchor(event.currentTarget);
    };

    const handleGridMenuClose = () => {
        setGridMenuAnchor(null);
    };

    const handleGridSnapSizeChange = (option: GridSnapOption) => {
        onGridSnapSizeChange?.(option);
        handleGridMenuClose();
    };

    return (
        <div className="fixed top-0 left-0 right-0 z-50 border-b overflow-x-auto overflow-y-hidden" style={{
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(18, 18, 18, 0.8)' : 'rgba(240, 240, 240, 0.1)',
            borderBottomColor: theme.palette.divider
        }}>
            <div ref={ref} className="grid grid-cols-3 items-center w-full min-w-fit gap-2 p-1" style={{
                gridTemplateColumns: '1fr auto 1fr',
                color: theme.palette.text.primary
            }}>
            {/* Left section */}
            <div className="flex items-center gap-2 justify-self-start">
                <div className="flex gap-1">
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
                </div>

                {/* Tool Icons */}
                {showToolbar && (
                    <div className="flex gap-1">
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
                        <Tooltip title={`Grid snap: ${getGridSnapOptionName(gridSnapSize)}`}>
                            <IconButton
                                size="small"
                                color="inherit"
                                onClick={handleGridClick}
                                sx={{
                                    borderRadius: '8px',
                                    backgroundColor: snapToGrid ? theme.palette.action.selected : 'transparent',
                                    '&:hover': {
                                        backgroundColor: theme.palette.action.hover,
                                    },
                                }}
                                disableRipple
                            >
                                {snapToGrid ? <GridIcon /> : <GridOffIcon />}
                            </IconButton>
                        </Tooltip>
                    </div>
                )}

                <div className="flex items-center rounded gap-1 px-2 py-1" style={{
                    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'
                }}>
                    <BPMControl bpm={bpm} onBpmChange={onBpmChange} />
                </div>

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

                <div className="flex gap-1">
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
                </div>
            </div>

            {/* Center section - Project Title */}
            <div className="flex justify-center justify-self-center">
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
            </div>

            {/* Right section */}
            <div className="justify-self-end">
                <div className="flex items-center gap-1">
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
                    <div className="font-bold min-w-10 text-center p-1 rounded border" style={{
                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
                        color: theme.palette.text.primary,
                        borderColor: theme.palette.divider
                    }}>
                        {zoomLevel.toFixed(1)}x
                    </div>
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
                </div>
            </div>
            </div>

            {/* Grid Snap Menu */}
            <Menu
                anchorEl={gridMenuAnchor}
                open={gridMenuOpen}
                onClose={handleGridMenuClose}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'center',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'center',
                }}
                PaperProps={{
                    sx: {
                        bgcolor: 'background.paper',
                        minWidth: 150,
                        maxHeight: 400,
                        '& .MuiMenuItem-root': {
                            fontSize: '0.875rem',
                            py: 0.75,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }
                    }
                }}
            >
                {/* None option */}
                <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.NONE)}>
                    <span>None</span>
                    {gridSnapSize === GridSnapOption.NONE && <CheckIcon fontSize="small" />}
                </MenuItem>
                
                {/* Step section */}
                <div className="border-t mt-2 pt-2" style={{borderTopColor: theme.palette.divider}}>
                    <div className="text-xs px-2 py-1" style={{color: theme.palette.text.secondary}}>STEP</div>
                    <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_6)}>
                        <span>1/6 step</span>
                        {gridSnapSize === GridSnapOption.STEP_1_6 && <CheckIcon fontSize="small" />}
                    </MenuItem>
                    <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_4)}>
                        <span>1/4 step</span>
                        {gridSnapSize === GridSnapOption.STEP_1_4 && <CheckIcon fontSize="small" />}
                    </MenuItem>
                    <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_3)}>
                        <span>1/3 step</span>
                        {gridSnapSize === GridSnapOption.STEP_1_3 && <CheckIcon fontSize="small" />}
                    </MenuItem>
                    <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_2)}>
                        <span>1/2 step</span>
                        {gridSnapSize === GridSnapOption.STEP_1_2 && <CheckIcon fontSize="small" />}
                    </MenuItem>
                    <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP)}>
                        <span>Step</span>
                        {gridSnapSize === GridSnapOption.STEP && <CheckIcon fontSize="small" />}
                    </MenuItem>
                </div>
                
                {/* Beat section */}
                <div className="border-t mt-2 pt-2" style={{borderTopColor: theme.palette.divider}}>
                    <div className="text-xs px-2 py-1" style={{color: theme.palette.text.secondary}}>BEAT</div>
                    <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_6)}>
                        <span>1/6 beat</span>
                        {gridSnapSize === GridSnapOption.BEAT_1_6 && <CheckIcon fontSize="small" />}
                    </MenuItem>
                    <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_4)}>
                        <span>1/4 beat</span>
                        {gridSnapSize === GridSnapOption.BEAT_1_4 && <CheckIcon fontSize="small" />}
                    </MenuItem>
                    <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_3)}>
                        <span>1/3 beat</span>
                        {gridSnapSize === GridSnapOption.BEAT_1_3 && <CheckIcon fontSize="small" />}
                    </MenuItem>
                    <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_2)}>
                        <span>1/2 beat</span>
                        {gridSnapSize === GridSnapOption.BEAT_1_2 && <CheckIcon fontSize="small" />}
                    </MenuItem>
                    <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT)}>
                        <span>Beat</span>
                        {gridSnapSize === GridSnapOption.BEAT && <CheckIcon fontSize="small" />}
                    </MenuItem>
                </div>
                
                {/* Bar option */}
                <div className="border-t mt-2 pt-2" style={{borderTopColor: theme.palette.divider}}>
                    <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BAR)}>
                        <span>Bar</span>
                        {gridSnapSize === GridSnapOption.BAR && <CheckIcon fontSize="small" />}
                    </MenuItem>
                </div>
            </Menu>
        </div>
    );
}));

export default StudioControlBar;