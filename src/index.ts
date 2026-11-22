#!/usr/bin/env node
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { Command } from 'commander';
import ora from 'ora';
import { version } from '../package.json';
import {
  CONFIG_PATH,
  NATSPEC_PROMPT,
  SECURITY_PROMPT,
  clearConfig,
  configExists,
  generatePDF,
  getProviderConfig,
  looksLikeSolidity,
  mergeSources,
  normalizeProvider,
  parseSecurityReport,
  saveFileAtomic,
  saveKey,
  saveModel,
  stripCodeFence,
  ProviderName
} from './helper';
import { AIResponse, createProvider } from './ai';

interface CommandOptions {
  path?: string;
  service?: string;
  out?: string;
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
}

interface ConfigOptions {
  reset?: boolean;
  yes?: boolean;
}

const serviceOption = ['--service <service>', 'AI provider: openrouter, openai, claude, or deepseek (default: openrouter).'] as const;
const program = new Command();

program
  .name('kritisi')
  .description('AI-powered Solidity security auditing and NatSpec documentation with OpenRouter, OpenAI, Claude, or DeepSeek.')
  .version(version)
  .addHelpText(
    'after',
    '\nProviders: openrouter (default), openai, claude/anthropic, deepseek.\nAPI key/model env vars: OPENROUTER_API_KEY/OPENROUTER_MODEL, OPENAI_API_KEY/OPENAI_MODEL, ANTHROPIC_API_KEY/ANTHROPIC_MODEL, DEEPSEEK_API_KEY/DEEPSEEK_MODEL.\nRuntime env vars: KRITISI_TIMEOUT_MS (default 120000), KRITISI_RETRIES (default 2), KRITISI_RETRY_DELAY_MS (default 500), ANTHROPIC_MAX_TOKENS/CLAUDE_MAX_TOKENS (default 8192).\nOpenRouter example: kritisi security --service openrouter --path ./contracts/MyContract.sol\n'
  );

function selectedProvider(options: CommandOptions, spinner: ReturnType<typeof ora>): ProviderName | null {
  try {
    return normalizeProvider(options.service);
  } catch (error) {
    process.exitCode = 1;
    spinner.fail(error instanceof Error ? error.message : 'Unknown provider.');
    return null;
  }
}

function readInputPath(options: CommandOptions): string | null {
  if (!options.path) return null;
  return path.resolve(options.path);
}

function solidityPath(options: CommandOptions, spinner: ReturnType<typeof ora>): string | null {
  const filePath = readInputPath(options);
  if (!filePath) {
    spinner.fail('No path specified. Use --path <path>.');
    process.exitCode = 1;
    return null;
  }
  if (path.extname(filePath).toLowerCase() !== '.sol') {
    spinner.fail(`Input must be a Solidity file (*.sol): ${filePath}`);
    process.exitCode = 1;
    return null;
  }
  return filePath;
}

function resolveOutputPath(options: CommandOptions, fallback: string, inputPath: string): string {
  if (!options.out) return fallback;
  const outputPath = path.resolve(options.out);
  if (outputPath === inputPath) throw new Error('The --out path must be different from the input Solidity file.');
  return outputPath;
}

function ensureWritable(outputPath: string, force: boolean | undefined): void {
  if (!force && existsSync(outputPath)) throw new Error(`Output file already exists: ${outputPath}. Use --force to overwrite.`);
}

function logUsage(response: AIResponse, verbose: boolean | undefined): void {
  if (!verbose) return;
  process.stderr.write(
    `model=${response.model} prompt_tokens=${response.usage.prompt_tokens} completion_tokens=${response.usage.completion_tokens} total_tokens=${response.usage.total_tokens}\n`
  );
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    let answered = false;
    rl.once('close', () => {
      if (!answered) resolve('');
    });
    rl.question(question, (answer) => {
      answered = true;
      resolve(answer);
    });
  });
}

async function promptInput(question: string, hidden: boolean): Promise<string> {
  const isTTY = Boolean(process.stdin.isTTY);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: isTTY });
  try {
    if (hidden && isTTY) {
      process.stdout.write(question);
      (rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput = () => undefined;
      const answer = await ask(rl, '');
      process.stdout.write('\n');
      return answer;
    }
    return await ask(rl, question);
  } finally {
    rl.close();
  }
}

