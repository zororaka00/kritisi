import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import PDFDocument = require('pdfkit');

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

/**
 * Models often wrap JSON in markdown fences or add brief prose. Normalize to a JSON object string.
 */
export function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i);
  if (fenced) return fenced[1].trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1).trim();

  return trimmed;
}

export function parseSecurityReport(content: string): SecurityReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(content));
  } catch {
    throw new Error('AI returned an invalid security report.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('AI returned an invalid security report.');
  const report = parsed as Record<string, unknown>;
  for (const category of ['high', 'medium', 'low']) {
    if (!Array.isArray(report[category])) throw new Error('AI returned an invalid security report.');
    for (const issue of report[category]) {
      if (!issue || typeof issue !== 'object' || Array.isArray(issue)) throw new Error('AI returned an invalid security report.');
      const item = issue as Record<string, unknown>;
      if (typeof item.issue !== 'string' || typeof item.suggestion !== 'string' || typeof item.code_highlight !== 'string') {
        throw new Error('AI returned an invalid security report.');
      }
    }
  }
  return report as unknown as SecurityReport;
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
    model: 'openai/gpt-4o-mini',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  },
  openai: {
    model: 'gpt-5.2',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
  },
  claude: {
    model: 'claude-opus-4-6',
    baseUrl: 'https://api.anthropic.com/v1/messages',
  },
  deepseek: {
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/chat/completions',
  },
};

const ENV: Record<ProviderName, { apiKey: string[]; model: string[]; baseUrl: string[] }> = {
  openrouter: {
    apiKey: ['OPENROUTER_API_KEY'],
    model: ['OPENROUTER_MODEL'],
    baseUrl: ['OPENROUTER_BASE_URL'],
  },
  openai: {
    apiKey: ['OPENAI_API_KEY'],
    model: ['OPENAI_MODEL'],
    baseUrl: ['OPENAI_BASE_URL'],
  },
  claude: {
    apiKey: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    model: ['ANTHROPIC_MODEL', 'CLAUDE_MODEL'],
    baseUrl: ['ANTHROPIC_BASE_URL', 'CLAUDE_BASE_URL'],
  },
  deepseek: {
    apiKey: ['DEEPSEEK_API_KEY'],
    model: ['DEEPSEEK_MODEL'],
    baseUrl: ['DEEPSEEK_BASE_URL'],
  },
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
    throw new Error(`Invalid Kritisi config file: ${CONFIG_PATH}`);
  }
}

function writeConfig(config: StoredConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(CONFIG_PATH, 0o600);
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
    baseUrl: envValue(env.baseUrl) || nonEmpty(stored.baseUrl) || DEFAULTS[provider].baseUrl,
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

export function generatePDF(result: SecurityReport, filePath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const doc = new PDFDocument({ margin: 50 });
      const output = fs.createWriteStream(filePath);
      output.on('error', () => reject(false));
      doc.pipe(output);
      doc.fontSize(18).fillColor('#333').text('Solidity Code Analysis Report', { align: 'center' }).moveDown();
      doc.fontSize(14).fillColor('#000').text('Analysis Results:', { underline: true }).moveDown(0.5);

      const writeCategory = (title: string, color: string, issues: SecurityIssue[]): void => {
        doc.fontSize(16).fillColor(color).text(title, { underline: true }).moveDown(0.5);
        if (issues.length === 0) {
          doc.fontSize(12).fillColor('#333').text('No issues found.', { indent: 20 });
        } else {
          issues.forEach((issue, index) => {
            doc.fontSize(12).fillColor('#000').text(`Issue ${index + 1}: ${issue.issue}`, { indent: 20 }).moveDown(0.5);
            doc.fontSize(12).fillColor('#000').text(`Suggestion: ${issue.suggestion}`, { indent: 40 }).moveDown(0.5);
            doc.fontSize(10).fillColor('#555').font('Courier')
              .text(`Code Highlight:\n${issue.code_highlight}`, { indent: 60, lineGap: 2 })
              .font('Helvetica').moveDown(1);
          });
        }
        doc.moveDown(1);
      };

      writeCategory('High Severity Issues', '#FF0000', result.high);
      writeCategory('Medium Severity Issues', '#FFA500', result.medium);
      writeCategory('Low Severity Issues', '#008000', result.low);
      const addFooter = (): void => {
        doc.fontSize(10).fillColor('#888').text('Generated by Kritisi', { align: 'center' });
      };
      doc.on('pageAdded', addFooter);
      addFooter();
      doc.end();
      output.on('finish', () => resolve(true));
    } catch {
      reject(false);
    }
  });
}
