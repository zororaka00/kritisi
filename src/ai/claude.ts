import fetch, { RequestInit } from 'node-fetch';
import { getProviderConfig, ProviderConfig } from '../helper';
import { AIResponse, FetchLike } from './compatible';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function contentText(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.content) || value.content.length === 0) return null;
  const first = value.content[0];
  return isRecord(first) && typeof first.text === 'string' ? first.text : null;
}

export class Claude {
  private readonly config: ProviderConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: ProviderConfig = getProviderConfig('claude'), fetchImpl: FetchLike = fetch as FetchLike) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async run(promptText: string, codeSolidity: string): Promise<AIResponse> {
    if (!this.config.apiKey) throw new Error('No Claude API key found.');

    let response;
    try {
      const init: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 4096,
          system: promptText,
          messages: [{ role: 'user', content: codeSolidity }],
        }),
      };
      response = await this.fetchImpl(this.config.baseUrl, init);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'request failed';
      throw new Error(`Claude request failed: ${message.slice(0, 300)}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Claude HTTP ${response.status}: response was not valid JSON`);
    }
    if (!response.ok) {
      const message = isRecord(data) && isRecord(data.error) && typeof data.error.message === 'string'
        ? data.error.message
        : 'Unknown Claude error';
      throw new Error(`Claude HTTP ${response.status}: ${message.replace(this.config.apiKey, '[redacted]').slice(0, 300)}`);
    }

    const content = contentText(data);
    if (content === null) throw new Error('Claude returned an invalid response shape.');
    const usage = isRecord(data) && isRecord(data.usage) ? data.usage : {};
    const promptTokens = numberOrZero(usage.input_tokens);
    const completionTokens = numberOrZero(usage.output_tokens);
    return {
      model: this.config.model,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      content,
    };
  }
}
