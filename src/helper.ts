import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { merge } from 'sol-merger';
import { version as currentVersion } from '../package.json';

export type ProviderName = 'openrouter' | 'openai' | 'claude' | 'deepseek';

export interface ProviderConfig {
  apiKey: string | null;
  model: string;
  baseUrl: string;
}

export interface SecurityIssue {
  issue: string;
  suggestion: string;
  code_highlight: string;
}

export interface SecurityReport {
  high: SecurityIssue[];
  medium: SecurityIssue[];
  low: SecurityIssue[];
}

export interface PDFMetadata {
  provider?: string;
  model?: string;
  version?: string;
  source?: string;
  generatedAt?: Date;
}

export interface RequestOptions {
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
}

const INVALID_REPORT = 'AI returned an invalid security report.';

export const KRITISI_VERSION = currentVersion;

export const NATSPEC_PROMPT =
  'You are an AI designed to add NatSpec documentation to Solidity code. For each function, include clear descriptions for the purpose of the function, the parameters, and the return values using proper NatSpec tags. Respond only with the modified Solidity code in a valid Solidity format. Do not include code block markers or explanations.';

export const SECURITY_PROMPT =
  'You are an AI designed to analyze Solidity code for business-logic issues and security vulnerabilities. Categorize findings as High, Medium, or Low. Respond with only a single JSON object (no markdown fences, no prose) with exactly these arrays: high, medium, low. Each item must contain issue, suggestion, and code_highlight strings. Use an empty array when no issues are found.';

export function looksLikeSolidity(content: string): boolean {
  return /\bpragma\s+solidity\b|\b(?:abstract\s+)?contract\s+\w+|\b(?:library|interface)\s+\w+/.test(content);
}

export async function mergeSources(filePath: string): Promise<string> {
  return merge(filePath);
}

