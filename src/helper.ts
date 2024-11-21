import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

import Config from './config.json';
import { ResultSecurityAi } from './types';

export const CONFIG_PATH = path.join(__dirname, 'config.json');

export function saveKey(newApiKey: string, service: 'openai' | 'groq') {
    let newConfig = Config;
    newConfig[service].apiKey = newApiKey;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
}

export function loadKey(service: 'openai' | 'groq'): string | null {
    const dataKey = Config[service];
    return dataKey && dataKey.apiKey.length > 0 ? dataKey.apiKey : null;
}

export function generatePDF(result: ResultSecurityAi, filePath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        try {
            // Ensure the directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true }); // Create the directory if it doesn't exist
            }

            // Create a new PDF document with a margin
            const doc = new PDFDocument({ margin: 50 });
            const output = fs.createWriteStream(filePath);

            // Handle stream errors to ensure proper rejection
            output.on('error', (err) => {
                console.error(`Stream Error: ${err.message}`);
                reject(false);
            });

            // Pipe the document to a writable stream
            doc.pipe(output);

            // Add the report title
            doc
                .fontSize(18)
                .fillColor('#333')
                .text('Solidity Code Analysis Report', { align: 'center' })
                .moveDown();

            // Section header: Analysis Results
            doc
                .fontSize(14)
                .fillColor('#000')
                .text('Analysis Results:', { underline: true })
                .moveDown(0.5);

            // Helper function to write each category
            const writeCategory = (
                title: string,
                color: string,
                issues: { issue: string; suggestion: string; code_highlight: string }[]
            ) => {
                // Write the category title
                doc
                    .fontSize(16)
                    .fillColor(color)
                    .text(title, { underline: true })
                    .moveDown(0.5);

                // Write issues if any, otherwise display "No issues found."
                if (issues.length === 0) {
                    doc.fontSize(12).fillColor('#333').text('No issues found.', { indent: 20 });
                } else {
                    issues.forEach((issue, index) => {
                        // Issue description
                        doc
                            .fontSize(12)
                            .fillColor('#000')
                            .text(`Issue ${index + 1}: ${issue.issue}`, { indent: 20 })
                            .moveDown(0.5);

                        // Suggestion
                        doc
                            .fontSize(12)
                            .fillColor('#000')
                            .text(`Suggestion: ${issue.suggestion}`, { indent: 40 })
                            .moveDown(0.5);

                        // Code highlight
                        doc
                            .fontSize(10)
                            .fillColor('#555')
                            .font('Courier')
                            .text(`Code Highlight:\n${issue.code_highlight}`, { indent: 60, lineGap: 2 })
                            .font('Helvetica') // Reset to default font
                            .moveDown(1);
                    });
                }
                doc.moveDown(1);
            };

            // Write each severity category
            writeCategory('High Severity Issues', '#FF0000', result.high);
            writeCategory('Medium Severity Issues', '#FFA500', result.medium);
            writeCategory('Low Severity Issues', '#008000', result.low);

            // Add a footer note at the bottom of the last page
            const addFooter = () => {
                doc
                    .fontSize(10)
                    .fillColor('#888')
                    .text('Generated by Kritisi', { align: 'center' });
            };

            doc.on('pageAdded', addFooter); // Add footer to every new page
            addFooter(); // Add footer to the first page

            // Finalize the document and handle the stream finish
            doc.end();
            output.on('finish', () => resolve(true));
        } catch (error) {
            console.log({error})
            reject(false);
        }
    });
}