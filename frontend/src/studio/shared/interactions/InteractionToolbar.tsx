import React, { useState } from 'react';
import { Box, IconButton, Tooltip, ToggleButton, ToggleButtonGroup, Menu, MenuItem } from '@mui/material';
import { 
  CropFree as SelectIcon,
  Edit as PenIcon,
  Highlight as HighlighterIcon,
  Delete as EraserIcon,
  GridOn as GridIcon,
  GridOff as GridOffIcon,
  Check as CheckIcon
} from '@mui/icons-material';
import { Tool } from './types';
import { GridSnapOption, getGridSnapOptionName, getAllGridSnapOptions } from '../../components/piano-roll2/gridConstants';

interface InteractionToolbarProps {
  selectedTool: Tool;
  onToolChange: (tool: Tool) => void;
  snapToGrid: boolean;
  onToggleSnapToGrid: () => void;
  gridSnapSize?: GridSnapOption;
  onGridSnapSizeChange?: (size: GridSnapOption) => void;
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
  gridSnapSize = GridSnapOption.STEP,
  onGridSnapSizeChange,
  showGridToggle = true,
  disabled = false,
  orientation = 'horizontal',
  size = 'medium',
  className = ''
}) => {
  const iconSize = size === 'small' ? 18 : size === 'large' ? 28 : 24;
  const [gridMenuAnchor, setGridMenuAnchor] = useState<null | HTMLElement>(null);
  const gridMenuOpen = Boolean(gridMenuAnchor);

  const handleGridClick = (event: React.MouseEvent<HTMLElement>) => {
    setGridMenuAnchor(event.currentTarget);
  };

  const handleGridMenuClose = () => {
    setGridMenuAnchor(null);
  };

  const handleGridSnapSizeChange = (option: GridSnapOption) => {
    onGridSnapSizeChange?.(option);
    handleGridMenuClose();
  };

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

      {/* Grid Snap Menu */}
      {showGridToggle && (
        <>
          <Tooltip title={`Grid snap: ${getGridSnapOptionName(gridSnapSize)}`}>
            <IconButton
              onClick={handleGridClick}
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

          <Menu
            anchorEl={gridMenuAnchor}
            open={gridMenuOpen}
            onClose={handleGridMenuClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'center',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'center',
            }}
            PaperProps={{
              sx: {
                bgcolor: 'background.paper',
                minWidth: 150,
                maxHeight: 400,
                '& .MuiMenuItem-root': {
                  fontSize: '0.875rem',
                  py: 0.75,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }
              }
            }}
          >
            {/* None option */}
            <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.NONE)}>
              <span>None</span>
              {gridSnapSize === GridSnapOption.NONE && <CheckIcon fontSize="small" />}
            </MenuItem>
            
            {/* Step section */}
            <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 0.5, pt: 0.5 }}>
              <Box sx={{ fontSize: '0.75rem', color: 'text.secondary', px: 2, py: 0.5 }}>STEP</Box>
              <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_6)}>
                <span>1/6 step</span>
                {gridSnapSize === GridSnapOption.STEP_1_6 && <CheckIcon fontSize="small" />}
              </MenuItem>
              <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_4)}>
                <span>1/4 step</span>
                {gridSnapSize === GridSnapOption.STEP_1_4 && <CheckIcon fontSize="small" />}
              </MenuItem>
              <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_3)}>
                <span>1/3 step</span>
                {gridSnapSize === GridSnapOption.STEP_1_3 && <CheckIcon fontSize="small" />}
              </MenuItem>
              <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP_1_2)}>
                <span>1/2 step</span>
                {gridSnapSize === GridSnapOption.STEP_1_2 && <CheckIcon fontSize="small" />}
              </MenuItem>
              <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.STEP)}>
                <span>Step</span>
                {gridSnapSize === GridSnapOption.STEP && <CheckIcon fontSize="small" />}
              </MenuItem>
            </Box>
            
            {/* Beat section */}
            <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 0.5, pt: 0.5 }}>
              <Box sx={{ fontSize: '0.75rem', color: 'text.secondary', px: 2, py: 0.5 }}>BEAT</Box>
              <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_6)}>
                <span>1/6 beat</span>
                {gridSnapSize === GridSnapOption.BEAT_1_6 && <CheckIcon fontSize="small" />}
              </MenuItem>
              <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_4)}>
                <span>1/4 beat</span>
                {gridSnapSize === GridSnapOption.BEAT_1_4 && <CheckIcon fontSize="small" />}
              </MenuItem>
              <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_3)}>
                <span>1/3 beat</span>
                {gridSnapSize === GridSnapOption.BEAT_1_3 && <CheckIcon fontSize="small" />}
              </MenuItem>
              <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT_1_2)}>
                <span>1/2 beat</span>
                {gridSnapSize === GridSnapOption.BEAT_1_2 && <CheckIcon fontSize="small" />}
              </MenuItem>
              <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BEAT)}>
                <span>Beat</span>
                {gridSnapSize === GridSnapOption.BEAT && <CheckIcon fontSize="small" />}
              </MenuItem>
            </Box>
            
            {/* Bar option */}
            <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 0.5, pt: 0.5 }}>
              <MenuItem onClick={() => handleGridSnapSizeChange(GridSnapOption.BAR)}>
                <span>Bar</span>
                {gridSnapSize === GridSnapOption.BAR && <CheckIcon fontSize="small" />}
              </MenuItem>
            </Box>
          </Menu>
        </>
      )}
    </Box>
  );
};

export default InteractionToolbar;