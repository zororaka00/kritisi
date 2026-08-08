#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import ora from 'ora';
import { merge } from 'sol-merger';
import { version } from '../package.json';
import { CONFIG_PATH, generatePDF, getProviderConfig, normalizeProvider, parseSecurityReport, saveFile, saveKey, saveModel, ProviderName, SecurityReport } from './helper';
import { createProvider } from './ai';

interface CommandOptions {
  path?: string;
  service?: string;
}

const serviceOption = ['--service <service>', 'AI provider: openrouter, openai, claude, or deepseek (default: openrouter).'] as const;
const program = new Command();

program
  .name('kritisi')
  .description('AI-powered Solidity security auditing and NatSpec documentation with OpenRouter, OpenAI, Claude, or DeepSeek.')
  .version(version)
  .addHelpText('after', '\nProviders: openrouter (default), openai, claude/anthropic, deepseek.\nAPI key/model env vars: OPENROUTER_API_KEY/OPENROUTER_MODEL, OPENAI_API_KEY/OPENAI_MODEL, ANTHROPIC_API_KEY/ANTHROPIC_MODEL, DEEPSEEK_API_KEY/DEEPSEEK_MODEL.\nOpenRouter example: kritisi security --service openrouter --path ./contracts/MyContract.sol\n');

function selectedProvider(options: CommandOptions, spinner: ReturnType<typeof ora>): ProviderName | null {
  try {
    return normalizeProvider(options.service);
  } catch (error) {
    process.exitCode = 1;
    spinner.fail(error instanceof Error ? error.message : 'Unknown provider.');
    return null;
  }
}

program
  .command('setkey')
  .description('Set an API key for the selected provider in the user-local config file')
  .option(...serviceOption)
  .addHelpText('after', '\nKeys are stored outside the package. Environment variables are recommended for CI.')
  .action((options: CommandOptions) => {
    const provider = normalizeProvider(options.service);
    process.stdout.write(`Enter the ${provider} API key: `);
    process.stdin.once('data', (data: Buffer) => {
      const spinner = ora('Processing...').start();
      try {
        saveKey(data.toString(), provider);
        spinner.succeed(`${provider} API key has been successfully saved.`);
      } catch (error) {
        process.exitCode = 1;
        spinner.fail(error instanceof Error ? error.message : `Unable to save the ${provider} API key.`);
      }
    });
  });

program
  .command('setmodel')
  .description('Set the model for the selected provider in the user-local config file')
  .option(...serviceOption)
  .addHelpText('after', '\nExamples: openai/gpt-4o-mini (OpenRouter), gpt-5.2 (OpenAI), claude-opus-4-6 (Claude), deepseek-chat (DeepSeek).')
  .action((options: CommandOptions) => {
    const provider = normalizeProvider(options.service);
    process.stdout.write(`Enter the ${provider} model name: `);
    process.stdin.once('data', (data: Buffer) => {
      const spinner = ora('Processing...').start();
      try {
        const model = data.toString().trim();
        saveModel(model, provider);
        spinner.succeed(`Model '${model}' has been successfully set for ${provider}.`);
      } catch (error) {
        process.exitCode = 1;
        spinner.fail(error instanceof Error ? error.message : `Unable to save the ${provider} model.`);
      }
    });
  });

program
  .command('merger')
  .description('Merge all imported Solidity files into a single file')
  .option('--path <path>', 'Specify the path to the Solidity file to be merged')
  .addHelpText('after', '\nThe merged file is written beside the input with _merge appended to its name.')
  .action(async (options: CommandOptions) => {
    const spinner = ora('Processing...').start();
    if (!options.path) {
      spinner.fail('No path specified. Use --path <path> to provide the Solidity file path.');
      process.exitCode = 1;
      return;
    }
    try {
      const filePath = path.resolve(options.path);
      const mergedCode = await merge(filePath);
      const mergedFilePath = filePath.replace(/\.sol$/i, '_merge.sol');
      await saveFile(mergedFilePath, mergedCode);
      spinner.succeed(`Files merged successfully. Output file: ${mergedFilePath}`);
    } catch (error) {
      process.exitCode = 1;
      spinner.fail(error instanceof Error ? error.message : 'Unable to merge Solidity files.');
    }
  });

function readInputPath(options: CommandOptions): string | null {
  if (!options.path) return null;
  return path.resolve(options.path);
}

const natspecPrompt = 'You are an AI designed to add NatSpec documentation to Solidity code. For each function, include clear descriptions for the purpose of the function, the parameters, and the return values using proper NatSpec tags. Respond only with the modified Solidity code in a valid Solidity format. Do not include code block markers or explanations.';

program
  .command('natspec')
  .description('Process NatSpec documentation for a Solidity file')
  .option(...serviceOption)
  .option('--path <path>', 'Path to the Solidity file')
  .addHelpText('after', '\nThe --service option selects the provider; default: openrouter.')
  .action(async (options: CommandOptions) => {
    const spinner = ora('Processing...').start();
    const provider = selectedProvider(options, spinner);
    const filePath = readInputPath(options);
    if (!provider || !filePath) {
      if (provider && !filePath) spinner.fail(`No path specified. Use --path <path>. Config is stored at ${CONFIG_PATH}.`);
      process.exitCode = 1;
      return;
    }
    if (!getProviderConfig(provider).apiKey) {
      spinner.fail(`No ${provider} API key found. Set the provider environment variable or use setkey --service ${provider}.`);
      process.exitCode = 1;
      return;
    }
    try {
      const codeSolidity = await fs.readFile(filePath, 'utf8');
      const response = await createProvider(provider).run(natspecPrompt, codeSolidity);
      await fs.writeFile(filePath, response.content, 'utf8');
      spinner.succeed(`NatSpec documentation has been successfully added using ${provider}.`);
    } catch (error) {
      process.exitCode = 1;
      spinner.fail(error instanceof Error ? error.message : `Unable to process NatSpec with ${provider}.`);
    }
  });

const securityPrompt = 'You are an AI designed to analyze Solidity code for business-logic issues and security vulnerabilities. Categorize findings as High, Medium, or Low. Respond with only a single JSON object (no markdown fences, no prose) with exactly these arrays: high, medium, low. Each item must contain issue, suggestion, and code_highlight strings. Use an empty array when no issues are found.';

program
  .command('security')
  .description('Run a Solidity security audit and create a PDF report')
  .option(...serviceOption)
  .option('--path <path>', 'Path to the Solidity file')
  .addHelpText('after', '\nThe --service option selects the provider; default: openrouter.')
  .action(async (options: CommandOptions) => {
    const spinner = ora('Processing...').start();
    const provider = selectedProvider(options, spinner);
    const filePath = readInputPath(options);
    if (!provider || !filePath) {
      if (provider && !filePath) spinner.fail('No path specified. Use --path <path>.');
      process.exitCode = 1;
      return;
    }
    if (!getProviderConfig(provider).apiKey) {
      spinner.fail(`No ${provider} API key found. Set the provider environment variable or use setkey --service ${provider}.`);
      process.exitCode = 1;
      return;
    }
    try {
      const response = await createProvider(provider).run(securityPrompt, await fs.readFile(filePath, 'utf8'));
      const pdfPath = filePath.replace(/\.sol$/i, '.pdf');
      await generatePDF(parseSecurityReport(response.content), pdfPath);
      spinner.succeed(`Security report saved at: ${pdfPath} using ${provider}.`);
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
