import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { IconDeviceImac } from '@tabler/icons-react';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';
import { useAppTheme } from '../../lib/theme-provider';

interface ThemeSwitcherProps {
  value: 'light' | 'dark' | 'system';
  onValueChange: (value: 'light' | 'dark' | 'system') => void;
  className?: string;
  useStudioTheme?: boolean; // If true, uses studioMode for styling; if false, uses homepage mode
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  value,
  onValueChange,
  className = '',
  useStudioTheme = true
}) => {
  const { mode, studioMode } = useAppTheme();
  const currentMode = useStudioTheme ? studioMode : mode;

  return (
    <ToggleGroup 
      type="single" 
      value={value} 
      onValueChange={(newValue) => newValue && onValueChange(newValue as any)}
      className={`bg-transparent ${className}`}
      style={{
        backgroundColor: currentMode === 'dark' ? '#2a2a2a' : '#f8fafc',
        borderColor: currentMode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
      }}
    >
      <ToggleGroupItem 
        value="light" 
        aria-label="Light theme"
        style={{
          color: currentMode === 'dark' ? '#ffffff' : '#000000',
          backgroundColor: value === 'light' 
            ? (currentMode === 'dark' ? '#3a3a3a' : '#e2e8f0')
            : 'transparent'
        }}
      >
        <Sun className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem 
        value="dark" 
        aria-label="Dark theme"
        style={{
          color: currentMode === 'dark' ? '#ffffff' : '#000000',
          backgroundColor: value === 'dark' 
            ? (currentMode === 'dark' ? '#3a3a3a' : '#e2e8f0')
            : 'transparent'
        }}
      >
        <Moon className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem 
        value="system" 
        aria-label="System theme"
        style={{
          color: currentMode === 'dark' ? '#ffffff' : '#000000',
          backgroundColor: value === 'system' 
            ? (currentMode === 'dark' ? '#3a3a3a' : '#e2e8f0')
            : 'transparent'
        }}
      >
        <IconDeviceImac className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
};