import React, { useState } from 'react';
import { Music, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { AudioTrackRead } from '../../../../platform/types/dto/track_models/audio_track';
import GenerationPromptControl from '../../shared/GenerationPromptControl';
import AudioPlayer from '../../shared/AudioPlayer';
import AudioGenerationModelMenu from '../../ai-assistant/AudioGenerationModelMenu';
import KeySelectorMenu from '../../ai-assistant/KeySelectorMenu';
import BPMSelector from '../../ai-assistant/BPMSelector';
import BarSelector from '../../ai-assistant/BarSelector';
import { getAudioModelInfo } from '../../../config/audioModels';

interface AudioGenerationPanelProps {
  // Generation state
  generatePrompt: string;
  setGeneratePrompt: (prompt: string) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  bpm: number;
  setBpm: (bpm: number) => void;
  keySignature: string;
  setKeySignature: (key: string) => void;
  bars: number;
  setBars: (bars: number) => void;
  duration: number;
  
  // Generation status
  isGenerating: boolean;
  generationStatus: string;
  generationError: string | null;
  generatedTrack: AudioTrackRead | null;
  generatedAudioBlob: Blob | null;
  
  // Actions
  onGenerateAudio: () => void;
  onCancelGeneration: () => void;
  onUseAudio: () => void;
  onResetGeneration: () => void;
  
  // UI props
  useUiMode?: boolean;
}

const AudioGenerationPanel: React.FC<AudioGenerationPanelProps> = ({
  generatePrompt,
  setGeneratePrompt,
  selectedModel,
  setSelectedModel,
  bpm,
  setBpm,
  keySignature,
  setKeySignature,
  bars,
  setBars,
  duration,
  isGenerating,
  generationStatus,
  generationError,
  generatedTrack,
  generatedAudioBlob,
  onGenerateAudio,
  onCancelGeneration,
  onUseAudio,
  onResetGeneration,
  useUiMode = false
}) => {
  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header and Tips - Top Section */}
      <div className="flex-shrink-0 space-y-6 mb-6">
        <div className="text-center">
          <Music className="w-12 h-12 mx-auto mb-3 text-primary" />
          <h3 className="text-lg font-semibold mb-2">Generate Audio</h3>
          <p className="text-sm text-muted-foreground">
            Describe the audio you want to generate and let AI create it for you
          </p>
        </div>

        {/* Generation Status or Help Text */}
        {generatedTrack && generatedAudioBlob ? (
          <div className="bg-muted/50 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{generatedTrack.name}</span>
            </div>
            
            {/* AudioPlayer */}
            <AudioPlayer
              audioBlob={generatedAudioBlob}
              className="w-full"
            />
            
            {/* Action Buttons */}
            <div className="flex justify-center gap-3">
              {!useUiMode && (
                <Button
                  onClick={onUseAudio}
                  className="min-w-24"
                >
                  Use Audio
                </Button>
              )}
              <Button
                onClick={onResetGeneration}
                variant="outline"
                className="min-w-24"
              >
                Reset
              </Button>
            </div>
          </div>
        ) : (isGenerating || generationStatus) ? (
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                {isGenerating ? 'Generating...' : 'Status'}
              </span>
              {isGenerating && (
                <Button
                  onClick={onCancelGeneration}
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isGenerating && <Loader2 className="h-4 w-4 animate-spin" />}
              <span className="text-sm text-muted-foreground">
                {generationStatus}
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-muted/30 rounded-lg p-4">
            <h4 className="font-medium mb-2">Tips for better results:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Be specific about the instrument (e.g., "acoustic guitar", "piano")</li>
              <li>• Mention the style or genre if desired</li>
              <li>• Specify key signature for musical coherence</li>
              <li>• Keep descriptions clear and concise</li>
              {getAudioModelInfo(selectedModel).capabilities?.includes('long-form') && (
                <li>• {getAudioModelInfo(selectedModel).description} supports longer durations and precise BPM control</li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Flexible space to push textarea to bottom */}
      <div className="flex-grow"></div>

      {/* Textarea and Controls - Bottom Section */}
      <div className="flex-shrink-0 space-y-4">
        <GenerationPromptControl
          prompt={generatePrompt}
          onPromptChange={setGeneratePrompt}
          onGenerate={onGenerateAudio}
          isGenerating={isGenerating}
          useStudioTheme={!useUiMode}
          placeholder="Describe the audio you want to generate (e.g., 'acoustic guitar melody in C major', 'piano chord progression', 'violin solo')"
          maxLength={500}
          showRandomButton={false}
          showSelect={false}
          submitButtonAriaLabel="Generate Audio"
          textareaTopPadding={8}
          textareaTopLeftComponent={
            <div className="flex gap-2">
              <KeySelectorMenu
                triggerLabel={keySignature}
                onSelect={setKeySignature}
                selectedKey={keySignature}
              />
              <BPMSelector
                triggerLabel={`${bpm} BPM`}
                onSelect={setBpm}
                selectedBPM={bpm}
                min={60}
                max={200}
              />
              <BarSelector
                triggerLabel={`${bars} bars`}
                onSelect={setBars}
                selectedBars={bars}
                min={1}
                max={getAudioModelInfo(selectedModel).maxBars || 8}
              />
            </div>
          }
          textareaBottomLeftComponent={
            <AudioGenerationModelMenu
              triggerLabel={selectedModel === 'vertex-ai/lyria2' ? 'Lyria 2 (Vertex AI)' : 'Stable Audio 2.0'}
              onSelect={setSelectedModel}
              models={['vertex-ai/lyria2', 'stability/stable-audio-2']}
              selectedModel={selectedModel}
            />
          }
        />

        {/* Generation Error */}
        {generationError && (
          <Alert variant="destructive">
            {generationError}
          </Alert>
        )}
      </div>
    </div>
  );
};

export default AudioGenerationPanel;