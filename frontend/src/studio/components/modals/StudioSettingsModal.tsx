import React, { useState, useEffect } from 'react';
import { Palette, Settings, Brain } from 'lucide-react';
import { useAppTheme, useTheme } from '../../../lib/theme-provider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Label } from '../../../components/ui/label';
import { ThemeSwitcher } from '../../../components/ui/ThemeSwitcher';
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
  const { mode, studioMode } = useAppTheme();
  const { homepageTheme, studioTheme, setHomepageTheme, setStudioTheme } = useTheme();
  
  const [selectedAssistantModel, setSelectedAssistantModel] = useState(assistantModels[0]?.id || '');

  const handleAssistantModelChange = (value: string) => {
    setSelectedAssistantModel(value);
    console.log('Assistant Model:', value);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="sm:max-w-[600px]"
        style={{
          backgroundColor: studioMode === 'dark' ? '#1a1a1a' : '#ffffff',
          color: studioMode === 'dark' ? '#ffffff' : '#000000',
          border: `1px solid ${studioMode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'}`
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: studioMode === 'dark' ? '#ffffff' : '#000000' }}>Studio Settings</DialogTitle>
        </DialogHeader>
        
        <div 
          className="my-4 h-px"
          style={{
            backgroundColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'
          }}
        />
        
        <div 
          className="space-y-6"
          style={{ color: studioMode === 'dark' ? '#ffffff' : '#000000' }}
        >
          {/* UI Theme Setting */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Palette 
                className="h-5 w-5"
                style={{ color: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)' }}
              />
              <Label 
                className="text-base font-normal"
                style={{ color: studioMode === 'dark' ? '#ffffff' : '#000000' }}
              >
                UI Theme
              </Label>
            </div>
            <ThemeSwitcher
              value={homepageTheme}
              onValueChange={setHomepageTheme}
              useStudioTheme={true}
            />
          </div>

          {/* Studio Theme Setting */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Settings 
                className="h-5 w-5"
                style={{ color: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)' }}
              />
              <Label 
                className="text-base font-normal"
                style={{ color: studioMode === 'dark' ? '#ffffff' : '#000000' }}
              >
                Studio Theme
              </Label>
            </div>
            <ThemeSwitcher
              value={studioTheme}
              onValueChange={setStudioTheme}
              useStudioTheme={true}
            />
          </div>

          {/* Assistant Model Setting */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Brain 
                className="h-5 w-5"
                style={{ color: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)' }}
              />
              <Label 
                htmlFor="assistant-model" 
                className="text-base font-normal"
                style={{ color: studioMode === 'dark' ? '#ffffff' : '#000000' }}
              >
                Assistant Model
              </Label>
            </div>
            <Select value={selectedAssistantModel} onValueChange={handleAssistantModelChange}>
              <SelectTrigger 
                id="assistant-model" 
                className="w-[200px]"
                style={{
                  backgroundColor: studioMode === 'dark' ? '#2a2a2a' : '#f8fafc',
                  borderColor: studioMode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                  color: studioMode === 'dark' ? '#ffffff' : '#000000'
                }}
              >
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