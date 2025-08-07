import { useCallback } from 'react';

/**
 * Custom hook that provides a button click animation handler
 * Creates a "squish and bounce" effect when buttons are clicked
 * 
 * @returns A function that wraps any callback with click animation
 */
export const useButtonClickAnimation = () => {
  const handleButtonClick = useCallback((callback: () => void) => {
    return (event: React.MouseEvent<HTMLElement>) => {
      const button = event.currentTarget;
      
      // Add click animation class - more noticeable scale
      button.style.transform = 'scale(0.85)';
      button.style.transition = 'transform 0.15s ease-out';
      
      // Reset after animation with bounce effect
      setTimeout(() => {
        button.style.transform = 'scale(1.05)';
        setTimeout(() => {
          button.style.transform = 'scale(1)';
          setTimeout(() => {
            button.style.transform = '';
            button.style.transition = '';
          }, 100);
        }, 100);
      }, 100);
      
      // Execute the original callback
      callback();
    };
  }, []);

  return { handleButtonClick };
};