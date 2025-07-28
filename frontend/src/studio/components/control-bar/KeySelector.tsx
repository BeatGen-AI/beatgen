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
    onKeyChange(`${key} ${mode}`);
    setOpen(false);
  };

  const handleModeChange = (newMode: 'major' | 'minor') => {
    setMode(newMode);
    // Update current key if needed
    if (selectedKey.includes('minor') && newMode === 'major') {
      onKeyChange(selectedKey.replace('minor', 'major'));
    } else if (selectedKey.includes('major') && newMode === 'minor') {
      onKeyChange(selectedKey.replace('major', 'minor'));
    }
  };

  return (
    <div className="w-[132px]">
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            className="w-full px-2 rounded text-left transition-colors"
            style={{
              backgroundColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
              border: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
              color: studioMode === 'dark' ? '#ffffff' : '#000000',
              height: '24px',
              lineHeight: '22px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = studioMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';
            }}
          >
            {selectedKey}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-auto p-2">
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
                className={cn(
                  "flex-1 rounded-r-none border-0 px-2",
                  mode === 'major'
                    ? studioMode === 'dark'
                      ? "bg-white/12 text-foreground hover:bg-white/12"
                      : "bg-black/8 text-foreground hover:bg-black/8"
                    : "text-muted-foreground hover:bg-accent/50"
                )}
              >
                Major
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleModeChange('minor')}
                className={cn(
                  "flex-1 rounded-l-none border-0 px-2",
                  mode === 'minor'
                    ? studioMode === 'dark'
                      ? "bg-white/12 text-foreground hover:bg-white/12"
                      : "bg-black/8 text-foreground hover:bg-black/8"
                    : "text-muted-foreground hover:bg-accent/50"
                )}
              >
                Minor
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {/* Diatonic Keys */}
            {DIATONIC_KEY_LIST.map((key) => {
              const isSelected = selectedKey === `${key} ${mode}`;
              return (
                <Button
                  key={key}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleKeySelect(key)}
                  className={cn(
                    "p-2 text-sm",
                    isSelected
                      ? studioMode === 'dark'
                        ? "bg-white/12 text-foreground hover:bg-white/12"
                        : "bg-black/8 text-foreground hover:bg-black/8"
                      : studioMode === 'dark'
                        ? "text-white/70 hover:bg-white/8"
                        : "text-black/60 hover:bg-black/4"
                  )}
                >
                  {key}
                </Button>
              );
            })}
            {/* Accidental Keys */}
            {ACCIDENTAL_KEY_LIST.map((key) => {
              const isSelected = selectedKey === `${key} ${mode}`;
              return (
                <Button
                  key={key}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleKeySelect(key)}
                  className={cn(
                    "p-2 text-sm",
                    isSelected
                      ? studioMode === 'dark'
                        ? "bg-white/12 text-foreground hover:bg-white/12"
                        : "bg-black/8 text-foreground hover:bg-black/8"
                      : studioMode === 'dark'
                        ? "text-white/70 hover:bg-white/8"
                        : "text-black/60 hover:bg-black/4"
                  )}
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