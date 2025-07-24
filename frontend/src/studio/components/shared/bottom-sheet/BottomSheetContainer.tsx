import React from 'react';
import { cn } from '@/lib/utils';

export interface PanelState {
  id: string;
  isExpanded: boolean;
  position: 'left' | 'right' | 'full';
  width?: number; // For custom widths
}

export interface BottomSheetContainerProps {
  panels: PanelState[];
  isAIAssistantOpen: boolean;
  aiAssistantWidth?: number;
  children: React.ReactNode;
  className?: string;
}

export const BottomSheetContainer: React.FC<BottomSheetContainerProps> = ({
  panels,
  isAIAssistantOpen,
  aiAssistantWidth = 350,
  children,
  className
}) => {
  // Calculate if any panel is expanded
  const hasExpandedPanel = panels.some(panel => panel.isExpanded);
  
  // Calculate container height based on panel states
  const containerHeight = hasExpandedPanel ? '50vh' : '0';
  
  return (
    <div 
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 transition-all duration-300 ease-in-out",
        className
      )}
      style={{
        height: containerHeight,
        marginRight: isAIAssistantOpen ? `${aiAssistantWidth}px` : '0',
      }}
    >
      <div className="relative h-full flex">
        {children}
      </div>
    </div>
  );
};

export default BottomSheetContainer;