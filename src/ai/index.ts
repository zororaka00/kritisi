import { normalizeProvider, ProviderName } from '../helper';
import { Claude } from './claude';
import { DeepSeek } from './deepseek';
import { OpenAI } from './openai';
import { OpenRouter } from './openrouter';

export { Claude, DeepSeek, OpenAI, OpenRouter };
export type { AIResponse, FetchLike } from './compatible';
export type { ProviderName } from '../helper';

export type AIProvider = OpenRouter | OpenAI | Claude | DeepSeek;

export function createProvider(service?: string): AIProvider {
  switch (normalizeProvider(service)) {
    case 'openai': return new OpenAI();
    case 'claude': return new Claude();
    case 'deepseek': return new DeepSeek();
    default: return new OpenRouter();
  }
}
