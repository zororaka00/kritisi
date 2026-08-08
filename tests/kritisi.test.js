/** @jest-environment node */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

jest.mock('node-fetch', () => jest.fn());

let fetch = require('node-fetch');
const CLI_PATH = path.join(__dirname, '..', 'dist', 'index.js');

const CLI_TEST_TIMEOUT_MS = 30_000;
const CLI_KILL_MS = 25_000;

function runCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, OPENROUTER_API_KEY: '', ...env },
      // Avoid leaving an open stdin pipe that can keep Node alive on some platforms.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const killer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`CLI timed out after ${CLI_KILL_MS}ms: node ${CLI_PATH} ${args.join(' ')}`));
    }, CLI_KILL_MS);
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('close', (code) => {
      clearTimeout(killer);
      resolve({ code, stdout, stderr });
    });
    child.on('error', (error) => {
      clearTimeout(killer);
      reject(error);
    });
  });
}

describe('Kritisi CLI', () => {
  test('help lists commands and available providers', async () => {
    const result = await runCli(['--help']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('setkey');
    expect(result.stdout).toContain('setmodel');
    expect(result.stdout).toContain('natspec');
    expect(result.stdout).toContain('security');
    expect(result.stdout).toContain('merger');
    expect(result.stdout).toContain('OpenRouter');
    expect(result.stdout).toContain('OpenAI');
    expect(result.stdout).toContain('Claude');
    expect(result.stdout).toContain('DeepSeek');
  }, CLI_TEST_TIMEOUT_MS);

  test('--service option documents provider selection', async () => {
    const result = await runCli(['security', '--help']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('--service');
    expect(result.stdout).toContain('openrouter');
    expect(result.stdout).toContain('openai');
    expect(result.stdout).toContain('claude');
    expect(result.stdout).toContain('deepseek');
  }, CLI_TEST_TIMEOUT_MS);

  test('merger without a path exits cleanly with a useful error', async () => {
    const result = await runCli(['merger']);

    expect(result.code).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('--path');
  }, CLI_TEST_TIMEOUT_MS);

  test('version and help commands exit successfully', async () => {
    await expect(runCli(['help'])).resolves.toMatchObject({ code: 0 });
    await expect(runCli(['--version'])).resolves.toMatchObject({ code: 0 });
  }, CLI_TEST_TIMEOUT_MS);
});

describe('OpenRouter configuration', () => {
  const configPath = path.join(os.tmpdir(), `kritisi-test-${process.pid}.json`);
  const originalConfigPath = process.env.KRITISI_CONFIG_PATH;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const originalModel = process.env.OPENROUTER_MODEL;
  const originalBaseUrl = process.env.OPENROUTER_BASE_URL;

  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_BASE_URL;
    process.env.KRITISI_CONFIG_PATH = configPath;
    jest.resetModules();
  });

  afterAll(() => {
    if (originalConfigPath === undefined) delete process.env.KRITISI_CONFIG_PATH;
    else process.env.KRITISI_CONFIG_PATH = originalConfigPath;
    if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = originalModel;
    if (originalBaseUrl === undefined) delete process.env.OPENROUTER_BASE_URL;
    else process.env.OPENROUTER_BASE_URL = originalBaseUrl;
    if (fs.existsSync(configPath)) fs.rmSync(configPath);
  });

  test('saves and loads user-local OpenRouter settings', () => {
    const helper = require('../dist/helper');

    helper.saveKey('test-only-key');
    helper.saveModel('test/model');
    helper.saveBaseUrl('https://example.test/v1/chat/completions');

    expect(helper.loadKey()).toBe('test-only-key');
    expect(helper.getOpenRouterConfig()).toMatchObject({
      model: 'test/model',
      baseUrl: 'https://example.test/v1/chat/completions',
    });
    expect(fs.existsSync(configPath)).toBe(true);
  });

  test('environment variables override user-local settings', () => {
    const helper = require('../dist/helper');
    helper.saveKey('local-only-key');
    helper.saveModel('local/model');
    helper.saveBaseUrl('https://local.test/v1/chat/completions');
    process.env.OPENROUTER_API_KEY = 'environment-only-key';
    process.env.OPENROUTER_MODEL = 'environment/model';
    process.env.OPENROUTER_BASE_URL = 'https://environment.test/v1/chat/completions';

    expect(helper.getOpenRouterConfig()).toEqual({
      apiKey: 'environment-only-key',
      model: 'environment/model',
      baseUrl: 'https://environment.test/v1/chat/completions',
    });
  });
});

describe('parseSecurityReport', () => {
  test('accepts plain JSON and markdown-fenced JSON', () => {
    const helper = require('../dist/helper');
    const report = {
      high: [],
      medium: [{ issue: 'a', suggestion: 'b', code_highlight: 'c' }],
      low: [],
    };
    const plain = JSON.stringify(report);
    expect(helper.parseSecurityReport(plain)).toEqual(report);
    expect(helper.parseSecurityReport(`\`\`\`json\n${plain}\n\`\`\``)).toEqual(report);
    expect(helper.parseSecurityReport(`Here is the report:\n\`\`\`json\n${plain}\n\`\`\``)).toEqual(report);
  });

  test('rejects invalid shapes', () => {
    const helper = require('../dist/helper');
    expect(() => helper.parseSecurityReport('not json')).toThrow('invalid security report');
    expect(() => helper.parseSecurityReport('{"high":[],"medium":[],"low":[{}]}')).toThrow('invalid security report');
  });
});

describe('OpenRouter provider', () => {
  beforeEach(() => {
    fetch.mockReset();
    process.env.OPENROUTER_API_KEY = 'test-only-key';
    process.env.OPENROUTER_MODEL = 'test/model';
    process.env.OPENROUTER_BASE_URL = 'https://openrouter.test/api/v1/chat/completions';
    jest.resetModules();
    fetch = require('node-fetch');
  });

  test('returns validated chat completion content and usage', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'updated solidity' } }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      }),
    });
    const { OpenRouter } = require('../dist/ai/openrouter');

    await expect(new OpenRouter().run('system prompt', 'contract C {}')).resolves.toEqual({
      model: 'test/model',
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      content: 'updated solidity',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://openrouter.test/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-only-key' }),
      }),
    );
  });

  test('rejects HTTP errors without requiring a real network', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'unauthorized' } }),
    });
    const { OpenRouter } = require('../dist/ai/openrouter');

    await expect(new OpenRouter().run('prompt', 'code')).rejects.toThrow('OpenRouter HTTP 401: unauthorized');
  });

  test('rejects invalid response shapes', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
    });
    const { OpenRouter } = require('../dist/ai/openrouter');

    await expect(new OpenRouter().run('prompt', 'code')).rejects.toThrow('invalid response');
  });
});

module.exports = { runCli, CLI_PATH };
