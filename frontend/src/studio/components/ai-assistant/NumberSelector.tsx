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

  const getDropdownClassName = () => {
    if (studioMode === 'dark') {
      return "w-48 z-[9999] p-3 bg-[rgb(48,48,48)] border-0 shadow-lg rounded-lg focus:outline-none";
    }
    return "w-48 z-[9999] p-3 bg-white border border-gray-200 shadow-lg rounded-lg focus:outline-none";
  };

  const getInputClassName = () => {
    if (studioMode === 'dark') {
      return "bg-[rgb(60,60,60)] border-[rgb(80,80,80)] text-white placeholder-gray-400 focus:border-blue-400";
    }
    return "bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500";
  };

  const getButtonClassName = () => {
    if (studioMode === 'dark') {
      return "bg-blue-600 hover:bg-blue-700 text-white";
    }
    return "bg-blue-600 hover:bg-blue-700 text-white";
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Badge 
          variant="secondary"
          className={`cursor-pointer h-5 text-xs border-0 ${
            studioMode === 'dark' 
              ? 'bg-[rgba(60,60,60,0.8)] text-white hover:bg-[rgba(60,60,60,0.9)]'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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
        className={getDropdownClassName()}
        sideOffset={4}
      >
        <div className="space-y-3">
          <div>
            <label className={`block text-sm font-medium mb-2 ${
              studioMode === 'dark' ? 'text-white' : 'text-gray-900'
            }`}>
              {label} ({min}-{max})
            </label>
            <Input
              type="number"
              min={min}
              max={max}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              className={getInputClassName()}
              placeholder={placeholder}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleInputSubmit}
              className={`flex-1 text-xs ${getButtonClassName()}`}
            >
              Apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsOpen(false)}
              className={`flex-1 text-xs ${
                studioMode === 'dark' 
                  ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
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