import React, { useState, useEffect, useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAppTheme } from '../../../platform/theme/ThemeContext';

interface AddContextMenuProps {
  triggerLabel: string;
  onSelect: (trackId: string) => void;
  tracks: Array<{ id: string; name: string }>;
}

const AddContextMenu: React.FC<AddContextMenuProps> = ({ 
  triggerLabel,
  onSelect,
  tracks 
}) => {
  const { studioMode } = useAppTheme();
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredTracks, setFilteredTracks] = useState(tracks);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset search and selection when menu opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      setSelectedIndex(0);
    }
    setFilteredTracks(tracks);
  }, [isOpen, tracks]);

  // Filter tracks and update selection based on search term
  useEffect(() => {
    const filtered = tracks.filter(track => 
      track.name.toLowerCase().startsWith(searchTerm.toLowerCase())
    );
    setFilteredTracks(filtered);
    // Reset selection index when filtered results change
    setSelectedIndex(filtered.length > 0 ? 0 : -1);
  }, [searchTerm, tracks]);

  // Focus input when menu opens
  useEffect(() => {
    if (isOpen) {
      // Use a small timeout to ensure the menu is fully rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    }
  }, [isOpen]);

  const handleSelect = (trackId: string) => {
    onSelect(trackId);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && 
        e.key !== 'ArrowDown' && 
        e.key !== 'Enter' && 
        e.key !== 'Escape') {
      e.stopPropagation();
    }

    // Handle arrow key navigation
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      if (filteredTracks.length > 0) {
        setSelectedIndex(prev => 
          prev < filteredTracks.length - 1 ? prev + 1 : prev
        );
      }
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (filteredTracks.length > 0) {
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : prev
        );
      }
    }

    // Handle enter key to select the highlighted item
    if (e.key === 'Enter' && selectedIndex >= 0 && filteredTracks.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      handleSelect(filteredTracks[selectedIndex].id);
    }

    // Handle escape key to close menu
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const getDropdownClassName = () => {
    if (studioMode === 'dark') {
      return "w-52 z-[9999] p-1 bg-[rgb(48,48,48)] border-0 shadow-lg rounded-lg focus:outline-none";
    }
    return "w-52 z-[9999] p-1 bg-white border border-gray-200 shadow-lg rounded-lg focus:outline-none";
  };

  const getItemClassName = (isSelected: boolean) => {
    const baseClasses = "cursor-pointer min-h-0 transition-colors text-xs rounded px-2 py-1";
    
    if (studioMode === 'dark') {
      const textColor = 'text-white';
      const selectedClass = isSelected ? 'bg-[rgba(255,255,255,0.1)]' : '';
      const hoverClass = 'hover:bg-[rgba(255,255,255,0.08)]';
      return `${baseClasses} ${textColor} ${selectedClass} ${hoverClass}`;
    } else {
      const textColor = 'text-gray-900';
      const selectedClass = isSelected ? 'bg-gray-100' : '';
      const hoverClass = 'hover:bg-gray-50';
      return `${baseClasses} ${textColor} ${selectedClass} ${hoverClass}`;
    }
  };

  const getInputClassName = () => {
    if (studioMode === 'dark') {
      return "bg-[rgba(30,30,30,0.8)] border-[rgba(255,255,255,0.2)] text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded mb-1";
    }
    return "bg-white border-gray-300 text-gray-900 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded mb-1";
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Badge 
          variant="secondary"
          className={`cursor-pointer h-5 text-xs border-0 ${
            studioMode === 'dark' 
              ? 'bg-[rgba(60,60,60,0.8)] text-white hover:bg-[rgba(60,60,60,0.9)]'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
          style={{
            borderRadius: '5px',
            fontSize: '0.7rem'
          }}
        >
          {triggerLabel}
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={getDropdownClassName()}
        sideOffset={4}
      >
        <div className="p-1">
          <Input
            ref={inputRef}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={getInputClassName()}
            placeholder="Search tracks..."
            autoComplete="off"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          />
        </div>
        {filteredTracks.map((track, index) => (
          <DropdownMenuItem
            key={track.id}
            onClick={() => handleSelect(track.id)}
            className={getItemClassName(index === selectedIndex)}
          >
            <span className="text-xs font-medium">{track.name}</span>
          </DropdownMenuItem>
        ))}
        {filteredTracks.length === 0 && (
          <DropdownMenuItem 
            disabled 
            className={`${getItemClassName(false)} opacity-50 cursor-not-allowed`}
          >
            <span className="text-xs">No tracks found</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AddContextMenu;