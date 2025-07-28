// import React, { createContext, useState, useMemo, useContext, ReactNode, useEffect } from 'react';

// interface ThemeContextType {
//   mode: 'light' | 'dark';
//   studioMode: 'light' | 'dark';
//   toggleUITheme: () => void;
//   toggleStudioTheme: () => void;
// }

// const ThemeContext = createContext<ThemeContextType | null>(null);

// export const AppThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
//   const [uiMode, setUIMode] = useState<'light' | 'dark'>('light'); 
//   const [studioMode, setStudioMode] = useState<'light' | 'dark'>('light'); 

//   // Initial theme setup on mount
//   useEffect(() => {
//     const root = window.document.documentElement;
//     const isStudioPage = window.location.pathname === '/studio' || 
//                          window.location.pathname.startsWith('/studio/');
    
//     const initialMode = isStudioPage ? studioMode : uiMode;
    
//     if (initialMode === 'dark') {
//       root.classList.add('dark');
//     } else {
//       root.classList.remove('dark');
//     }
//   }, []); // Only run on mount

//   // Effect for studio mode changes - only runs when studioMode changes
//   useEffect(() => {
//     const root = window.document.documentElement;
//     const isStudioPage = window.location.pathname === '/studio' || 
//                          window.location.pathname.startsWith('/studio/');
    
//     console.log('studioMode effect running:', { studioMode, isStudioPage, pathname: window.location.pathname });
    
//     // Only apply studioMode changes if we're on a studio page
//     if (isStudioPage) {
//       if (studioMode === 'dark') {
//         root.classList.add('dark');
//       } else {
//         root.classList.remove('dark');
//       }
//     } else {
//       console.log('Skipping studioMode change because we are not on a studio page');
//     }
//   }, [studioMode]);

//   // Effect for UI mode changes - only runs when uiMode changes
//   useEffect(() => {
//     const root = window.document.documentElement;
//     const isStudioPage = window.location.pathname === '/studio' || 
//                          window.location.pathname.startsWith('/studio/');
    
//     console.log('uiMode effect running:', { uiMode, isStudioPage, pathname: window.location.pathname });
    
//     // Only apply uiMode changes if we're NOT on a studio page
//     if (!isStudioPage) {
//       if (uiMode === 'dark') {
//         root.classList.add('dark');
//       } else {
//         root.classList.remove('dark');
//       }
//     } else {
//       console.log('Skipping uiMode change because we are on a studio page');
//     }
//   }, [uiMode]);

//   // Listen for route changes to update theme accordingly
//   useEffect(() => {
//     const handleRouteChange = () => {
//       const root = window.document.documentElement;
//       const isStudioPage = window.location.pathname === '/studio' || 
//                            window.location.pathname.startsWith('/studio/');
      
//       // Apply the correct theme for the new route
//       if (isStudioPage) {
//         // Switching TO studio page - apply studioMode
//         if (studioMode === 'dark') {
//           root.classList.add('dark');
//         } else {
//           root.classList.remove('dark');
//         }
//       } else {
//         // Switching TO non-studio page - apply uiMode
//         if (uiMode === 'dark') {
//           root.classList.add('dark');
//         } else {
//           root.classList.remove('dark');
//         }
//       }
//     };

//     // Listen for popstate events (back/forward navigation)
//     window.addEventListener('popstate', handleRouteChange);
    
//     return () => {
//       window.removeEventListener('popstate', handleRouteChange);
//     };
//   }, [uiMode, studioMode]);

//   const toggleUITheme = () => {
//     setUIMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
//   };
  
//   const toggleStudioTheme = () => {
//     setStudioMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
//   };

//   const contextValue = useMemo(() => ({ 
//     mode: uiMode, 
//     studioMode: studioMode, 
//     toggleUITheme, 
//     toggleStudioTheme 
//   }), [uiMode, studioMode]);

//   return (
//     <ThemeContext.Provider value={contextValue}>
//       {children}
//     </ThemeContext.Provider>
//   );
// };

// export const useAppTheme = () => {
//   const context = useContext(ThemeContext);
//   if (!context) {
//     throw new Error('useAppTheme must be used within an AppThemeProvider');
//   }
//   return context;
// };