import React from 'react';
import { Button } from '@/components/ui/button';
import { X, ChevronUp, ChevronDown, Minimize2, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FlexPosition = 'left' | 'right' | 'full';

export interface BottomSheetPanelProps {
  title: string;
  isExpanded: boolean;
  isMinimized?: boolean;
  onToggleExpand: () => void;
  onToggleMinimize?: () => void;
  onClose: () => void;
  position: FlexPosition;
  width?: string | number;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
}

export const BottomSheetPanel: React.FC<BottomSheetPanelProps> = ({
  title,
  isExpanded,
  isMinimized = false,
  onToggleExpand,
  onToggleMinimize,
  onClose,
  position,
  width,
  children,
  className,
  headerActions
}) => {
  // Calculate panel width based on position
  const getWidth = () => {
    if (width) return typeof width === 'number' ? `${width}px` : width;
    
    switch (position) {
      case 'left':
      case 'right':
        return '50%';
      case 'full':
      default:
        return '100%';
    }
  };

  // Calculate panel positioning
  const getPositionStyles = () => {
    switch (position) {
      case 'left':
        return { left: 0, right: 'auto' };
      case 'right':
        return { left: 'auto', right: 0 };
      case 'full':
      default:
        return { left: 0, right: 0 };
    }
  };

  return (
    <div
      className={cn(
        "absolute top-0 bottom-0 bg-gray-900 border-t border-gray-700 transition-all duration-300 ease-in-out",
        !isExpanded && "translate-y-full",
        isMinimized && "translate-y-[calc(100%-60px)]",
        className
      )}
      style={{
        width: getWidth(),
        ...getPositionStyles(),
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          
          {/* Minimize/Maximize button */}
          {onToggleMinimize && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleMinimize}
              className="text-gray-400 hover:text-white"
            >
              {isMinimized ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Custom header actions */}
          {headerActions}
          
          {/* Expand/Collapse button for multi-panel layouts */}
          {position !== 'full' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleExpand}
              className="text-gray-400 hover:text-white"
            >
              {position === 'left' ? (
                <Maximize2 className="h-4 w-4" />
              ) : (
                <Minimize2 className="h-4 w-4" />
              )}
            </Button>
          )}
          
          {/* Close button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content - Hidden when minimized */}
      {!isMinimized && (
        <div className="h-[calc(100%-73px)] overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
};

export default BottomSheetPanel;