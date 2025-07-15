'use client'

import React, { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SelectItem } from '@/components/ui/select';
import { Dices, Loader2 } from "lucide-react";
import { IconCircleArrowUpFilled } from "@tabler/icons-react";

interface SelectOption {
  id: string;
  name: string;
  icon?: React.ReactNode;
}

interface GenerationPromptControlProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  
  placeholder?: string;
  maxLength?: number;
  randomPrompts?: string[];
  onRandomPrompt?: () => void;
  
  selectOptions?: SelectOption[];
  selectedOption?: string;
  onOptionChange?: (value: string) => void;
  selectPlaceholder?: string;
  selectWidth?: string;
  renderSelectItem?: (option: SelectOption) => React.ReactNode;
  
  // Custom component to render instead of select dropdown
  customSelectComponent?: React.ReactNode;
  
  // UI customization
  showRandomButton?: boolean;
  showSelect?: boolean;
  submitButtonIcon?: React.ReactNode;
  submitButtonAriaLabel?: string;
  className?: string;
}

const GenerationPromptControl: React.FC<GenerationPromptControlProps> = ({
  prompt,
  onPromptChange,
  onGenerate,
  isGenerating,
  placeholder = "Enter prompt",
  maxLength = 300,
  randomPrompts,
  onRandomPrompt,
  selectOptions,
  selectedOption,
  onOptionChange,
  selectPlaceholder = "Select option",
  selectWidth = "130px",
  renderSelectItem,
  customSelectComponent,
  showRandomButton = true,
  showSelect = true,
  submitButtonIcon,
  submitButtonAriaLabel = "Generate",
  className = "",
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      
      // Reset height to shrink if needed
      textarea.style.height = '0px';
      
      // Set to actual scroll height
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [prompt]);

  const handleRandomPrompt = () => {
    if (onRandomPrompt) {
      onRandomPrompt();
    } else if (randomPrompts && randomPrompts.length > 0) {
      const randomIndex = Math.floor(Math.random() * randomPrompts.length);
      onPromptChange(randomPrompts[randomIndex]);
    }
  };

  const canGenerate = !isGenerating && prompt.trim().length > 0;

  // Calculate if we have bottom elements that need space
  const hasBottomElements = (showRandomButton && (randomPrompts || onRandomPrompt)) || 
                           customSelectComponent || 
                           (showSelect && selectOptions && selectedOption && onOptionChange);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="relative">
        <Textarea
          ref={textareaRef}
          placeholder={placeholder}
          maxLength={maxLength}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          className="pr-16 min-h-[100px] resize-none"
        />
        
        <div className="absolute top-2 right-2 text-xs text-muted-foreground">
          {prompt.length}/{maxLength}
        </div>
        
        <div className="absolute bottom-2 right-2">
          <Button
            onClick={onGenerate}
            disabled={!canGenerate}
            size="icon"
            className="h-8 w-8"
            aria-label={submitButtonAriaLabel}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              submitButtonIcon || <IconCircleArrowUpFilled className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      
      {/* Bottom controls */}
      {hasBottomElements && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {showRandomButton && (randomPrompts || onRandomPrompt) && (
              <Button
                onClick={handleRandomPrompt}
                variant="outline"
                size="icon"
                disabled={isGenerating}
                aria-label="Random Prompt"
              >
                <Dices className="h-4 w-4" />
              </Button>
            )}
            
            {customSelectComponent ? (
              customSelectComponent
            ) : (
              showSelect && selectOptions && selectedOption && onOptionChange && (
                <Select value={selectedOption} onValueChange={onOptionChange}>
                  <SelectTrigger className={`w-[${selectWidth}] h-8 text-xs`}>
                    <SelectValue placeholder={selectPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {renderSelectItem ? renderSelectItem(option) : (
                          <div className="flex items-center text-xs">
                            {option.icon && <span className="mr-2">{option.icon}</span>}
                            <span>{option.name}</span>
                          </div>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GenerationPromptControl; 