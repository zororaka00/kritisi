/** @jest-environment node */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

jest.mock('node-fetch', () => jest.fn());

let fetch = require('node-fetch');
const CLI_PATH = path.join(__dirname, '..', 'dist', 'index.js');
const CLI_TEST_TIMEOUT_MS = 30_000;
const CLI_KILL_MS = 25_000;
const CLI_CONFIG_PATH = path.join(os.tmpdir(), `kritisi-cli-${process.pid}.json`);

function runCli(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        OPENROUTER_API_KEY: '',
        OPENROUTER_MODEL: '',
        OPENROUTER_BASE_URL: '',
        OPENAI_API_KEY: '',
        ANTHROPIC_API_KEY: '',
        CLAUDE_API_KEY: '',
        DEEPSEEK_API_KEY: '',
        KRITISI_CONFIG_PATH: CLI_CONFIG_PATH,
        KRITISI_RETRY_DELAY_MS: '0',
        ...env
      },
      // Avoid leaving an open stdin pipe that can keep Node alive on some platforms.
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const killer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`CLI timed out after ${CLI_KILL_MS}ms: node ${CLI_PATH} ${args.join(' ')}`));
    }, CLI_KILL_MS);
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
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

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kritisi-test-'));
}

function writeFile(directory, name, content) {
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

const SAMPLE_SOL = '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ncontract Sample { uint256 public value; }\n';
const REPORT = {
  high: [{ issue: 'Reentrancy', suggestion: 'Use checks-effects-interactions.', code_highlight: 'target.call{value: amount}("")' }],
  medium: [],
  low: []
};

function chatReply(content, usage = { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }) {
  return JSON.stringify({ choices: [{ message: { content } }], usage });
}

async function startMockServer(respond) {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      requests.push({ url: request.url, body });
      const payload = respond(body, requests.length);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/v1/chat/completions`,
    requests,
    close: () =>
      new Promise((resolve) => {
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        server.close(resolve);
      })
  };
}

function providerEnv(server, extra = {}) {
  return {
    OPENROUTER_API_KEY: 'test-only-key',
    OPENROUTER_MODEL: 'test/model',
    OPENROUTER_BASE_URL: server.url,
    ...extra
  };
}

beforeAll(() => {
  fs.rmSync(CLI_CONFIG_PATH, { force: true });
});

afterAll(() => {
  fs.rmSync(CLI_CONFIG_PATH, { force: true });
});

describe('Kritisi CLI', () => {
  test(
    'help lists commands and available providers',
    async () => {
      const result = await runCli(['--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('setkey');
      expect(result.stdout).toContain('setmodel');
      expect(result.stdout).toContain('config');
      expect(result.stdout).toContain('natspec');
      expect(result.stdout).toContain('security');
      expect(result.stdout).toContain('merger');
      expect(result.stdout).toContain('OpenRouter');
      expect(result.stdout).toContain('OpenAI');
      expect(result.stdout).toContain('Claude');
      expect(result.stdout).toContain('DeepSeek');
    },
    CLI_TEST_TIMEOUT_MS
  );

  test(
    '--service option documents provider selection',
    async () => {
      const result = await runCli(['security', '--help']);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('--service');
      expect(result.stdout).toContain('openrouter');
      expect(result.stdout).toContain('openai');
      expect(result.stdout).toContain('claude');
      expect(result.stdout).toContain('deepseek');
      expect(result.stdout).toContain('--dry-run');
      expect(result.stdout).toContain('--out');
      expect(result.stdout).toContain('--force');
    },
    CLI_TEST_TIMEOUT_MS
  );

  test(
    'merger without a path exits cleanly with a useful error',
    async () => {
      const result = await runCli(['merger']);

      expect(result.code).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain('--path');
    },
    CLI_TEST_TIMEOUT_MS
  );

  test(
    'version and help commands exit successfully',
    async () => {
      await expect(runCli(['help'])).resolves.toMatchObject({ code: 0 });
      await expect(runCli(['--version'])).resolves.toMatchObject({ code: 0 });
    },
    CLI_TEST_TIMEOUT_MS
  );

  test(
    'unknown providers are rejected without stack traces',
    async () => {
      for (const command of ['setkey', 'setmodel']) {
        const result = await runCli([command, '--service', 'nope']);
        const output = `${result.stdout}${result.stderr}`;
        expect(result.code).toBe(1);
        expect(output).toContain("Unknown provider 'nope'");
        expect(output).not.toContain('at Command');
      }
    },
    CLI_TEST_TIMEOUT_MS
  );

  test(
    'non-Solidity inputs are rejected before any provider call',
    async () => {
      const directory = tempDir();
      const textPath = writeFile(directory, 'notes.txt', 'not solidity');
      for (const command of ['security', 'natspec', 'merger']) {
        const result = await runCli([command, '--path', textPath]);
        expect(result.code).toBe(1);
        expect(`${result.stdout}${result.stderr}`).toContain('Input must be a Solidity file');
      }
      expect(fs.readFileSync(textPath, 'utf8')).toBe('not solidity');
      expect(fs.existsSync(path.join(directory, 'notes.pdf'))).toBe(false);
      expect(fs.existsSync(path.join(directory, 'notes_merge.sol'))).toBe(false);
    },
    CLI_TEST_TIMEOUT_MS
  );
});

describe('config command', () => {
  test(
    'shows redacted settings and resets only with confirmation',
    async () => {
      const directory = tempDir();
      const configPath = path.join(directory, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ apiKey: 'secret-key', model: 'configured/model' }));

      let result = await runCli(['config'], { KRITISI_CONFIG_PATH: configPath });
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('apiKey=set');
      expect(result.stdout).toContain('configured/model');
      expect(`${result.stdout}${result.stderr}`).not.toContain('secret-key');

      result = await runCli(['config', '--reset'], { KRITISI_CONFIG_PATH: configPath });
      expect(result.code).toBe(1);
      expect(fs.existsSync(configPath)).toBe(true);

      result = await runCli(['config', '--reset', '--yes'], { KRITISI_CONFIG_PATH: configPath });
      expect(result.code).toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain('Removed');
      expect(fs.existsSync(configPath)).toBe(false);
    },
    CLI_TEST_TIMEOUT_MS
  );
});

describe('natspec command', () => {
  let server;

  afterEach(async () => {
    if (server) await server.close();
    server = null;
  });

  test(
    'strips fences, validates Solidity, and keeps a backup for in-place updates',
    async () => {
      server = await startMockServer(() => chatReply('```solidity\ncontract Documented { uint256 public x; }\n```'));
      const directory = tempDir();
      const filePath = writeFile(directory, 'Sample.sol', SAMPLE_SOL);

      const result = await runCli(['natspec', '--path', filePath, '--verbose'], providerEnv(server));

      expect(result.code).toBe(0);
      const updated = fs.readFileSync(filePath, 'utf8');
      expect(updated).toBe('contract Documented { uint256 public x; }');
      expect(updated).not.toContain('```');
      expect(fs.readFileSync(`${filePath}.bak`, 'utf8')).toBe(SAMPLE_SOL);
      expect(server.requests).toHaveLength(1);
      expect(server.requests[0].body).toContain('test/model');
      expect(result.stderr).toContain('total_tokens=3');
    },
    CLI_TEST_TIMEOUT_MS
  );

  test(
    'dry-run prints Solidity and writes nothing',
    async () => {
      server = await startMockServer(() => chatReply('contract DryRun { uint256 public y; }'));
      const directory = tempDir();
      const filePath = writeFile(directory, 'Sample.sol', SAMPLE_SOL);

      const result = await runCli(['natspec', '--path', filePath, '--dry-run'], providerEnv(server));

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('contract DryRun');
      expect(fs.readFileSync(filePath, 'utf8')).toBe(SAMPLE_SOL);
      expect(fs.existsSync(`${filePath}.bak`)).toBe(false);
    },
    CLI_TEST_TIMEOUT_MS
  );

  test(
    '--out writes elsewhere, refuses existing targets, and --force overrides',
    async () => {
      server = await startMockServer(() => chatReply('contract OutTarget { uint256 public z; }'));
      const directory = tempDir();
      const filePath = writeFile(directory, 'Sample.sol', SAMPLE_SOL);
      const outPath = path.join(directory, 'Documented.sol');

      let result = await runCli(['natspec', '--path', filePath, '--out', outPath], providerEnv(server));
      expect(result.code).toBe(0);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(SAMPLE_SOL);
      expect(fs.readFileSync(outPath, 'utf8')).toContain('contract OutTarget');

      result = await runCli(['natspec', '--path', filePath, '--out', outPath], providerEnv(server));
      expect(result.code).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain('already exists');

      result = await runCli(['natspec', '--path', filePath, '--out', outPath, '--force'], providerEnv(server));
      expect(result.code).toBe(0);
    },
    CLI_TEST_TIMEOUT_MS
  );

  test(
    'rejects responses that are not Solidity and leaves the source untouched',
    async () => {
      server = await startMockServer(() => chatReply('I cannot help with that request.'));
      const directory = tempDir();
      const filePath = writeFile(directory, 'Sample.sol', SAMPLE_SOL);

      const result = await runCli(['natspec', '--path', filePath], providerEnv(server));

      expect(result.code).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain('does not look like Solidity');
      expect(fs.readFileSync(filePath, 'utf8')).toBe(SAMPLE_SOL);
      expect(fs.existsSync(`${filePath}.bak`)).toBe(false);
    },
    CLI_TEST_TIMEOUT_MS
  );
});

