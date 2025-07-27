import React, { forwardRef, memo, useRef, useState } from 'react';
import { Box, IconButton, Typography, TextField, Tooltip, Menu, MenuItem } from '@mui/material';
import { useAppTheme } from '../../../lib/theme-provider';
// Import components
import BPMControl from './BPMControl';
import TimeSignatureDisplay from './TimeSignatureDisplay';
import { TimeDisplay, TimeDisplayHandle } from './TimeDisplay';
import KeySelector from './KeySelector';
import { SaveProjectButton } from './SaveProjectButton';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { useStudioStore } from '../../stores/studioStore';
import { IconPlayerPlayFilled, IconPlayerSkipBackFilled, IconPlayerPauseFilled, IconArrowForwardUp, IconArrowBackUp, IconZoomIn, IconZoomOut, IconInputAi, IconChevronsRight, IconArrowLeft, IconFileExport } from '@tabler/icons-react';
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
    onExportClick?: () => void;
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
    onExportClick,
}, ref) => {
    const { studioMode } = useAppTheme();
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
        <Box 
            sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 1300,
                bgcolor: studioMode === 'dark' ? 'rgba(18, 18, 18, 0.8)' : 'rgba(240, 240, 240, 0.1)',
                borderBottom: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
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
                                    backgroundColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
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
                                backgroundColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
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
                                backgroundColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                            },
                        }}
                        disableRipple
                    >
                        <IconArrowForwardUp />
                    </IconButton>
                </Box>


                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    bgcolor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
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
                                backgroundColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
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
                                backgroundColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
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
                           color: studioMode === 'dark' ? '#ffffff' : '#000000'
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
                    <Tooltip title={`Grid snap: ${getGridSnapOptionName(gridSnapSize)}`}>
                        <IconButton
                            size="small"
                            color="inherit"
                            onClick={handleGridClick}
                            sx={{
                                borderRadius: '8px',
                                backgroundColor: snapToGrid ? (studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)') : 'transparent',
                                '&:hover': {
                                    backgroundColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                                },
                            }}
                            disableRipple
                        >
                            {snapToGrid ? <GridIcon /> : <GridOffIcon />}
                        </IconButton>
                    </Tooltip>
                    <IconButton
                        size="small"
                        color="inherit"
                        onClick={onZoomIn}
                        sx={{
                            borderRadius: '8px',
                            '&:hover': {
                                backgroundColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                            },
                        }}
                        disableRipple
                    >
                        <IconZoomIn />
                    </IconButton>
                    <Box sx={{ 
                        color: "text.primary",
                        fontWeight: "bold", 
                        bgcolor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
                        minWidth: 40, 
                        textAlign: "center", 
                        border: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
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
                                backgroundColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
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
                    <Tooltip title="Export project">
                        <IconButton
                            size="small"
                            color="inherit"
                            onClick={onExportClick}
                            sx={{
                                borderRadius: '8px',
                                '&:hover': {
                                    backgroundColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                                },
                            }}
                            disableRipple
                        >
                            <IconFileExport />
                        </IconButton>
                    </Tooltip>
                    <IconButton
                        size="small"
                        color="inherit"
                        onClick={onChatToggle}
                        sx={{
                            borderRadius: '8px',
                            '&:hover': {
                                backgroundColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
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
                                backgroundColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                            },
                        }}
                        disableRipple
                    >
                        <IconSettings />
                    </IconButton>
                </Box>
            </Box>
            </Box>

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
                <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 0.5, pt: 0.5 }}>
                    <Box sx={{ fontSize: '0.75rem', color: 'text.secondary', px: 2, py: 0.5 }}>STEP</Box>
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
                </Box>
                
                {/* Beat section */}
                <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 0.5, pt: 0.5 }}>
                    <Box sx={{ fontSize: '0.75rem', color: 'text.secondary', px: 2, py: 0.5 }}>BEAT</Box>
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
                </Box>
                
                {/* Bar option */}
                <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 0.5, pt: 0.5 }}>
                    <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BAR)}>
                        <span>Bar</span>
                        {gridSnapSize === GridSnapOption.BAR && <CheckIcon fontSize="small" />}
                    </MenuItem>
                </Box>
            </Menu>
        </Box>
    );
}));

export default StudioControlBar;