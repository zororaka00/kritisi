#!/usr/bin/env node
const { Command } = require('commander');
const ora = require('ora');
const path = require('path');
const fs = require('fs');

const { CONFIG_PATH, generatePDF, loadKey, saveKey, saveModel } = require('./helper');
const { Groq, OpenAI } = require('./ai');

const program = new Command();

program
  .name("kritisi")
  .description("A powerful AI-driven security audit tool for Solidity smart contracts, designed to detect vulnerabilities, enhance code quality, and ensure compliance with best practices. Ideal for developers seeking fast, reliable security insights.")
  .version("1.0.0");

program
  .command("setkey")
  .description("Set an API key for the selected service")
  .option("--service <service>", "Specify the AI service to use (e.g., 'openai' or 'groq')")
  .addHelpText(
    'after',
    `
Example:
  $ npx kritisi setkey --service openai
  Enter the API key openai:
  (You will be prompted to input your API key interactively.)`
  )
  .action((options) => {
    const aiService = options?.service && options?.service == 'groq' ? 'groq' : 'openai';
    process.stdout.write(`Enter the API key ${aiService}: `);
    process.stdin.once("data", (data) => {
      const spinner = ora('Processing...').start();
      const key = data.toString().trim();
      saveKey(key, aiService);
      spinner.succeed('Key has been successfully saved.');
    });
  });

program
  .command("setmodel")
  .description("Set the AI model for the selected service")
  .option("--service <service>", "Specify the AI service to use (e.g., 'openai' or 'groq')")
  .addHelpText(
    'after',
    `
Example:
  $ npx kritisi setmodel --service openai
  Enter the model for openai or groq (e.g., 'gpt-4', 'llama-3.1-70b-versatile'):
  (You will be prompted to input the model interactively.)`
  )
  .action((options) => {
    const aiService = options?.service && options?.service == 'groq' ? 'groq' : 'openai';
    process.stdout.write(`Enter the model name for ${aiService} (e.g., 'gpt-4', 'llama-3.1-70b-versatile'): `);
    process.stdin.once("data", (data) => {
      const spinner = ora('Processing...').start();
      const modelName = data.toString().trim();
      saveModel(modelName, aiService);
      spinner.succeed(`Model '${modelName}' has been successfully set for ${aiService}.`);
    });
  });

program
  .command("natspec")
  .description("Process NatSpec documentation for Solidity files")
  .option("--service <service>", "Specify the AI service to use (e.g., 'openai' or 'groq')")
  .option("--path <path>", "Path to the Solidity file")
  .addHelpText(
    'after',
    `
Example:
  $ npx kritisi natspec --service openai --path ./contracts/MyContract.sol
  (Processes the file and adds NatSpec documentation.)`
  )
  .action(async (options) => {
    const spinner = ora('Processing...').start();
    const configPath = options.path ? path.resolve(options.path) : CONFIG_PATH;

    const aiService = options?.service && options?.service == 'groq' ? 'groq' : 'openai';
    const storedKey = loadKey(aiService);
    if (storedKey) {
      const promptText = "You are an AI designed to add NatSpec documentation to Solidity code. For each function, include clear descriptions for the purpose of the function, the parameters, and the return values using proper NatSpec tags. Respond only with the modified Solidity code in a valid Solidity format. Do not include any code block markers, additional explanations, or characters unrelated to the Solidity code itself.";
      fs.readFile(configPath, 'utf-8', (err, codeSolidity) => {
        if (err) {
          spinner.fail(`Error reading file: ${err}`);
        } else {
          const ai = aiService === 'openai' ? new OpenAI() : new Groq();
          ai.run(promptText, codeSolidity)
            .then((responseAi) => {
              fs.writeFile(configPath, responseAi?.content, 'utf-8', (errFs) => {
                if (errFs) {
                  spinner.fail(`Error writing NatSpec to file: ${errFs}`);
                } else {
                  spinner.succeed('NatSpec documentation has been successfully added to the file.');
                }
              });
            })
            .catch((errorAi) => spinner.fail(`Error processing with AI: ${errorAi}`));
        }
      });
    } else {
      spinner.fail(`No API key found. Please set a key using the 'setkey' command.`);
    }
  });

program
  .command("security")
  .description("Run a security audit for Solidity smart contracts")
  .option("--service <service>", "Specify the AI service to use (e.g., 'openai' or 'groq')")
  .option("--path <path>", "Path to the Solidity file")
  .addHelpText(
    'after',
    `
Example:
  $ npx kritisi security --service groq --path ./contracts/MyContract.sol
  (Analyzes the file and generates a security report in PDF format.)`
  )
  .action((options) => {
    const spinner = ora('Processing...').start();
    const configPath = options.path ? path.resolve(options.path) : CONFIG_PATH;

    const aiService = options?.service && options?.service == 'groq' ? 'groq' : 'openai';
    const storedKey = loadKey(aiService);
    if (storedKey) {
      const promptText = `You are an AI designed to analyze Solidity code for potential issues in business logic and security vulnerabilities. Review the provided Solidity code and identify any issues or vulnerabilities, categorizing them by severity level as follows:

        - **High**: Critical issues that could lead to severe security vulnerabilities or major functional failures.
        - **Medium**: Significant issues that may lead to moderate security risks or noticeable functional issues.
        - **Low**: Minor issues that could cause small inefficiencies, minor functional inaccuracies, or very low security risks.
        
        Respond only in valid JSON format, structured as follows:

        {
            "high": [
                {
                    "issue": "<description of high-severity issue>",
                    "suggestion": "<suggested improvement or fix>",
                    "code_highlight": "<relevant Solidity code snippet>"
                }
            ],
            "medium": [
                {
                    "issue": "<description of medium-severity issue>",
                    "suggestion": "<suggested improvement or fix>",
                    "code_highlight": "<relevant Solidity code snippet>"
                }
            ],
            "low": [
                {
                    "issue": "<description of low-severity issue>",
                    "suggestion": "<suggested improvement or fix>",
                    "code_highlight": "<relevant Solidity code snippet>"
                }
            ]
        }

        If no issues are found for a particular severity level, use an empty array for that category. Ensure the \`code_highlight\` field contains the exact portion of the Solidity code that is relevant to the described issue.`;
      fs.readFile(configPath, 'utf-8', (err, codeSolidity) => {
        if (err) {
          spinner.fail(`Error reading file: ${err}`);
        } else {
          const ai = aiService === 'openai' ? new OpenAI() : new Groq();
          ai.run(promptText, codeSolidity)
            .then((responseAi) => {
              const pdfPath = configPath.replace('.sol', '.pdf');
              generatePDF(JSON.parse(responseAi?.content), pdfPath)
              .then(() => spinner.succeed(`Security report saved at: ${pdfPath}`))
              .catch(() => spinner.fail('Something went wrong while generating the PDF.'));
            })
            .catch((errorAi) => spinner.fail(`Error processing with AI: ${errorAi}`));
        }
      });
    } else {
      console.error("No API key found. Please set a key using the 'setkey' command.");
    }
  });

program
  .command("help")
  .description("Display help information for available commands")
  .action(() => {
    program.outputHelp();
  });

program.parse(process.argv);

const options = program.opts();
if (options.key) {
  console.log("API key provided:", options.key);
}
