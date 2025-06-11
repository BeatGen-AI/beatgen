import React from 'react';

interface ZoomControlsProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  minZoom?: number;
  maxZoom?: number;
  showPercentage?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoomLevel,
  onZoomIn,
  onZoomOut,
  minZoom = 0.25,
  maxZoom = 4.0,
  showPercentage = true,
  className = '',
  style = {}
}) => {
  // Custom styles for zoom icons
  const iconHoverStyle = (e: React.MouseEvent<HTMLImageElement>) => {
    e.currentTarget.style.opacity = "1";
    e.currentTarget.style.transform = "scale(1.1)";
  };

  const iconLeaveStyle = (e: React.MouseEvent<HTMLImageElement>) => {
    e.currentTarget.style.opacity = "0.8";
    e.currentTarget.style.transform = "scale(1)";
  };

  const containerStyle: React.CSSProperties = {
    display: "flex", 
    alignItems: "center", 
    width: "80px", 
    justifyContent: "space-between",
    marginRight: "8px",
    ...style
  };

  const canZoomOut = zoomLevel > minZoom;
  const canZoomIn = zoomLevel < maxZoom;

  return (
    <div className={className} style={containerStyle}>
      <img 
        src="/icons/zoom-out.svg"
        alt="Zoom out"
        onClick={canZoomOut ? onZoomOut : undefined}
        style={{ 
          width: "18px",
          height: "18px",
          cursor: canZoomOut ? "pointer" : "not-allowed",
          opacity: canZoomOut ? 0.8 : 0.4,
          filter: "brightness(0) invert(1)", // Make icon white
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={canZoomOut ? iconHoverStyle : undefined}
        onMouseLeave={canZoomOut ? iconLeaveStyle : undefined}
      />
      
      {showPercentage && (
        <span style={{ 
          fontSize: "12px", 
          width: "36px", 
          textAlign: "center",
          color: "white",
          userSelect: "none"
        }}>
          {Math.round(zoomLevel * 100)}%
        </span>
      )}
      
      <img 
        src="/icons/zoom-in.svg"
        alt="Zoom in"
        onClick={canZoomIn ? onZoomIn : undefined}
        style={{ 
          width: "18px",
          height: "18px",
          cursor: canZoomIn ? "pointer" : "not-allowed",
          opacity: canZoomIn ? 0.8 : 0.4,
          filter: "brightness(0) invert(1)", // Make icon white
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={canZoomIn ? iconHoverStyle : undefined}
        onMouseLeave={canZoomIn ? iconLeaveStyle : undefined}
      />
    </div>
  );
};

export default ZoomControls;