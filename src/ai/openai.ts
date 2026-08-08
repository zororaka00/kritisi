import fetch from 'node-fetch';
import { getProviderConfig } from '../helper';
import { FetchLike, OpenAICompatible } from './compatible';

export class OpenAI extends OpenAICompatible {
  constructor(fetchImpl: FetchLike = fetch as FetchLike) {
    super('OpenAI', getProviderConfig('openai'), fetchImpl);
  }
}
