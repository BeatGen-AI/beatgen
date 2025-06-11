import React, { useState } from 'react';
import { SharedToolbar, ToolType, GridSnapOption } from '../shared';

// Timeline-specific grid snap options that match track timeline usage
const timelineGridSnapOptions: GridSnapOption[] = [
  { value: 0, label: 'None' },
  { value: 1, label: '1/32 note', category: 'beat' },
  { value: 2, label: '1/16 note', category: 'beat' },
  { value: 3, label: '1/8 note', category: 'beat' },
  { value: 4, label: '1/4 note', category: 'beat' },
  { value: 5, label: '1/2 note', category: 'beat' },
  { value: 6, label: 'Whole note', category: 'beat' },
  { value: 7, label: 'Beat', category: 'beat' },
  { value: 8, label: 'Bar', category: 'bar' }
];

interface TimelineToolbarProps {
  // Tool state
  selectedTool: ToolType;
  onToolSelect: (tool: ToolType) => void;
  
  // Grid snap state
  gridSnapEnabled: boolean;
  selectedSnapSize: number;
  onGridSnapToggle: () => void;
  onSnapSizeChange: (size: number) => void;
  
  // Zoom state
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  
  // Timeline-specific props
  selectedTracksCount?: number;
  isSelectionMode?: boolean;
  onToggleSelectionMode?: () => void;
  
  // Style props
  className?: string;
  style?: React.CSSProperties;
}

export const TimelineToolbar: React.FC<TimelineToolbarProps> = ({
  selectedTool,
  onToolSelect,
  gridSnapEnabled,
  selectedSnapSize,
  onGridSnapToggle,
  onSnapSizeChange,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  selectedTracksCount = 0,
  isSelectionMode = false,
  onToggleSelectionMode,
  className = '',
  style = {}
}) => {
  const containerStyle: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 1002,
    backgroundColor: "#1a1a1a",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    ...style
  };

  const getTitle = () => {
    if (isSelectionMode && selectedTracksCount > 0) {
      return `${selectedTracksCount} track${selectedTracksCount !== 1 ? 's' : ''} selected`;
    }
    if (isSelectionMode) {
      return "Selection Mode";
    }
    return "Timeline";
  };

  // Handle tool selection with special logic for select tool
  const handleToolSelect = (tool: ToolType) => {
    onToolSelect(tool);
    
    // If selecting the select tool, enable selection mode
    if (tool === 'select' && onToggleSelectionMode && !isSelectionMode) {
      onToggleSelectionMode();
    }
    // If selecting any other tool, disable selection mode
    else if (tool !== 'select' && onToggleSelectionMode && isSelectionMode) {
      onToggleSelectionMode();
    }
  };

  return (
    <div className={className} style={containerStyle}>
      <SharedToolbar
        selectedTool={selectedTool}
        onToolSelect={handleToolSelect}
        gridSnapEnabled={gridSnapEnabled}
        selectedSnapSize={selectedSnapSize}
        onGridSnapToggle={onGridSnapToggle}
        onSnapSizeChange={onSnapSizeChange}
        snapOptions={timelineGridSnapOptions}
        zoomLevel={zoomLevel}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        minZoom={0.25}
        maxZoom={4.0}
        showZoomPercentage={true}
        title={getTitle()}
        backgroundColor="#1a1a1a"
      />
      
      {/* Timeline-specific info panel */}
      {(isSelectionMode || selectedTracksCount > 0) && (
        <div style={{
          padding: "4px 12px",
          fontSize: "10px",
          color: "rgba(255,255,255,0.7)",
          backgroundColor: "rgba(0,0,0,0.2)",
          borderBottom: "1px solid rgba(255,255,255,0.05)"
        }}>
          {isSelectionMode ? (
            <span>
              <strong>Selection Mode:</strong> Drag to select • Click + Ctrl/Shift for multi-select • 
              S to toggle mode • Esc to exit
            </span>
          ) : (
            <span>
              <strong>Edit Mode:</strong> Use tools to create, edit, and delete track instances
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default TimelineToolbar;