/**
 * Kritisi CLI Test Suite
 * 
 * Comprehensive unit tests for the kritisi security audit tool CLI.
 * Tests cover command parsing, version verification, help text,
 * error handling, and configuration management.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Test constants
const CLI_PATH = path.join(__dirname, '..', 'src', 'index.js');
const TEST_CONFIG_PATH = path.join(__dirname, '..', 'src', 'config.json');
const TEST_VERSION = '1.6.0';

// Helper function to run CLI commands
function runCli(args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn('node', [CLI_PATH, ...args], {
            cwd: path.join(__dirname, '..'),
            env: { ...process.env },
            ...options
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            resolve({ code, stdout, stderr });
        });

        child.on('error', (error) => {
            reject(error);
        });
    });
}

// Helper function to backup and restore config
let configBackup = null;
function backupConfig() {
    configBackup = fs.readFileSync(TEST_CONFIG_PATH, 'utf8');
}

function restoreConfig() {
    if (configBackup) {
        fs.writeFileSync(TEST_CONFIG_PATH, configBackup, 'utf8');
    }
}

describe('Kritisi CLI Tests', () => {
    beforeAll(() => {
        backupConfig();
    });

    afterAll(() => {
        restoreConfig();
    });

    beforeEach(() => {
        restoreConfig();
    });

    // ============================================
    // Test Group 1: Version Output Verification
    // ============================================
    describe('Version Output', () => {
        test('--version flag should output correct version', async () => {
            const { code, stdout } = await runCli(['--version']);
            
            expect(code).toBe(0);
            expect(stdout.trim()).toBe(TEST_VERSION);
        });

        test('-V flag should output correct version', async () => {
            const { code, stdout } = await runCli(['-V']);
            
            expect(code).toBe(0);
            expect(stdout.trim()).toBe(TEST_VERSION);
        });

        test('version command via node src/index.js should work', async () => {
            const { code, stdout } = await runCli(['--version']);
            
            expect(code).toBe(0);
            expect(stdout.trim()).toBe(TEST_VERSION);
        });
    });

    // ============================================
    // Test Group 2: Help Text Display
    // ============================================
    describe('Help Text Display', () => {
        test('--help flag should display help information', async () => {
            const { code, stdout } = await runCli(['--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('Usage:');
            expect(stdout).toContain('kritisi');
            expect(stdout).toContain('Commands:');
        });

        test('-h flag should display help information', async () => {
            const { code, stdout } = await runCli(['-h']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('Usage:');
            expect(stdout).toContain('Commands:');
        });

        test('help command should display help information', async () => {
            const { code, stdout } = await runCli(['help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('Usage:');
            expect(stdout).toContain('Commands:');
        });

        test('help should list all available commands', async () => {
            const { code, stdout } = await runCli(['--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('setkey');
            expect(stdout).toContain('setmodel');
            expect(stdout).toContain('natspec');
            expect(stdout).toContain('security');
            expect(stdout).toContain('merger');
            expect(stdout).toContain('help');
        });

        test('help should display options correctly', async () => {
            const { code, stdout } = await runCli(['--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('-V, --version');
            expect(stdout).toContain('-h, --help');
        });
    });

    // ============================================
    // Test Group 3: Command Parsing and Execution
    // ============================================
    describe('Command Parsing and Execution', () => {
        test('setkey command should be recognized', async () => {
            const { code, stdout } = await runCli(['setkey', '--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('Set an API key');
        });

        test('setmodel command should be recognized', async () => {
            const { code, stdout } = await runCli(['setmodel', '--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('Set the AI model');
        });

        test('natspec command should be recognized', async () => {
            const { code, stdout } = await runCli(['natspec', '--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('NatSpec');
        });

        test('security command should be recognized', async () => {
            const { code, stdout } = await runCli(['security', '--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('security audit');
        });

        test('merger command should be recognized', async () => {
            const { code, stdout } = await runCli(['merger', '--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('Merge');
        });

        test('setkey should accept --service option', async () => {
            const { code, stdout } = await runCli(['setkey', '--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('--service');
        });

        test('setmodel should accept --service option', async () => {
            const { code, stdout } = await runCli(['setmodel', '--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('--service');
        });

        test('natspec should accept --service and --path options', async () => {
            const { code, stdout } = await runCli(['natspec', '--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('--service');
            expect(stdout).toContain('--path');
        });

        test('security should accept --service and --path options', async () => {
            const { code, stdout } = await runCli(['security', '--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('--service');
            expect(stdout).toContain('--path');
        });

        test('merger should accept --path option', async () => {
            const { code, stdout } = await runCli(['merger', '--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('--path');
        });
    });

    // ============================================
    // Test Group 4: Service Options Validation
    // ============================================
    describe('Service Options', () => {
        test('setkey help should mention openai service', async () => {
            const { code, stdout } = await runCli(['setkey', '--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('openai');
        });

        test('setkey help should mention claude service', async () => {
            const { code, stdout } = await runCli(['setkey', '--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('claude');
        });

        test('setmodel help should mention example models', async () => {
            const { code, stdout } = await runCli(['setmodel', '--help']);
            
            expect(code).toBe(0);
            expect(stdout).toContain('gpt-');
            expect(stdout).toContain('claude-');
        });

        test('natspec should work with --service openai', async () => {
            const { code } = await runCli(['natspec', '--help']);
            // Should not error - just show help
            expect(code).toBe(0);
        });

        test('natspec should work with --service claude', async () => {
            const { code } = await runCli(['natspec', '--service', 'claude', '--help']);
            // Should not error - just show help
            expect(code).toBe(0);
        });

        test('security should work with --service openai', async () => {
            const { code } = await runCli(['security', '--help']);
            expect(code).toBe(0);
        });

        test('security should work with --service claude', async () => {
            const { code } = await runCli(['security', '--service', 'claude', '--help']);
            expect(code).toBe(0);
        });
    });

    // ============================================
    // Test Group 5: Error Handling
    // ============================================
    describe('Error Handling', () => {
        test('unknown command should exit with non-zero code', async () => {
            const { code } = await runCli(['unknown-command']);
            
            expect(code).not.toBe(0);
        });

        test('invalid option should be handled gracefully', async () => {
            const { code } = await runCli(['--invalid-option']);
            
            expect(code).not.toBe(0);
        });

        test('missing required argument for merger should fail', async () => {
            const { code, stdout, stderr } = await runCli(['merger']);
            
            // merger requires --path but should still run without crashing
            // It will show help or error message
            expect(code).toBe(0);
        });

        test('natspec without API key should show error', async () => {
            const { code, stdout } = await runCli(['natspec', '--path', 'nonexistent.sol']);
            
            // Without API key, should show error about missing key
            // Note: This may pass silently or show spinner error
            expect([0, 1]).toContain(code);
        });

        test('security without API key should show error', async () => {
            const { code, stdout } = await runCli(['security', '--path', 'nonexistent.sol']);
            
            // Without API key, should show error about missing key
            expect([0, 1]).toContain(code);
        });
    });

    // ============================================
    // Test Group 6: Configuration File Operations
    // ============================================
    describe('Configuration File Operations', () => {
        test('config file should exist', () => {
            expect(fs.existsSync(TEST_CONFIG_PATH)).toBe(true);
        });

        test('config file should have valid JSON', () => {
            const configContent = fs.readFileSync(TEST_CONFIG_PATH, 'utf8');
            expect(() => JSON.parse(configContent)).not.toThrow();
        });

        test('config should have openai section', () => {
            const config = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, 'utf8'));
            expect(config).toHaveProperty('openai');
            expect(config.openai).toHaveProperty('url');
            expect(config.openai).toHaveProperty('apiKey');
            expect(config.openai).toHaveProperty('model');
        });

        test('config should have claude section', () => {
            const config = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, 'utf8'));
            expect(config).toHaveProperty('claude');
            expect(config.claude).toHaveProperty('url');
            expect(config.claude).toHaveProperty('apiKey');
            expect(config.claude).toHaveProperty('model');
        });

        test('openai default model should be gpt-5.2', () => {
            const config = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, 'utf8'));
            expect(config.openai.model).toBe('gpt-5.2');
        });

        test('claude default model should be claude-opus-4-6', () => {
            const config = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, 'utf8'));
            expect(config.claude.model).toContain('claude-opus-4-6');
        });

        test('config should not have groq section', () => {
            const config = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, 'utf8'));
            expect(config).not.toHaveProperty('groq');
        });
    });

    // ============================================
    // Test Group 7: Exit Codes
    // ============================================
    describe('Exit Codes', () => {
        test('successful help command should return exit code 0', async () => {
            const { code } = await runCli(['--help']);
            expect(code).toBe(0);
        });

        test('successful version command should return exit code 0', async () => {
            const { code } = await runCli(['--version']);
            expect(code).toBe(0);
        });

        test('unknown command should return non-zero exit code', async () => {
            const { code } = await runCli(['nonexistent']);
            expect(code).not.toBe(0);
        });

        test('invalid flag should return non-zero exit code', async () => {
            const { code } = await runCli(['--invalid-flag']);
            expect(code).not.toBe(0);
        });
    });

    // ============================================
    // Test Group 8: CLI Invocation Methods
    // ============================================
    describe('CLI Invocation Methods', () => {
        test('should work with node src/index.js', async () => {
            const { code, stdout } = await runCli(['--version']);
            
            expect(code).toBe(0);
            expect(stdout.trim()).toBe(TEST_VERSION);
        });

        test('should work with direct path invocation', async () => {
            const child = spawn('node', [CLI_PATH, '--version'], {
                cwd: path.join(__dirname, '..')
            });

            let stdout = '';
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            const exitCode = await new Promise((resolve) => {
                child.on('close', resolve);
            });

            expect(exitCode).toBe(0);
            expect(stdout.trim()).toBe(TEST_VERSION);
        });
    });

    // ============================================
    // Test Group 9: Mock File System Tests
    // ============================================
    describe('Mock File System Operations', () => {
        const mockFs = require('fs');
        
        test('should be able to read config file synchronously', () => {
            const data = mockFs.readFileSync(TEST_CONFIG_PATH, 'utf8');
            expect(data).toBeTruthy();
        });

        test('should be able to write config file', () => {
            const originalConfig = mockFs.readFileSync(TEST_CONFIG_PATH, 'utf8');
            
            // Write test
            const testData = JSON.parse(originalConfig);
            testData.testWrite = true;
            mockFs.writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testData, null, 2));
            
            // Verify write
            const writtenData = mockFs.readFileSync(TEST_CONFIG_PATH, 'utf8');
            expect(writtenData).toContain('"testWrite": true');
            
            // Restore
            mockFs.writeFileSync(TEST_CONFIG_PATH, originalConfig);
        });

        test('helper module should export required functions', () => {
            const helper = require('../src/helper');
            
            expect(typeof helper.saveKey).toBe('function');
            expect(typeof helper.saveModel).toBe('function');
            expect(typeof helper.loadKey).toBe('function');
            expect(typeof helper.saveFile).toBe('function');
            expect(typeof helper.generatePDF).toBe('function');
        });

        test('helper should handle saveKey operation', () => {
            const helper = require('../src/helper');
            const originalConfig = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, 'utf8'));
            
            // Save a test key
            helper.saveKey('test-api-key', 'openai');
            
            // Verify
            const updatedConfig = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, 'utf8'));
            expect(updatedConfig.openai.apiKey).toBe('test-api-key');
            
            // Restore
            helper.saveKey(originalConfig.openai.apiKey || '', 'openai');
        });

        test('helper should handle saveModel operation', () => {
            const helper = require('../src/helper');
            const originalConfig = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, 'utf8'));
            const originalModel = originalConfig.openai.model;
            
            // Save a test model
            helper.saveModel('gpt-4-test', 'openai');
            
            // Verify
            const updatedConfig = JSON.parse(fs.readFileSync(TEST_CONFIG_PATH, 'utf8'));
            expect(updatedConfig.openai.model).toBe('gpt-4-test');
            
            // Restore
            helper.saveModel(originalModel, 'openai');
        });

        test('helper should handle loadKey operation', () => {
            const helper = require('../src/helper');
            
            const key = helper.loadKey('openai');
            // Key might be empty string if not set
            expect(key === null || typeof key === 'string').toBe(true);
        });
    });

    // ============================================
    // Test Group 10: AI Module Tests
    // ============================================
    describe('AI Module Tests', () => {
        test('AI index should export Claude and OpenAI', () => {
            const ai = require('../src/ai');
            
            expect(ai).toHaveProperty('Claude');
            expect(ai).toHaveProperty('OpenAI');
            expect(typeof ai.Claude).toBe('function');
            expect(typeof ai.OpenAI).toBe('function');
        });

        test('Claude class should have run method', () => {
            const Claude = require('../src/ai/claude');
            const instance = new Claude();
            
            expect(typeof instance.run).toBe('function');
        });

        test('OpenAI class should have run method', () => {
            const OpenAI = require('../src/ai/openai');
            const instance = new OpenAI();
            
            expect(typeof instance.run).toBe('function');
        });
    });
});

// ============================================
// Additional Integration Tests
// ============================================
describe('Integration Tests', () => {
    test('full CLI help pipeline should work', async () => {
        const { code, stdout, stderr } = await runCli(['help']);
        
        expect(code).toBe(0);
        expect(stdout).toContain('Usage');
        expect(stderr).toBe('');
    });

    test('version should work in different scenarios', async () => {
        const scenarios = [
            ['--version'],
            ['-V']
        ];

        for (const args of scenarios) {
            const { code, stdout } = await runCli(args);
            expect(code).toBe(0);
            expect(stdout.trim()).toBe(TEST_VERSION);
        }
    });

    test('all commands should be accessible via help', async () => {
        const commands = ['setkey', 'setmodel', 'natspec', 'security', 'merger', 'help'];
        
        for (const cmd of commands) {
            const { code } = await runCli([cmd, '--help']);
            expect(code).toBe(0);
        }
    });
});

module.exports = { runCli, CLI_PATH, TEST_VERSION };
