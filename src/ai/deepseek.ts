import fetch from 'node-fetch';
import { getProviderConfig } from '../helper';
import { FetchLike, OpenAICompatible } from './compatible';

export class DeepSeek extends OpenAICompatible {
  constructor(fetchImpl: FetchLike = fetch as FetchLike) {
    super('DeepSeek', getProviderConfig('deepseek'), fetchImpl);
  }
}
