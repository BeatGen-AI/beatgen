import React, { createContext, useState, useMemo, useContext, ReactNode, useEffect } from 'react';

// Define the shape of the context
interface ThemeContextType {
  mode: 'light' | 'dark';
  studioMode: 'light' | 'dark';
  toggleUITheme: () => void;
  toggleStudioTheme: () => void;
}

// Create the context with a default value (or null and check)
const ThemeContext = createContext<ThemeContextType | null>(null);

// Custom theme type definition that matches MUI theme structure
interface CustomTheme {
  palette: {
    mode: 'light' | 'dark';
    background: {
      default: string;
      paper: string;
    };
    text: {
      primary: string;
      secondary: string;
      disabled: string;
    };
    divider: string;
    action: {
      hover: string;
      selected: string;
      disabled: string;
      disabledBackground: string;
      focus: string;
    };
    primary: {
      light: string;
      main: string;
      dark: string;
      contrastText: string;
    };
    secondary: {
      light: string;
      main: string;
      dark: string;
      contrastText: string;
    };
    error: {
      light: string;
      main: string;
      dark: string;
      contrastText: string;
    };
    warning: {
      light: string;
      main: string;
      dark: string;
      contrastText: string;
    };
    info: {
      light: string;
      main: string;
      dark: string;
      contrastText: string;
    };
    success: {
      light: string;
      main: string;
      dark: string;
      contrastText: string;
    };
  };
  typography: {
    fontFamily: string;
    pxToRem: (px: number) => string;
  };
  shadows: string[];
  spacing: {
    (...args: Array<number | string>): string;
  };
  breakpoints: {
    values: {
      xs: number;
      sm: number;
      md: number;
      lg: number;
      xl: number;
    };
    up: (key: string | number) => string;
    down: (key: string | number) => string;
    between: (start: string | number, end: string | number) => string;
    only: (key: string) => string;
  };
  shape: {
    borderRadius: number;
  };
  transitions: {
    easing: {
      easeInOut: string;
      easeOut: string;
      easeIn: string;
      sharp: string;
    };
    duration: {
      shortest: number;
      shorter: number;
      short: number;
      standard: number;
      complex: number;
      enteringScreen: number;
      leavingScreen: number;
    };
    create: (props?: string | string[], options?: {
      duration?: number | string;
      easing?: string;
      delay?: number | string;
    }) => string;
  };
  zIndex: {
    mobileStepper: number;
    speedDial: number;
    appBar: number;
    drawer: number;
    modal: number;
    snackbar: number;
    tooltip: number;
  };
  mixins: {
    toolbar: {
      minHeight: number;
      '@media (min-width:0px) and (orientation: landscape)': {
        minHeight: number;
      };
      '@media (min-width:600px)': {
        minHeight: number;
      };
    };
  };
}

// Helper functions for breakpoints
const createBreakpoints = () => {
  const values = {
    xs: 0,
    sm: 600,
    md: 900,
    lg: 1200,
    xl: 1536,
  };
  
  return {
    values,
    up: (key: string | number) => `@media (min-width:${typeof key === 'number' ? key : values[key as keyof typeof values]}px)`,
    down: (key: string | number) => `@media (max-width:${typeof key === 'number' ? key - 0.05 : values[key as keyof typeof values] - 0.05}px)`,
    between: (start: string | number, end: string | number) => {
      const startValue = typeof start === 'number' ? start : values[start as keyof typeof values];
      const endValue = typeof end === 'number' ? end : values[end as keyof typeof values];
      return `@media (min-width:${startValue}px) and (max-width:${endValue - 0.05}px)`;
    },
    only: (key: string) => {
      const keyValue = values[key as keyof typeof values];
      const keys = Object.keys(values);
      const keyIndex = keys.indexOf(key);
      const nextKey = keys[keyIndex + 1];
      if (nextKey) {
        const nextValue = values[nextKey as keyof typeof values];
        return `@media (min-width:${keyValue}px) and (max-width:${nextValue - 0.05}px)`;
      }
      return `@media (min-width:${keyValue}px)`;
    },
  };
};

const createSpacing = () => (...args: Array<number | string>): string => {
  const baseUnit = 8; // 8px base unit like MUI
  if (args.length === 0) return '0px';
  return args.map(arg => {
    if (typeof arg === 'string') return arg;
    return `${arg * baseUnit}px`;
  }).join(' ');
};