program
  .command('setkey')
  .description('Set an API key for the selected provider in the user-local config file')
  .option(...serviceOption)
  .addHelpText(
    'after',
    '\nKeys are stored outside the package. Environment variables are recommended for CI. Input is hidden when the terminal supports it.'
  )
  .action(async (options: CommandOptions) => {
    let provider: ProviderName;
    try {
      provider = normalizeProvider(options.service);
    } catch (error) {
      process.exitCode = 1;
      process.stderr.write(`${error instanceof Error ? error.message : 'Unknown provider.'}\n`);
      return;
    }
    const apiKey = await promptInput(`Enter the ${provider} API key: `, true);
    const spinner = ora('Processing...').start();
    try {
      saveKey(apiKey, provider);
      spinner.succeed(`${provider} API key has been successfully saved.`);
    } catch (error) {
      process.exitCode = 1;
      spinner.fail(error instanceof Error ? error.message : `Unable to save the ${provider} API key.`);
    }
  });

program
  .command('setmodel')
  .description('Set the model for the selected provider in the user-local config file')
  .option(...serviceOption)
  .addHelpText(
    'after',
    '\nExamples: openai/gpt-5.6-sol (OpenRouter), gpt-5.6-sol (OpenAI), claude-opus-5 (Claude), deepseek-v4-pro (DeepSeek).'
  )
  .action(async (options: CommandOptions) => {
    let provider: ProviderName;
    try {
      provider = normalizeProvider(options.service);
    } catch (error) {
      process.exitCode = 1;
      process.stderr.write(`${error instanceof Error ? error.message : 'Unknown provider.'}\n`);
      return;
    }
    const model = await promptInput(`Enter the ${provider} model name: `, false);
    const spinner = ora('Processing...').start();
    try {
      saveModel(model, provider);
      spinner.succeed(`Model '${model.trim()}' has been successfully set for ${provider}.`);
    } catch (error) {
      process.exitCode = 1;
      spinner.fail(error instanceof Error ? error.message : `Unable to save the ${provider} model.`);
    }
  });

program
  .command('config')
  .description('Show the effective provider configuration or reset the user-local config file')
  .option('--reset', 'Delete the user-local configuration file')
  .option('--yes', 'Confirm deletion without prompting')
  .addHelpText('after', '\nThe display shows effective values, including environment variable overrides. Keys are never printed.')
  .action((options: ConfigOptions) => {
    if (!options.reset) {
      try {
        process.stdout.write(`Config file: ${CONFIG_PATH} (${configExists() ? 'present' : 'not created'})\n`);
        for (const provider of ['openrouter', 'openai', 'claude', 'deepseek'] as ProviderName[]) {
          const config = getProviderConfig(provider);
          process.stdout.write(`${provider}: apiKey=${config.apiKey ? 'set' : 'unset'} model=${config.model} baseUrl=${config.baseUrl}\n`);
        }
      } catch (error) {
        process.exitCode = 1;
        process.stderr.write(`${error instanceof Error ? error.message : 'Unable to read the configuration.'}\n`);
      }
      return;
    }
    const spinner = ora('Processing...').start();
    try {
      if (!options.yes) throw new Error(`Refusing to delete ${CONFIG_PATH} without --yes.`);
      const removed = clearConfig();
      spinner.succeed(removed ? `Removed ${CONFIG_PATH}` : `No configuration file found at ${CONFIG_PATH}`);
    } catch (error) {
      process.exitCode = 1;
      spinner.fail(error instanceof Error ? error.message : 'Unable to reset the configuration.');
    }
  });

program
  .command('merger')
  .description('Merge all imported Solidity files into a single file')
  .option('--path <path>', 'Specify the path to the Solidity file to be merged')
  .option('--out <path>', 'Write the merged file to a different path')
  .option('--force', 'Overwrite the output file if it already exists')
  .addHelpText('after', '\nThe merged file is written beside the input with _merge appended to its name.')
  .action(async (options: CommandOptions) => {
    const spinner = ora('Processing...').start();
    const filePath = solidityPath(options, spinner);
    if (!filePath) return;
    try {
      const mergedFilePath = resolveOutputPath(options, filePath.replace(/\.sol$/i, '_merge.sol'), filePath);
      ensureWritable(mergedFilePath, options.force);
      const mergedCode = await mergeSources(filePath);
      saveFileAtomic(mergedFilePath, mergedCode);
      spinner.succeed(`Files merged successfully. Output file: ${mergedFilePath}`);
    } catch (error) {
      process.exitCode = 1;
      spinner.fail(error instanceof Error ? error.message : 'Unable to merge Solidity files.');
    }
  });

