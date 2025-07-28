import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddContextChipProps {
  trackName: string;
  onDelete: () => void;
}

const AddContextChip: React.FC<AddContextChipProps> = ({ trackName, onDelete }) => {
  return (
    <div className="flex items-center bg-secondary text-secondary-foreground rounded-md h-5 px-2 text-xs">
      <span>{trackName}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-auto w-auto p-0 ml-1 hover:bg-transparent"
        onClick={onDelete}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
};

export default AddContextChip;