const createTransitions = () => {
  const easing = {
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
  };

  const duration = {
    shortest: 150,
    shorter: 200,
    short: 250,
    standard: 300,
    complex: 375,
    enteringScreen: 225,
    leavingScreen: 195,
  };

  const create = (props?: string | string[], options?: {
    duration?: number | string;
    easing?: string;
    delay?: number | string;
  }) => {
    const normalizedProps = Array.isArray(props) ? props : props ? [props] : ['all'];
    const normalizedDuration = typeof options?.duration === 'string' ? options.duration : `${options?.duration || duration.standard}ms`;
    const normalizedEasing = options?.easing || easing.easeInOut;
    const normalizedDelay = typeof options?.delay === 'string' ? options.delay : options?.delay ? `${options.delay}ms` : '0ms';

    return normalizedProps.map(prop => 
      `${prop} ${normalizedDuration} ${normalizedEasing} ${normalizedDelay}`
    ).join(', ');
  };

  return {
    easing,
    duration,
    create,
  };
};

// Define light and dark themes with custom objects
const lightTheme: CustomTheme = {
  palette: {
    mode: 'light',
    background: {
      default: '#ffffff',
      paper: '#f5f5f5',
    },
    text: {
      primary: '#000000',
      secondary: '#666666',
      disabled: '#9e9e9e',
    },
    divider: '#e0e0e0',
    action: {
      hover: 'rgba(0, 0, 0, 0.04)',
      selected: 'rgba(0, 0, 0, 0.08)',
      disabled: 'rgba(0, 0, 0, 0.26)',
      disabledBackground: 'rgba(0, 0, 0, 0.12)',
      focus: 'rgba(0, 0, 0, 0.12)',
    },
    primary: {
      light: '#64b5f6',
      main: '#2196f3',
      dark: '#1976d2',
      contrastText: '#ffffff',
    },
    secondary: {
      light: '#ba68c8',
      main: '#9c27b0',
      dark: '#7b1fa2',
      contrastText: '#ffffff',
    },
    error: {
      light: '#ef5350',
      main: '#f44336',
      dark: '#d32f2f',
      contrastText: '#ffffff',
    },
    warning: {
      light: '#ffb74d',
      main: '#ff9800',
      dark: '#f57c00',
      contrastText: '#000000',
    },
    info: {
      light: '#4fc3f7',
      main: '#29b6f6',
      dark: '#0288d1',
      contrastText: '#ffffff',
    },
    success: {
      light: '#81c784',
      main: '#66bb6a',
      dark: '#388e3c',
      contrastText: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Sen", sans-serif',
    pxToRem: (px: number) => `${px / 16}rem`,
  },
  shadows: [
    'none',
    '0px 2px 1px -1px rgba(0,0,0,0.2),0px 1px 1px 0px rgba(0,0,0,0.14),0px 1px 3px 0px rgba(0,0,0,0.12)',
    '0px 3px 1px -2px rgba(0,0,0,0.2),0px 2px 2px 0px rgba(0,0,0,0.14),0px 1px 5px 0px rgba(0,0,0,0.12)',
    '0px 3px 3px -2px rgba(0,0,0,0.2),0px 3px 4px 0px rgba(0,0,0,0.14),0px 1px 8px 0px rgba(0,0,0,0.12)',
    '0px 2px 4px -1px rgba(0,0,0,0.2),0px 4px 5px 0px rgba(0,0,0,0.14),0px 1px 10px 0px rgba(0,0,0,0.12)',
  ],
  spacing: createSpacing(),
  breakpoints: createBreakpoints(),
  shape: {
    borderRadius: 4,
  },
  transitions: createTransitions(),
  zIndex: {
    mobileStepper: 1000,
    speedDial: 1050,
    appBar: 1100,
    drawer: 1200,
    modal: 1300,
    snackbar: 1400,
    tooltip: 1500,
  },
  mixins: {
    toolbar: {
      minHeight: 56,
      '@media (min-width:0px) and (orientation: landscape)': {
        minHeight: 48,
      },
      '@media (min-width:600px)': {
        minHeight: 64,
      },
    },
  },
};

const darkTheme: CustomTheme = {
  palette: {
    mode: 'dark',
    background: {
      default: '#000000',
      paper: '#1a1a1a',
    },
    text: {
      primary: '#ffffff',
      secondary: '#b3b3b3',
      disabled: '#666666',
    },
    divider: '#333333',
    action: {
      hover: 'rgba(255, 255, 255, 0.08)',
      selected: 'rgba(255, 255, 255, 0.12)',
      disabled: 'rgba(255, 255, 255, 0.3)',
      disabledBackground: 'rgba(255, 255, 255, 0.12)',
      focus: 'rgba(255, 255, 255, 0.12)',
    },
    primary: {
      light: '#64b5f6',
      main: '#2196f3',
      dark: '#1976d2',
      contrastText: '#ffffff',
    },
    secondary: {
      light: '#ba68c8',
      main: '#9c27b0',
      dark: '#7b1fa2',
      contrastText: '#ffffff',
    },
    error: {
      light: '#ef5350',
      main: '#f44336',
      dark: '#d32f2f',
      contrastText: '#ffffff',
    },
    warning: {
      light: '#ffb74d',
      main: '#ff9800',
      dark: '#f57c00',
      contrastText: '#000000',
    },
    info: {
      light: '#4fc3f7',
      main: '#29b6f6',
      dark: '#0288d1',
      contrastText: '#ffffff',
    },
    success: {
      light: '#81c784',
      main: '#66bb6a',
      dark: '#388e3c',
      contrastText: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Sen", sans-serif',
    pxToRem: (px: number) => `${px / 16}rem`,
  },
  shadows: [
    'none',
    '0px 2px 1px -1px rgba(0,0,0,0.2),0px 1px 1px 0px rgba(0,0,0,0.14),0px 1px 3px 0px rgba(0,0,0,0.12)',
    '0px 3px 1px -2px rgba(0,0,0,0.2),0px 2px 2px 0px rgba(0,0,0,0.14),0px 1px 5px 0px rgba(0,0,0,0.12)',
    '0px 3px 3px -2px rgba(0,0,0,0.2),0px 3px 4px 0px rgba(0,0,0,0.14),0px 1px 8px 0px rgba(0,0,0,0.12)',
    '0px 2px 4px -1px rgba(0,0,0,0.2),0px 4px 5px 0px rgba(0,0,0,0.14),0px 1px 10px 0px rgba(0,0,0,0.12)',
  ],
  spacing: createSpacing(),
  breakpoints: createBreakpoints(),
  shape: {
    borderRadius: 4,
  },
  transitions: createTransitions(),
  zIndex: {
    mobileStepper: 1000,
    speedDial: 1050,
    appBar: 1100,
    drawer: 1200,
    modal: 1300,
    snackbar: 1400,
    tooltip: 1500,
  },
  mixins: {
    toolbar: {
      minHeight: 56,
      '@media (min-width:0px) and (orientation: landscape)': {
        minHeight: 48,
      },
      '@media (min-width:600px)': {
        minHeight: 64,
      },
    },
  },
};

// Studio-specific themes (can be customized independently later)
// For now, they mirror the global themes
export const studioLightTheme: CustomTheme = {
  ...lightTheme,
};

export const studioDarkTheme: CustomTheme = {
  ...darkTheme,
};

// Create the provider component
export const AppThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Default to dark mode, or read from localStorage/preference
  const [uiMode, setUIMode] = useState<'light' | 'dark'>('light'); 
  const [studioMode, setStudioMode] = useState<'light' | 'dark'>('dark'); 

  useEffect(() => {
    const root = window.document.documentElement;
    if (uiMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [uiMode]);

  const toggleUITheme = () => {
    setUIMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  };
  const toggleStudioTheme = () => {
    setStudioMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  };

  // Select the theme object based on the current mode
  const theme = useMemo(() => (uiMode === 'light' ? lightTheme : darkTheme), [uiMode]);

  // Provide the context value
  const contextValue = useMemo(() => ({ mode: uiMode, studioMode: studioMode, toggleUITheme, toggleStudioTheme }), [uiMode, studioMode]);

  return (
    <ThemeContext.Provider value={contextValue}>
      <ThemeObjectContext.Provider value={theme}>
        {/* Apply global styles based on theme */}
        <GlobalStyles theme={theme} />
        {children}
      </ThemeObjectContext.Provider>
    </ThemeContext.Provider>
  );
};

// Global styles component to replace CssBaseline
const GlobalStyles: React.FC<{ theme: CustomTheme }> = ({ theme }) => {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* CSS Reset similar to CssBaseline */
      *, *::before, *::after {
        box-sizing: border-box;
      }
      
      html {
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      
      body {
        margin: 0;
        font-family: ${theme.typography.fontFamily};
        background-color: ${theme.palette.background.default};
        color: ${theme.palette.text.primary};
      }
      
      /* Custom scrollbar for dark mode */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      
      ::-webkit-scrollbar-track {
        background: ${theme.palette.background.paper};
      }
      
      ::-webkit-scrollbar-thumb {
        background: ${theme.palette.action.hover};
        border-radius: 4px;
      }
      
      ::-webkit-scrollbar-thumb:hover {
        background: ${theme.palette.action.selected};
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, [theme]);
  
  return null;
};

// Theme context that provides the current theme object
const ThemeObjectContext = createContext<CustomTheme | null>(null);

// Custom hook to use the theme context  
export const useAppTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within an AppThemeProvider');
  }
  return context;
};

// Custom hook to use the theme object (replaces MUI's useTheme)
export const useTheme = () => {
  const context = useContext(ThemeObjectContext);
  if (!context) {
    throw new Error('useTheme must be used within an AppThemeProvider');
  }
  return context;
}; 