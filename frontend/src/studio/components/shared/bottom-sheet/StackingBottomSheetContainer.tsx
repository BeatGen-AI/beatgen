import React, { useState, ReactElement, cloneElement, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface StackingBottomSheetItem {
  id: string;
  isOpen: boolean;
  component: ReactElement;
  onClose: () => void;
}

export interface StackingBottomSheetContainerProps {
  sheets: StackingBottomSheetItem[];
  containerHeight?: string;
  isAIAssistantOpen?: boolean;
  aiAssistantWidth?: number;
  className?: string;
}

export const StackingBottomSheetContainer: React.FC<StackingBottomSheetContainerProps> = ({
  sheets,
  containerHeight = '40vh',
  isAIAssistantOpen = false,
  aiAssistantWidth = 350,
  className
}) => {
  // Track which bottom sheet is currently expanded (only one can be expanded at a time)
  const [expandedSheetId, setExpandedSheetId] = useState<string | null>(null);
  // Track the opening order to maintain consistent visual stacking
  const [sheetOrder, setSheetOrder] = useState<string[]>([]);

  // Get currently open sheets
  const openSheets = sheets.filter(sheet => sheet.isOpen);

  // Update order when sheets open/close
  useEffect(() => {
    const currentOpenIds = openSheets.map(sheet => sheet.id);
    
    setSheetOrder(prevOrder => {
      // Remove closed sheets from order
      const filteredOrder = prevOrder.filter(id => currentOpenIds.includes(id));
      
      // Add newly opened sheets to the end
      const newIds = currentOpenIds.filter(id => !filteredOrder.includes(id));
      const updatedOrder = [...filteredOrder, ...newIds];
      
      // Set the most recently opened sheet as expanded
      if (newIds.length > 0) {
        setExpandedSheetId(newIds[newIds.length - 1]);
      } else if (updatedOrder.length === 0) {
        setExpandedSheetId(null);
      }
      
      return updatedOrder;
    });
  }, [openSheets.map(s => s.id).join(',')]);

  // Handle sheet minimize/expand toggle
  const handleToggleMinimize = (sheetId: string) => {
    setExpandedSheetId(expandedSheetId === sheetId ? null : sheetId);
  };

  // Handle sheet close
  const handleSheetClose = (sheetId: string, originalOnClose: () => void) => {
    setExpandedSheetId(null);
    setSheetOrder(prev => prev.filter(id => id !== sheetId));
    originalOnClose();
  };

  // Don't render container if no sheets are open
  if (openSheets.length === 0) return null;

  // Sort sheets by their order (first in order renders first = bottom)
  const sortedSheets = openSheets.sort((a, b) => {
    const aIndex = sheetOrder.indexOf(a.id);
    const bIndex = sheetOrder.indexOf(b.id);
    return aIndex - bIndex;
  });

  return (
    <div 
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 flex flex-col-reverse",
        className
      )}
      style={{ 
        height: containerHeight,
        marginRight: isAIAssistantOpen ? `${aiAssistantWidth}px` : '0'
      }}
    >
      {sortedSheets.map((sheet) => {
        const isMinimized = expandedSheetId !== sheet.id && openSheets.length > 1;
        const isOtherSheetOpen = openSheets.length > 1;

        // Clone the component and inject the necessary props
        const enhancedComponent = cloneElement(sheet.component, {
          isOpen: sheet.isOpen,
          isMinimized,
          isOtherBottomSheetOpen: isOtherSheetOpen,
          onToggleMinimize: () => handleToggleMinimize(sheet.id),
          onClose: () => handleSheetClose(sheet.id, sheet.onClose),
          // Preserve any existing props from the original component
            ...sheet.component.props
        });

        return (
          <div key={sheet.id}>
            {enhancedComponent}
          </div>
        );
      })}
    </div>
  );
};

export default StackingBottomSheetContainer;
