import React, { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAppTheme } from '../../../lib/theme-provider';
import AssistantActionChip from './AssistantActionChip';
import ReactMarkdown from 'react-markdown';

// ... (keep keyframes)
// Add keyframes for cursor blink animation
const cursorBlinkKeyframes = `
@keyframes cursor-blink {
  from, to { opacity: 1; }
  50% { opacity: 0; }
}
`;

interface AssistantChatBubbleProps {
  text: string;
  action?: string;
  onActionClick?: () => void;
  isStreaming?: boolean; // Flag indicating if this message is being streamed
}

const AssistantChatBubble: React.FC<AssistantChatBubbleProps> = ({ text, action, onActionClick, isStreaming }) => {
  const { studioMode } = useAppTheme();

  // Determine colors based on studioMode
  // These are no longer bubble-specific, adjust for panel style
  const codeBgColor = studioMode === 'light'
    ? 'rgba(0, 0, 0, 0.05)' // Lighter code background for panel
    : 'rgba(255, 255, 255, 0.08)'; // Slightly adjusted dark mode code bg

  const blockquoteBorderColor = studioMode === 'light'
    ? '#e0e0e0'
    : '#424242';

  const blockquoteTextColor = studioMode === 'light'
    ? '#424242'
    : '#bdbdbd';
  
  const textColor = studioMode === 'dark' ? '#ffffff' : '#000000'; // General text color

  // ... (rest of the component remains the same, using the theme object correctly)
  // For action-only messages, we need a different style
  const isActionOnly = action && onActionClick && !text;
  
  // Add keyframes to the DOM when component mounts
  useEffect(() => {
    if (isStreaming) {
      const styleElement = document.createElement('style');
      styleElement.appendChild(document.createTextNode(cursorBlinkKeyframes));
      document.head.appendChild(styleElement);
      
      return () => {
        // Check if the element is still in the head before removing
        if (styleElement.parentNode === document.head) {
           document.head.removeChild(styleElement);
        }
      };
    }
  }, [isStreaming]);
  
  if (isActionOnly) {
    return (
      <div className="max-w-full p-1">
        <AssistantActionChip 
          action={action} 
          onClick={onActionClick}
        />
      </div>
    );
  }
  
  return (
    <div
      className={cn(
        "max-w-full py-2 break-words relative"
      )}
      style={{
        color: textColor,
        '--code-bg': codeBgColor,
        '--blockquote-border': blockquoteBorderColor,
        '--blockquote-text': blockquoteTextColor,
      } as React.CSSProperties}
    >
      <div 
        className={cn(
          "text-sm prose prose-sm max-w-none",
          "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          "[&_code]:bg-[var(--code-bg)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-[0.9em]",
          "[&_pre]:bg-[var(--code-bg)] [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0",
          "[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_ul]:pl-5 [&_ol]:pl-5",
          "[&_blockquote]:border-l-[3px] [&_blockquote]:border-[var(--blockquote-border)] [&_blockquote]:my-2 [&_blockquote]:pl-3"
        )}
        style={{ color: textColor }}
      >
        <ReactMarkdown>{text}</ReactMarkdown>
        {isStreaming && (
          <span 
            className="inline-block ml-0.5 font-bold animate-pulse"
            style={{ 
              animation: 'cursor-blink 1s step-end infinite',
              color: textColor,
            }}
          >
            |
          </span>
        )}
      </div>
      {action && onActionClick && (
        <div className="mt-2">
          <AssistantActionChip 
            action={action} 
            onClick={onActionClick}
          />
        </div>
      )}
    </div>
  );
};

export default AssistantChatBubble;