import fetch, { RequestInit } from 'node-fetch';
import { getRequestOptions, ProviderConfig, RequestOptions } from '../helper';

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

export function redactSecrets(message: string, apiKey: string | null): string {
  const secret = apiKey?.trim();
  const redacted = secret ? message.split(secret).join('[redacted]') : message;
  return redacted.slice(0, 300);
}

function errorMessage(value: unknown, provider: string, apiKey: string | null): string {
  const message =
    isRecord(value) && isRecord(value.error) && typeof value.error.message === 'string' ? value.error.message : `Unknown ${provider} error`;
  return redactSecrets(message, apiKey);
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

async function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchWithRetry(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  provider: string,
  options: RequestOptions
): Promise<FetchResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, init);
      if ((response.status === 429 || response.status >= 500) && attempt < options.retries) {
        try {
          await response.json();
        } catch {
          // Drain the discarded body when possible; the retry decision does not depend on it.
        }
        await delay(options.retryDelayMs * 2 ** attempt);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < options.retries) {
        await delay(options.retryDelayMs * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${provider} request failed`);
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

    const requestOptions = getRequestOptions();
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: promptText },
          { role: 'user', content: codeSolidity }
        ]
      }),
      timeout: requestOptions.timeoutMs
    };

    let response: FetchResponse;
    try {
      response = await fetchWithRetry(this.fetchImpl, this.config.baseUrl, init, this.provider, requestOptions);
    } catch (error) {
      if ((error as { type?: string }).type === 'request-timeout') {
        throw new Error(`${this.provider} request timed out after ${requestOptions.timeoutMs}ms.`);
      }
      const message = error instanceof Error ? error.message : 'request failed';
      throw new Error(`${this.provider} request failed: ${redactSecrets(message, this.config.apiKey)}`);
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
        total_tokens: numberOrZero(usage.total_tokens)
      },
      content
    };
  }
}
