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
import { MousePointer2, Edit, Highlighter, Eraser, Check, Grid3X3 } from 'lucide-react';
import { Tool } from '../../shared/interactions';
import { GridSnapOption, getGridSnapOptionName } from '../piano-roll2/gridConstants';
import { GridSnapSelector } from '../ui/GridSnapSelector';
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
                    className="grid grid-cols-[1fr_auto_1fr] items-center w-full min-w-fit gap-3 px-2 py-2"
                >
                    {/* Left section */}
                    <div className="flex items-center gap-3 justify-self-start">
                        <div className="flex gap-3">
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
                                        <IconArrowLeft size={24} />
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
                                        <IconArrowBackUp size={24} />
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
                                        <IconArrowForwardUp size={24} />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Redo</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>

                        <div 
                            className="flex items-center rounded px-2 py-1 gap-3"
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

                        <div className="flex gap-3">
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
                                {isPlaying ? <IconPlayerPauseFilled size={24} /> : <IconPlayerPlayFilled size={24} />}
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
                                <IconPlayerSkipBackFilled size={24} />
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
                        <div className="flex items-center gap-3">
                            <GridSnapSelector
                                value={gridSnapSize}
                                enabled={snapToGrid}
                                onValueChange={onGridSnapSizeChange}
                                variant="control-bar"
                                theme={studioMode}
                            />
                            
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
                                <IconZoomIn size={24} />
                            </button>
                            
                            <div 
                                className="font-bold min-w-[40px] text-center px-2 py-1 rounded text-sm"
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
                                <IconZoomOut size={24} />
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
                                        <IconFileExport size={24} />
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
                                {isChatOpen ? <IconChevronsRight size={24} /> : <IconInputAi size={24} />}
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
                                <IconSettings size={24} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
}));

export default StudioControlBar;