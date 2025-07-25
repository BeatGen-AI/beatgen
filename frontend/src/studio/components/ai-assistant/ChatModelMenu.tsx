import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Coins } from 'lucide-react';

// Model credit costs (matching backend MODEL_COSTS)
const MODEL_CREDIT_COSTS: Record<string, number> = {
  "Deepseek R1": 22,
  "Deepseek V3": 16,
  "Claude 4 Sonnet": 120,
  "Claude 4 Opus": 600,
  "Claude 3.7 Sonnet": 120,
  "GPT-4.1": 80,
  "GPT-4o": 100,
  "o3": 400,
  "o3-mini": 44,
  "Gemini Pro 2.5": 50,
  "Gemini Flash 2.5": 12,
  "Llama 4 Maverick": 6,
  "Llama 4 Scout": 4,
};

interface ChatModelMenuProps {
  triggerLabel: string; // Label for the trigger
  onSelect: (model: string) => void;
  models: string[];
  selectedModel?: string;
  disabled?: boolean;
}

const ChatModelMenu: React.FC<ChatModelMenuProps> = ({ triggerLabel, onSelect, models, selectedModel, disabled }) => {
  const handleSelect = (model: string) => {
    onSelect(model);
  };

  const getCreditCost = (model: string): number => {
    return MODEL_CREDIT_COSTS[model] || 10; // Fallback to 10 credits
  };


  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Badge 
          variant="secondary"
          className="cursor-pointer hover:bg-secondary/80 h-5 text-xs"
        >
          {triggerLabel}
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-52 z-[9999] p-1"
        sideOffset={4}
      >
        {models
          .sort((a, b) => getCreditCost(b) - getCreditCost(a)) // Sort by cost descending
          .map((model) => {
          const cost = getCreditCost(model);
          const isSelected = selectedModel === model;
          
          return (
            <DropdownMenuItem
              key={model}
              onClick={() => handleSelect(model)}
              className={`
                flex items-center justify-between px-2 py-1 cursor-pointer min-h-0
                ${isSelected ? 'bg-accent' : ''}
                hover:bg-accent/50 transition-colors
              `}
            >
              <span className="text-xs font-medium truncate">{model}</span>
              <div className="text-[10px] font-medium ml-2 shrink-0 flex items-center gap-0.5 text-gray-600 dark:text-gray-400">
                {cost}
                <Coins/>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ChatModelMenu;