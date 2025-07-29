import React from 'react';
import { BarChart3 } from 'lucide-react';
import NumberSelector from './NumberSelector';

interface BarSelectorProps {
  triggerLabel: string;
  onSelect: (bars: number) => void;
  selectedBars: number;
  disabled?: boolean;
  min?: number;
  max?: number;
}

const BarSelector: React.FC<BarSelectorProps> = ({ 
  triggerLabel, 
  onSelect, 
  selectedBars,
  disabled = false,
  min = 1,
  max = 16
}) => {
  return (
    <NumberSelector
      triggerLabel={triggerLabel}
      onSelect={onSelect}
      selectedValue={selectedBars}
      disabled={disabled}
      min={min}
      max={max}
      label="Bars"
      placeholder="Enter number of bars"
      unit="bars"
      icon={<BarChart3 className="w-3 h-3 mr-1" />}
    />
  );
};

export default BarSelector;