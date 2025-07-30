// Audio generation model configurations
export interface AudioModelInfo {
  duration: string;
  description: string;
  maxBars?: number;
  capabilities?: string[];
}

export const AUDIO_MODEL_CONFIG: Record<string, AudioModelInfo> = {
  "vertex-ai/lyria2": {
    duration: "30s",
    description: "Lyria 2",
    maxBars: 8,
    capabilities: ["melody", "harmony", "rhythm"]
  },
  "stability/stable-audio-2": {
    duration: "120s", 
    description: "Stable Audio 2",
    maxBars: 16,
    capabilities: ["melody", "harmony", "rhythm", "long-form"]
  }
};

// Helper function to get model information with fallback
export const getAudioModelInfo = (modelId: string): AudioModelInfo => {
  return AUDIO_MODEL_CONFIG[modelId] || {
    duration: "30s",
    description: modelId,
    maxBars: 8,
    capabilities: ["melody"]
  };
};

// Get available model IDs
export const getAvailableAudioModels = (): string[] => {
  return Object.keys(AUDIO_MODEL_CONFIG);
};