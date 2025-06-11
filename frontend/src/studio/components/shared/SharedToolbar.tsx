import React from 'react';
import ToolSelection, { ToolType } from './ToolSelection';
import GridSnapControls, { GridSnapOption } from './GridSnapControls';
import ZoomControls from './ZoomControls';

interface SharedToolbarProps {
  // Tool selection props
  selectedTool: ToolType;
  onToolSelect: (tool: ToolType) => void;
  
  // Grid snap props
  gridSnapEnabled: boolean;
  selectedSnapSize: number;
  onGridSnapToggle: () => void;
  onSnapSizeChange: (size: number) => void;
  snapOptions?: GridSnapOption[];
  
  // Zoom control props
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  minZoom?: number;
  maxZoom?: number;
  showZoomPercentage?: boolean;
  
  // Optional close button
  onClose?: () => void;
  title?: string;
  
  // Style props
  className?: string;
  style?: React.CSSProperties;
  backgroundColor?: string;
}

export const SharedToolbar: React.FC<SharedToolbarProps> = ({
  selectedTool,
  onToolSelect,
  gridSnapEnabled,
  selectedSnapSize,
  onGridSnapToggle,
  onSnapSizeChange,
  snapOptions,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  minZoom = 0.25,
  maxZoom = 4.0,
  showZoomPercentage = true,
  onClose,
  title,
  className = '',
  style = {},
  backgroundColor = "#222222"
}) => {
  const containerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "32px",
    backgroundColor,
    color: "white",
    padding: "0 8px",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    userSelect: "none",
    ...style
  };

  const leftSectionStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    flex: 1
  };

  const rightSectionStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center"
  };

  return (
    <div className={className} style={containerStyle}>
      {/* Left section with title */}
      <div style={leftSectionStyle}>
        {title && (
          <span style={{ 
            marginRight: "16px", 
            fontSize: "12px", 
            fontWeight: "bold",
            color: "rgba(255,255,255,0.9)"
          }}>
            {title}
          </span>
        )}
      </div>

      {/* Center section with controls */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <ToolSelection 
          selectedTool={selectedTool}
          onToolSelect={onToolSelect}
        />
        
        <GridSnapControls 
          enabled={gridSnapEnabled}
          selectedSnapSize={selectedSnapSize}
          onToggle={onGridSnapToggle}
          onSnapSizeChange={onSnapSizeChange}
          snapOptions={snapOptions}
        />
        
        <ZoomControls 
          zoomLevel={zoomLevel}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          minZoom={minZoom}
          maxZoom={maxZoom}
          showPercentage={showZoomPercentage}
        />
      </div>

      {/* Right section with close button */}
      <div style={rightSectionStyle}>
        {onClose && (
          <div
            style={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "22px",
              height: "22px",
              marginRight: "-4px",
              borderRadius: "3px",
              transition: "background-color 0.2s ease",
            }}
            onClick={onClose}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            <img
              src="/icons/close.svg"
              alt="Close"
              style={{
                width: "16px",
                height: "16px",
                filter: "brightness(0) invert(1)", // Make icon white
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default SharedToolbar;