import React from 'react';
import { cn } from '@/lib/utils';
import MenuChip from './MenuChip';
import AddContextChip from './AddContextChip';

interface UserChatBubbleProps {
  text: string;
  mode?: string;
  selectedTrack?: {
    id: string;
    name: string;
  } | null;
}

const UserChatBubble: React.FC<UserChatBubbleProps> = ({ text, mode, selectedTrack }) => {
  return (
    <div
      className={cn(
        "self-end max-w-[85%] p-2 rounded-2xl",
        "bg-blue-500/80 text-white shadow-sm break-words"
      )}
    >
      <p className="text-sm">
        {text}
      </p>
      {/* Chips container */}
      {(mode || selectedTrack) && (
        <div className="mt-2 flex gap-2 justify-end">
          {mode && (
            <MenuChip 
              label={mode}
              onClick={() => {}}  // Empty function since it's disabled
              disabled={true}
              filled={true}
            />
          )}
          {selectedTrack && (
            <MenuChip 
              label={selectedTrack.name}
              onClick={() => {}}  // Empty function since it's disabled
              disabled={true}
              filled={true}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default UserChatBubble; 