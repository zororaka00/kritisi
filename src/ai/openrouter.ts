import fetch from 'node-fetch';
import { getOpenRouterConfig, ProviderConfig } from '../helper';
import { FetchLike, OpenAICompatible } from './compatible';

export type { AIResponse } from './compatible';

export class OpenRouter extends OpenAICompatible {
  constructor(config: ProviderConfig = getOpenRouterConfig(), fetchImpl: FetchLike = fetch as FetchLike) {
    super('OpenRouter', config, fetchImpl);
  }
}
