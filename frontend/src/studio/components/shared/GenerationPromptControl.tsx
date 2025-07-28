'use client'

import React, { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SelectItem } from '@/components/ui/select';
import { Dices, Loader2 } from "lucide-react";
import { IconCircleArrowUpFilled } from "@tabler/icons-react";
import { useAppTheme } from '../../../lib/theme-provider';

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
  
  // Custom bottom components to render (more flexible than customSelectComponent)
  bottomLeftComponent?: React.ReactNode;
  bottomRightComponent?: React.ReactNode;
  
  // Components to render inside the textarea at the bottom
  textareaBottomLeftComponent?: React.ReactNode;
  textareaBottomRightComponent?: React.ReactNode;
  
  // UI customization
  showRandomButton?: boolean;
  showSelect?: boolean;
  submitButtonIcon?: React.ReactNode;
  submitButtonAriaLabel?: string;
  className?: string;
  useStudioTheme?: boolean;
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
  bottomLeftComponent,
  bottomRightComponent,
  textareaBottomLeftComponent,
  textareaBottomRightComponent,
  showRandomButton = true,
  showSelect = true,
  submitButtonIcon,
  submitButtonAriaLabel = "Generate",
  className = "",
  useStudioTheme = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { mode, studioMode } = useAppTheme();
  const currentTheme = useStudioTheme ? studioMode : mode;

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canGenerate) {
        onGenerate();
      }
    }
  };

  // Calculate if we have bottom elements that need space
  const hasBottomElements = (showRandomButton && (randomPrompts || onRandomPrompt)) || 
                           customSelectComponent || 
                           bottomLeftComponent ||
                           bottomRightComponent ||
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
          onKeyDown={handleKeyDown}
          className={`pr-16 min-h-[100px] resize-none ${
            textareaBottomLeftComponent || textareaBottomRightComponent ? 'pb-8' : 'pb-2'
          }`}
          style={useStudioTheme ? {
            backgroundColor: currentTheme === 'dark' ? '#1a1a1a' : '#ffffff',
            color: currentTheme === 'dark' ? '#ffffff' : '#000000',
            borderColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
          } : {}}
        />
        
        <div className="absolute top-2 right-2 text-xs text-muted-foreground">
          {prompt.length}/{maxLength}
        </div>
        
        {/* Bottom components inside textarea */}
        {textareaBottomLeftComponent && (
          <div className="absolute bottom-2 left-2">
            {textareaBottomLeftComponent}
          </div>
        )}
        
        {textareaBottomRightComponent && (
          <div className="absolute bottom-2 right-12">
            {textareaBottomRightComponent}
          </div>
        )}
        
        <div className="absolute bottom-2 right-2">
          <Button
            onClick={onGenerate}
            disabled={!canGenerate}
            size="icon"
            className="h-8 w-8"
            aria-label={submitButtonAriaLabel}
            style={useStudioTheme ? {
              backgroundColor: currentTheme === 'dark' ? '#374151' : '#6b7280',
              color: '#ffffff',
              borderColor: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
            } : {}}
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
            {/* Left side components */}
            {bottomLeftComponent ? (
              bottomLeftComponent
            ) : (
              <>
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
              </>
            )}
          </div>
          
          {/* Right side components */}
          {bottomRightComponent && (
            <div className="flex items-center space-x-2">
              {bottomRightComponent}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GenerationPromptControl; 