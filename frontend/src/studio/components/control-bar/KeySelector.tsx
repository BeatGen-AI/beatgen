import React, { useState } from 'react';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { useAppTheme } from '../../../lib/theme-provider';
import { cn } from '../../../lib/utils';

interface KeySelectorProps {
  selectedKey: string;
  onKeyChange: (newKey: string) => void;
}

const DIATONIC_KEY_LIST = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const ACCIDENTAL_KEY_LIST = ['C♯/D♭', 'D♯/E♭', 'F♯/G♭', 'G♯/A♭', 'A♯/B♭'];

const KeySelector: React.FC<KeySelectorProps> = ({ selectedKey = 'C major', onKeyChange }) => {
  const { studioMode } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'major' | 'minor'>(
    selectedKey.toLowerCase().includes('minor') ? 'minor' : 'major'
  );

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
  };

  const handleKeySelect = (key: string) => {
    const capitalizedMode = mode === 'major' ? 'Major' : 'Minor';
    onKeyChange(`${key} ${capitalizedMode}`);
    setOpen(false);
  };

  const handleModeChange = (newMode: 'major' | 'minor') => {
    setMode(newMode);
    // Update current key if needed
    if (selectedKey.toLowerCase().includes('minor') && newMode === 'major') {
      onKeyChange(selectedKey.replace(/minor/i, 'Major'));
    } else if (selectedKey.toLowerCase().includes('major') && newMode === 'minor') {
      onKeyChange(selectedKey.replace(/major/i, 'Minor'));
    }
  };

  return (
    <div className="flex items-center">
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            className="px-2 rounded text-center transition-colors cursor-pointer outline-none"
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: studioMode === 'dark' ? '#ffffff' : '#000000',
              height: '24px',
              lineHeight: '24px',
              fontSize: '14px',
              minWidth: '80px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {selectedKey.replace('major', 'Major').replace('minor', 'Minor')}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent 
          className="w-auto p-2"
          style={{
            backgroundColor: studioMode === 'dark' ? '#1a1a1a' : '#ffffff',
            border: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'}`,
            color: studioMode === 'dark' ? '#ffffff' : '#000000'
          }}
        >
          <div className="mb-2">
            <div
              className={cn(
                "flex rounded border",
                studioMode === 'dark'
                  ? "bg-black/20 border-white/12"
                  : "bg-black/5 border-black/12"
              )}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleModeChange('major')}
                className="flex-1 rounded-r-none border-0 px-2"
                style={{
                  backgroundColor: mode === 'major' 
                    ? (studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                    : 'transparent',
                  color: mode === 'major' 
                    ? (studioMode === 'dark' ? '#ffffff' : '#000000')
                    : (studioMode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)')
                }}
                onMouseEnter={(e) => {
                  if (mode !== 'major') {
                    e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (mode !== 'major') {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                Major
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleModeChange('minor')}
                className="flex-1 rounded-l-none border-0 px-2"
                style={{
                  backgroundColor: mode === 'minor' 
                    ? (studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                    : 'transparent',
                  color: mode === 'minor' 
                    ? (studioMode === 'dark' ? '#ffffff' : '#000000')
                    : (studioMode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)')
                }}
                onMouseEnter={(e) => {
                  if (mode !== 'minor') {
                    e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (mode !== 'minor') {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                Minor
              </Button>
            </div>
          </div>
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
                  className="p-2 text-sm"
                  style={{
                    backgroundColor: isSelected 
                      ? (studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                      : 'transparent',
                    color: isSelected 
                      ? (studioMode === 'dark' ? '#ffffff' : '#000000')
                      : (studioMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)')
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
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
                  className="p-2 text-sm"
                  style={{
                    backgroundColor: isSelected 
                      ? (studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                      : 'transparent',
                    color: isSelected 
                      ? (studioMode === 'dark' ? '#ffffff' : '#000000')
                      : (studioMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)')
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  {key}
                </Button>
              );
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default KeySelector;