describe('security command', () => {
  let server;

  afterEach(async () => {
    if (server) await server.close();
    server = null;
  });

  test(
    'dry-run prints a normalized report without creating a PDF',
    async () => {
      server = await startMockServer(() => chatReply(JSON.stringify({ high: REPORT.high, medium: [] })));
      const directory = tempDir();
      const filePath = writeFile(directory, 'Sample.sol', SAMPLE_SOL);

      const result = await runCli(['security', '--path', filePath, '--dry-run', '--verbose'], providerEnv(server));

      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ high: REPORT.high, medium: [], low: [] });
      expect(fs.existsSync(path.join(directory, 'Sample.pdf'))).toBe(false);
      expect(result.stderr).toContain('total_tokens=3');
    },
    CLI_TEST_TIMEOUT_MS
  );

  test(
    'writes a PDF and refuses to overwrite it without --force',
    async () => {
      server = await startMockServer(() => chatReply(JSON.stringify(REPORT)));
      const directory = tempDir();
      const filePath = writeFile(directory, 'Sample.sol', SAMPLE_SOL);
      const pdfPath = path.join(directory, 'report.pdf');

      let result = await runCli(['security', '--path', filePath, '--out', pdfPath], providerEnv(server));
      expect(result.code).toBe(0);
      const buffer = fs.readFileSync(pdfPath);
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
      expect(buffer.length).toBeGreaterThan(500);

      result = await runCli(['security', '--path', filePath, '--out', pdfPath], providerEnv(server));
      expect(result.code).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain('already exists');

      result = await runCli(['security', '--path', filePath, '--out', pdfPath, '--force'], providerEnv(server));
      expect(result.code).toBe(0);
    },
    CLI_TEST_TIMEOUT_MS
  );

  test(
    'invalid provider output leaves no PDF',
    async () => {
      server = await startMockServer(() => chatReply('not json at all'));
      const directory = tempDir();
      const filePath = writeFile(directory, 'Sample.sol', SAMPLE_SOL);

      const result = await runCli(['security', '--path', filePath], providerEnv(server));

      expect(result.code).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain('invalid security report');
      expect(fs.existsSync(path.join(directory, 'Sample.pdf'))).toBe(false);
    },
    CLI_TEST_TIMEOUT_MS
  );
});

