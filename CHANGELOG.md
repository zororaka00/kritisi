# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [2.4.0](https://github.com/zororaka00/kritisi/compare/v2.3.0...v2.4.0) (2026-11-22)

### Features

* Added `--out`, `--dry-run`, `--force`, and `--verbose` options to `natspec` and `security`; `merger` gained `--out` and `--force`.
* Added `kritisi config` to display effective provider settings and `kritisi config --reset --yes` to recover from a corrupted config file.
* Added configurable request timeouts and retries (`KRITISI_TIMEOUT_MS`, `KRITISI_RETRIES`, `KRITISI_RETRY_DELAY_MS`) for all providers.
* Added a configurable Claude output token cap (`ANTHROPIC_MAX_TOKENS`/`CLAUDE_MAX_TOKENS`, default 8192).
* Unified provider constructors as `(config?, fetchImpl?)` for all four providers while keeping the legacy fetch-only form for OpenAI and DeepSeek.
* Redesigned PDF security reports with a cover page, risk badge, executive summary, severity cards, structured finding blocks, paginated code panels, page headers/footers, and an in-report AI-assistance disclaimer.
* PDF metadata now includes the audited source path, and `generatePDF` lives in a dedicated `pdf` module while remaining exported from the package root.
* `parseSecurityReport` now tolerates missing severity arrays and extracts JSON with balanced-brace scanning.

### Bug Fixes

* Rejected non-`.sol` inputs so `security`, `natspec`, and `merger` can no longer overwrite the source file with generated output.
* `natspec` now strips markdown code fences, validates that the response looks like Solidity, and keeps a `.sol.bak` backup before in-place updates.
* Fixed stack traces for unknown providers in `setkey` and `setmodel`.
* Config writes are atomic, and `generatePDF` rejects with a real error instead of a boolean.
* Fixed PDF footers so they appear on every page.

### Security

* Updated transitive dependencies to clear the `brace-expansion` advisory (`npm audit` reports zero vulnerabilities).
* API keys are hidden during `setkey` input on TTY terminals and fully redacted from provider error messages.

### Tests

* Added regression coverage for destructive-path guards, NatSpec sanitization and backup, dry-run and output flags, PDF creation, retry/timeout behavior, Claude token configuration, provider constructor parity, tolerant report parsing, and config reset.

## [2.3.0](https://github.com/zororaka00/kritisi/compare/v2.2.0...v2.3.0) (2026-08-09)

### Features

* Hardened `parseSecurityReport` to accept security findings wrapped in markdown code fences or brief surrounding prose.
* Strengthened the security audit prompt to request a single plain JSON object (no markdown fences).

### Changed

* Updated default models to the latest stable GA IDs: `openai/gpt-5.6-sol` (OpenRouter), `gpt-5.6-sol` (OpenAI), `claude-opus-5` (Claude), and `deepseek-v4-pro` (DeepSeek).
* Updated CLI help text and README default-model documentation to match the new defaults.

### Tests

* Added unit coverage for fenced and invalid security report parsing.
* Increased CLI spawn timeouts and ignore child stdin to reduce flaky cold-start failures on Windows.

## [2.2.0](https://github.com/zororaka00/kritisi/compare/v2.1.0...v2.2.0) (2026-08-08)

### Features

* Migrated the runtime and public API source to TypeScript with CommonJS output and declarations.
* Added support for both the CLI and a public library entrypoint with package-root exports.
* Added provider integrations for OpenRouter, OpenAI, Claude/Anthropic, and DeepSeek, including provider-specific environment and model configuration.

### Changed

* Aligned dependencies and package metadata for improved stability on Node.js >=18.
* Updated the README with CLI, provider configuration, library usage, and network-free validation documentation.
* Preserved the project's MIT license across the npm package and repository license file.

### Validation

* Dependency audit completed with zero reported vulnerabilities.
* Release validation covers local build, network-free automated tests, CLI behavior, library loading, and package contents. No live provider calls are claimed for this release.

### [1.6.2](https://github.com/zororaka00/kritisi/compare/v1.6.1...v1.6.2) (2026-03-03)

### [1.6.1](https://github.com/zororaka00/kritisi/compare/v1.5.2...v1.6.1) (2026-03-03)

### [1.5.2](https://github.com/zororaka00/kritisi/compare/v1.5.1...v1.5.2) (2024-11-24)

### [1.5.1](https://github.com/zororaka00/kritisi/compare/v1.5.0...v1.5.1) (2024-11-23)

## [1.5.0](https://github.com/zororaka00/kritisi/compare/v1.4.0...v1.5.0) (2024-11-22)

### Features

* Update README.md for added code factor & vulnerabilities ([0ad70af](https://github.com/zororaka00/kritisi/commit/0ad70af15b147156fc3ef62a715c8b3cc1b532b8))

## [1.4.0](https://github.com/zororaka00/kritisi/compare/v1.3.0...v1.4.0) (2024-11-22)

### Features

* update README.md ([771f7db](https://github.com/zororaka00/kritisi/commit/771f7db9f0f58e1fe6e6e8bc31df91cae6ca79fd))

## [1.3.0](https://github.com/zororaka00/kritisi/compare/v1.2.1...v1.3.0) (2024-11-22)

### Features

* change ts to js and fixing command ([abbde84](https://github.com/zororaka00/kritisi/commit/abbde847989ab91c75fb304563413a046c81c4e4))

### [1.2.1](https://github.com/zororaka00/kritisi/compare/v1.2.0...v1.2.1) (2024-11-22)

### Bug Fixes

* fixing run global command ([b1e0b84](https://github.com/zororaka00/kritisi/commit/b1e0b846efc038083afa364433f2c211576a63e0))

## [1.2.0](https://github.com/zororaka00/kritisi/compare/v1.1.0...v1.2.0) (2024-11-22)

### Features

* update README.md for tutorial setmodel ([a728700](https://github.com/zororaka00/kritisi/commit/a728700659511bb3bcde82d6a5b2ad41325fac4c))

## 1.1.0 (2024-11-22)

### Features

* added set model ([79c7209](https://github.com/zororaka00/kritisi/commit/79c7209a564fdd60ea3a0c97df7a08713292254c))
* update package.json ([2de7fb7](https://github.com/zororaka00/kritisi/commit/2de7fb7b1673a2c00a80d7ca8d6fba2ef937ed51))

## 1.0.0 (2024-11-21)

* Initial release
