import * as fs from 'node:fs';
import * as path from 'node:path';
import PDFDocument from 'pdfkit';
import type { PDFMetadata, SecurityIssue, SecurityReport } from './helper';

type SeverityKey = 'high' | 'medium' | 'low';

interface SeverityStyle {
  key: SeverityKey;
  label: string;
  short: string;
  color: string;
  tint: string;
  border: string;
}

const COLORS = {
  ink: '#0F172A',
  body: '#1F2937',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  surface: '#F8FAFC',
  white: '#FFFFFF',
  accent: '#6366F1'
};

const SEVERITIES: SeverityStyle[] = [
  { key: 'high', label: 'High severity', short: 'H', color: '#B91C1C', tint: '#FEF2F2', border: '#FECACA' },
  { key: 'medium', label: 'Medium severity', short: 'M', color: '#B45309', tint: '#FFFBEB', border: '#FDE68A' },
  { key: 'low', label: 'Low severity', short: 'L', color: '#0F766E', tint: '#F0FDFA', border: '#99F6E4' }
];

function formatTimestamp(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function generatePDF(result: SecurityReport, filePath: string, metadata: PDFMetadata = {}): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
      const generatedAt = metadata.generatedAt ?? new Date();
      const sourcePath = metadata.source ? path.resolve(metadata.source) : null;
      const sourceName = sourcePath ? path.basename(sourcePath) : 'Solidity contract';
      const versionLabel = metadata.version ? `v${metadata.version}` : '';
      const footerBrand = versionLabel ? `Kritisi ${versionLabel}` : 'Kritisi';
      const counts: Record<SeverityKey, number> = {
        high: result.high.length,
        medium: result.medium.length,
        low: result.low.length
      };
      const total = counts.high + counts.medium + counts.low;
      const risk =
        counts.high > 0
          ? { label: 'HIGH RISK', color: '#B91C1C', tint: '#FEF2F2', border: '#FECACA' }
          : counts.medium > 0
            ? { label: 'MEDIUM RISK', color: '#B45309', tint: '#FFFBEB', border: '#FDE68A' }
            : counts.low > 0
              ? { label: 'LOW RISK', color: '#0F766E', tint: '#F0FDFA', border: '#99F6E4' }
              : { label: 'CLEAN', color: '#15803D', tint: '#F0FDF4', border: '#BBF7D0' };

      const doc = new PDFDocument({
        margin: 50,
        bufferPages: true,
        info: {
          Title: `Solidity Security Audit Report - ${sourceName}`,
          Author: 'Kritisi',
          Subject: 'AI-assisted Solidity security audit',
          Keywords: 'solidity, security, audit, kritisi',
          Creator: `Kritisi ${versionLabel}`.trim(),
          CreationDate: generatedAt
        }
      });
      const output = fs.createWriteStream(filePath);
      let settled = false;
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error('Unable to generate the PDF report.'));
      };
      output.on('error', fail);
      doc.on('error', fail);
      doc.pipe(output);

      const left = (): number => doc.page.margins.left;
      const right = (): number => doc.page.width - doc.page.margins.right;
      const contentWidth = (): number => right() - left();
      const ensureSpace = (height: number): void => {
        if (doc.y + height > doc.page.maxY()) doc.addPage();
      };
      const measure = (text: string, font: string, size: number, width: number, lineGap = 0): number => {
        doc.font(font).fontSize(size);
        return doc.heightOfString(text || ' ', { width, lineGap });
      };
      const fitText = (value: string, maxWidth: number): string => {
        if (doc.widthOfString(value) <= maxWidth) return value;
        let clipped = value;
        while (clipped.length > 1 && doc.widthOfString(`${clipped}...`) > maxWidth) clipped = clipped.slice(0, -1);
        return `${clipped}...`;
      };

      const drawCover = (): void => {
        const width = doc.page.width;
        const height = doc.page.height;
        doc.rect(0, 0, width, height).fill(COLORS.ink);
        doc.rect(0, 0, width, 6).fill(COLORS.accent);

        doc.font('Helvetica-Bold').fontSize(10).fillColor('#A5B4FC').text('KRITISI', 60, 70, { characterSpacing: 3, lineBreak: false });
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor('#64748B')
          .text('SOLIDITY SECURITY REVIEW', 60, 86, { characterSpacing: 1.8, lineBreak: false });

        doc.font('Helvetica-Bold').fontSize(34).fillColor('#F8FAFC').text('Solidity Security', 60, 150, { lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(34).fillColor('#F8FAFC').text('Audit Report', 60, 192, { lineBreak: false });

        doc.font('Helvetica').fontSize(12).fillColor('#CBD5E1');
        doc.text(fitText(sourceName, width - 120), 60, 262, { lineBreak: false });
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#94A3B8')
          .text(`Generated ${formatTimestamp(generatedAt)}`, 60, 284, { lineBreak: false });

        const badgeWidth = 150;
        const badgeY = 332;
        doc.roundedRect(60, badgeY, badgeWidth, 34, 6).fillAndStroke(risk.color, risk.color);
        doc
          .font('Helvetica-Bold')
          .fontSize(11)
          .fillColor('#FFFFFF')
          .text(risk.label, 60, badgeY + 11, { width: badgeWidth, align: 'center', lineBreak: false });
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor('#94A3B8')
          .text(`${total} finding${total === 1 ? '' : 's'} reported`, 60 + badgeWidth + 16, badgeY + 11, { lineBreak: false });

        const boxGap = 12;
        const boxWidth = (width - 120 - boxGap * 2) / 3;
        const boxHeight = 86;
        const boxY = 402;
        SEVERITIES.forEach((style, index) => {
          const x = 60 + index * (boxWidth + boxGap);
          doc.roundedRect(x, boxY, boxWidth, boxHeight, 8).fill('#1E293B');
          doc.roundedRect(x + 16, boxY + 18, 28, 4, 2).fill(style.color);
          doc
            .font('Helvetica-Bold')
            .fontSize(26)
            .fillColor(style.color)
            .text(String(counts[style.key]), x + 16, boxY + 32, { lineBreak: false });
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor('#94A3B8')
            .text(style.label.toUpperCase(), x + 16, boxY + 66, { characterSpacing: 0.7, lineBreak: false });
        });

        const panelY = 522;
        const panelHeight = 158;
        doc.roundedRect(60, panelY, width - 120, panelHeight, 8).fill('#111827');
        const rows: Array<[string, string]> = [
          ['Source', sourcePath ?? 'Not provided'],
          ['Provider', metadata.provider ?? 'Not specified'],
          ['Model', metadata.model ?? 'Not specified'],
          ['Engine', `Kritisi ${versionLabel}`.trim() || 'Kritisi']
        ];
        rows.forEach(([label, value], index) => {
          const rowY = panelY + 20 + index * 30;
          doc
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .fillColor('#64748B')
            .text(label.toUpperCase(), 80, rowY, { characterSpacing: 0.8, lineBreak: false });
          doc.font('Helvetica').fontSize(9.5).fillColor('#E2E8F0');
          doc.text(fitText(value, width - 320), 190, rowY - 1, { lineBreak: false });
        });

        doc
          .moveTo(60, height - 70)
          .lineTo(width - 60, height - 70)
          .strokeColor('#1E293B')
          .lineWidth(1)
          .stroke();
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#64748B')
          .text(`Generated by ${footerBrand} · AI-assisted preliminary review`, 60, height - 52, {
            lineBreak: false
          });
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#475569')
          .text('Not a substitute for a professional security audit.', 60, height - 38, { lineBreak: false });
      };

      const drawMetaTable = (): void => {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink).text('Report details', left(), doc.y);
        doc.moveDown(0.4);
        let y = doc.y;
        const labelWidth = 96;
        const rows: Array<[string, string]> = [
          ['Source', sourcePath ?? 'Not provided'],
          ['Provider', metadata.provider ?? 'Not specified'],
          ['Model', metadata.model ?? 'Not specified'],
          ['Generated', formatTimestamp(generatedAt)],
          ['Engine', `Kritisi ${versionLabel}`.trim()]
        ];
        rows.forEach(([label, value], index) => {
          if (index > 0) {
            doc.moveTo(left(), y).lineTo(right(), y).strokeColor(COLORS.line).lineWidth(0.5).stroke();
          }
          doc
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .fillColor(COLORS.muted)
            .text(label.toUpperCase(), left(), y + 6, { characterSpacing: 0.7, lineBreak: false });
          doc
            .font('Helvetica')
            .fontSize(9.5)
            .fillColor(COLORS.body)
            .text(fitText(value, contentWidth() - labelWidth), left() + labelWidth, y + 4, {
              lineBreak: false
            });
          y += 19;
        });
        doc.y = y;
      };

      const drawDisclaimerNote = (): void => {
        ensureSpace(64);
        const y = doc.y;
        const body =
          'AI-assisted preliminary review. Not a substitute for a professional security audit; model output can be incomplete or incorrect, and instructions embedded in audited code can influence it. Verify every finding independently.';
        const textWidth = contentWidth() - 26;
        const bodyHeight = measure(body, 'Helvetica', 8.2, textWidth, 1.2);
        const boxHeight = Math.max(46, bodyHeight + 30);
        doc.roundedRect(left(), y, contentWidth(), boxHeight, 5).fillAndStroke('#FFFBEB', '#FDE68A');
        doc.rect(left(), y, 3, boxHeight).fill('#D97706');
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor('#92400E')
          .text('IMPORTANT', left() + 12, y + 10, { characterSpacing: 0.7, lineBreak: false });
        doc
          .font('Helvetica')
          .fontSize(8.2)
          .fillColor('#78350F')
          .text(body, left() + 12, y + 22, { width: textWidth, lineGap: 1.2 });
        doc.y = y + boxHeight;
      };

      const drawSummary = (): void => {
        ensureSpace(230);
        const titleY = doc.y;
        doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.ink).text('Executive summary', left(), titleY);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(risk.color);
        const riskPillWidth = doc.widthOfString(risk.label) + 20;
        doc.roundedRect(right() - riskPillWidth, titleY + 3, riskPillWidth, 18, 9).fillAndStroke(risk.tint, risk.border);
        doc
          .fillColor(risk.color)
          .text(risk.label, right() - riskPillWidth, titleY + 8, { width: riskPillWidth, align: 'center', lineBreak: false });
        doc.y = titleY + 28;
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor(COLORS.muted)
          .text(
            `AI-assisted review of ${sourceName}. Findings are grouped by severity, with suggested remediations and code references.`,
            left(),
            doc.y,
            { width: contentWidth(), lineGap: 1.5 }
          );
        doc.moveDown(0.9);

        const gap = 12;
        const cardWidth = (contentWidth() - gap * 2) / 3;
        const cardHeight = 64;
        const cardY = doc.y;
        SEVERITIES.forEach((style, index) => {
          const x = left() + index * (cardWidth + gap);
          doc.roundedRect(x, cardY, cardWidth, cardHeight, 8).fillAndStroke(style.tint, style.border);
          doc
            .font('Helvetica-Bold')
            .fontSize(24)
            .fillColor(style.color)
            .text(String(counts[style.key]), x + 14, cardY + 10, { lineBreak: false });
          doc
            .font('Helvetica')
            .fontSize(7.5)
            .fillColor(COLORS.muted)
            .text(style.label.toUpperCase(), x + 14, cardY + 44, { characterSpacing: 0.8, lineBreak: false });
        });
        doc.y = cardY + cardHeight;
        doc.moveDown(1);
        drawMetaTable();
        doc.moveDown(0.6);
        drawDisclaimerNote();
        doc.moveDown(0.8);
      };

      const drawSectionHeader = (style: SeverityStyle, count: number): void => {
        ensureSpace(190);
        const y = doc.y;
        doc.rect(left(), y + 2, 4, 20).fill(style.color);
        doc
          .font('Helvetica-Bold')
          .fontSize(14)
          .fillColor(COLORS.ink)
          .text(style.label, left() + 12, y + 4, { lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(9).fillColor(style.color);
        const pillText = String(count);
        const pillWidth = doc.widthOfString(pillText) + 18;
        const pillX = right() - pillWidth;
        doc.roundedRect(pillX, y + 3, pillWidth, 18, 9).fillAndStroke(style.tint, style.border);
        doc.fillColor(style.color).text(pillText, pillX, y + 8, { width: pillWidth, align: 'center', lineBreak: false });
        doc.y = y + 32;
      };

      const drawCodePanel = (code: string): void => {
        const innerWidth = contentWidth() - 20;
        const lines = (code || '// no code snippet provided').replace(/\r\n/g, '\n').replace(/\t/g, '  ').split('\n');
        let index = 0;
        let continuation = false;
        while (index < lines.length) {
          if (continuation) {
            doc
              .font('Helvetica-Bold')
              .fontSize(7.5)
              .fillColor(COLORS.muted)
              .text('CODE HIGHLIGHT (CONTINUED)', left() + 14, doc.y, { characterSpacing: 0.8, lineBreak: false });
            doc.y += 14;
          }
          const panelTop = doc.y;
          const available = doc.page.maxY() - panelTop - 24;
          if (available < 20) {
            doc.addPage();
            continuation = true;
            continue;
          }
          let used = 0;
          const group: string[] = [];
          while (index < lines.length) {
            doc.font('Courier').fontSize(8.5);
            const lineHeight = doc.heightOfString(lines[index] || ' ', { width: innerWidth, lineGap: 1 });
            if (group.length > 0 && used + lineHeight > available) break;
            group.push(lines[index]);
            used += lineHeight;
            index += 1;
            if (used >= available) break;
          }
          const panelHeight = used + 24;
          doc.roundedRect(left(), panelTop, contentWidth(), panelHeight, 6).fillAndStroke(COLORS.surface, COLORS.line);
          doc
            .font('Courier')
            .fontSize(8.5)
            .fillColor('#334155')
            .text(group.join('\n'), left() + 10, panelTop + 12, { width: innerWidth, lineGap: 1 });
          doc.y = panelTop + panelHeight;
          if (index < lines.length) {
            doc.addPage();
            continuation = true;
          }
        }
      };

      const drawFinding = (issue: SecurityIssue, index: number, style: SeverityStyle): void => {
        const badgeWidth = 52;
        const badgeHeight = 17;
        const titleX = left() + badgeWidth + 10;
        const titleWidth = contentWidth() - badgeWidth - 10;
        const titleHeight = measure(issue.issue, 'Helvetica-Bold', 11.5, titleWidth, 1);
        const suggestionHeight = measure(issue.suggestion, 'Helvetica', 10, contentWidth() - 14, 1.5);
        const headerHeight = Math.max(badgeHeight, titleHeight);
        ensureSpace(headerHeight + 8 + 12 + suggestionHeight + 12 + 46);

        const startY = doc.y;
        doc.roundedRect(left(), startY, badgeWidth, badgeHeight, 4).fill(style.color);
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor(COLORS.white)
          .text(`${style.short}-${String(index + 1).padStart(2, '0')}`, left(), startY + 5, {
            width: badgeWidth,
            align: 'center',
            lineBreak: false
          });
        doc
          .font('Helvetica-Bold')
          .fontSize(11.5)
          .fillColor(COLORS.ink)
          .text(issue.issue, titleX, startY, { width: titleWidth, lineGap: 1 });

        let y = Math.max(startY + headerHeight, doc.y) + 10;
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor(COLORS.muted)
          .text('SUGGESTION', left() + 14, y, { characterSpacing: 0.8, lineBreak: false });
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor(COLORS.body)
          .text(issue.suggestion, left() + 14, y + 12, {
            width: contentWidth() - 14,
            lineGap: 1.5
          });
        y = doc.y + 10;
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor(COLORS.muted)
          .text('CODE HIGHLIGHT', left() + 14, y, { characterSpacing: 0.8, lineBreak: false });
        doc.y = y + 12;
        ensureSpace(48);
        drawCodePanel(issue.code_highlight);
        doc.y += 12;
        doc.moveTo(left(), doc.y).lineTo(right(), doc.y).strokeColor(COLORS.line).lineWidth(0.6).stroke();
        doc.y += 12;
      };

      const drawEmptyState = (): void => {
        ensureSpace(96);
        const y = doc.y;
        doc.roundedRect(left(), y, contentWidth(), 84, 8).fillAndStroke('#F0FDF4', '#BBF7D0');
        doc
          .font('Helvetica-Bold')
          .fontSize(12)
          .fillColor('#15803D')
          .text('No findings reported', left() + 16, y + 16, { lineBreak: false });
        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor('#166534')
          .text(
            'The model did not report any high, medium, or low severity issues for this contract. This is not a guarantee that the contract is free of vulnerabilities.',
            left() + 16,
            y + 34,
            { width: contentWidth() - 32, lineGap: 1.5 }
          );
        doc.y = y + 84;
      };

      const decoratePages = (): void => {
        const range = doc.bufferedPageRange();
        const contentPages = range.count - 1;
        for (let index = range.start + 1; index < range.start + range.count; index += 1) {
          doc.switchToPage(index);
          doc
            .font('Helvetica-Bold')
            .fontSize(8.5)
            .fillColor('#475569')
            .text('KRITISI', left(), 24, { characterSpacing: 1.2, lineBreak: false });
          doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.faint);
          const header = fitText(sourceName, 240);
          const headerWidth = doc.widthOfString(header);
          doc.text(header, right() - headerWidth, 24, { lineBreak: false });
          doc.moveTo(left(), 40).lineTo(right(), 40).strokeColor(COLORS.line).lineWidth(0.6).stroke();

          const footerY = doc.page.height - 34;
          doc
            .moveTo(left(), footerY - 10)
            .lineTo(right(), footerY - 10)
            .strokeColor(COLORS.line)
            .lineWidth(0.6)
            .stroke();
          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor(COLORS.faint)
            .text(`${footerBrand} · AI-assisted preliminary review`, left(), footerY, { lineBreak: false });
          const pageText = `Page ${index - range.start} of ${contentPages}`;
          const pageWidth = doc.widthOfString(pageText);
          doc.text(pageText, right() - pageWidth, footerY, { lineBreak: false });
        }
      };

      drawCover();
      doc.addPage();
      drawSummary();
      const nonEmpty = SEVERITIES.filter((style) => counts[style.key] > 0);
      if (nonEmpty.length === 0) {
        drawEmptyState();
      } else {
        for (const style of nonEmpty) {
          drawSectionHeader(style, counts[style.key]);
          result[style.key].forEach((issue, index) => drawFinding(issue, index, style));
        }
      }
      decoratePages();
      doc.end();

      output.on('finish', () => {
        if (settled) return;
        settled = true;
        resolve(true);
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Unable to generate the PDF report.'));
    }
  });
}
