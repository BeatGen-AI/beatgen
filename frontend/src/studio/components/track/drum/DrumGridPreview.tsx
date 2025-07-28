import React from 'react';
import { MUSIC_CONSTANTS } from '../../../constants/musicConstants';

// Constants for the preview grid
const PREVIEW_COLS = 64; // Show 4 bars (16 steps * 4)
const TICKS_PER_STEP = MUSIC_CONSTANTS.pulsesPerQuarterNote / 4; // Assuming 4 steps per beat (like DrumMachine)

interface DrumGridPreviewProps {
  pattern: boolean[][] | null;
  width: number;
  height: number;
  trackColor: string;
  // Add other necessary props like timeSignature, bpm, etc. if needed for calculations
  timeSignature?: [number, number];
  bpm?: number;
}

const DrumGridPreview: React.FC<DrumGridPreviewProps> = ({
  pattern,
  width,
  height,
  trackColor,
  timeSignature = [4, 4],
  bpm = 120
}) => {

  console.log(`DrumGridPreview: Received pattern:`, pattern);

  // Determine number of rows dynamically, default to 1 if pattern is null/empty
  const numRows = pattern?.length || 1;
  // Keep number of columns fixed for now
  const numCols = PREVIEW_COLS; 

  // Use the passed-in pattern directly, but prepare a sliced version for display
  const patternToShow = pattern 
    ? pattern.slice(0, numRows).map(row => row.slice(0, numCols))
    : Array(numRows).fill(null).map(() => Array(numCols).fill(false));

  return (
    <div 
      className="relative overflow-hidden grid gap-0.5 p-0.5 rounded-sm"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: 'rgba(0,0,0,0.2)', 
        border: `1px solid ${trackColor}`,
        gridTemplateRows: `repeat(${numRows}, 1fr)`,
        gridTemplateColumns: `repeat(${numCols}, 1fr)`
      }}
    >
      {/* Render the grid cells using the sliced pattern */}
      {patternToShow.map((row, rowIndex) => 
        row.map((isActive, colIndex) => (
          <div 
            key={`cell-${rowIndex}-${colIndex}`}
            className="rounded-sm transition-shadow duration-100"
            style={{
              backgroundColor: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.05)',
              boxShadow: isActive ? '0px 0px 3px 1px rgba(255, 255, 255, 0.6)' : 'none'
            }}
          />
        ))
      )}
      {/* 
      <span style={{ color: trackColor, fontSize: '10px', opacity: 0.7 }}>
        Drum Grid Preview (TODO)
      </span>
      */}
    </div>
  );
};

export default DrumGridPreview; 