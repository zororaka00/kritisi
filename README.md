# Kritisi: Multi-provider Solidity Audit CLI and Library

Kritisi audits Solidity contracts, adds NatSpec documentation, merges imports, and writes security findings as PDF. It supports OpenRouter, OpenAI, Claude/Anthropic, and DeepSeek.

## Requirements

- Node.js 18 or newer

## Install

Install the CLI globally:

```bash
npm install --global kritisi
kritisi help
```

Install the package locally when using the library or a project-local CLI:

```bash
npm install kritisi
npx kritisi help
```

## CLI usage

```bash
kritisi setkey --service <provider>
kritisi setmodel --service <provider>
kritisi config
kritisi natspec --service <provider> --path ./contracts/MyContract.sol
kritisi security --service <provider> --path ./contracts/MyContract.sol
kritisi merger --path ./contracts/MyContract.sol
```

`--service` selects the provider for `natspec`, `security`, `setkey`, and `setmodel`. Supported values are `openrouter` (the default), `openai`, `claude` (or `anthropic`), and `deepseek`. Omitting `--service` keeps the OpenRouter default.

`security` writes `MyContract.pdf` beside the Solidity source. `natspec` updates the source file in place and keeps a backup at `MyContract.sol.bak`. `merger` writes `MyContract_merge.sol` beside the source.

### Output safety

- Input files must end in `.sol`. Non-Solidity paths are rejected before any provider request, so a report can never overwrite a source file.
- Existing output files are not overwritten unless `--force` is passed. This applies to the PDF report, `--out` targets, and merged files.
- `--dry-run` writes nothing. `natspec` prints the documented Solidity source and `security` prints the parsed JSON report to stdout.
- `--out <path>` writes the result to another location. `--verbose` prints the model and token usage to stderr.
- `natspec` rejects responses that do not look like Solidity and leaves the source untouched. Markdown code fences are stripped before validation.

| Command | Output | Extra flags |
| --- | --- | --- |
| `natspec` | In place (`<file>.sol.bak` backup) or `--out` | `--dry-run`, `--out`, `--force`, `--verbose` |
| `security` | `<file>.pdf` or `--out` | `--dry-run`, `--out`, `--force`, `--verbose` |
| `merger` | `<file>_merge.sol` or `--out` | `--out`, `--force` |

### Configuration commands

`kritisi config` prints the effective provider configuration, including environment variable overrides. API keys are reported as `set` or `unset`, never printed. `kritisi config --reset --yes` deletes the user-local config file, which is also the recovery path for a corrupted file.

## Providers and configuration

Environment variables take precedence over user-local configuration. Supply API keys through the environment or the interactive `setkey` command; do not commit them.

| Provider | API key environment variable | Model environment variable | Default endpoint |
| --- | --- | --- | --- |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` | `https://openrouter.ai/api/v1/chat/completions` |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` | `https://api.openai.com/v1/chat/completions` |
| Claude / Anthropic | `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` | `ANTHROPIC_MODEL` or `CLAUDE_MODEL` | `https://api.anthropic.com/v1/messages` |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODEL` | `https://api.deepseek.com/chat/completions` |

Provider-specific `*_BASE_URL` variables override the default endpoint: `OPENROUTER_BASE_URL`, `OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL`/`CLAUDE_BASE_URL`, and `DEEPSEEK_BASE_URL`.

Default models are `openai/gpt-5.6-sol` (OpenRouter), `gpt-5.6-sol` (OpenAI), `claude-opus-5` (Claude), and `deepseek-v4-pro` (DeepSeek).

### Runtime tuning

| Variable | Default | Purpose |
| --- | --- | --- |
| `KRITISI_TIMEOUT_MS` | `120000` | Per-request timeout for provider calls |
| `KRITISI_RETRIES` | `2` | Retries for network errors and HTTP 429/5xx responses |
| `KRITISI_RETRY_DELAY_MS` | `500` | Base backoff delay; doubles after each retry |
| `ANTHROPIC_MAX_TOKENS` / `CLAUDE_MAX_TOKENS` | `8192` | Claude output token cap |

For example, with a placeholder key supplied outside the repository:

```bash
export OPENROUTER_API_KEY="<your-api-key>"
export OPENROUTER_MODEL="<provider-model>"
kritisi security --service openrouter --path ./contracts/MyContract.sol
```

Keys, models, and endpoints can also be stored in the user-local file `~/.config/kritisi/config.json` (or `$XDG_CONFIG_HOME/kritisi/config.json`):

```bash
kritisi setkey --service openrouter
kritisi setmodel --service openrouter
kritisi setkey --service openai
kritisi setmodel --service deepseek
```

