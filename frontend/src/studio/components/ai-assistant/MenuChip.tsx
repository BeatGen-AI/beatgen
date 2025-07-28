import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface MenuChipProps {
  label: string;
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  disabled?: boolean;
  color?: string;
  filled?: boolean;
}

const MenuChip: React.FC<MenuChipProps> = ({ label, onClick, disabled, color, filled }) => {
  return (
    <Badge 
      variant={filled ? "secondary" : "outline"}
      className={cn(
        "w-fit rounded-md h-5 px-2 text-xs cursor-pointer transition-colors",
        !disabled && "hover:bg-accent",
        disabled && "opacity-100 cursor-default",
        filled && "bg-gray-600/80 text-white",
        color === 'primary' && !filled && "bg-primary text-primary-foreground",
        color === 'secondary' && !filled && "bg-secondary text-secondary-foreground"
      )}
      onClick={!disabled ? onClick : undefined}
    >
      {label}
    </Badge>
  );
};

export default MenuChip;
