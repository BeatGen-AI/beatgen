import { useState, useCallback } from 'react';
import { Tool } from './types';

export type { Tool };

export interface ToolState {
  selectedTool: Tool;
  setTool: (tool: Tool) => void;
}

export interface UseToolOptions {
  initialTool?: Tool;
  onToolChange?: (tool: Tool) => void;
}

export function useTool({ initialTool = 'select', onToolChange }: UseToolOptions = {}): ToolState {
  const [selectedTool, setSelectedTool] = useState<Tool>(initialTool);

  const setTool = useCallback((tool: Tool) => {
    setSelectedTool(tool);
    onToolChange?.(tool);
  }, [onToolChange]);

  return {
    selectedTool,
    setTool
  };
}