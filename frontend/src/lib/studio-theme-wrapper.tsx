import React from 'react';
import { useTheme } from './theme-provider';

interface StudioThemeWrapperProps {
  children: React.ReactNode;
}

export function StudioThemeWrapper({ children }: StudioThemeWrapperProps) {
  const { studioTheme } = useTheme();

  // Resolve system theme if needed
  const resolvedStudioTheme = studioTheme === 'system' 
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : studioTheme;

  return (
    <div 
      className="studio-theme-wrapper min-h-screen"
      data-studio-theme={resolvedStudioTheme}
    >
      {children}
    </div>
  );
}