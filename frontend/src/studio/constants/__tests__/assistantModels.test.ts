import { describe, expect, it } from 'vitest';
import { AVAILABLE_MODELS, getModelCreditCost, SONG_GENERATION_MODEL } from '../assistantModels';

describe('assistant model wire contract', () => {
  it('keeps the specified order and credit costs', () => {
    expect(AVAILABLE_MODELS.map(name => [name, getModelCreditCost(name)])).toEqual([
      ['Gemini 4 Carbon', 80],
      ['Gemini 3.8 Flash', 33],
      ['DeepSeek V4 Pro', 36],
      ['DeepSeek V4.1 Flash', 12],
      ['Claude Sonnet 5.5', 80],
      ['Claude Opus 5.5', 160],
      ['Claude Haiku 5.5', 4],
      ['GPT-6.2 Sol', 80],
      ['GPT-6.1 Terra', 40],
      ['GPT-6.2 Astra', 320],
      ['GPT-6 Luna', 4],
      ['Llama 4 Maverick', 14],
      ['Llama 4 Scout', 4],
    ]);
    expect(SONG_GENERATION_MODEL).toBe('Claude Sonnet 5.5');
  });

  it.each(['unknown', 'Claude 4 Sonnet', '', 'toString', '__proto__'])('rejects unknown model %j', name => {
    expect(() => getModelCreditCost(name)).toThrow('Unknown assistant model:');
  });
});