describe('merger command', () => {
  const LIB_SOL =
    '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\nlibrary Lib { function v() internal pure returns (uint256) { return 42; } }\n';
  const MAIN_SOL =
    '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\nimport "./Lib.sol";\ncontract Uses { function f() public pure returns (uint256) { return Lib.v(); } }\n';

  test(
    'merges into _merge.sol without modifying the input and guards overwrites',
    async () => {
      const directory = tempDir();
      writeFile(directory, 'Lib.sol', LIB_SOL);
      const mainPath = writeFile(directory, 'Main.sol', MAIN_SOL);
      const mergedPath = path.join(directory, 'Main_merge.sol');

      let result = await runCli(['merger', '--path', mainPath]);
      expect(result.code).toBe(0);
      expect(fs.readFileSync(mainPath, 'utf8')).toBe(MAIN_SOL);
      const merged = fs.readFileSync(mergedPath, 'utf8');
      expect(merged).toContain('library Lib');
      expect(merged).not.toContain('import "./Lib.sol"');

      result = await runCli(['merger', '--path', mainPath]);
      expect(result.code).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain('already exists');

      result = await runCli(['merger', '--path', mainPath, '--force']);
      expect(result.code).toBe(0);
    },
    CLI_TEST_TIMEOUT_MS
  );

  test(
    '--out writes the merged file to a custom path',
    async () => {
      const directory = tempDir();
      writeFile(directory, 'Lib.sol', LIB_SOL);
      const mainPath = writeFile(directory, 'Main.sol', MAIN_SOL);
      const outPath = path.join(directory, 'combined.sol');

      const result = await runCli(['merger', '--path', mainPath, '--out', outPath]);

      expect(result.code).toBe(0);
      expect(fs.readFileSync(outPath, 'utf8')).toContain('library Lib');
      expect(fs.existsSync(path.join(directory, 'Main_merge.sol'))).toBe(false);
    },
    CLI_TEST_TIMEOUT_MS
  );

  test(
    'rejects --out paths that would overwrite the input',
    async () => {
      const directory = tempDir();
      writeFile(directory, 'Lib.sol', LIB_SOL);
      const mainPath = writeFile(directory, 'Main.sol', MAIN_SOL);

      const result = await runCli(['merger', '--path', mainPath, '--out', mainPath]);

      expect(result.code).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toContain('must be different from the input');
      expect(fs.readFileSync(mainPath, 'utf8')).toBe(MAIN_SOL);
    },
    CLI_TEST_TIMEOUT_MS
  );
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
    fs.rmSync(configPath, { force: true });
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
      baseUrl: 'https://example.test/v1/chat/completions'
    });
    expect(fs.existsSync(configPath)).toBe(true);
    expect(
      fs.readdirSync(path.dirname(configPath)).filter((name) => name.startsWith(path.basename(configPath)) && name.endsWith('.tmp'))
    ).toEqual([]);
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
      baseUrl: 'https://environment.test/v1/chat/completions'
    });
  });

  test('reports corrupted config with a recovery hint', () => {
    const helper = require('../dist/helper');
    fs.writeFileSync(configPath, '{not valid json');

    expect(() => helper.getProviderConfig()).toThrow('kritisi config --reset --yes');
  });

  test('clears the user-local config file', () => {
    const helper = require('../dist/helper');
    helper.saveKey('test-only-key');

    expect(helper.configExists()).toBe(true);
    expect(helper.clearConfig()).toBe(true);
    expect(helper.configExists()).toBe(false);
    expect(helper.clearConfig()).toBe(false);
  });
});

