import React from 'react';
import { Box, IconButton, Tooltip, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { 
  CropFree as SelectIcon,
  Edit as PenIcon,
  Highlight as HighlighterIcon,
  Delete as EraserIcon,
  GridOn as GridIcon,
  GridOff as GridOffIcon
} from '@mui/icons-material';
import { Tool } from './types';

interface InteractionToolbarProps {
  selectedTool: Tool;
  onToolChange: (tool: Tool) => void;
  snapToGrid: boolean;
  onToggleSnapToGrid: () => void;
  showGridToggle?: boolean;
  disabled?: boolean;
  orientation?: 'horizontal' | 'vertical';
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export const InteractionToolbar: React.FC<InteractionToolbarProps> = ({
  selectedTool,
  onToolChange,
  snapToGrid,
  onToggleSnapToGrid,
  showGridToggle = true,
  disabled = false,
  orientation = 'horizontal',
  size = 'medium',
  className = ''
}) => {
  const iconSize = size === 'small' ? 18 : size === 'large' ? 28 : 24;

  const tools = [
    { value: 'select' as Tool, icon: <SelectIcon />, label: 'Select Tool', description: 'Select and move items' },
    { value: 'pen' as Tool, icon: <PenIcon />, label: 'Pen Tool', description: 'Create new items' },
    { value: 'highlighter' as Tool, icon: <HighlighterIcon />, label: 'Highlighter Tool', description: 'Paint to create items' },
    { value: 'eraser' as Tool, icon: <EraserIcon />, label: 'Eraser Tool', description: 'Delete items' }
  ];

  return (
    <Box 
      className={`interaction-toolbar ${className}`}
      sx={{ 
        display: 'flex', 
        flexDirection: orientation === 'vertical' ? 'column' : 'row',
        alignItems: 'center',
        gap: 1,
        p: 1,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1
      }}
    >
      {/* Tool Selection */}
      <ToggleButtonGroup
        value={selectedTool}
        exclusive
        onChange={(_, newTool) => {
          if (newTool !== null) {
            onToolChange(newTool);
          }
        }}
        orientation={orientation}
        size={size}
        disabled={disabled}
        sx={{
          '& .MuiToggleButton-root': {
            border: 1,
            borderColor: 'divider',
            '&.Mui-selected': {
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': {
                backgroundColor: 'primary.dark'
              }
            }
          }
        }}
      >
        {tools.map(tool => (
          <ToggleButton 
            key={tool.value} 
            value={tool.value}
            aria-label={tool.label}
          >
            <Tooltip title={tool.description} placement="bottom">
              <Box sx={{ display: 'flex', alignItems: 'center', fontSize: iconSize }}>
                {React.cloneElement(tool.icon, { fontSize: 'inherit' })}
              </Box>
            </Tooltip>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* Grid Toggle */}
      {showGridToggle && (
        <Tooltip title={snapToGrid ? 'Disable grid snap' : 'Enable grid snap'}>
          <IconButton
            onClick={onToggleSnapToGrid}
            disabled={disabled}
            size={size}
            sx={{
              color: snapToGrid ? 'primary.main' : 'text.secondary',
              '&:hover': {
                backgroundColor: 'action.hover'
              }
            }}
          >
            {snapToGrid ? <GridIcon /> : <GridOffIcon />}
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

export default InteractionToolbar;