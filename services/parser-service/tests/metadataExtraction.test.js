import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
import XLSX from 'xlsx';
import { PdfParserStrategy } from '../src/services/parser/strategies/PdfParserStrategy.js';
import { parseExcel } from '../src/services/parser/excelParser.js';
import { parseCsv } from '../src/services/parser/csvParser.js';
import { parseJson } from '../src/services/parser/jsonParser.js';
import { BundleParserStrategy } from '../src/services/parser/strategies/BundleParserStrategy.js';
import { ParserRegistry } from '../src/services/parser/strategies/ParserRegistry.js';

describe('Feature F8: Document Metadata Extraction', () => {
  let tempFiles = [];

  const createTempFile = async (name, content) => {
    const filePath = path.join(os.tmpdir(), `f8_test_${Date.now()}_${name}`);
    await fs.promises.writeFile(filePath, content);
    tempFiles.push(filePath);
    return filePath;
  };

  afterEach(async () => {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) {
        try {
          await fs.promises.unlink(f);
        } catch {
          // Ignore unlink errors
        }
      }
    }
    tempFiles = [];
  });

  describe('PDF Metadata Extraction (F8-1, F8-B1, F8-B5)', () => {
    const pdfStrategy = new PdfParserStrategy();

    it('F8-1: Extracts PDF page count from valid multi-page PDF catalog', async () => {
      const pdfContent = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>\nendobj\n' +
        '3 0 obj\n<< /Type /Page >>\nendobj\n4 0 obj\n<< /Type /Page >>\nendobj\n5 0 obj\n<< /Type /Page >>\nendobj\n' +
        'trailer\n<< >>\n%%EOF'
      );
      const filePath = await createTempFile('multipage.pdf', pdfContent);
      const result = await pdfStrategy.parse(filePath);

      expect(result.metadata.pageCount).toBe(3);
      expect(result.metadata.format).toBe('PDF-1.4');
    });

    it('F8-B1: Single-page PDF correctly returns pageCount 1', async () => {
      const pdfContent = Buffer.from(
        '%PDF-1.5\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
        '3 0 obj\n<< /Type /Page >>\nendobj\ntrailer\n<< >>\n%%EOF'
      );
      const filePath = await createTempFile('singlepage.pdf', pdfContent);
      const result = await pdfStrategy.parse(filePath);

      expect(result.metadata.pageCount).toBe(1);
      expect(result.metadata.format).toBe('PDF-1.5');
    });

    it('Detects text stream and sets isTextSearchable: true with textSnippet', async () => {
      const streamText = 'BT /F1 12 Tf 72 712 Td (Algorithms and Data Structures Course Overview) Tj ET';
      const pdfContent = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
        `3 0 obj\n<< /Type /Page /Contents 4 0 R >>\nendobj\n` +
        `4 0 obj\n<< /Length ${streamText.length} >>\nstream\n${streamText}\nendstream\nendobj\n` +
        'trailer\n<< >>\n%%EOF'
      );
      const filePath = await createTempFile('searchable.pdf', pdfContent);
      const result = await pdfStrategy.parse(filePath);

      expect(result.metadata.isTextSearchable).toBe(true);
      expect(result.metadata.textSnippet).toContain('Algorithms and Data Structures');
    });

    it('Sets isTextSearchable: false when PDF has no extractable text stream', async () => {
      const pdfContent = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
        '3 0 obj\n<< /Type /Page >>\nendobj\ntrailer\n<< >>\n%%EOF'
      );
      const filePath = await createTempFile('scanned_image.pdf', pdfContent);
      const result = await pdfStrategy.parse(filePath);

      expect(result.metadata.isTextSearchable).toBe(false);
      expect(result.metadata.textSnippet).toBeUndefined();
    });

    it('Detects /Encrypt dictionary on password-protected PDFs', async () => {
      const pdfContent = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '2 0 obj\n<< /Type /Pages /Count 1 >>\nendobj\n' +
        'trailer\n<< /Encrypt 3 0 R >>\n%%EOF'
      );
      const filePath = await createTempFile('encrypted.pdf', pdfContent);
      const result = await pdfStrategy.parse(filePath);

      expect(result.metadata.isEncrypted).toBe(true);
    });

    it('F8-B5: Corrupted PDF produces clear structured error without crash', async () => {
      const corruptedContent = Buffer.from('NOT_A_VALID_PDF_HEADER');
      const filePath = await createTempFile('corrupt.pdf', corruptedContent);

      await expect(pdfStrategy.parse(filePath)).rejects.toThrow(
        /Corrupted or invalid PDF structure/
      );
    });
  });

  describe('Spreadsheet Metadata Extraction (F8-2, F8-3, F8-B2, F8-B3)', () => {
    it('F8-2 & F8-B2: Multi-sheet spreadsheet extracts all sheet names, counts, and per-sheet metadata', async () => {
      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.json_to_sheet([
        { Question: 'What is O(1)?', Answer: 'Constant' },
        { Question: 'What is O(n)?', Answer: 'Linear' },
      ]);
      const ws2 = XLSX.utils.json_to_sheet([
        { Concept: 'Sorting', Time: 'O(n log n)' },
      ]);
      XLSX.utils.book_append_sheet(wb, ws1, 'Algorithms');
      XLSX.utils.book_append_sheet(wb, ws2, 'Complexities');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filePath = await createTempFile('workbook.xlsx', buffer);

      const result = parseExcel(filePath);

      expect(result.sheetNames).toEqual(['Algorithms', 'Complexities']);
      expect(result.metadata.sheetCount).toBe(2);
      expect(result.metadata.totalRows).toBe(2);
      expect(result.metadata.totalCols).toBe(2);
      expect(result.metadata.headers).toEqual(['Question', 'Answer']);
      expect(result.metadata.sheets.length).toBe(2);
      expect(result.metadata.sheets[0].name).toBe('Algorithms');
      expect(result.metadata.sheets[1].name).toBe('Complexities');
    });

    it('F8-3: Column headers with formula injection triggers are sanitized with single quote', async () => {
      const wb = XLSX.utils.book_new();
      const maliciousData = [
        {
          '=cmd|\' /C calc\'!A0': 'Value1',
          '+cmd|calc': 'Value2',
          '@SUM(1+1)': 'Value3',
          '-50': 'Pure number negative should preserve',
          'StandardHeader': 'Normal',
        },
      ];
      const ws = XLSX.utils.json_to_sheet(maliciousData);
      XLSX.utils.book_append_sheet(wb, ws, 'Injections');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filePath = await createTempFile('injections.xlsx', buffer);

      const result = parseExcel(filePath);

      expect(result.headers).toContain("'=cmd|' /C calc'!A0");
      expect(result.headers).toContain("'+cmd|calc");
      expect(result.headers).toContain("'@SUM(1+1)");
      // Pure numbers like -50 should be preserved without formula quoting
      expect(result.headers).toContain("-50");
      expect(result.headers).toContain("StandardHeader");
    });

    it('F8-B3: CSV with wide column headers (50+ columns) extracts without truncation', async () => {
      const colCount = 55;
      const headers = Array.from({ length: colCount }, (_, i) => `Col_${i + 1}`);
      const row = Array.from({ length: colCount }, (_, i) => `Val_${i + 1}`);
      const csvContent = `${headers.join(',')}\n${row.join(',')}`;

      const filePath = await createTempFile('wide_columns.csv', Buffer.from(csvContent, 'utf8'));
      const result = parseCsv(filePath);

      expect(result.headers.length).toBe(55);
      expect(result.metadata.totalCols).toBe(55);
      expect(result.metadata.totalRows).toBe(1);
      expect(result.headers[54]).toBe('Col_55');
    });
  });

  describe('MCQ Question Bank Extraction (F8-4, F8-B4)', () => {
    it('F8-4: Extracts totalQuestions, choiceDistribution, and validates schema', async () => {
      const mcqBank = {
        resourceType: 'mcq_bank',
        title: 'Computer Architecture Quiz',
        questions: [
          { prompt: 'Q1', options: ['A', 'B', 'C', 'D'], correctAnswer: 0, explanation: 'Exp 1' },
          { prompt: 'Q2', options: ['True', 'False'], correctAnswer: 1, explanation: 'Exp 2' },
          { prompt: 'Q3', options: ['A', 'B', 'C', 'D'], correctAnswer: 2, explanation: 'Exp 3' },
          { prompt: 'Q4', options: ['A', 'B', 'C', 'D'], correctAnswer: 3, explanation: 'Exp 4' },
        ],
      };

      const filePath = await createTempFile('mcq.json', Buffer.from(JSON.stringify(mcqBank), 'utf8'));
      const result = parseJson(filePath);

      expect(result.metadata.totalQuestions).toBe(4);
      expect(result.metadata.questionCount).toBe(4);
      expect(result.metadata.schemaValid).toBe(true);
      expect(result.metadata.completeness).toBe(1);
      expect(result.metadata.choiceDistribution).toEqual({
        '4': 3,
        '2': 1,
      });
      expect(result.metadata.title).toBe('Computer Architecture Quiz');
    });

    it('F8-B4: Question with missing explanation defaults safely to "No explanation provided"', async () => {
      const mcqBank = [
        { prompt: 'Question with no explanation', options: ['A', 'B'], correctAnswer: 0 },
      ];

      const filePath = await createTempFile('missing_explanation.json', Buffer.from(JSON.stringify(mcqBank), 'utf8'));
      const result = parseJson(filePath);

      expect(result.metadata.totalQuestions).toBe(1);
      expect(result.metadata.questions[0].explanation).toBe('No explanation provided');
    });
  });

  describe('Bundle Metadata Extraction (BundleParserStrategy)', () => {
    const bundleStrategy = new BundleParserStrategy();

    it('Filters out directory entries and extracts resourceCount and item summaries', async () => {
      // Build a mock ZIP buffer with 1 directory entry ("docs/") and 2 file entries ("syllabus.pdf", "quiz.csv")
      // Local header 1: docs/ (dir)
      const e1Name = Buffer.from('docs/');
      const e1Header = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
        Buffer.from([e1Name.length, 0x00, 0x00, 0x00]),
        e1Name,
      ]);

      // Local header 2: docs/syllabus.pdf (1200 bytes)
      const e2Name = Buffer.from('docs/syllabus.pdf');
      const e2Header = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
        Buffer.from([0xb0, 0x04, 0x00, 0x00]), // compSize: 1200
        Buffer.from([0xb0, 0x04, 0x00, 0x00]), // uncompSize: 1200
        Buffer.from([e2Name.length, 0x00, 0x00, 0x00]),
        e2Name,
        Buffer.alloc(1200, 0x20),
      ]);

      // Local header 3: quiz.csv (400 bytes)
      const e3Name = Buffer.from('quiz.csv');
      const e3Header = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
        Buffer.from([0x90, 0x01, 0x00, 0x00]), // compSize: 400
        Buffer.from([0x90, 0x01, 0x00, 0x00]), // uncompSize: 400
        Buffer.from([e3Name.length, 0x00, 0x00, 0x00]),
        e3Name,
        Buffer.alloc(400, 0x20),
      ]);

      const zipBuffer = Buffer.concat([e1Header, e2Header, e3Header]);
      const filePath = await createTempFile('bundle.zip', zipBuffer);

      const result = await bundleStrategy.parse(filePath);

      expect(result.metadata.entryCount).toBe(3);
      // resourceCount strictly filters out directory entries
      expect(result.metadata.resourceCount).toBe(2);
      expect(result.metadata.items.length).toBe(2);
      expect(result.metadata.items[0]).toEqual({
        title: 'docs/syllabus.pdf',
        contentType: 'pdf',
        size: 1200,
      });
      expect(result.metadata.items[1]).toEqual({
        title: 'quiz.csv',
        contentType: 'csv',
        size: 400,
      });
      expect(result.metadata.totalBundleSize.uncompressed).toBe(1600);
    });
  });
});
