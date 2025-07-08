import React, { useState, useEffect } from 'react';
import { Palette, Settings, Brain } from 'lucide-react';
import { useAppTheme } from '../../../platform/theme/ThemeContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Separator } from '../../../components/ui/separator';

export interface StudioSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

// Dummy data for assistant models - replace with actual data source
const assistantModels = [
  { id: 'model1', name: 'GPT-4' },
  { id: 'model2', name: 'Claude 3 Opus' },
  { id: 'model3', name: 'Gemini Pro' },
];

export const StudioSettingsModal = ({ open, onClose }: StudioSettingsModalProps) => {
  const { mode: uiMode, studioMode, toggleUITheme, toggleStudioTheme } = useAppTheme();
  const [selectedAssistantModel, setSelectedAssistantModel] = useState(assistantModels[0]?.id || '');

  // Apply studio dark mode to document element when dialog is open
  useEffect(() => {
    if (!open) return;
    
    const root = window.document.documentElement;
    const originalHasDark = root.classList.contains('dark');
    
    // Apply or remove dark class based on studioMode immediately
    if (studioMode === 'dark' && !originalHasDark) {
      root.classList.add('dark');
    } else if (studioMode === 'light' && originalHasDark) {
      root.classList.remove('dark');
    }
    
    // Don't restore immediately on cleanup - let the dialog close first
    return () => {
      // We'll handle restoration when dialog fully closes
    };
  }, [open, studioMode]);
  
  // Separate effect to handle restoration after dialog closes
  useEffect(() => {
    if (open) return; // Only run when dialog is closed
    
    // Restore original dark mode after animation completes
    const timeoutId = setTimeout(() => {
      const root = window.document.documentElement;
      const currentHasDark = root.classList.contains('dark');
      const shouldHaveDark = uiMode === 'dark';
      
      if (shouldHaveDark && !currentHasDark) {
        root.classList.add('dark');
      } else if (!shouldHaveDark && currentHasDark) {
        root.classList.remove('dark');
      }
    }, 200); // Wait for closing animation
    
    return () => clearTimeout(timeoutId);
  }, [open, uiMode]);

  const handleAssistantModelChange = (value: string) => {
    setSelectedAssistantModel(value);
    console.log('Assistant Model:', value);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Studio Settings</DialogTitle>
        </DialogHeader>
        
        <Separator className="my-4" />
        
        <div className="space-y-6 text-foreground">
          {/* UI Dark Mode Setting */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Palette className="h-5 w-5 text-muted-foreground" />
              <Label htmlFor="ui-dark-mode" className="text-base font-normal">
                UI Dark Mode
              </Label>
            </div>
            <Switch
              id="ui-dark-mode"
              checked={uiMode === 'dark'}
              onCheckedChange={() => toggleUITheme()}
            />
          </div>

          {/* Studio Dark Mode Setting */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Settings className="h-5 w-5 text-muted-foreground" />
              <Label htmlFor="studio-dark-mode" className="text-base font-normal">
                Studio Dark Mode
              </Label>
            </div>
            <Switch
              id="studio-dark-mode"
              checked={studioMode === 'dark'}
              onCheckedChange={() => toggleStudioTheme()}
            />
          </div>

          {/* Assistant Model Setting */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Brain className="h-5 w-5 text-muted-foreground" />
              <Label htmlFor="assistant-model" className="text-base font-normal">
                Assistant Model
              </Label>
            </div>
            <Select value={selectedAssistantModel} onValueChange={handleAssistantModelChange}>
              <SelectTrigger id="assistant-model" className="w-[200px]">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {assistantModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};