describe('parseSecurityReport', () => {
  test('accepts plain JSON and markdown-fenced JSON', () => {
    const helper = require('../dist/helper');
    const report = {
      high: [],
      medium: [{ issue: 'a', suggestion: 'b', code_highlight: 'c' }],
      low: []
    };
    const plain = JSON.stringify(report);
    expect(helper.parseSecurityReport(plain)).toEqual(report);
    expect(helper.parseSecurityReport(`\`\`\`json\n${plain}\n\`\`\``)).toEqual(report);
    expect(helper.parseSecurityReport(`Here is the report:\n\`\`\`json\n${plain}\n\`\`\``)).toEqual(report);
  });

  test('tolerates missing severity arrays', () => {
    const helper = require('../dist/helper');
    expect(helper.parseSecurityReport('{"high":[]}')).toEqual({ high: [], medium: [], low: [] });
    expect(helper.parseSecurityReport('{"high":[],"medium":null}')).toEqual({ high: [], medium: [], low: [] });
  });

  test('extracts balanced JSON through prose and nested braces', () => {
    const helper = require('../dist/helper');
    const report = {
      high: [{ issue: 'Use {checks}', suggestion: 's', code_highlight: 'if (x) { y(); }' }],
      medium: [],
      low: []
    };
    const content = `Review {summary} follows:\n${JSON.stringify(report)}\nThanks`;
    expect(helper.parseSecurityReport(content)).toEqual(report);
  });

  test('rejects invalid shapes', () => {
    const helper = require('../dist/helper');
    expect(() => helper.parseSecurityReport('not json')).toThrow('invalid security report');
    expect(() => helper.parseSecurityReport('{"high":[],"medium":[],"low":[{}]}')).toThrow('invalid security report');
    expect(() => helper.parseSecurityReport('{"high":{},"medium":[],"low":[]}')).toThrow('invalid security report');
  });
});

