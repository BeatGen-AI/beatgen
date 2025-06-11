import React, { useState } from 'react';
import { Menu, MenuItem } from '@mui/material';

export interface GridSnapOption {
  value: number;
  label: string;
  category?: 'step' | 'beat' | 'bar';
}

// Default grid snap options that match the piano roll
const defaultGridSnapOptions: GridSnapOption[] = [
  { value: 0, label: 'None' },
  { value: 1, label: '1/6 step', category: 'step' },
  { value: 2, label: '1/4 step', category: 'step' },
  { value: 3, label: '1/3 step', category: 'step' },
  { value: 4, label: '1/2 step', category: 'step' },
  { value: 5, label: 'Step', category: 'step' },
  { value: 6, label: '1/6 beat', category: 'beat' },
  { value: 7, label: '1/4 beat', category: 'beat' },
  { value: 8, label: '1/3 beat', category: 'beat' },
  { value: 9, label: '1/2 beat', category: 'beat' },
  { value: 10, label: 'Beat', category: 'beat' },
  { value: 11, label: 'Bar', category: 'bar' }
];

interface GridSnapControlsProps {
  enabled: boolean;
  selectedSnapSize: number;
  onToggle: () => void;
  onSnapSizeChange: (size: number) => void;
  snapOptions?: GridSnapOption[];
  className?: string;
  style?: React.CSSProperties;
}

export const GridSnapControls: React.FC<GridSnapControlsProps> = ({
  enabled,
  selectedSnapSize,
  onToggle,
  onSnapSizeChange,
  snapOptions = defaultGridSnapOptions,
  className = '',
  style = {}
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const menuOpen = Boolean(anchorEl);

  const handleIconClick = (event: React.MouseEvent<HTMLImageElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleSnapSizeSelect = (size: number) => {
    onSnapSizeChange(size);
    handleMenuClose();
  };

  const containerStyle: React.CSSProperties = {
    display: "flex", 
    alignItems: "center", 
    marginRight: "12px",
    paddingRight: "12px",
    position: "relative",
    height: "100%",
    ...style
  };

  // Group options by category for menu organization
  const groupedOptions = snapOptions.reduce((acc, option) => {
    const category = option.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(option);
    return acc;
  }, {} as Record<string, GridSnapOption[]>);

  const renderMenuItem = (option: GridSnapOption) => (
    <MenuItem 
      key={option.value}
      onClick={() => handleSnapSizeSelect(option.value)}
      style={{
        padding: "3px 8px",
        fontSize: "11px",
        display: "flex",
        justifyContent: "space-between",
        backgroundColor: selectedSnapSize === option.value ? "#3a3a3a" : "transparent"
      }}
      sx={{ 
        '&:hover': { 
          backgroundColor: '#525252 !important'
        }
      }}
    >
      <span>{option.label}</span>
      {selectedSnapSize === option.value && (
        <span className="material-symbols-outlined" style={{ fontSize: "11px", marginLeft: "4px" }}>
          check
        </span>
      )}
    </MenuItem>
  );

  const renderDivider = (label: string) => (
    <div key={`divider-${label}`}>
      <div style={{ 
        height: "1px", 
        backgroundColor: "rgba(255,255,255,0.1)", 
        margin: "2px 4px",
        position: "relative" 
      }}>
        <span style={{
          position: "absolute",
          top: "-6px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "#222222",
          padding: "0 4px",
          fontSize: "8px",
          color: "rgba(255,255,255,0.5)",
          textTransform: "uppercase",
          letterSpacing: "0.5px"
        }}>
          {label}
        </span>
      </div>
    </div>
  );

  return (
    <div className={className} style={containerStyle}>
      {/* Divider on the right */}
      <div style={{ 
        position: "absolute", 
        right: 0, 
        top: "50%", 
        transform: "translateY(-50%)",
        height: "16px", 
        width: "1px", 
        backgroundColor: "rgba(255,255,255,0.1)" 
      }} />
      
      <img 
        src="/icons/grid-on.svg"
        alt="Grid snap"
        onClick={handleIconClick}
        onMouseDown={(e) => {
          // Prevent drag handle interference
          e.stopPropagation();
        }}
        style={{ 
          width: "18px",
          height: "18px",
          opacity: enabled ? 1 : 0.5,
          cursor: "pointer",
          filter: "brightness(0) invert(1)", // Make icon white
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          if (!enabled) e.currentTarget.style.opacity = "0.8";
          e.currentTarget.style.transform = "scale(1.1)";
        }}
        onMouseLeave={(e) => {
          if (!enabled) e.currentTarget.style.opacity = "0.5";
          e.currentTarget.style.transform = "scale(1)";
        }}
      />

      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={handleMenuClose}
        style={{ zIndex: 10001 }}
        slotProps={{
          paper: {
            style: {
              backgroundColor: "#222222",
              color: "white",
              borderRadius: "4px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              padding: "2px 0",
              minWidth: "100px"
            }
          }
        }}
        MenuListProps={{
          style: {
            padding: "2px 0"
          }
        }}
      >
        {/* Render 'None' option first */}
        {snapOptions.filter(opt => opt.value === 0).map(renderMenuItem)}
        
        {/* Render step options */}
        {groupedOptions.step && (
          <>
            {renderDivider('step')}
            {groupedOptions.step.map(renderMenuItem)}
          </>
        )}
        
        {/* Render beat options */}
        {groupedOptions.beat && (
          <>
            {renderDivider('beat')}
            {groupedOptions.beat.map(renderMenuItem)}
          </>
        )}
        
        {/* Render bar options */}
        {groupedOptions.bar && (
          <>
            {renderDivider('bar')}
            {groupedOptions.bar.map(renderMenuItem)}
          </>
        )}
        
        {/* Render any other options */}
        {groupedOptions.other && groupedOptions.other.map(renderMenuItem)}
      </Menu>
    </div>
  );
};

export default GridSnapControls;