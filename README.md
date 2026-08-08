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
kritisi natspec --service <provider> --path ./contracts/MyContract.sol
kritisi security --service <provider> --path ./contracts/MyContract.sol
kritisi merger --path ./contracts/MyContract.sol
```

`--service` selects the provider for `natspec`, `security`, `setkey`, and `setmodel`. Supported values are `openrouter` (the default), `openai`, `claude` (or `anthropic`), and `deepseek`. Omitting `--service` keeps the OpenRouter default.

`security` writes `MyContract.pdf` beside the Solidity source. `natspec` updates the source file in place. `merger` writes `MyContract_merge.sol` beside the source.

## Providers and configuration

Environment variables take precedence over user-local configuration. Supply API keys through the environment or the interactive `setkey` command; do not commit them.

| Provider | API key environment variable | Model environment variable | Default endpoint |
| --- | --- | --- | --- |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` | `https://openrouter.ai/api/v1/chat/completions` |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` | `https://api.openai.com/v1/chat/completions` |
| Claude / Anthropic | `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` | `ANTHROPIC_MODEL` or `CLAUDE_MODEL` | `https://api.anthropic.com/v1/messages` |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODEL` | `https://api.deepseek.com/chat/completions` |

Provider-specific `*_BASE_URL` variables override the default endpoint: `OPENROUTER_BASE_URL`, `OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL`/`CLAUDE_BASE_URL`, and `DEEPSEEK_BASE_URL`.

Default models are `openai/gpt-4o-mini` (OpenRouter), `gpt-5.2` (OpenAI), `claude-opus-4-6` (Claude), and `deepseek-chat` (DeepSeek).

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

The config directory is created with mode `0700` and the file with mode `0600`. `KRITISI_CONFIG_PATH` can select a different user-local path for automation. Keep that file outside source control.

## Library usage

The package's public library entrypoint is the package root (`dist/library.js` at build time). It exports the provider classes `OpenRouter`, `OpenAI`, `Claude`, and `DeepSeek`; `createProvider`; provider/config helpers (`getProviderConfig`, `getOpenRouterConfig`, `normalizeProvider`, `loadKey`, `saveKey`, `saveModel`, `saveBaseUrl`, `CONFIG_PATH`); and local utilities including `parseSecurityReport`, `generatePDF`, and `saveFile`.

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

Constructing a provider or reading configuration does not make a network request. Calling a provider's `run` method requires the relevant API key and makes a request to its configured endpoint.

## Audit response

The selected provider must return JSON in this shape for `security`:

```json
{
  "high": [{ "issue": "...", "suggestion": "...", "code_highlight": "..." }],
  "medium": [],
  "low": []
}
```

HTTP failures, invalid JSON, and invalid response shapes are reported without writing a PDF.

## Development and validation

```bash
npm ci
npm run build
npm test -- --runInBand
node dist/index.js help
node dist/index.js --version
npm pack --dry-run
npm publish --dry-run
```

The automated tests and release validation are network-free. They do not claim live provider testing; run any provider smoke test only with credentials intentionally supplied in the environment, without printing credentials or full API responses.

## License

MIT; see [LICENSE](LICENSE).