describe('Provider implementations', () => {
  const configPath = path.join(os.tmpdir(), `kritisi-provider-${process.pid}.json`);

  function okBody(content) {
    return { choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } };
  }

  beforeEach(() => {
    for (const name of [
      'OPENROUTER_API_KEY',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'CLAUDE_API_KEY',
      'DEEPSEEK_API_KEY',
      'OPENAI_MODEL',
      'OPENAI_BASE_URL',
      'ANTHROPIC_MODEL',
      'ANTHROPIC_BASE_URL',
      'DEEPSEEK_MODEL',
      'DEEPSEEK_BASE_URL',
      'ANTHROPIC_MAX_TOKENS',
      'CLAUDE_MAX_TOKENS',
      'KRITISI_TIMEOUT_MS',
      'KRITISI_RETRIES'
    ]) {
      delete process.env[name];
    }
    process.env.KRITISI_CONFIG_PATH = configPath;
    process.env.KRITISI_RETRY_DELAY_MS = '0';
    jest.resetModules();
  });

  afterAll(() => {
    if (fs.existsSync(configPath)) fs.rmSync(configPath);
  });

  test('OpenAI and DeepSeek accept explicit config with an injected fetch', async () => {
    const { OpenAI } = require('../dist/ai/openai');
    const { DeepSeek } = require('../dist/ai/deepseek');
    const fake = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => okBody('ok') });

    const openai = new OpenAI({ apiKey: 'explicit-key', model: 'explicit-model', baseUrl: 'https://openai.unit/v1' }, fake);
    await expect(openai.run('prompt', 'code')).resolves.toMatchObject({ content: 'ok', model: 'explicit-model' });
    expect(fake).toHaveBeenCalledWith('https://openai.unit/v1', expect.objectContaining({ timeout: 120000 }));

    const deepseek = new DeepSeek({ apiKey: 'ds-key', model: 'ds-model', baseUrl: 'https://deepseek.unit/v1' }, fake);
    await expect(deepseek.run('prompt', 'code')).resolves.toMatchObject({ content: 'ok', model: 'ds-model' });
    expect(fake).toHaveBeenCalledWith('https://deepseek.unit/v1', expect.anything());
  });

  test('legacy fetch-only constructors still read environment config', async () => {
    process.env.OPENAI_API_KEY = 'env-key';
    process.env.OPENAI_MODEL = 'env-model';
    process.env.OPENAI_BASE_URL = 'https://openai.env/v1';
    jest.resetModules();
    const { OpenAI } = require('../dist/ai/openai');
    const fake = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => okBody('env-ok') });

    const provider = new OpenAI(fake);
    await expect(provider.run('prompt', 'code')).resolves.toMatchObject({ content: 'env-ok', model: 'env-model' });
    expect(fake).toHaveBeenCalledWith('https://openai.env/v1', expect.anything());
  });

  test('Claude sends the configured token cap and maps usage fields', async () => {
    process.env.ANTHROPIC_MAX_TOKENS = '1234';
    jest.resetModules();
    const { Claude } = require('../dist/ai/claude');
    const fake = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ text: 'done' }], usage: { input_tokens: 4, output_tokens: 6 } })
    });

    const claude = new Claude({ apiKey: 'anthropic-key', model: 'claude-test', baseUrl: 'https://claude.unit/v1' }, fake);
    await expect(claude.run('prompt', 'code')).resolves.toEqual({
      model: 'claude-test',
      usage: { prompt_tokens: 4, completion_tokens: 6, total_tokens: 10 },
      content: 'done'
    });
    const [, init] = fake.mock.calls[0];
    expect(JSON.parse(init.body).max_tokens).toBe(1234);
  });

  test('retries 5xx and 429 responses before succeeding', async () => {
    const { OpenAI } = require('../dist/ai/openai');
    const fake = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) })
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: { message: 'slow down' } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => okBody('recovered') });

    const provider = new OpenAI({ apiKey: 'k', model: 'm', baseUrl: 'https://retry.unit' }, fake);
    await expect(provider.run('prompt', 'code')).resolves.toMatchObject({ content: 'recovered' });
    expect(fake).toHaveBeenCalledTimes(3);
  });

  test('times out with a clear error', async () => {
    process.env.KRITISI_TIMEOUT_MS = '1234';
    process.env.KRITISI_RETRIES = '0';
    jest.resetModules();
    const { OpenAI } = require('../dist/ai/openai');
    const timeoutError = Object.assign(new Error('network timeout at: https://timeout.unit'), { type: 'request-timeout' });
    const fake = jest.fn().mockRejectedValue(timeoutError);

    const provider = new OpenAI({ apiKey: 'k', model: 'm', baseUrl: 'https://timeout.unit' }, fake);
    await expect(provider.run('prompt', 'code')).rejects.toThrow('timed out after 1234ms');
    expect(fake).toHaveBeenCalledTimes(1);
    expect(fake.mock.calls[0][1]).toMatchObject({ timeout: 1234 });
  });

  test('redacts API keys in provider errors', async () => {
    const { Claude } = require('../dist/ai/claude');
    const fake = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'invalid api key secret-claude' } })
    });

    const claude = new Claude({ apiKey: 'secret-claude', model: 'm', baseUrl: 'https://claude.unit' }, fake);
    await expect(claude.run('prompt', 'code')).rejects.toThrow('HTTP 401: invalid api key [redacted]');
  });

  test('rejects invalid runtime settings', async () => {
    process.env.KRITISI_RETRIES = 'many';
    jest.resetModules();
    const { OpenAI } = require('../dist/ai/openai');
    const provider = new OpenAI({ apiKey: 'k', model: 'm', baseUrl: 'https://x' }, jest.fn());

    await expect(provider.run('prompt', 'code')).rejects.toThrow('Invalid KRITISI_RETRIES');

    delete process.env.KRITISI_RETRIES;
    process.env.ANTHROPIC_MAX_TOKENS = '0';
    jest.resetModules();
    const { Claude } = require('../dist/ai/claude');
    const claude = new Claude({ apiKey: 'k', model: 'm', baseUrl: 'https://x' }, jest.fn());
    await expect(claude.run('prompt', 'code')).rejects.toThrow('Invalid ANTHROPIC_MAX_TOKENS');
  });
});

