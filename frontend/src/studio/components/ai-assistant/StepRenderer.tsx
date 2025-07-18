import React from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  Chip, 
  CircularProgress,
  useTheme,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import { IconChevronDown } from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import { Step, StepEvent } from './StepManager';

interface StepRendererProps {
  steps: Step[];
  onActionClick?: (actionType: string, actionData: any) => void;
}

export const StepRenderer: React.FC<StepRendererProps> = ({ steps, onActionClick }) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {steps.map(step => (
        <StepCard 
          key={step.id} 
          step={step} 
          onActionClick={onActionClick}
        />
      ))}
    </Box>
  );
};

interface StepCardProps {
  step: Step;
  onActionClick?: (actionType: string, actionData: any) => void;
}

const StepCard: React.FC<StepCardProps> = ({ step, onActionClick }) => {
  const theme = useTheme();
  
  const getStatusColor = () => {
    switch (step.status) {
      case 'completed': return 'success';
      case 'in_progress': return 'primary';
      default: return 'default';
    }
  };

  const getStatusIcon = () => {
    if (step.status === 'in_progress') {
      return <CircularProgress size={16} />;
    }
    return null;
  };

  // Check if step has any content to show
  const hasContent = step.events.length > 0;

  return (
    <Paper 
      sx={{ 
        border: `2px solid`,
        borderColor: `${getStatusColor()}.main`,
        opacity: step.status === 'pending' ? 0.6 : 1,
        transition: 'opacity 0.2s ease'
      }}
    >
      <Accordion 
        defaultExpanded={false}
        disabled={false}
        sx={{
          '&.Mui-disabled': {
            backgroundColor: 'transparent'
          },
          '& .MuiAccordionSummary-root.Mui-disabled': {
            opacity: 1
          }
        }}
      >
        <AccordionSummary
          expandIcon={<IconChevronDown size={20} />}
          sx={{ 
            '& .MuiAccordionSummary-content': {
              alignItems: 'center'
            }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
            <Chip 
              label={step.id} 
              size="small" 
              color={getStatusColor()}
              sx={{ minWidth: 32 }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {step.name}
            </Typography>
            <Box sx={{ marginLeft: 'auto' }}>
              {getStatusIcon()}
            </Box>
          </Box>
        </AccordionSummary>
        
        <AccordionDetails sx={{ pt: 0 }}>
          <Box sx={{ pl: 2 }}>
            {step.events.length > 0 ? (
              step.events.map(event => (
                <StepEventRenderer 
                  key={event.id} 
                  event={event} 
                  onActionClick={onActionClick}
                />
              ))
            ) : (
              <Typography 
                variant="body2" 
                sx={{ color: 'text.secondary', fontStyle: 'italic' }}
              >
                {step.status === 'pending' ? 'Step not started yet' : 'No events recorded'}
              </Typography>
            )}
          </Box>
        </AccordionDetails>
      </Accordion>
    </Paper>
  );
};

interface StepEventRendererProps {
  event: StepEvent;
  onActionClick?: (actionType: string, actionData: any) => void;
}

const StepEventRenderer: React.FC<StepEventRendererProps> = ({ event, onActionClick }) => {
  const theme = useTheme();

  switch (event.type) {
    case 'explanation':
      return (
        <Box sx={{ mb: 2 }}>
          {event.title && (
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              {event.title}
            </Typography>
          )}
          {event.content && (
            <Typography 
              variant="body2" 
              sx={{ 
                color: theme.palette.text.secondary,
                lineHeight: 1.6,
                '& p': { margin: 0, mb: 1 },
                '& p:last-child': { mb: 0 }
              }}
            >
              <ReactMarkdown>{event.content}</ReactMarkdown>
            </Typography>
          )}
        </Box>
      );

    case 'action':
      return (
        <Box sx={{ mb: 1 }}>
          <Chip
            label={`Action: ${event.actionType}`}
            size="small"
            color="secondary"
            variant="outlined"
            onClick={() => onActionClick?.(event.actionType || '', event.actionData)}
            clickable={!!onActionClick}
            sx={{ fontSize: '0.75rem' }}
          />
        </Box>
      );

    case 'stage':
      return (
        <Box sx={{ mb: 1 }}>
          <Typography 
            variant="caption" 
            sx={{ 
              color: theme.palette.primary.main,
              fontStyle: 'italic'
            }}
          >
            {event.content}
          </Typography>
        </Box>
      );

    case 'status':
      return (
        <Box sx={{ mb: 1 }}>
          <Typography 
            variant="caption" 
            sx={{ 
              color: event.content?.includes('Error') 
                ? theme.palette.error.main 
                : theme.palette.success.main,
              fontWeight: 500
            }}
          >
            {event.content}
          </Typography>
        </Box>
      );

    default:
      return null;
  }
};

export default StepRenderer;