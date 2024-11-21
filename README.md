# Kritisi: AI-Powered Security Audit Tool for Solidity Smart Contracts

**Kritisi** is an AI-powered tool designed to analyze the security and documentation of Solidity code. This tool helps developers detect vulnerabilities, improve code quality, and ensure compliance with best practices.

---

## ✨ Key Features

- **Security Audit**: Analyze Solidity code to identify security vulnerabilities with structured reporting.
- **NatSpec Documentation**: Automatically add NatSpec documentation to functions within Solidity code.
- **Ease of Use**: CLI-based, allowing for simple and efficient interaction.
- **AI Service Support**: Supports OpenAI and Groq services for flexibility.

---

## 🚀 Installation

To use **Kritisi**, make sure you have the latest version of Node.js installed. Then, install the tool globally using the following command:

```bash
npm install -g kritisi
```

---

## 📘 Usage Instructions

Once **Kritisi** is installed globally, you can use it from the command line by typing `kritisi` followed by the desired command. Here are the available commands:

1. **View Help**
   To see a list of available commands, use:

   ```bash
   kritisi help
   ```

   Example output:

   ```
   Usage: kritisi [options] [command]

   A powerful AI-driven security audit tool for Solidity smart contracts.
   Detect vulnerabilities, enhance code quality, and ensure compliance with best practices.

   Options:
     -V, --version           output the version number
     -h, --help              display help for command

   Commands:
     setkey                 Set an API key for the selected service
     natspec                Process NatSpec documentation for Solidity files
     security               Run a security audit for Solidity smart contracts
     help                   Display help information for available commands

   Run 'kritisi <command> --help' for detailed usage of a specific command.
   ```

2. **Set API Key**
   Before using the AI services, you need to set up your API key. Use the following command:

   ```bash
   kritisi setkey --service <service>
   ```

   `<service>`: Specify the service to be used, such as `openai` or `groq`. Example:

   ```bash
   kritisi setkey --service openai
   ```

   You will be prompted to enter your API key.

3. **Add NatSpec Documentation**
   To automatically add NatSpec documentation to your Solidity code, use the following command:

   ```bash
   kritisi natspec --service <service> --path <path>
   ```

   `<service>`: Specify the AI service (e.g., `openai` or `groq`).  
   `<path>`: Specify the path to your Solidity file. Example:

   ```bash
   kritisi natspec --service openai --path ./contracts/MyContract.sol
   ```

4. **Security Audit**
   To run a security audit on your Solidity contracts, use:

   ```bash
   kritisi security --service <service> --path <path>
   ```

   `<service>`: Specify the AI service (e.g., `openai` or `groq`).  
   `<path>`: Specify the path to your Solidity file. Example:

   ```bash
   kritisi security --service groq --path ./contracts/MyContract.sol
   ```

The audit results will be saved as a PDF file in the same location as your Solidity file.

## 📂 Example Output

### Security Audit

The results are presented as a JSON report converted into a PDF file like this:

```json
{
  "high": [
    {
      "issue": "Reentrancy vulnerability in withdraw function.",
      "suggestion": "Use the Checks-Effects-Interactions pattern.",
      "code_highlight": "function withdraw() public { ... }"
    }
  ],
  "medium": [],
  "low": []
}
```

## 🔧 Development

### Running Locally

To run the tool locally, follow these steps:

1. Clone this repository:

   ```bash
   git clone https://github.com/username/kritisi.git
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the tool:

   ```bash
   npm run build
   ```

4. Run the tool:

   ```bash
   node dist/index.js
   ```

## 🤝 Contributing

We greatly appreciate your contributions! Please fork this repository and submit a pull request with your changes or additions.

## 🛠 Support

If you encounter any issues or have questions, please open an issue in this repository or contact us at rakawidhiantoro@gmail.com.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

🎉 Thank you for using **Kritisi**! We hope this tool proves beneficial in enhancing the security and quality of your smart contracts.