describe('OpenRouter provider', () => {
  beforeEach(() => {
    fetch.mockReset();
    process.env.OPENROUTER_API_KEY = 'test-only-key';
    process.env.OPENROUTER_MODEL = 'test/model';
    process.env.OPENROUTER_BASE_URL = 'https://openrouter.test/api/v1/chat/completions';
    process.env.KRITISI_RETRY_DELAY_MS = '0';
    jest.resetModules();
    fetch = require('node-fetch');
  });

  test('returns validated chat completion content and usage', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'updated solidity' } }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }
      })
    });
    const { OpenRouter } = require('../dist/ai/openrouter');

    await expect(new OpenRouter().run('system prompt', 'contract C {}')).resolves.toEqual({
      model: 'test/model',
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      content: 'updated solidity'
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://openrouter.test/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-only-key' }),
        timeout: 120000
      })
    );
  });

  test('rejects HTTP errors without requiring a real network', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'unauthorized' } })
    });
    const { OpenRouter } = require('../dist/ai/openrouter');

    await expect(new OpenRouter().run('prompt', 'code')).rejects.toThrow('OpenRouter HTTP 401: unauthorized');
  });

  test('rejects invalid response shapes', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] })
    });
    const { OpenRouter } = require('../dist/ai/openrouter');

    await expect(new OpenRouter().run('prompt', 'code')).rejects.toThrow('invalid response');
  });
});

describe('generatePDF', () => {
  test('writes a PDF and rejects with an Error for unwritable targets', async () => {
    const helper = require('../dist/helper');
    const directory = tempDir();
    const filePath = path.join(directory, 'report.pdf');

    await expect(
      helper.generatePDF({ high: [], medium: [], low: [] }, filePath, { provider: 'openrouter', model: 'test/model', version: '2.4.0' })
    ).resolves.toBe(true);
    const buffer = fs.readFileSync(filePath);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);

    const blockedPath = path.join(directory, 'blocked.pdf');
    fs.mkdirSync(blockedPath);
    await expect(helper.generatePDF({ high: [], medium: [], low: [] }, blockedPath)).rejects.toBeInstanceOf(Error);
  });
});

module.exports = { runCli, CLI_PATH };
