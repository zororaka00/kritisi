import fetch from 'node-fetch';
import { getProviderConfig, ProviderConfig } from '../helper';
import { FetchLike, OpenAICompatible } from './compatible';

export class OpenAI extends OpenAICompatible {
  constructor(configOrFetch?: ProviderConfig | FetchLike, fetchImpl: FetchLike = fetch as FetchLike) {
    if (typeof configOrFetch === 'function') {
      super('OpenAI', getProviderConfig('openai'), configOrFetch);
    } else {
      super('OpenAI', configOrFetch ?? getProviderConfig('openai'), fetchImpl);
    }
  }
}
