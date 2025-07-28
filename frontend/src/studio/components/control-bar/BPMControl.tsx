import React, { useRef } from 'react';
import { cn } from '../../../lib/utils';
import { useAppTheme } from '../../../lib/theme-provider';

interface BPMControlProps {
  bpm: number;
  onBpmChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const BPMControl: React.FC<BPMControlProps> = ({ bpm, onBpmChange }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { studioMode } = useAppTheme();

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      inputRef.current?.blur();
    }
  };

  // Calculate width based on number of digits
  const getInputWidth = (value: number) => {
    const numDigits = value.toString().length;
    // Use dynamic width classes based on digit count
    if (numDigits === 1) return 'w-3';
    if (numDigits === 2) return 'w-5';
    return 'w-7';
  };

  return (
    <div className="flex items-center">
      <div className="w-7 text-right">
        <input
          value={bpm}
          onChange={onBpmChange}
          onKeyDown={handleKeyDown}
          type="number"
          ref={inputRef}
          min={1}
          max={999}
          className={cn(
            "p-0 border-0 bg-transparent text-center cursor-pointer outline-none",
            "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
            "caret-transparent text-base h-6 select-none",
            getInputWidth(bpm)
          )}
          style={{
            backgroundColor: 'transparent',
            color: studioMode === 'dark' ? '#ffffff' : '#000000',
            border: 'none',
            height: '24px',
            lineHeight: '24px'
          }}
          onFocus={(e) => {
            e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        />
      </div>
      <div 
        className="ml-1"
        style={{ color: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)' }}
      >
        bpm
      </div>
    </div>
  );
};

export default BPMControl;