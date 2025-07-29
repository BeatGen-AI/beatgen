// Standardized styling utilities for dropdown menus and components
export interface ThemeMode {
  studioMode: 'dark' | 'light';
}

// Badge styles for menu triggers
export const getBadgeClassName = (studioMode: 'dark' | 'light', disabled = false) => {
  const baseClasses = "cursor-pointer h-5 text-xs border-0";
  const themeClasses = studioMode === 'dark' 
    ? 'bg-[rgba(60,60,60,0.8)] text-white hover:bg-[rgba(60,60,60,0.9)]'
    : 'bg-gray-200 text-gray-800 hover:bg-gray-300';
  const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed' : '';
  
  return `${baseClasses} ${themeClasses} ${disabledClasses}`;
};

// Dropdown menu container styles
export const getDropdownClassName = (studioMode: 'dark' | 'light', width = 'w-52') => {
  const baseClasses = `${width} z-[9999] p-1 shadow-lg rounded-lg focus:outline-none`;
  
  if (studioMode === 'dark') {
    return `${baseClasses} bg-[rgb(48,48,48)] border-0`;
  }
  return `${baseClasses} bg-white border border-gray-200`;
};

// Menu item styles
export const getMenuItemClassName = (
  studioMode: 'dark' | 'light', 
  isSelected = false,
  size: 'sm' | 'md' = 'md'
) => {
  const baseClasses = "flex items-center justify-between cursor-pointer min-h-0 transition-colors rounded";
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-1' : 'text-sm px-3 py-2';
  
  if (studioMode === 'dark') {
    const textColor = 'text-white';
    const selectedClass = isSelected ? 'bg-[rgba(255,255,255,0.1)]' : '';
    const hoverClass = 'hover:bg-[rgba(255,255,255,0.08)]';
    return `${baseClasses} ${sizeClasses} ${textColor} ${selectedClass} ${hoverClass}`;
  } else {
    const textColor = 'text-gray-900';
    const selectedClass = isSelected ? 'bg-gray-100' : '';
    const hoverClass = 'hover:bg-gray-50';
    return `${baseClasses} ${sizeClasses} ${textColor} ${selectedClass} ${hoverClass}`;
  }
};

// Input field styles for forms
export const getInputClassName = (studioMode: 'dark' | 'light') => {
  if (studioMode === 'dark') {
    return "bg-[rgb(60,60,60)] border-[rgb(80,80,80)] text-white placeholder-gray-400 focus:border-blue-400";
  }
  return "bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500";
};

// Button styles
export const getButtonClassName = (
  studioMode: 'dark' | 'light', 
  variant: 'primary' | 'secondary' | 'outline' = 'primary'
) => {
  const baseClasses = "transition-colors";
  
  switch (variant) {
    case 'primary':
      return `${baseClasses} bg-blue-600 hover:bg-blue-700 text-white`;
    case 'outline':
      if (studioMode === 'dark') {
        return `${baseClasses} border-gray-600 text-gray-300 hover:bg-gray-700`;
      }
      return `${baseClasses} border-gray-300 text-gray-700 hover:bg-gray-50`;
    case 'secondary':
    default:
      if (studioMode === 'dark') {
        return `${baseClasses} bg-gray-600 hover:bg-gray-700 text-white`;
      }
      return `${baseClasses} bg-gray-200 hover:bg-gray-300 text-gray-900`;
  }
};

// Text color utilities
export const getTextColor = (studioMode: 'dark' | 'light', variant: 'primary' | 'secondary' | 'muted' = 'primary') => {
  switch (variant) {
    case 'muted':
      return studioMode === 'dark' ? 'text-gray-400' : 'text-gray-600';
    case 'secondary':
      return studioMode === 'dark' ? 'text-gray-300' : 'text-gray-700';
    case 'primary':
    default:
      return studioMode === 'dark' ? 'text-white' : 'text-gray-900';
  }
};