import React, { forwardRef, memo, useRef, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../../../components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu';
import { useAppTheme } from '../../../lib/theme-provider';
// Import components
import BPMControl from './BPMControl';
import TimeSignatureDisplay from './TimeSignatureDisplay';
import { TimeDisplay, TimeDisplayHandle } from './TimeDisplay';
import KeySelector from './KeySelector';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { useStudioStore } from '../../stores/studioStore';
import { IconPlayerPlayFilled, IconPlayerSkipBackFilled, IconPlayerPauseFilled, IconArrowForwardUp, IconArrowBackUp, IconZoomIn, IconZoomOut, IconInputAi, IconChevronsRight, IconArrowLeft, IconFileExport } from '@tabler/icons-react';
import { IconSettings } from '@tabler/icons-react';
import { MousePointer2, Edit, Highlighter, Eraser, Grid3X3, Check } from 'lucide-react';
import { Tool } from '../../shared/interactions';
import { GridSnapOption, getGridSnapOptionName } from '../piano-roll2/gridConstants';
import { cn } from '../../../lib/utils';

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
    const [gridMenuOpen, setGridMenuOpen] = useState(false);

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

    const handleGridSnapSizeChange = (option: GridSnapOption) => {
        onGridSnapSizeChange?.(option);
        setGridMenuOpen(false);
    };

    return (
        <TooltipProvider>
            <div 
                className="fixed top-0 left-0 right-0 z-50 backdrop-blur-sm overflow-x-auto overflow-y-hidden"
                style={{
                    zIndex: 50,
                    backgroundColor: studioMode === 'dark' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)',
                    borderBottom: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`
                }}
            >
                <div 
                    ref={ref}
                    className="grid grid-cols-[1fr_auto_1fr] items-center w-full min-w-fit gap-2 px-4 py-2"
                >
                    {/* Left section */}
                    <div className="flex items-center gap-2 justify-self-start">
                        <div className="flex gap-1">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => {
                                            window.location.href = '/home';
                                        }}
                                        className="h-8 w-8 p-0 rounded-lg transition-colors"
                                        style={{
                                            backgroundColor: 'transparent',
                                            color: studioMode === 'dark' ? '#ffffff' : '#000000',
                                            border: 'none',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                        }}
                                    >
                                        <IconArrowLeft size={16} />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Go back to Projects</p>
                                </TooltipContent>
                            </Tooltip>
                            
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={onUndo}
                                        disabled={!canUndo}
                                        className="h-8 w-8 p-0 rounded-lg transition-colors disabled:opacity-50"
                                        style={{
                                            backgroundColor: 'transparent',
                                            color: studioMode === 'dark' ? '#ffffff' : '#000000',
                                            border: 'none',
                                            cursor: canUndo ? 'pointer' : 'not-allowed',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (canUndo) {
                                                e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                        }}
                                    >
                                        <IconArrowBackUp size={16} />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Undo</p>
                                </TooltipContent>
                            </Tooltip>
                            
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={onRedo}
                                        disabled={!canRedo}
                                        className="h-8 w-8 p-0 rounded-lg transition-colors disabled:opacity-50"
                                        style={{
                                            backgroundColor: 'transparent',
                                            color: studioMode === 'dark' ? '#ffffff' : '#000000',
                                            border: 'none',
                                            cursor: canRedo ? 'pointer' : 'not-allowed',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (canRedo) {
                                                e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                        }}
                                    >
                                        <IconArrowForwardUp size={16} />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Redo</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>

                        <div 
                            className="flex items-center rounded px-2 py-1 gap-1"
                            style={{
                                backgroundColor: studioMode === 'dark' ? '#2a2a2a' : '#f1f5f9'
                            }}
                        >
                            <BPMControl bpm={bpm} onBpmChange={onBpmChange} />
                        </div>

                        <KeySelector
                            selectedKey={keySignature}
                            onKeyChange={onKeySignatureChange}
                        />

                        <div className="flex gap-1">
                            <button
                                onClick={handlePlayPause}
                                className="h-8 w-8 p-0 rounded-lg transition-colors"
                                style={{
                                    backgroundColor: 'transparent',
                                    color: studioMode === 'dark' ? '#ffffff' : '#000000',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                {isPlaying ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
                            </button>
                            <button
                                onClick={handleStop}
                                className="h-8 w-8 p-0 rounded-lg transition-colors"
                                style={{
                                    backgroundColor: 'transparent',
                                    color: studioMode === 'dark' ? '#ffffff' : '#000000',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                <IconPlayerSkipBackFilled size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Center section - Project Title */}
                    <div className="flex justify-center justify-self-center">
                        <input
                            value={projectTitle}
                            onChange={onTitleChange}
                            className="w-full max-w-[300px] text-center outline-none"
                            placeholder="Project Title"
                            style={{
                                backgroundColor: 'transparent',
                                border: 'none',
                                color: studioMode === 'dark' ? '#ffffff' : '#000000'
                            }}
                        />
                    </div>

                    {/* Right section */}
                    <div className="justify-self-end">
                        <div className="flex items-center gap-1">
                            <DropdownMenu open={gridMenuOpen} onOpenChange={setGridMenuOpen}>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        className="h-8 w-8 p-0 rounded-lg transition-colors"
                                        style={{
                                            backgroundColor: snapToGrid 
                                                ? (studioMode === 'dark' ? '#2a2a2a' : '#f1f5f9')
                                                : 'transparent',
                                            color: studioMode === 'dark' ? '#ffffff' : '#000000',
                                            border: 'none',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!snapToGrid) {
                                                e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!snapToGrid) {
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                            }
                                        }}
                                    >
                                        <Grid3X3 
                                            size={16} 
                                            style={{ 
                                                opacity: snapToGrid ? 1 : 0.5,
                                                color: studioMode === 'dark' ? '#ffffff' : '#000000'
                                            }} 
                                        />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent 
                                    align="center" 
                                    className="w-40"
                                    style={{
                                        backgroundColor: studioMode === 'dark' ? '#1a1a1a' : '#ffffff',
                                        borderColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                                        color: studioMode === 'dark' ? '#ffffff' : '#000000'
                                    }}
                                >
                                    <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.NONE)}>
                                        <span>None</span>
                                        {gridSnapSize === GridSnapOption.NONE && <Check size={16} className="ml-auto" />}
                                    </DropdownMenuItem>
                                    
                                    <div className="border-t mx-2 my-1"></div>
                                    <div 
                                        className="px-2 py-1 text-xs font-medium"
                                        style={{ color: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)' }}
                                    >STEP</div>
                                    <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_6)}>
                                        <span>1/6 step</span>
                                        {gridSnapSize === GridSnapOption.STEP_1_6 && <Check size={16} className="ml-auto" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_4)}>
                                        <span>1/4 step</span>
                                        {gridSnapSize === GridSnapOption.STEP_1_4 && <Check size={16} className="ml-auto" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_3)}>
                                        <span>1/3 step</span>
                                        {gridSnapSize === GridSnapOption.STEP_1_3 && <Check size={16} className="ml-auto" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_2)}>
                                        <span>1/2 step</span>
                                        {gridSnapSize === GridSnapOption.STEP_1_2 && <Check size={16} className="ml-auto" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP)}>
                                        <span>Step</span>
                                        {gridSnapSize === GridSnapOption.STEP && <Check size={16} className="ml-auto" />}
                                    </DropdownMenuItem>
                                    
                                    <div className="border-t mx-2 my-1"></div>
                                    <div 
                                        className="px-2 py-1 text-xs font-medium"
                                        style={{ color: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)' }}
                                    >BEAT</div>
                                    <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_6)}>
                                        <span>1/6 beat</span>
                                        {gridSnapSize === GridSnapOption.BEAT_1_6 && <Check size={16} className="ml-auto" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_4)}>
                                        <span>1/4 beat</span>
                                        {gridSnapSize === GridSnapOption.BEAT_1_4 && <Check size={16} className="ml-auto" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_3)}>
                                        <span>1/3 beat</span>
                                        {gridSnapSize === GridSnapOption.BEAT_1_3 && <Check size={16} className="ml-auto" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_2)}>
                                        <span>1/2 beat</span>
                                        {gridSnapSize === GridSnapOption.BEAT_1_2 && <Check size={16} className="ml-auto" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT)}>
                                        <span>Beat</span>
                                        {gridSnapSize === GridSnapOption.BEAT && <Check size={16} className="ml-auto" />}
                                    </DropdownMenuItem>
                                    
                                    <div className="border-t mx-2 my-1"></div>
                                    <div 
                                        className="px-2 py-1 text-xs font-medium"
                                        style={{ color: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)' }}
                                    >BAR</div>
                                    <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BAR)}>
                                        <span>Bar</span>
                                        {gridSnapSize === GridSnapOption.BAR && <Check size={16} className="ml-auto" />}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            
                            <button
                                onClick={onZoomIn}
                                className="h-8 w-8 p-0 rounded-lg transition-colors"
                                style={{
                                    backgroundColor: 'transparent',
                                    color: studioMode === 'dark' ? '#ffffff' : '#000000',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                <IconZoomIn size={16} />
                            </button>
                            
                            <div 
                                className="font-bold min-w-[40px] text-center px-1 py-1 rounded text-sm"
                                style={{
                                    backgroundColor: studioMode === 'dark' ? '#2a2a2a' : '#f1f5f9',
                                    border: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'}`,
                                    color: studioMode === 'dark' ? '#ffffff' : '#000000'
                                }}
                            >
                                {zoomLevel.toFixed(1)}x
                            </div>
                            
                            <button
                                onClick={onZoomOut}
                                className="h-8 w-8 p-0 rounded-lg transition-colors"
                                style={{
                                    backgroundColor: 'transparent',
                                    color: studioMode === 'dark' ? '#ffffff' : '#000000',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                <IconZoomOut size={16} />
                            </button>
                            
                            <TimeDisplay
                                ref={timeDisplayRef}
                                initialTime={currentTime}
                            />
                            
                            <SaveStatusIndicator
                                status={autoSaveStatus || 'idle'}
                                message={autoSaveMessage}
                                onRetryClick={onAutoSaveRetry}
                            />
                            
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={onExportClick}
                                        className="h-8 w-8 p-0 rounded-lg transition-colors"
                                        style={{
                                            backgroundColor: 'transparent',
                                            color: studioMode === 'dark' ? '#ffffff' : '#000000',
                                            border: 'none',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                        }}
                                    >
                                        <IconFileExport size={16} />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Export project</p>
                                </TooltipContent>
                            </Tooltip>
                            
                            <button
                                onClick={onChatToggle}
                                className="h-8 w-8 p-0 rounded-lg transition-colors"
                                style={{
                                    backgroundColor: 'transparent',
                                    color: studioMode === 'dark' ? '#ffffff' : '#000000',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                {isChatOpen ? <IconChevronsRight size={16} /> : <IconInputAi size={16} />}
                            </button>
                            
                            <button
                                onClick={onSettingsToggle}
                                className="h-8 w-8 p-0 rounded-lg transition-colors"
                                style={{
                                    backgroundColor: 'transparent',
                                    color: studioMode === 'dark' ? '#ffffff' : '#000000',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                <IconSettings size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}));

export default StudioControlBar;