export function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```[a-zA-Z0-9_+-]*\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : trimmed).trim();
}

function matchingBraceEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * Models often wrap JSON in markdown fences or add brief prose. Normalize to a JSON object string.
 * Candidate braces are scanned in order so prose containing braces does not break extraction.
 */
export function extractJsonObject(content: string): string {
  const candidate = stripCodeFence(content);
  let fallback: string | null = null;
  let start = candidate.indexOf('{');
  while (start !== -1) {
    const end = matchingBraceEnd(candidate, start);
    if (end !== -1) {
      const slice = candidate.slice(start, end + 1);
      try {
        JSON.parse(slice);
        return slice;
      } catch {
        if (fallback === null) fallback = slice;
      }
    }
    start = candidate.indexOf('{', start + 1);
  }
  return fallback ?? candidate;
}

export function parseSecurityReport(content: string): SecurityReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(content));
  } catch {
    throw new Error(INVALID_REPORT);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(INVALID_REPORT);
  const report = parsed as Record<string, unknown>;
  const normalized: SecurityReport = { high: [], medium: [], low: [] };
  for (const category of ['high', 'medium', 'low'] as const) {
    const value = report[category];
    if (value === undefined || value === null) continue;
    if (!Array.isArray(value)) throw new Error(INVALID_REPORT);
    for (const issue of value) {
      if (!issue || typeof issue !== 'object' || Array.isArray(issue)) throw new Error(INVALID_REPORT);
      const item = issue as Record<string, unknown>;
      if (typeof item.issue !== 'string' || typeof item.suggestion !== 'string' || typeof item.code_highlight !== 'string') {
        throw new Error(INVALID_REPORT);
      }
    }
    normalized[category] = value as SecurityIssue[];
  }
  return normalized;
}

interface StoredProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface StoredConfig extends StoredProviderConfig {
  providers?: Partial<Record<ProviderName, StoredProviderConfig>>;
}

const DEFAULTS: Record<ProviderName, Omit<ProviderConfig, 'apiKey'>> = {
  openrouter: {
    model: 'openai/gpt-5.6-sol',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions'
  },
  openai: {
    model: 'gpt-5.6-sol',
    baseUrl: 'https://api.openai.com/v1/chat/completions'
  },
  claude: {
    model: 'claude-opus-5',
    baseUrl: 'https://api.anthropic.com/v1/messages'
  },
  deepseek: {
    model: 'deepseek-v4-pro',
    baseUrl: 'https://api.deepseek.com/chat/completions'
  }
};

const ENV: Record<ProviderName, { apiKey: string[]; model: string[]; baseUrl: string[] }> = {
  openrouter: {
    apiKey: ['OPENROUTER_API_KEY'],
    model: ['OPENROUTER_MODEL'],
    baseUrl: ['OPENROUTER_BASE_URL']
  },
  openai: {
    apiKey: ['OPENAI_API_KEY'],
    model: ['OPENAI_MODEL'],
    baseUrl: ['OPENAI_BASE_URL']
  },
  claude: {
    apiKey: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    model: ['ANTHROPIC_MODEL', 'CLAUDE_MODEL'],
    baseUrl: ['ANTHROPIC_BASE_URL', 'CLAUDE_BASE_URL']
  },
  deepseek: {
    apiKey: ['DEEPSEEK_API_KEY'],
    model: ['DEEPSEEK_MODEL'],
    baseUrl: ['DEEPSEEK_BASE_URL']
  }
};

const configRoot = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
export const CONFIG_PATH = process.env.KRITISI_CONFIG_PATH || path.join(configRoot, 'kritisi', 'config.json');

export function normalizeProvider(service?: string): ProviderName {
  const value = service?.trim().toLowerCase() || 'openrouter';
  if (value === 'openrouter' || value === 'openai' || value === 'claude' || value === 'deepseek') return value;
  if (value === 'anthropic') return 'claude';
  throw new Error(`Unknown provider '${service}'. Choose openrouter, openai, claude, or deepseek.`);
}

function readConfig(): StoredConfig {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    const value: unknown = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value as StoredConfig;
  } catch {
    throw new Error(`Invalid Kritisi config file: ${CONFIG_PATH}. Fix it or remove it with kritisi config --reset --yes.`);
  }
}

function writeConfig(config: StoredConfig): void {
  const directory = path.dirname(CONFIG_PATH);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${CONFIG_PATH}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
    fs.chmodSync(temporaryPath, 0o600);
    fs.renameSync(temporaryPath, CONFIG_PATH);
    fs.chmodSync(CONFIG_PATH, 0o600);
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // The temporary file may already be gone; the original error is what matters.
    }
    throw error;
  }
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_PATH);
}

export function clearConfig(): boolean {
  if (!fs.existsSync(CONFIG_PATH)) return false;
  fs.rmSync(CONFIG_PATH);
  return true;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

function envValue(names: string[]): string | undefined {
  for (const name of names) {
    const value = nonEmpty(process.env[name]);
    if (value) return value;
  }
  return undefined;
}

function envInt(names: string[], fallback: number, minimum: number): number {
  for (const name of names) {
    const raw = nonEmpty(process.env[name]);
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < minimum) throw new Error(`Invalid ${name}: expected an integer >= ${minimum}.`);
    return value;
  }
  return fallback;
}

export function getRequestOptions(): RequestOptions {
  return {
    timeoutMs: envInt(['KRITISI_TIMEOUT_MS'], 120_000, 1),
    retries: envInt(['KRITISI_RETRIES'], 2, 0),
    retryDelayMs: envInt(['KRITISI_RETRY_DELAY_MS'], 500, 0)
  };
}

export function getClaudeMaxTokens(): number {
  return envInt(['ANTHROPIC_MAX_TOKENS', 'CLAUDE_MAX_TOKENS'], 8192, 1);
}

function storedProviderConfig(config: StoredConfig, provider: ProviderName): StoredProviderConfig {
  if (provider === 'openrouter') return config;
  return config.providers?.[provider] || {};
}

export function getProviderConfig(provider: ProviderName = 'openrouter'): ProviderConfig {
  const config = readConfig();
  const stored = storedProviderConfig(config, provider);
  const env = ENV[provider];
  return {
    apiKey: envValue(env.apiKey) || nonEmpty(stored.apiKey) || null,
    model: envValue(env.model) || nonEmpty(stored.model) || DEFAULTS[provider].model,
    baseUrl: envValue(env.baseUrl) || nonEmpty(stored.baseUrl) || DEFAULTS[provider].baseUrl
  };
}

export function loadKey(provider: ProviderName = 'openrouter'): string | null {
  return getProviderConfig(provider).apiKey;
}

export function saveKey(newApiKey: string, provider: ProviderName = 'openrouter'): void {
  const apiKey = newApiKey.trim();
  if (!apiKey) throw new Error(`${provider} API key cannot be empty.`);
  const config = readConfig();
  if (provider === 'openrouter') writeConfig({ ...config, apiKey });
  else writeConfig({ ...config, providers: { ...config.providers, [provider]: { ...config.providers?.[provider], apiKey } } });
}

export function saveModel(newModel: string, provider: ProviderName = 'openrouter'): void {
  const model = newModel.trim();
  if (!model) throw new Error(`${provider} model cannot be empty.`);
  const config = readConfig();
  if (provider === 'openrouter') writeConfig({ ...config, model });
  else writeConfig({ ...config, providers: { ...config.providers, [provider]: { ...config.providers?.[provider], model } } });
}

export function saveBaseUrl(newBaseUrl: string, provider: ProviderName = 'openrouter'): void {
  const baseUrl = newBaseUrl.trim();
  if (!baseUrl) throw new Error(`${provider} base URL cannot be empty.`);
  const config = readConfig();
  if (provider === 'openrouter') writeConfig({ ...config, baseUrl });
  else writeConfig({ ...config, providers: { ...config.providers, [provider]: { ...config.providers?.[provider], baseUrl } } });
}

export function getOpenRouterConfig(): ProviderConfig {
  return getProviderConfig('openrouter');
}

export function saveFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf8');
}

export function saveFileAtomic(filePath: string, content: string): void {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, content, 'utf8');
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // Keep the original error from the failed write or rename.
    }
    throw error;
  }
}

export { generatePDF } from './pdf';
