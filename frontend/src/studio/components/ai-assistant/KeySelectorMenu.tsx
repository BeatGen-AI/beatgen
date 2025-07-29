import React, { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Music } from 'lucide-react';
import { useAppTheme } from '../../../lib/theme-provider';
import { cn } from '@/lib/utils';

const DIATONIC_KEY_LIST = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ACCIDENTAL_KEY_LIST = ['C♯/D♭', 'D♯/E♭', 'F♯/G♭', 'G♯/A♭', 'A♯/B♭'];

interface KeySelectorMenuProps {
  triggerLabel: string; // Label for the trigger
  onSelect: (key: string) => void;
  selectedKey?: string;
  disabled?: boolean;
  themeMode?: 'light' | 'dark'; // Override theme mode, falls back to studioMode
}

const KeySelectorMenu: React.FC<KeySelectorMenuProps> = ({ 
  triggerLabel, 
  onSelect, 
  selectedKey = 'C Major',
  disabled,
  themeMode
}) => {
  const { studioMode } = useAppTheme();
  const effectiveTheme = themeMode || studioMode;
  const [mode, setMode] = useState<'major' | 'minor'>(
    selectedKey.toLowerCase().includes('minor') ? 'minor' : 'major'
  );

  const handleKeySelect = (key: string) => {
    const capitalizedMode = mode === 'major' ? 'Major' : 'Minor';
    onSelect(`${key} ${capitalizedMode}`);
  };

  const handleModeChange = (newMode: 'major' | 'minor') => {
    setMode(newMode);
    // Update current key if needed
    if (selectedKey.toLowerCase().includes('minor') && newMode === 'major') {
      onSelect(selectedKey.replace(/minor/i, 'Major'));
    } else if (selectedKey.toLowerCase().includes('major') && newMode === 'minor') {
      onSelect(selectedKey.replace(/major/i, 'Minor'));
    }
  };

  const getTextColor = () => {
    return effectiveTheme === 'dark' ? 'text-gray-400' : 'text-gray-600';
  };

  const getDropdownClassName = () => {
    if (effectiveTheme === 'dark') {
      // Match Material-UI menu styling for dark mode
      return "w-auto z-[9999] p-2 bg-[rgb(48,48,48)] border-0 shadow-lg rounded-lg focus:outline-none";
    }
    // Light mode styling
    return "w-auto z-[9999] p-2 bg-white border border-gray-200 shadow-lg rounded-lg focus:outline-none";
  };

  const getKeyButtonClassName = (key: string, isSelected: boolean) => {
    const baseClasses = "p-2 text-sm transition-colors";
    
    if (effectiveTheme === 'dark') {
      const selectedClass = isSelected ? 'bg-[rgba(255,255,255,0.12)] text-white' : 'text-[rgba(255,255,255,0.7)]';
      const hoverClass = isSelected ? '' : 'hover:bg-[rgba(255,255,255,0.08)]';
      return `${baseClasses} ${selectedClass} ${hoverClass}`;
    } else {
      const selectedClass = isSelected ? 'bg-gray-100 text-gray-900' : 'text-gray-600';
      const hoverClass = isSelected ? '' : 'hover:bg-gray-50';
      return `${baseClasses} ${selectedClass} ${hoverClass}`;
    }
  };

  const getModeButtonStyle = (isActive: boolean) => {
    return {
      backgroundColor: isActive 
        ? (effectiveTheme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
        : 'transparent',
      color: isActive 
        ? (effectiveTheme === 'dark' ? '#ffffff' : '#000000')
        : (effectiveTheme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)')
    };
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Badge 
          variant="secondary"
          className={`cursor-pointer h-5 text-xs border-0 ${
            effectiveTheme === 'dark' 
              ? 'bg-[rgba(60,60,60,0.8)] text-white hover:bg-[rgba(60,60,60,0.9)]'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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
        side="top"
        className={getDropdownClassName()}
        sideOffset={4}
      >
        {/* Mode Toggle */}
        <div className="mb-2">
          <div
            className={cn(
              "flex rounded border",
              effectiveTheme === 'dark'
                ? "bg-black/20 border-white/12"
                : "bg-black/5 border-black/12"
            )}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleModeChange('major')}
              className="flex-1 rounded-r-none border-0 px-2 text-xs"
              style={getModeButtonStyle(mode === 'major')}
            >
              Major
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleModeChange('minor')}
              className="flex-1 rounded-l-none border-0 px-2 text-xs"
              style={getModeButtonStyle(mode === 'minor')}
            >
              Minor
            </Button>
          </div>
        </div>

        {/* Key Grid */}
        <div className="grid grid-cols-3 gap-1">
          {/* Diatonic Keys */}
          {DIATONIC_KEY_LIST.map((key) => {
            const capitalizedMode = mode === 'major' ? 'Major' : 'Minor';
            const isSelected = selectedKey === `${key} ${capitalizedMode}` || selectedKey === `${key} ${mode}`;
            
            return (
              <Button
                key={key}
                variant="ghost"
                size="sm"
                onClick={() => handleKeySelect(key)}
                className={getKeyButtonClassName(key, isSelected)}
              >
                {key}
              </Button>
            );
          })}
          {/* Accidental Keys */}
          {ACCIDENTAL_KEY_LIST.map((key) => {
            const capitalizedMode = mode === 'major' ? 'Major' : 'Minor';
            const isSelected = selectedKey === `${key} ${capitalizedMode}` || selectedKey === `${key} ${mode}`;
            
            return (
              <Button
                key={key}
                variant="ghost"
                size="sm"
                onClick={() => handleKeySelect(key)}
                className={getKeyButtonClassName(key, isSelected)}
              >
                {key}
              </Button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default KeySelectorMenu;