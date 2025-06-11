import React from 'react';

export type ToolType = 'select' | 'pen' | 'highlighter' | 'eraser';

interface ToolSelectionProps {
  selectedTool: ToolType;
  onToolSelect: (tool: ToolType) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const ToolSelection: React.FC<ToolSelectionProps> = ({
  selectedTool,
  onToolSelect,
  className = '',
  style = {}
}) => {
  // Custom styles for tool icons
  const iconHoverStyle = (e: React.MouseEvent<HTMLImageElement>) => {
    e.currentTarget.style.opacity = "1";
    e.currentTarget.style.transform = "scale(1.1)";
  };

  const iconLeaveStyle = (e: React.MouseEvent<HTMLImageElement>) => {
    e.currentTarget.style.opacity = "0.8";
    e.currentTarget.style.transform = "scale(1)";
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

  const tools: Array<{
    type: ToolType;
    icon: string;
    alt: string;
    marginRight: string;
  }> = [
    { type: 'select', icon: '/icons/crop.svg', alt: 'Select tool', marginRight: '8px' },
    { type: 'pen', icon: '/icons/pen.svg', alt: 'Pen tool', marginRight: '8px' },
    { type: 'highlighter', icon: '/icons/highlighter.svg', alt: 'Highlighter tool', marginRight: '8px' },
    { type: 'eraser', icon: '/icons/eraser.svg', alt: 'Eraser tool', marginRight: '0px' }
  ];

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
      
      {tools.map((tool) => (
        <img 
          key={tool.type}
          src={tool.icon}
          alt={tool.alt}
          style={{ 
            width: "18px",
            height: "18px",
            cursor: "pointer",
            marginRight: tool.marginRight,
            opacity: selectedTool === tool.type ? 1 : 0.8,
            background: selectedTool === tool.type ? 'rgba(255,255,255,0.1)' : 'transparent',
            padding: '2px',
            borderRadius: '2px',
            transition: 'all 0.2s ease',
          }}
          onClick={() => onToolSelect(tool.type)}
          onMouseEnter={selectedTool !== tool.type ? iconHoverStyle : undefined}
          onMouseLeave={selectedTool !== tool.type ? iconLeaveStyle : undefined}
        />
      ))}
    </div>
  );
};

export default ToolSelection;