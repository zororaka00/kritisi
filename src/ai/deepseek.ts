import fetch from 'node-fetch';
import { getProviderConfig, ProviderConfig } from '../helper';
import { FetchLike, OpenAICompatible } from './compatible';

export class DeepSeek extends OpenAICompatible {
  constructor(configOrFetch?: ProviderConfig | FetchLike, fetchImpl: FetchLike = fetch as FetchLike) {
    if (typeof configOrFetch === 'function') {
      super('DeepSeek', getProviderConfig('deepseek'), configOrFetch);
    } else {
      super('DeepSeek', configOrFetch ?? getProviderConfig('deepseek'), fetchImpl);
    }
  }
}
