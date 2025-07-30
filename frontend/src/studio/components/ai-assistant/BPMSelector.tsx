import React from 'react';
import { IconMetronome as Metronome } from '@tabler/icons-react';
import NumberSelector from './NumberSelector';

interface BPMSelectorProps {
  triggerLabel: string;
  onSelect: (bpm: number) => void;
  selectedBPM: number;
  disabled?: boolean;
  min?: number;
  max?: number;
  themeMode?: 'light' | 'dark'; // Override theme mode, falls back to studioMode
}

const BPMSelector: React.FC<BPMSelectorProps> = ({ 
  triggerLabel, 
  onSelect, 
  selectedBPM,
  disabled = false,
  min = 60,
  max = 200,
  themeMode
}) => {
  return (
    <NumberSelector
      triggerLabel={triggerLabel}
      onSelect={onSelect}
      selectedValue={selectedBPM}
      disabled={disabled}
      min={min}
      max={max}
      label="BPM"
      placeholder="Enter BPM"
      unit="BPM"
      icon={<Metronome className="w-3 h-3 mr-1" />}
      themeMode={themeMode}
    />
  );
};

export default BPMSelector;