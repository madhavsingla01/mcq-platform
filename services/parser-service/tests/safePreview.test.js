import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  generateSafePreviewArtifact,
  redactMcqPreview,
  buildPdfPreviewData,
  buildSpreadsheetPreviewData,
  buildBundlePreviewData,
  DEFAULT_WATERMARK,
  MAX_PDF_PREVIEW_PAGES,
  MAX_SPREADSHEET_SAMPLE_ROWS,
  MAX_MCQ_SAMPLE_QUESTIONS,
} from '../src/services/preview/safePreview.service.js';
import { memoryCache } from '../src/services/cache/cache.service.js';

describe('Feature F9: Safe Preview Artifact Generation', () => {
  beforeEach(() => {
    memoryCache.clear();
  });

  describe('PDF Safe Preview Generation (F9-1, F9-2, F9-B1, F9-B4)', () => {
    it('F9-1: Limits sample pages to preview cap (max 3 pages) for large documents', () => {
      const parseResult = {
        metadata: {
          pageCount: 20,
          textSnippet: 'Document Abstract',
        },
      };

      const artifact = generateSafePreviewArtifact('asset_pdf_20', 'pdf', parseResult);

      expect(artifact.contentType).toBe('pdf');
      expect(artifact.previewData.pdf.samplePageCount).toBe(MAX_PDF_PREVIEW_PAGES);
      expect(artifact.previewData.pdf.pages.length).toBe(3);
      expect(artifact.previewData.pdf.pages[0].pageNumber).toBe(1);
      expect(artifact.previewData.pdf.pages[2].pageNumber).toBe(3);
    });

    it('F9-B1: 1-page PDF yields exactly 1 preview page without out-of-bounds error', () => {
      const parseResult = {
        metadata: {
          pageCount: 1,
          textSnippet: 'Single page flyer',
        },
      };

      const artifact = generateSafePreviewArtifact('asset_pdf_1', 'pdf', parseResult);

      expect(artifact.previewData.pdf.samplePageCount).toBe(1);
      expect(artifact.previewData.pdf.pages.length).toBe(1);
      expect(artifact.previewData.pdf.pages[0].pageNumber).toBe(1);
      expect(artifact.previewData.pdf.pages[0].textSnippet).toBe('Single page flyer');
    });

    it('F9-2 & F9-B4: Embeds visible watermark string on every sample page', () => {
      const parseResult = {
        metadata: { pageCount: 2 },
      };

      const customWatermark = 'CONFIDENTIAL-SAMPLE-REVIEW';
      const artifact = generateSafePreviewArtifact('asset_pdf_wm', 'pdf', parseResult, {
        watermark: customWatermark,
      });

      expect(artifact.previewData.pdf.pages.length).toBe(2);
      expect(artifact.previewData.pdf.pages[0].watermark).toBe(customWatermark);
      expect(artifact.previewData.pdf.pages[1].watermark).toBe(customWatermark);
    });

    it('Uses default QuizFocus watermark when none specified', () => {
      const parseResult = {
        metadata: { pageCount: 1 },
      };

      const artifact = generateSafePreviewArtifact('asset_pdf_def', 'pdf', parseResult);
      expect(artifact.previewData.pdf.pages[0].watermark).toBe(DEFAULT_WATERMARK);
      expect(artifact.previewData.pdf.pages[0].watermark).toContain('CONFIDENTIAL PREVIEW - QUIZFOCUS');
    });
  });

  describe('Spreadsheet Safe Preview Generation (F9-3, F9-B2)', () => {
    it('F9-3: Truncates sample rows to preview cap (max 10 rows) for 50-row spreadsheet', () => {
      const headers = ['Question', 'Option A', 'Option B', 'Topic'];
      const rows = Array.from({ length: 50 }, (_, i) => ({
        Question: `What is concept ${i + 1}?`,
        'Option A': `Choice A${i + 1}`,
        'Option B': `Choice B${i + 1}`,
        Topic: 'CS',
      }));

      const parseResult = {
        sheetNames: ['Questions'],
        headers,
        rows,
        metadata: {
          totalRows: 50,
          totalCols: 4,
          headers,
        },
      };

      const artifact = generateSafePreviewArtifact('asset_sheet_50', 'spreadsheet', parseResult);

      expect(artifact.contentType).toBe('spreadsheet');
      expect(artifact.previewData.spreadsheet.totalRows).toBe(50);
      expect(artifact.previewData.spreadsheet.totalCols).toBe(4);
      expect(artifact.previewData.spreadsheet.sampleRows.length).toBe(MAX_SPREADSHEET_SAMPLE_ROWS);
    });

    it('F9-B2: Spreadsheet with fewer rows than preview limit returns all available rows without null padding', () => {
      const headers = ['ID', 'Value'];
      const rows = [
        { ID: '1', Value: 'First' },
        { ID: '2', Value: 'Second' },
      ];

      const parseResult = {
        sheetNames: ['SmallSheet'],
        headers,
        rows,
        metadata: {
          totalRows: 2,
          totalCols: 2,
          headers,
        },
      };

      const artifact = generateSafePreviewArtifact('asset_sheet_small', 'spreadsheet', parseResult);

      expect(artifact.previewData.spreadsheet.totalRows).toBe(2);
      expect(artifact.previewData.spreadsheet.sampleRows.length).toBe(2);
      expect(artifact.previewData.spreadsheet.sampleRows[0]).toEqual({ ID: '1', Value: 'First' });
      expect(artifact.previewData.spreadsheet.sampleRows[1]).toEqual({ ID: '2', Value: 'Second' });
    });

    it('Formula neutralization: Neutralizes formula injection payloads in headers and preview sample cells', () => {
      const headers = ['=cmd|calc!A0', 'Normal'];
      const rows = [
        {
          '=cmd|calc!A0': '+1234malicious',
          Normal: '@SUM(1+2)',
        },
      ];

      const parseResult = {
        sheetNames: ['Sheet1'],
        headers,
        rows,
      };

      const artifact = generateSafePreviewArtifact('asset_injection', 'csv', parseResult);

      expect(artifact.contentType).toBe('csv');
      expect(artifact.previewData.spreadsheet.headers).toContain("'=cmd|calc!A0");
      const sampleRow = artifact.previewData.spreadsheet.sampleRows[0];
      expect(sampleRow["'=cmd|calc!A0"]).toBe("'+1234malicious");
      expect(sampleRow["Normal"]).toBe("'@SUM(1+2)");
    });
  });

  describe('MCQ Question Bank Safe Preview Generation (F9-4, F9-B3)', () => {
    it('F9-4: Strictly redacts correct answers and explanations with answerRedacted: true', () => {
      const questions = [
        {
          prompt: 'What is O(1)?',
          options: ['Constant', 'Linear', 'Quadratic'],
          correctAnswer: 0,
          explanation: 'Constant time operations do not depend on input size.',
        },
        {
          prompt: 'What is O(n)?',
          options: ['Constant', 'Linear', 'Quadratic'],
          correctAnswer: 1,
          explanation: 'Linear time scales with n.',
        },
      ];

      const artifact = generateSafePreviewArtifact('asset_mcq_1', 'mcq_bank', {
        metadata: {
          totalQuestions: 2,
          questions,
        },
      });

      expect(artifact.contentType).toBe('mcq_bank');
      expect(artifact.previewData.mcq.totalQuestions).toBe(2);
      expect(artifact.previewData.mcq.sampleQuestions.length).toBe(2);

      const q1 = artifact.previewData.mcq.sampleQuestions[0];
      expect(q1.prompt).toBe('What is O(1)?');
      expect(q1.options).toEqual(['Constant', 'Linear', 'Quadratic']);
      expect(q1.answerRedacted).toBe(true);
      expect(q1.correctAnswer).toBeUndefined();
      expect(q1.explanation).toBeUndefined();
    });

    it('F9-B3: MCQ preview redacts correct answer even when correctAnswer index is 0', () => {
      const questions = [
        {
          prompt: 'Question with index 0 answer',
          options: ['Option A (Correct)', 'Option B'],
          correctAnswer: 0,
          explanation: 'Detailed explanation for 0',
        },
      ];

      const redacted = redactMcqPreview(questions);

      expect(redacted.length).toBe(1);
      expect(redacted[0].correctAnswer).toBeUndefined();
      expect(redacted[0].explanation).toBeUndefined();
      expect(redacted[0].answerRedacted).toBe(true);
      expect('correctAnswer' in redacted[0]).toBe(false);
      expect('explanation' in redacted[0]).toBe(false);
    });

    it('Redacts options with object-level isCorrect booleans', () => {
      const questions = [
        {
          prompt: 'Which protocol is connection-oriented?',
          options: [
            { text: 'TCP', isCorrect: true },
            { text: 'UDP', isCorrect: false },
          ],
          correctAnswer: 0,
          explanation: 'TCP uses 3-way handshake',
        },
      ];

      const redacted = redactMcqPreview(questions);

      expect(redacted[0].options).toEqual(['TCP', 'UDP']);
      expect(redacted[0].answerRedacted).toBe(true);
      expect(redacted[0].correctAnswer).toBeUndefined();
      expect(redacted[0].explanation).toBeUndefined();
    });

    it('Limits MCQ preview sample questions to maximum 3 questions', () => {
      const questions = Array.from({ length: 10 }, (_, i) => ({
        prompt: `Question ${i + 1}`,
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: i % 4,
        explanation: `Explanation ${i + 1}`,
      }));

      const artifact = generateSafePreviewArtifact('asset_mcq_10', 'mcq_bank', {
        metadata: {
          totalQuestions: 10,
          questions,
        },
      });

      expect(artifact.previewData.mcq.totalQuestions).toBe(10);
      expect(artifact.previewData.mcq.sampleQuestions.length).toBe(MAX_MCQ_SAMPLE_QUESTIONS);
    });
  });

  describe('Bundle Safe Preview Generation', () => {
    it('Extracts bundle resourceCount and item list without unpacking binaries', () => {
      const parseResult = {
        metadata: {
          resourceCount: 3,
          items: [
            { title: 'Lecture_Notes.pdf', contentType: 'pdf', size: 10240 },
            { title: 'Sample_Quiz.json', contentType: 'mcq_bank', size: 2048 },
            { title: 'Diagram.png', contentType: 'image', size: 51200 },
          ],
        },
      };

      const artifact = generateSafePreviewArtifact('asset_bundle_1', 'bundle', parseResult);

      expect(artifact.contentType).toBe('bundle');
      expect(artifact.previewData.bundle.resourceCount).toBe(3);
      expect(artifact.previewData.bundle.items).toEqual([
        { title: 'Lecture_Notes.pdf', contentType: 'pdf' },
        { title: 'Sample_Quiz.json', contentType: 'mcq_bank' },
        { title: 'Diagram.png', contentType: 'image' },
      ]);
    });
  });

  describe('Interface Contract & In-Memory Caching', () => {
    it('Generated artifact satisfies SafePreviewArtifact contract fields', () => {
      const artifact = generateSafePreviewArtifact('asset_contract_check', 'pdf', {
        metadata: { pageCount: 1 },
      });

      expect(typeof artifact.assetId).toBe('string');
      expect(artifact.assetId).toBe('asset_contract_check');
      expect(typeof artifact.contentType).toBe('string');
      expect(typeof artifact.previewData).toBe('object');
      expect(typeof artifact.generatedAt).toBe('string');
      expect(new Date(artifact.generatedAt).getTime()).not.toBeNaN();
    });

    it('Caches preview artifact in memoryCache and retrieves it by assetId', () => {
      const artifact = generateSafePreviewArtifact('asset_cache_test', 'pdf', {
        metadata: { pageCount: 2 },
      });

      memoryCache.set(`preview:${artifact.assetId}`, artifact, 300000);

      const cached = memoryCache.get('preview:asset_cache_test');
      expect(cached).not.toBeNull();
      expect(cached.assetId).toBe('asset_cache_test');
      expect(cached.previewData.pdf.samplePageCount).toBe(2);
    });
  });
});
