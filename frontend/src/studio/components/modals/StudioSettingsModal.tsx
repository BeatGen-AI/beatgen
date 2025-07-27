import React, { useState, useEffect } from 'react';
import { Palette, Settings, Brain } from 'lucide-react';
import { useTheme } from '../../../lib/theme-provider';
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
  const { themes, setTheme } = useTheme();
  
  const toggleUITheme = () => {
    const newTheme = themes.homepage === 'dark' ? 'light' : 'dark';
    setTheme('homepage', newTheme);
  };
  
  const toggleStudioTheme = () => {
    const newTheme = themes.studio === 'dark' ? 'light' : 'dark';
    setTheme('studio', newTheme);
  };
  const [selectedAssistantModel, setSelectedAssistantModel] = useState(assistantModels[0]?.id || '');

  // No need to manually manage dark class - ThemeContext handles this automatically

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
              checked={themes.homepage === 'dark'}
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
              checked={themes.studio === 'dark'}
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