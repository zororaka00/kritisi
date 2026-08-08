import fetch, { RequestInit } from 'node-fetch';
import { ProviderConfig } from '../helper';

export interface AIResponse {
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  content: string;
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<FetchResponse>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(value: unknown, provider: string, apiKey: string | null): string {
  const message = isRecord(value) && isRecord(value.error) && typeof value.error.message === 'string'
    ? value.error.message
    : `Unknown ${provider} error`;
  return message.replace(apiKey || '\0', '[redacted]').slice(0, 300);
}

function completionContent(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length === 0) return null;
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== 'string') return null;
  return choice.message.content;
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export class OpenAICompatible {
  private readonly config: ProviderConfig;
  private readonly fetchImpl: FetchLike;
  private readonly provider: string;

  constructor(provider: string, config: ProviderConfig, fetchImpl: FetchLike = fetch as FetchLike) {
    this.provider = provider;
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async run(promptText: string, codeSolidity: string): Promise<AIResponse> {
    if (!this.config.apiKey) throw new Error(`No ${this.provider} API key found.`);

    let response: FetchResponse;
    try {
      response = await this.fetchImpl(this.config.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: promptText },
            { role: 'user', content: codeSolidity },
          ],
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'request failed';
      throw new Error(`${this.provider} request failed: ${message.slice(0, 300)}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error(`${this.provider} HTTP ${response.status}: response was not valid JSON`);
    }
    if (!response.ok) throw new Error(`${this.provider} HTTP ${response.status}: ${errorMessage(data, this.provider, this.config.apiKey)}`);

    const content = completionContent(data);
    if (content === null) throw new Error(`${this.provider} returned an invalid response shape.`);
    const usage = isRecord(data) && isRecord(data.usage) ? data.usage : {};
    return {
      model: this.config.model,
      usage: {
        prompt_tokens: numberOrZero(usage.prompt_tokens),
        completion_tokens: numberOrZero(usage.completion_tokens),
        total_tokens: numberOrZero(usage.total_tokens),
      },
      content,
    };
  }
}
