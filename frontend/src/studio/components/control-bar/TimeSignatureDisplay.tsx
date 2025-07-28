import React, { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { useAppTheme } from '../../../lib/theme-provider';
import { cn } from '../../../lib/utils';

interface TimeSignatureMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedValue: number;
  options: number[];
  onSelect: (value: number) => void;
  children: React.ReactNode;
}

const TimeSignatureMenu: React.FC<TimeSignatureMenuProps> = ({
  open,
  onOpenChange,
  selectedValue,
  options,
  onSelect,
  children,
}) => {
  const { studioMode } = useAppTheme();

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="center"
        sideOffset={8}
        className={cn(
          "min-w-[60px] p-1",
          studioMode === 'dark'
            ? "bg-black/90 border-white/20"
            : "bg-white border-black/20"
        )}
      >
        {options.map((num) => (
          <DropdownMenuItem
            key={num}
            onClick={() => onSelect(num)}
            className={cn(
              "justify-center text-sm py-1.5 px-2 rounded cursor-pointer",
              num === selectedValue
                ? studioMode === 'dark'
                  ? "bg-white/20 text-white"
                  : "bg-black/20 text-black"
                : studioMode === 'dark'
                  ? "text-white/80 hover:bg-white/10"
                  : "text-black/80 hover:bg-black/10"
            )}
          >
            {num}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface TimeSignatureNumberProps {
  value: number;
  onClick: () => void;
  options: number[];
  onSelect: (value: number) => void;
}

const TimeSignatureNumber: React.FC<TimeSignatureNumberProps> = ({
  value,
  onClick,
  options,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const { studioMode } = useAppTheme();

  return (
    <TimeSignatureMenu
      open={open}
      onOpenChange={setOpen}
      selectedValue={value}
      options={options}
      onSelect={(newValue) => {
        onSelect(newValue);
        setOpen(false);
      }}
    >
      <span
        className={cn(
          "inline-block w-4 text-center cursor-pointer transition-colors duration-200",
          studioMode === 'dark'
            ? "hover:text-white/60"
            : "hover:text-black/60"
        )}
        onClick={() => setOpen(true)}
      >
        {value}
      </span>
    </TimeSignatureMenu>
  );
};

interface TimeSignatureDisplayProps {
  topNumber: number;
  bottomNumber: number;
  onTopNumberChange?: (value: number) => void;
  onBottomNumberChange?: (value: number) => void;
}

export const TimeSignatureDisplay: React.FC<TimeSignatureDisplayProps> = ({
  topNumber,
  bottomNumber,
  onTopNumberChange,
  onBottomNumberChange,
}) => {
  const { studioMode } = useAppTheme();

  const handleTopSelect = (value: number) => {
    if (onTopNumberChange) {
      onTopNumberChange(value);
    }
  };

  const handleBottomSelect = (value: number) => {
    if (onBottomNumberChange) {
      onBottomNumberChange(value);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center px-2 py-1 h-6 rounded font-mono text-sm",
        studioMode === 'dark'
          ? "bg-white/10 border border-white/12"
          : "bg-black/10 border border-black/12"
      )}
    >
      <TimeSignatureNumber 
        value={topNumber} 
        onClick={() => {}} 
        options={[1, 2, 3, 4, 5, 6]}
        onSelect={handleTopSelect}
      />
      <span className="mx-1 select-none">/</span>
      <TimeSignatureNumber 
        value={bottomNumber} 
        onClick={() => {}} 
        options={[1, 2, 4, 8]}
        onSelect={handleBottomSelect}
      />
    </div>
  );
};

export default TimeSignatureDisplay;