// Display names are wire values shared with the backend. Order defines the chat default.
export const MODEL_CREDIT_COSTS = {
  "Gemini 4 Carbon": 80,
  "Gemini 3.8 Flash": 33,
  "DeepSeek V4 Pro": 36,
  "DeepSeek V4.1 Flash": 12,
  "Claude Sonnet 5.5": 80,
  "Claude Opus 5.5": 160,
  "Claude Haiku 5.5": 4,
  "GPT-6.2 Sol": 80,
  "GPT-6.1 Terra": 40,
  "GPT-6.2 Astra": 320,
  "GPT-6 Luna": 4,
  "Llama 4 Maverick": 14,
  "Llama 4 Scout": 4,
} as const;

export type AssistantModel = keyof typeof MODEL_CREDIT_COSTS;
export const AVAILABLE_MODELS = Object.keys(MODEL_CREDIT_COSTS) as AssistantModel[];
export const SONG_GENERATION_MODEL: AssistantModel = "Claude Sonnet 5.5";

export function getModelCreditCost(model: string): number {
  if (!Object.prototype.hasOwnProperty.call(MODEL_CREDIT_COSTS, model)) {
    throw new Error(`Unknown assistant model: ${model}`);
  }
  return MODEL_CREDIT_COSTS[model as AssistantModel];
}
