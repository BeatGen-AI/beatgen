import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useAppTheme } from '../../../lib/theme-provider';

interface ChatModeMenuProps {
  triggerLabel: string;
  onSelect: (mode: string) => void;
  selectedMode?: string;
}

const ChatModeMenu: React.FC<ChatModeMenuProps> = ({ triggerLabel, onSelect, selectedMode }) => {
  const { studioMode } = useAppTheme();

  const modes = [
    { id: 'generate', label: 'Generate' },
    { id: 'edit', label: 'Edit' },
    { id: 'generate-audio', label: 'Generate Audio' }
  ];

  const handleSelect = (mode: string) => {
    onSelect(mode);
  };

  const getDropdownClassName = () => {
    if (studioMode === 'dark') {
      // Match Material-UI menu styling for dark mode
      return "w-44 z-[9999] p-1 bg-[rgb(48,48,48)] border-0 shadow-lg rounded-lg focus:outline-none";
    }
    // Light mode styling
    return "w-44 z-[9999] p-1 bg-white border border-gray-200 shadow-lg rounded-lg focus:outline-none";
  };

  const getItemClassName = (isSelected: boolean) => {
    const baseClasses = "flex items-center justify-between cursor-pointer min-h-0 transition-colors text-xs rounded";
    const paddingClasses = "px-2 py-1";
    
    if (studioMode === 'dark') {
      // Dark mode: Match Material-UI MenuItem styling
      const textColor = 'text-white';
      const selectedClass = isSelected ? 'bg-[rgba(255,255,255,0.1)]' : '';
      const hoverClass = 'hover:bg-[rgba(255,255,255,0.08)]';
      return `${baseClasses} ${paddingClasses} ${textColor} ${selectedClass} ${hoverClass}`;
    } else {
      // Light mode styling
      const textColor = 'text-gray-900';
      const selectedClass = isSelected ? 'bg-gray-100' : '';
      const hoverClass = 'hover:bg-gray-50';
      return `${baseClasses} ${paddingClasses} ${textColor} ${selectedClass} ${hoverClass}`;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Badge 
          variant="secondary"
          className={`cursor-pointer h-5 text-xs border-0 ${
            studioMode === 'dark' 
              ? 'bg-[rgba(60,60,60,0.8)] text-white hover:bg-[rgba(60,60,60,0.9)]'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
          style={{
            borderRadius: '5px',
            fontSize: '0.7rem'
          }}
        >
          {triggerLabel}
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={getDropdownClassName()}
        sideOffset={4}
      >
        {modes.map((mode) => {
          const isSelected = selectedMode === mode.id;
          
          return (
            <DropdownMenuItem
              key={mode.id}
              onClick={() => handleSelect(mode.id)}
              className={getItemClassName(isSelected)}
            >
              <span className="text-xs font-medium">{mode.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ChatModeMenu;