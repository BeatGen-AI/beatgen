import React from 'react';
import { Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Step, StepEvent } from './StepManager';
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from '@/components/ui/accordion';
import { useAppTheme } from '../../../platform/theme/ThemeContext';

interface StepRendererProps {
  steps: Step[];
  onActionClick?: (actionType: string, actionData: any) => void;
}

export const StepRenderer: React.FC<StepRendererProps> = ({ steps, onActionClick }) => {
  return (
    <div className="flex flex-col gap-2">
      {steps.map(step => (
        <StepCard 
          key={step.id} 
          step={step} 
          onActionClick={onActionClick}
        />
      ))}
    </div>
  );
};

interface StepCardProps {
  step: Step;
  onActionClick?: (actionType: string, actionData: any) => void;
}

const StepCard: React.FC<StepCardProps> = ({ step, onActionClick }) => {
  const { studioMode } = useAppTheme();
  const isDark = studioMode === 'dark';

  const getBadgeClass = () => {
    const baseClass = "min-w-[24px] h-5 flex items-center justify-center text-xs rounded-md border font-medium";
    if (isDark) {
      switch (step.status) {
        case 'completed': return `${baseClass} bg-green-900/30 border-green-700 text-green-300`;
        case 'in_progress': return `${baseClass} bg-blue-900/30 border-blue-700 text-blue-300`;
        default: return `${baseClass} bg-gray-800 border-gray-600 text-gray-300`;
      }
    } else {
      switch (step.status) {
        case 'completed': return `${baseClass} bg-green-100 border-green-300 text-green-800`;
        case 'in_progress': return `${baseClass} bg-blue-100 border-blue-300 text-blue-800`;
        default: return `${baseClass} bg-gray-100 border-gray-300 text-gray-700`;
      }
    }
  };

  const getStatusIcon = () => {
    if (step.status === 'in_progress') {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    return null;
  };

  const getBackgroundClass = () => {
    if (isDark) {
      switch (step.status) {
        case 'completed': return 'bg-green-900/20';
        case 'in_progress': return 'bg-blue-900/20';
        default: return 'bg-gray-800/30';
      }
    } else {
      switch (step.status) {
        case 'completed': return 'bg-green-50';
        case 'in_progress': return 'bg-blue-50';
        default: return 'bg-gray-50';
      }
    }
  };

  const getTextClass = () => {
    return isDark ? 'text-gray-100' : 'text-gray-900';
  };

  const getMutedTextClass = () => {
    return isDark ? 'text-gray-400' : 'text-gray-600';
  };

  return (
    <div className={`rounded-md ${getBackgroundClass()} transition-opacity duration-200 ${step.status === 'pending' ? 'opacity-60' : 'opacity-100'}`}>
      <Accordion type="single" collapsible>
        <AccordionItem value={`step-${step.id}`} className="border-none">
          <AccordionTrigger className={`px-3 py-2 hover:no-underline ${getTextClass()}`}>
            <div className="flex items-center gap-2 w-full">
              <div className={getBadgeClass()}>
                {step.id}
              </div>
              <span className={`font-medium text-sm flex-1 text-left ${getTextClass()}`}>
                {step.name}
              </span>
              <div className="ml-auto">
                {getStatusIcon()}
              </div>
            </div>
          </AccordionTrigger>
          
          <AccordionContent className="px-3 pb-2 pt-0">
            <div className="pl-1">
              {step.events.length > 0 ? (
                step.events.map(event => (
                  <StepEventRenderer 
                    key={event.id} 
                    event={event} 
                    onActionClick={onActionClick}
                    isDark={isDark}
                  />
                ))
              ) : (
                <p className={`text-xs ${getMutedTextClass()} italic`}>
                  {step.status === 'pending' ? 'Step not started yet' : 'No events recorded'}
                </p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

interface StepEventRendererProps {
  event: StepEvent;
  onActionClick?: (actionType: string, actionData: any) => void;
  isDark: boolean;
}

const StepEventRenderer: React.FC<StepEventRendererProps> = ({ event, onActionClick, isDark }) => {
  const getTextClass = () => isDark ? 'text-gray-100' : 'text-gray-900';
  const getMutedTextClass = () => isDark ? 'text-gray-400' : 'text-gray-600';
  const getStageTextClass = () => isDark ? 'text-blue-400' : 'text-blue-600';
  const getSuccessTextClass = () => isDark ? 'text-green-400' : 'text-green-600';
  const getErrorTextClass = () => isDark ? 'text-red-400' : 'text-red-600';
  
  const getActionBadgeClass = () => {
    if (isDark) {
      return "text-xs cursor-pointer h-4 px-2 py-1 rounded border bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700";
    } else {
      return "text-xs cursor-pointer h-4 px-2 py-1 rounded border bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200";
    }
  };

  switch (event.type) {
    case 'explanation':
      return (
        <div className="mb-2">
          {event.title && (
            <h4 className={`font-medium text-xs mb-1 ${getTextClass()}`}>
              {event.title}
            </h4>
          )}
          {event.content && (
            <div className={`text-xs ${getMutedTextClass()} leading-relaxed prose prose-xs max-w-none`}>
              <ReactMarkdown>{event.content}</ReactMarkdown>
            </div>
          )}
        </div>
      );

    case 'action':
      return (
        <div className="mb-1">
          <div
            className={getActionBadgeClass()}
            onClick={() => onActionClick?.(event.actionType || '', event.actionData)}
          >
            Action: {event.actionType}
          </div>
        </div>
      );

    case 'stage':
      return (
        <div className="mb-1">
          <p className={`text-xs ${getStageTextClass()} italic`}>
            {event.content}
          </p>
        </div>
      );

    case 'status':
      return (
        <div className="mb-1">
          <p className={`text-xs font-medium ${
            event.content?.includes('Error') 
              ? getErrorTextClass()
              : getSuccessTextClass()
          }`}>
            {event.content}
          </p>
        </div>
      );

    default:
      return null;
  }
};

export default StepRenderer;