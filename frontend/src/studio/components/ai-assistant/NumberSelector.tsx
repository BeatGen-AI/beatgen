import React, { useState, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAppTheme } from '../../../lib/theme-provider';
import { 
  getBadgeClassName, 
  getDropdownClassName, 
  getInputClassName, 
  getButtonClassName,
  getTextColor 
} from '../../utils/menuStyles';

interface NumberSelectorProps {
  triggerLabel: string;
  onSelect: (value: number) => void;
  selectedValue: number;
  disabled?: boolean;
  min?: number;
  max?: number;
  label: string; // e.g., "BPM", "Bars"
  placeholder: string; // e.g., "Enter BPM", "Enter number of bars"
  unit?: string; // e.g., "BPM", "bars"
  icon: React.ReactNode;
}

const NumberSelector: React.FC<NumberSelectorProps> = ({ 
  triggerLabel, 
  onSelect, 
  selectedValue,
  disabled = false,
  min = 1,
  max = 100,
  label,
  placeholder,
  unit,
  icon
}) => {
  const { studioMode } = useAppTheme();
  const [inputValue, setInputValue] = useState(selectedValue.toString());
  const [isOpen, setIsOpen] = useState(false);

  // Fix state synchronization bug - sync with prop changes
  useEffect(() => {
    setInputValue(selectedValue.toString());
  }, [selectedValue]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputSubmit = () => {
    const numericValue = parseInt(inputValue);
    if (!isNaN(numericValue) && numericValue >= min && numericValue <= max) {
      onSelect(numericValue);
      setIsOpen(false);
    } else {
      // Reset to current value if invalid
      setInputValue(selectedValue.toString());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInputSubmit();
    } else if (e.key === 'Escape') {
      setInputValue(selectedValue.toString());
      setIsOpen(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setInputValue(selectedValue.toString());
    }
  };


  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Badge 
          variant="secondary"
          className={getBadgeClassName(studioMode, disabled)}
          style={{
            borderRadius: '5px',
            fontSize: '0.7rem'
          }}
        >
          {icon}
          {triggerLabel}
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className={`${getDropdownClassName(studioMode, 'w-48')} p-3`}
        sideOffset={4}
      >
        <div className="space-y-3">
          <div>
            <label className={`block text-sm font-medium mb-2 ${getTextColor(studioMode)}`}>
              {label} ({min}-{max})
            </label>
            <Input
              type="number"
              min={min}
              max={max}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              className={getInputClassName(studioMode)}
              placeholder={placeholder}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleInputSubmit}
              className={`flex-1 text-xs ${getButtonClassName(studioMode, 'primary')}`}
            >
              Apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsOpen(false)}
              className={`flex-1 text-xs ${getButtonClassName(studioMode, 'outline')}`}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NumberSelector;