The config directory is created with mode `0700` and the file with mode `0600`. Writes are atomic: a temporary file is renamed into place so an interrupted write cannot corrupt the existing configuration. `KRITISI_CONFIG_PATH` can select a different user-local path for automation. Keep that file outside source control.

## Library usage

The package's public library entrypoint is the package root (`dist/library.js` at build time). It exports the provider classes `OpenRouter`, `OpenAI`, `Claude`, and `DeepSeek`; `createProvider`; provider/config helpers (`getProviderConfig`, `getOpenRouterConfig`, `normalizeProvider`, `loadKey`, `saveKey`, `saveModel`, `saveBaseUrl`, `clearConfig`, `configExists`, `CONFIG_PATH`); runtime option helpers (`getRequestOptions`, `getClaudeMaxTokens`); and local utilities including `parseSecurityReport`, `extractJsonObject`, `stripCodeFence`, `formatForReportPath`, `renderMarkdownReport`, `writeMarkdownReport`, `generatePDF`, `saveFile`, and `saveFileAtomic`.

CommonJS:

```js
const {
  OpenRouter,
  OpenAI,
  Claude,
  DeepSeek,
  createProvider,
  getProviderConfig,
  parseSecurityReport,
} = require('kritisi');

const provider = createProvider('openrouter');
const config = getProviderConfig('openrouter');
```

TypeScript/ES modules can import the same named exports:

```ts
import { createProvider, parseSecurityReport } from 'kritisi';
```

All four providers accept an optional configuration object and an optional fetch implementation: `new OpenRouter(config, fetchImpl)`, `new OpenAI(config, fetchImpl)`, `new Claude(config, fetchImpl)`, and `new DeepSeek(config, fetchImpl)`. The older `new OpenAI(fetchImpl)` and `new DeepSeek(fetchImpl)` form remains supported. Constructing a provider or reading configuration does not make a network request. Calling a provider's `run` method requires the relevant API key and makes a request to its configured endpoint.

## Audit response

The selected provider must return JSON in this shape for `security`:

```json
{
  "high": [{ "issue": "...", "suggestion": "...", "code_highlight": "..." }],
  "medium": [],
  "low": []
}
```

Markdown fences and brief surrounding prose are tolerated. Missing severity arrays are treated as empty; every present item must contain string `issue`, `suggestion`, and `code_highlight` fields. HTTP failures, invalid JSON, and invalid item shapes are reported without writing a PDF.

## PDF report

`security` produces a designed report rather than a plain list:

- A cover page with the contract name, generation time, overall risk level, and high/medium/low counts.
- An executive summary with severity cards and report details (source, provider, model, timestamp, engine version).
- Severity sections with numbered finding blocks (`H-01`, `M-01`, ...), remediation guidance, and syntax-styled code highlights that paginate cleanly across pages.
- Page headers, footers, and page numbers, plus an AI-assistance disclaimer on the summary page and in every footer.

When no findings are reported, the summary shows a clear "No findings reported" state instead of an empty report.

### Markdown reports

Library consumers can render the same findings as Markdown instead of PDF:

```js
const { renderMarkdownReport, writeMarkdownReport, formatForReportPath } = require('kritisi');

const format = formatForReportPath('reports/Vault.md'); // 'markdown'
const metadata = {
  target: 'contracts/Vault.sol',
  provider: 'openrouter',
  model: 'test/model',
  version: '2.5.0',
};
const markdown = renderMarkdownReport(report, metadata);
writeMarkdownReport('reports/Vault.md', report, metadata);
```

Markdown output includes metadata, risk level, severity summary, token usage, numbered findings, safe Solidity code fences, and the AI-assistance disclaimer. The `security` CLI command continues to write PDF; Markdown is available to library consumers and integrations such as `mcp-kritisi`.

## Limitations and responsible use

- Audit results are AI-assisted suggestions, not a guaranteed or complete security review. Verify every finding independently before acting on it.
- Solidity source is sent to the configured third-party provider. Do not audit code you are not allowed to share with that provider.
- Model output is untrusted and can be manipulated by instructions embedded in the audited code (prompt injection). Treat findings as leads, not conclusions.
- Large contracts may exceed the model context window. Split very large files before auditing.
- Deterministic analyzers (for example, Slither or solhint) complement this tool and remain the recommended baseline for automated checks.

## Development and validation

```bash
npm ci
npm run lint
npm run build
npm test -- --runInBand
npm run test:coverage
node dist/index.js help
node dist/index.js --version
npm pack --dry-run
npm publish --dry-run
```

The CI workflow runs the lint, build, tests, production dependency audit, and package dry-run on Node.js 18, 20, 22, and 24. The automated tests are network-free. They do not claim live provider testing; run any provider smoke test only with credentials intentionally supplied in the environment, without printing credentials or full API responses.

## License

MIT; see [LICENSE](LICENSE).
