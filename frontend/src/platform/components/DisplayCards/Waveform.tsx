import React, { useState, useRef } from 'react';
import { formatTime } from '../../../studio/utils/audioProcessing'; // Path for the global formatTime

// Enhanced waveform component with progress and click handling
const Waveform = ({ 
  data, 
  playing = false, 
  progress = 0, 
  duration = 0,
  onSeek
}: { 
  data: number[], 
  playing?: boolean, 
  progress?: number, 
  duration?: number,
  onSeek?: (position: number) => void 
}) => {
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  
  // Calculate current position as percentage
  const progressPercent = duration > 0 ? (progress / duration) : 0;
  
  // Handle mouse move to show time indicator
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || !onSeek) return;
    
    const rect = waveformRef.current.getBoundingClientRect();
    const position = (e.clientX - rect.left) / rect.width;
    setHoverPosition(position);
  };
  
  // Handle click to seek
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || !onSeek || !duration) return;
    
    const rect = waveformRef.current.getBoundingClientRect();
    const position = (e.clientX - rect.left) / rect.width;
    onSeek(position * duration);
  };
  
  // Format time for hover display
  const formatHoverTime = (position: number): string => {
    if (!duration) return "0:00"; // Or use formatTime(0, false) for consistency
    const seconds = Math.floor(position * duration);
    // Pass false to formatTime to get MM:SS, assuming that's the desired hover format
    return formatTime(seconds, false); 
  };
  
  return (
    <div 
      ref={waveformRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverPosition(null)}
      className={`h-10 w-full flex items-end relative mt-1 mb-1 ${onSeek ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {/* Waveform bars */}
      {data.map((value, index) => (
        <div 
          key={index}
          className="w-full flex-1 mx-px transition-colors duration-100 ease-in-out"
          style={{
            height: `${Math.max(3, value * 40)}px`,
            backgroundColor: index < (data.length * progressPercent) ? '#6a3de8' : '#555',
          }}
        />
      ))}
      
      {/* Time indicator on hover */}
      {hoverPosition !== null && (
        <div 
          className="absolute bottom-full transform -translate-x-1/2 bg-black/70 text-white px-1.5 py-0.5 rounded text-xs mb-1"
          style={{ left: `${hoverPosition * 100}%` }}
        >
          {formatHoverTime(hoverPosition)}
        </div>
      )}
      
      {/* Playback position indicator */}
      {playing && progress > 0 && (
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-white z-[2]"
          style={{ left: `${progressPercent * 100}%` }}
        />
      )}
    </div>
  );
};

export default Waveform;
