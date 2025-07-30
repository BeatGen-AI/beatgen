import React, { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '../../../components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../../../components/ui/tooltip';
import { GridSnapOption, getGridSnapOptionName } from '../piano-roll2/gridConstants';
import { Grid3X3 } from 'lucide-react';

interface GridSnapSelectorProps {
  /** Current grid snap option */
  value: GridSnapOption;
  /** Whether grid snapping is enabled */
  enabled?: boolean;
  /** Callback when the snap option changes */
  onValueChange: (option: GridSnapOption) => void;
  /** Callback when snap enabled/disabled state changes */
  onEnabledChange?: () => void;
  /** Visual style variant */
  variant?: 'piano-roll' | 'control-bar';
  /** Theme mode for styling */
  theme?: 'light' | 'dark';
  /** Whether to show the grid icon or use a button */
  showIcon?: boolean;
  /** Size of the icon */
  iconSize?: number;
}

export const GridSnapSelector: React.FC<GridSnapSelectorProps> = ({
  value,
  enabled = true,
  onValueChange,
  onEnabledChange,
  variant = 'control-bar',
  theme = 'dark',
  showIcon = true,
  iconSize = 24,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleValueChange = (newValue: string) => {
    const option = parseInt(newValue) as GridSnapOption;
    onValueChange(option);
    setIsOpen(false);
  };

  const renderTrigger = () => {
    if (variant === 'piano-roll') {
      // Piano roll specific styling with Grid3X3
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              style={{ 
                width: `${iconSize}px`,
                height: `${iconSize}px`,
                opacity: enabled ? 1 : 0.5,
                cursor: "pointer",
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                if (!enabled) e.currentTarget.style.opacity = "0.8";
                e.currentTarget.style.transform = "scale(1.1)";
              }}
              onMouseLeave={(e) => {
                if (!enabled) e.currentTarget.style.opacity = "0.5";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              <Grid3X3 
                size={iconSize}
                style={{ 
                  color: '#ffffff'
                }} 
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Snap to grid</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    // Control bar styling with Lucide icon
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="h-8 w-8 p-0 rounded-lg transition-colors"
            style={{
              color: theme === 'dark' ? '#ffffff' : '#000000',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              if (!enabled) {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (!enabled) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <Grid3X3 
              size={iconSize} 
              style={{ 
                opacity: enabled ? 1 : 0.5,
                color: theme === 'dark' ? '#ffffff' : '#000000'
              }} 
            />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Snap to grid</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  const renderContent = () => {
    if (variant === 'piano-roll') {
      // Piano roll specific styling
      return (
        <DropdownMenuContent 
          className="min-w-[120px] bg-[#222222] border-[#444444] text-white text-xs z-[10001]"
          sideOffset={5}
        >
          <DropdownMenuRadioGroup 
            value={value.toString()} 
            onValueChange={handleValueChange}
          >
            <DropdownMenuRadioItem 
              value="0" 
              className="text-xs focus:bg-[#525252] focus:text-white cursor-pointer"
            >
              None
            </DropdownMenuRadioItem>
            
            <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.1)] my-2 mx-1 relative">
              <span className="absolute right-1 -top-2 text-[8px] bg-[#222222] px-1 text-[rgba(255,255,255,0.5)]">
                STEP
              </span>
            </DropdownMenuSeparator>
            
            <DropdownMenuRadioItem value="1" className="text-xs focus:bg-[#525252] focus:text-white cursor-pointer">
              1/6 step
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="2" className="text-xs focus:bg-[#525252] focus:text-white cursor-pointer">
              1/4 step
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="3" className="text-xs focus:bg-[#525252] focus:text-white cursor-pointer">
              1/3 step
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="4" className="text-xs focus:bg-[#525252] focus:text-white cursor-pointer">
              1/2 step
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="5" className="text-xs focus:bg-[#525252] focus:text-white cursor-pointer">
              Step
            </DropdownMenuRadioItem>
            
            <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.1)] my-2 mx-1 relative">
              <span className="absolute right-1 -top-2 text-[8px] bg-[#222222] px-1 text-[rgba(255,255,255,0.5)]">
                BEAT
              </span>
            </DropdownMenuSeparator>
            
            <DropdownMenuRadioItem value="6" className="text-xs focus:bg-[#525252] focus:text-white cursor-pointer">
              1/6 beat
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="7" className="text-xs focus:bg-[#525252] focus:text-white cursor-pointer">
              1/4 beat
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="8" className="text-xs focus:bg-[#525252] focus:text-white cursor-pointer">
              1/3 beat
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="9" className="text-xs focus:bg-[#525252] focus:text-white cursor-pointer">
              1/2 beat
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="10" className="text-xs focus:bg-[#525252] focus:text-white cursor-pointer">
              Beat
            </DropdownMenuRadioItem>
            
            <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.1)] my-2 mx-1 relative">
              <span className="absolute right-1 -top-2 text-[8px] bg-[#222222] px-1 text-[rgba(255,255,255,0.5)]">
                BAR
              </span>
            </DropdownMenuSeparator>
            
            <DropdownMenuRadioItem value="11" className="text-xs focus:bg-[#525252] focus:text-white cursor-pointer">
              Bar
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      );
    }

    // Control bar styling
    return (
      <DropdownMenuContent 
        align="center" 
        className="w-40"
        style={{
          backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff',
          borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
          color: theme === 'dark' ? '#ffffff' : '#000000'
        }}
      >
        <DropdownMenuRadioGroup 
          value={value.toString()} 
          onValueChange={handleValueChange}
        >
          <DropdownMenuRadioItem value="0" className="cursor-pointer">
            <span>None</span>
          </DropdownMenuRadioItem>
          
          <div className="border-t mx-2 my-1"></div>
          <div 
            className="px-2 py-1 text-xs font-medium"
            style={{ color: theme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)' }}
          >STEP</div>
          
          <DropdownMenuRadioItem value="1" className="cursor-pointer">
            <span>1/6 step</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="2" className="cursor-pointer">
            <span>1/4 step</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="3" className="cursor-pointer">
            <span>1/3 step</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="4" className="cursor-pointer">
            <span>1/2 step</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="5" className="cursor-pointer">
            <span>Step</span>
          </DropdownMenuRadioItem>
          
          <div className="border-t mx-2 my-1"></div>
          <div 
            className="px-2 py-1 text-xs font-medium"
            style={{ color: theme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)' }}
          >BEAT</div>
          
          <DropdownMenuRadioItem value="6" className="cursor-pointer">
            <span>1/6 beat</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="7" className="cursor-pointer">
            <span>1/4 beat</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="8" className="cursor-pointer">
            <span>1/3 beat</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="9" className="cursor-pointer">
            <span>1/2 beat</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="10" className="cursor-pointer">
            <span>Beat</span>
          </DropdownMenuRadioItem>
          
          <div className="border-t mx-2 my-1"></div>
          <div 
            className="px-2 py-1 text-xs font-medium"
            style={{ color: theme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)' }}
          >BAR</div>
          
          <DropdownMenuRadioItem value="11" className="cursor-pointer">
            <span>Bar</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    );
  };

  return (
    <TooltipProvider>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          {renderTrigger()}
        </DropdownMenuTrigger>
        {renderContent()}
      </DropdownMenu>
    </TooltipProvider>
  );
};