program
  .command('natspec')
  .description('Process NatSpec documentation for a Solidity file')
  .option(...serviceOption)
  .option('--path <path>', 'Path to the Solidity file')
  .option('--out <path>', 'Write the documented contract to a different file')
  .option('--dry-run', 'Print the documented contract to stdout without writing any file')
  .option('--force', 'Overwrite an existing --out file')
  .option('--verbose', 'Print provider usage information to stderr')
  .addHelpText(
    'after',
    '\nIn-place updates keep a backup of the original source at <file>.sol.bak. The --service option selects the provider; default: openrouter.'
  )
  .action(async (options: CommandOptions) => {
    const spinner = ora('Processing...').start();
    const provider = selectedProvider(options, spinner);
    if (!provider) return;
    const filePath = solidityPath(options, spinner);
    if (!filePath) return;
    if (!getProviderConfig(provider).apiKey) {
      spinner.fail(`No ${provider} API key found. Set the provider environment variable or use setkey --service ${provider}.`);
      process.exitCode = 1;
      return;
    }
    try {
      const outputPath = resolveOutputPath(options, filePath, filePath);
      if (!options.dryRun && outputPath !== filePath) ensureWritable(outputPath, options.force);
      const original = await fs.readFile(filePath, 'utf8');
      const response = await createProvider(provider).run(NATSPEC_PROMPT, original);
      const documented = stripCodeFence(response.content);
      if (!looksLikeSolidity(documented))
        throw new Error('The AI response does not look like Solidity; the source file was left unchanged.');
      if (options.dryRun) {
        spinner.succeed(`NatSpec dry run completed using ${provider}.`);
        process.stdout.write(documented.endsWith('\n') ? documented : `${documented}\n`);
        logUsage(response, options.verbose);
        return;
      }
      if (outputPath === filePath) await fs.writeFile(`${filePath}.bak`, original, 'utf8');
      await fs.writeFile(outputPath, documented, 'utf8');
      spinner.succeed(
        `NatSpec documentation has been successfully added using ${provider}. Output file: ${outputPath}${
          outputPath === filePath ? ` (backup: ${filePath}.bak)` : ''
        }`
      );
      logUsage(response, options.verbose);
    } catch (error) {
      process.exitCode = 1;
      spinner.fail(error instanceof Error ? error.message : `Unable to process NatSpec with ${provider}.`);
    }
  });

program
  .command('security')
  .description('Run a Solidity security audit and create a PDF report')
  .option(...serviceOption)
  .option('--path <path>', 'Path to the Solidity file')
  .option('--out <path>', 'Write the PDF report to a different path')
  .option('--dry-run', 'Print the parsed report as JSON to stdout without writing a PDF')
  .option('--force', 'Overwrite an existing PDF report')
  .option('--verbose', 'Print provider usage information to stderr')
  .addHelpText(
    'after',
    '\nThe --service option selects the provider; default: openrouter. Existing reports are never overwritten without --force.'
  )
  .action(async (options: CommandOptions) => {
    const spinner = ora('Processing...').start();
    const provider = selectedProvider(options, spinner);
    if (!provider) return;
    const filePath = solidityPath(options, spinner);
    if (!filePath) return;
    if (!getProviderConfig(provider).apiKey) {
      spinner.fail(`No ${provider} API key found. Set the provider environment variable or use setkey --service ${provider}.`);
      process.exitCode = 1;
      return;
    }
    try {
      const pdfPath = resolveOutputPath(options, filePath.replace(/\.sol$/i, '.pdf'), filePath);
      if (!options.dryRun) ensureWritable(pdfPath, options.force);
      const response = await createProvider(provider).run(SECURITY_PROMPT, await fs.readFile(filePath, 'utf8'));
      const report = parseSecurityReport(response.content);
      if (options.dryRun) {
        spinner.succeed(`Security audit dry run completed using ${provider}.`);
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        logUsage(response, options.verbose);
        return;
      }
      await generatePDF(report, pdfPath, { provider, model: response.model, version, source: filePath });
      spinner.succeed(`Security report saved at: ${pdfPath} using ${provider}.`);
      logUsage(response, options.verbose);
    } catch (error) {
      process.exitCode = 1;
      spinner.fail(error instanceof Error ? error.message : `Unable to generate the security report with ${provider}.`);
    }
  });

program
  .command('help')
  .description('Display help information for available commands')
  .action(() => program.outputHelp());

program.parse(process.argv);

export { parseSecurityReport };
