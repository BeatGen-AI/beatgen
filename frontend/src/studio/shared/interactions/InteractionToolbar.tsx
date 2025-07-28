import React, { useState } from 'react';
import { 
  Move as SelectIcon,
  Edit as PenIcon,
  Highlighter as HighlighterIcon,
  Eraser as EraserIcon,
  Grid3X3 as GridIcon,
  Grid2X2 as GridOffIcon,
  Check as CheckIcon
} from 'lucide-react';
import { Tool } from './types';
import { GridSnapOption, getGridSnapOptionName, getAllGridSnapOptions } from '../../components/piano-roll2/gridConstants';
import { Button } from '../../../components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '../../../components/ui/dropdown-menu';
import { cn } from '../../../lib/utils';

interface InteractionToolbarProps {
  selectedTool: Tool;
  onToolChange: (tool: Tool) => void;
  snapToGrid: boolean;
  onToggleSnapToGrid: () => void;
  gridSnapSize?: GridSnapOption;
  onGridSnapSizeChange?: (size: GridSnapOption) => void;
  showGridToggle?: boolean;
  disabled?: boolean;
  orientation?: 'horizontal' | 'vertical';
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export const InteractionToolbar: React.FC<InteractionToolbarProps> = ({
  selectedTool,
  onToolChange,
  snapToGrid,
  onToggleSnapToGrid,
  gridSnapSize = GridSnapOption.STEP,
  onGridSnapSizeChange,
  showGridToggle = true,
  disabled = false,
  orientation = 'horizontal',
  size = 'medium',
  className = ''
}) => {
  const iconSize = size === 'small' ? 'w-4 h-4' : size === 'large' ? 'w-7 h-7' : 'w-6 h-6';
  const buttonSize = size === 'small' ? 'sm' : size === 'large' ? 'lg' : 'default';

  const handleGridSnapSizeChange = (option: GridSnapOption) => {
    onGridSnapSizeChange?.(option);
  };

  const tools = [
    { value: 'select' as Tool, icon: SelectIcon, label: 'Select Tool', description: 'Select and move items' },
    { value: 'pen' as Tool, icon: PenIcon, label: 'Pen Tool', description: 'Create new items' },
    { value: 'highlighter' as Tool, icon: HighlighterIcon, label: 'Highlighter Tool', description: 'Paint to create items' },
    { value: 'eraser' as Tool, icon: EraserIcon, label: 'Eraser Tool', description: 'Delete items' }
  ];

  return (
    <TooltipProvider>
      <div 
        className={cn(
          `interaction-toolbar flex items-center gap-1 p-2 bg-background border border-border rounded`,
          orientation === 'vertical' ? 'flex-col' : 'flex-row',
          className
        )}
      >
        {/* Tool Selection */}
        <div className={cn(
          "flex gap-0.5",
          orientation === 'vertical' ? 'flex-col' : 'flex-row'
        )}>
          {tools.map(tool => {
            const IconComponent = tool.icon;
            return (
              <Tooltip key={tool.value}>
                <TooltipTrigger asChild>
                  <Button
                    variant={selectedTool === tool.value ? "default" : "ghost"}
                    size={buttonSize}
                    disabled={disabled}
                    onClick={() => onToolChange(tool.value)}
                    aria-label={tool.label}
                    className={cn(
                      "border border-border",
                      selectedTool === tool.value && "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    <IconComponent className={iconSize} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {tool.description}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Grid Snap Menu */}
        {showGridToggle && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size={buttonSize}
                    disabled={disabled}
                    className={cn(
                      snapToGrid ? "text-primary" : "text-muted-foreground",
                      "hover:bg-accent"
                    )}
                  >
                    {snapToGrid ? 
                      <GridIcon className={iconSize} /> : 
                      <GridOffIcon className={`${iconSize} opacity-50`} />
                    }
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Grid snap: {getGridSnapOptionName(gridSnapSize)}
              </TooltipContent>
            </Tooltip>
            
            <DropdownMenuContent align="center" className="min-w-[150px] max-h-[400px]">
              {/* None option */}
              <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.NONE)}>
                <div className="flex items-center justify-between w-full">
                  <span>None</span>
                  {gridSnapSize === GridSnapOption.NONE && <CheckIcon className="w-4 h-4" />}
                </div>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              {/* Step section */}
              <div className="px-2 py-1.5">
                <div className="text-xs text-muted-foreground font-medium">STEP</div>
              </div>
              <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_6)}>
                <div className="flex items-center justify-between w-full">
                  <span>1/6 step</span>
                  {gridSnapSize === GridSnapOption.STEP_1_6 && <CheckIcon className="w-4 h-4" />}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_4)}>
                <div className="flex items-center justify-between w-full">
                  <span>1/4 step</span>
                  {gridSnapSize === GridSnapOption.STEP_1_4 && <CheckIcon className="w-4 h-4" />}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_3)}>
                <div className="flex items-center justify-between w-full">
                  <span>1/3 step</span>
                  {gridSnapSize === GridSnapOption.STEP_1_3 && <CheckIcon className="w-4 h-4" />}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_2)}>
                <div className="flex items-center justify-between w-full">
                  <span>1/2 step</span>
                  {gridSnapSize === GridSnapOption.STEP_1_2 && <CheckIcon className="w-4 h-4" />}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP)}>
                <div className="flex items-center justify-between w-full">
                  <span>Step</span>
                  {gridSnapSize === GridSnapOption.STEP && <CheckIcon className="w-4 h-4" />}
                </div>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              {/* Beat section */}
              <div className="px-2 py-1.5">
                <div className="text-xs text-muted-foreground font-medium">BEAT</div>
              </div>
              <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_6)}>
                <div className="flex items-center justify-between w-full">
                  <span>1/6 beat</span>
                  {gridSnapSize === GridSnapOption.BEAT_1_6 && <CheckIcon className="w-4 h-4" />}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_4)}>
                <div className="flex items-center justify-between w-full">
                  <span>1/4 beat</span>
                  {gridSnapSize === GridSnapOption.BEAT_1_4 && <CheckIcon className="w-4 h-4" />}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_3)}>
                <div className="flex items-center justify-between w-full">
                  <span>1/3 beat</span>
                  {gridSnapSize === GridSnapOption.BEAT_1_3 && <CheckIcon className="w-4 h-4" />}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_2)}>
                <div className="flex items-center justify-between w-full">
                  <span>1/2 beat</span>
                  {gridSnapSize === GridSnapOption.BEAT_1_2 && <CheckIcon className="w-4 h-4" />}
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT)}>
                <div className="flex items-center justify-between w-full">
                  <span>Beat</span>
                  {gridSnapSize === GridSnapOption.BEAT && <CheckIcon className="w-4 h-4" />}
                </div>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              {/* Bar option */}
              <DropdownMenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BAR)}>
                <div className="flex items-center justify-between w-full">
                  <span>Bar</span>
                  {gridSnapSize === GridSnapOption.BAR && <CheckIcon className="w-4 h-4" />}
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </TooltipProvider>
  );
};

export default InteractionToolbar;