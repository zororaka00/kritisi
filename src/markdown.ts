import path from 'node:path';
import { saveFileAtomic } from './helper';
import type { SecurityReport } from './helper';

export type ReportFormat = 'pdf' | 'markdown';

export interface ReportUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface MarkdownReportMetadata {
  target: string;
  provider: string;
  model: string;
  version: string;
  usage?: ReportUsage;
  generatedAt?: Date;
  details?: Array<[string, string]>;
}

function escapeCell(value: string): string {
  return String(value).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function codeBlock(code: string, language: string): string {
  const runs = code.match(/`+/g) || [];
  const fenceLength = Math.max(3, ...runs.map((run) => run.length + 1));
  const fence = '`'.repeat(fenceLength);
  return `${fence}${language}\n${code.replace(/\s+$/, '')}\n${fence}`;
}

export function formatForReportPath(filePath: string): ReportFormat {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.pdf') return 'pdf';
  if (extension === '.md' || extension === '.markdown') return 'markdown';
  throw new Error(`Report path must end in .pdf, .md, or .markdown: ${filePath}`);
}

export function renderMarkdownReport(report: SecurityReport, metadata: MarkdownReportMetadata): string {
  const counts = {
    high: report.high.length,
    medium: report.medium.length,
    low: report.low.length
  };
  const total = counts.high + counts.medium + counts.low;
  const risk = counts.high > 0 ? 'HIGH RISK' : counts.medium > 0 ? 'MEDIUM RISK' : counts.low > 0 ? 'LOW RISK' : 'CLEAN';
  const generatedAt = metadata.generatedAt ?? new Date();
  const rows: Array<[string, string]> = [
    ['Target', metadata.target],
    ['Provider', metadata.provider],
    ['Model', metadata.model],
    ['Overall risk', risk],
    ['Generated', generatedAt.toISOString()],
    ['Engine', `Kritisi v${metadata.version}`],
    ...(metadata.details ?? [])
  ];

  const lines: string[] = [
    '# Solidity Security Audit Report',
    '',
    `**${risk}**`,
    '',
    '| Field | Value |',
    '| --- | --- |',
    ...rows.map(([label, value]) => `| ${escapeCell(label)} | ${escapeCell(value)} |`),
    '',
    '> This report is an AI-assisted preliminary review, not a substitute for a professional security audit. Verify every finding independently before acting on it.',
    '',
    '## Summary',
    '',
    '| Severity | Findings |',
    '| --- | ---: |',
    `| High | ${counts.high} |`,
    `| Medium | ${counts.medium} |`,
    `| Low | ${counts.low} |`,
    `| **Total** | **${total}** |`,
    ''
  ];

  if (metadata.usage) {
    lines.push(
      '## Usage',
      '',
      `- Prompt tokens: ${metadata.usage.prompt_tokens}`,
      `- Completion tokens: ${metadata.usage.completion_tokens}`,
      `- Total tokens: ${metadata.usage.total_tokens}`,
      ''
    );
  }

  const sections: Array<{ key: keyof SecurityReport; label: string; prefix: string }> = [
    { key: 'high', label: 'High severity', prefix: 'H' },
    { key: 'medium', label: 'Medium severity', prefix: 'M' },
    { key: 'low', label: 'Low severity', prefix: 'L' }
  ];

  for (const section of sections) {
    const issues = report[section.key];
    lines.push(`## ${section.label} (${issues.length})`, '');
    if (issues.length === 0) {
      lines.push('No issues found.', '');
      continue;
    }
    issues.forEach((issue, index) => {
      const title = issue.issue.replace(/\s+/g, ' ').trim();
      lines.push(
        `### ${section.prefix}-${String(index + 1).padStart(2, '0')}: ${title}`,
        '',
        '**Suggestion:**',
        '',
        issue.suggestion.trim(),
        '',
        '**Code highlight:**',
        '',
        codeBlock(issue.code_highlight, 'solidity'),
        ''
      );
    });
  }

  lines.push(
    '## Important',
    '',
    'AI-assisted preliminary review. Model output can be incomplete or incorrect, and instructions embedded in audited code can influence it. Verify every finding independently.',
    ''
  );
  return `${lines.join('\n')}\n`;
}

export function writeMarkdownReport(filePath: string, report: SecurityReport, metadata: MarkdownReportMetadata): void {
  saveFileAtomic(filePath, renderMarkdownReport(report, metadata));
}
