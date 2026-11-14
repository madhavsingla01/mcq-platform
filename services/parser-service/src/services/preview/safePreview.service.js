/**
 * Safe Preview Artifact Generation Service (Feature F9)
 * Generates sanitized, watermarked, bounded preview artifacts
 * matching the canonical SafePreviewArtifact interface contract in PROJECT.md.
 * Defends against answer key leaks (CWE-200), formula injection (CWE-1236),
 * and unauthorized full-document exfiltration.
 */

import { sanitizeFormulaPrefix } from '../security/formulaSanitizer.service.js';

export const DEFAULT_WATERMARK = 'CONFIDENTIAL PREVIEW - QUIZFOCUS';
export const MAX_PDF_PREVIEW_PAGES = 3;
export const MAX_SPREADSHEET_SAMPLE_ROWS = 10;
export const MAX_MCQ_SAMPLE_QUESTIONS = 3;

/**
 * Strictly redacts MCQ question banks to prevent answer key and explanation leakage.
 * Guarantees zero answer leakage even when correctAnswer === 0.
 *
 * @param {Array<Object>} questions - Raw question array
 * @param {Object} [options]
 * @param {number} [options.maxItems=3] - Maximum sample questions to return
 * @returns {Array<{ prompt: string, options: string[], answerRedacted: true }>}
 */
export function redactMcqPreview(questions, { maxItems = MAX_MCQ_SAMPLE_QUESTIONS } = {}) {
  if (!Array.isArray(questions)) return [];

  return questions.slice(0, maxItems).map((q) => {
    if (!q || typeof q !== 'object') {
      return { prompt: '', options: [], answerRedacted: true };
    }

    const prompt = q.prompt || q.text || q.question || '';
    let rawOptions = q.options || q.choices || [];

    if (typeof rawOptions === 'string') {
      try {
        rawOptions = JSON.parse(rawOptions);
      } catch {
        rawOptions = [rawOptions];
      }
    }

    const options = Array.isArray(rawOptions)
      ? rawOptions.map((opt) =>
          typeof opt === 'object' && opt !== null
            ? opt.text || opt.label || opt.option || ''
            : String(opt)
        )
      : [];

    // Strictly redact correctAnswer (including index 0), explanation, and isCorrect flags
    return {
      prompt,
      options,
      answerRedacted: true,
    };
  });
}

/**
 * Builds watermarked PDF preview structure capped at min(pageCount, 3).
 *
 * @param {Object} parseResult - Parser result with metadata
 * @param {Object} [options]
 * @returns {{ samplePageCount: number, pages: Array<{ pageNumber: number, textSnippet: string, watermark: string }> }}
 */
export function buildPdfPreviewData(parseResult = {}, options = {}) {
  const pageCount = parseResult?.metadata?.pageCount || 1;
  const maxPages = options.maxPreviewPages || MAX_PDF_PREVIEW_PAGES;
  const samplePageCount = Math.max(1, Math.min(pageCount, maxPages));
  const watermark = options.watermark || DEFAULT_WATERMARK;
  const baseSnippet = parseResult?.metadata?.textSnippet || 'QuizFocus Educational Resource Preview';

  const pages = [];
  for (let p = 1; p <= samplePageCount; p++) {
    const textSnippet =
      samplePageCount === 1
        ? baseSnippet
        : `${baseSnippet} [Page ${p} of ${pageCount}]`;

    pages.push({
      pageNumber: p,
      textSnippet,
      watermark,
    });
  }

  return {
    samplePageCount,
    pages,
  };
}

/**
 * Builds formula-sanitized spreadsheet/csv preview structure capped at min(totalRows, 10).
 *
 * @param {Object} parseResult - Parser result with headers, rows, sheetNames
 * @param {Object} [options]
 * @returns {{ sheetName: string, totalRows: number, totalCols: number, headers: string[], sampleRows: Array<Record<string, string>> }}
 */
export function buildSpreadsheetPreviewData(parseResult = {}, options = {}) {
  const sheetName = parseResult?.sheetNames?.[0] || 'Sheet1';
  const rawHeaders = parseResult?.metadata?.headers || parseResult?.headers || [];
  const headers = rawHeaders.map((h) => sanitizeFormulaPrefix(String(h)));

  const totalRows = parseResult?.metadata?.totalRows ?? (parseResult?.rows?.length || 0);
  const totalCols = parseResult?.metadata?.totalCols ?? headers.length;
  const maxSampleRows = options.maxSampleRows || MAX_SPREADSHEET_SAMPLE_ROWS;

  const rawRows = (parseResult?.rows || []).slice(0, Math.min(totalRows, maxSampleRows));

  const sampleRows = rawRows.map((row) => {
    const sanitizedRow = {};
    if (row && typeof row === 'object') {
      for (const [k, v] of Object.entries(row)) {
        const sanitizedKey = sanitizeFormulaPrefix(String(k));
        sanitizedRow[sanitizedKey] = sanitizeFormulaPrefix(
          v !== null && v !== undefined ? String(v) : ''
        );
      }
    }
    return sanitizedRow;
  });

  return {
    sheetName,
    totalRows,
    totalCols,
    headers,
    sampleRows,
  };
}

/**
 * Builds educational bundle preview structure listing contained resources without unzipping.
 *
 * @param {Object} parseResult - Parser result with metadata
 * @returns {{ resourceCount: number, items: Array<{ title: string, contentType: string }> }}
 */
export function buildBundlePreviewData(parseResult = {}) {
  const items = (parseResult?.metadata?.items || []).map((item) => ({
    title: item.title,
    contentType: item.contentType,
  }));
  const resourceCount = parseResult?.metadata?.resourceCount ?? items.length;

  return {
    resourceCount,
    items,
  };
}

/**
 * Generates canonical SafePreviewArtifact matching PROJECT.md interface contract:
 *
 * interface SafePreviewArtifact {
 *   assetId: string;
 *   contentType: 'pdf' | 'spreadsheet' | 'csv' | 'mcq_bank' | 'bundle';
 *   previewData: {
 *     pdf?: { samplePageCount: number; pages: Array<{ pageNumber: number; textSnippet: string; watermark: string }> };
 *     spreadsheet?: { sheetName: string; totalRows: number; totalCols: number; headers: string[]; sampleRows: Array<Record<string, string>> };
 *     mcq?: { totalQuestions: number; sampleQuestions: Array<{ prompt: string; options: string[]; answerRedacted: true }> };
 *     bundle?: { resourceCount: number; items: Array<{ title: string; contentType: string }> };
 *   };
 *   generatedAt: string;
 * }
 *
 * @param {string} assetId - Target asset identifier
 * @param {string} detectedType - File type detected during inspection
 * @param {Object} parseResult - Output from parser strategy
 * @param {Object} [options] - Optional custom bounds or watermark
 * @returns {SafePreviewArtifact}
 */
export function generateSafePreviewArtifact(assetId, detectedType, parseResult = {}, options = {}) {
  if (!assetId) {
    throw new Error('assetId is required to generate safe preview artifact');
  }

  const normType = String(detectedType || parseResult?.metadata?.format || '').toLowerCase();
  const previewData = {};
  let contentType = 'pdf';

  if (normType === 'pdf' || normType === 'application/pdf') {
    contentType = 'pdf';
    previewData.pdf = buildPdfPreviewData(parseResult, options);
  } else if (normType === 'csv' || normType === 'tsv' || normType === 'text/csv') {
    contentType = 'csv';
    previewData.spreadsheet = buildSpreadsheetPreviewData(parseResult, options);
  } else if (
    normType === 'xlsx' ||
    normType === 'xls' ||
    normType === 'spreadsheet' ||
    normType.includes('excel') ||
    normType.includes('spreadsheet')
  ) {
    contentType = 'spreadsheet';
    previewData.spreadsheet = buildSpreadsheetPreviewData(parseResult, options);
  } else if (normType === 'bundle' || normType === 'zip' || normType.includes('zip')) {
    contentType = 'bundle';
    previewData.bundle = buildBundlePreviewData(parseResult);
  } else {
    // Default to mcq_bank for json/mcq formats
    contentType = 'mcq_bank';
    let rawQuestions = [];
    if (Array.isArray(parseResult)) {
      rawQuestions = parseResult;
    } else if (Array.isArray(parseResult?.questions)) {
      rawQuestions = parseResult.questions;
    } else if (Array.isArray(parseResult?.metadata?.questions)) {
      rawQuestions = parseResult.metadata.questions;
    } else if (Array.isArray(parseResult?.rows)) {
      rawQuestions = parseResult.rows;
    }

    const totalQuestions = parseResult?.metadata?.totalQuestions ?? rawQuestions.length;
    const sampleQuestions = redactMcqPreview(rawQuestions, options);

    previewData.mcq = {
      totalQuestions,
      sampleQuestions,
    };
  }

  return {
    assetId,
    contentType,
    previewData,
    generatedAt: new Date().toISOString(),
  };
}

export default {
  DEFAULT_WATERMARK,
  MAX_PDF_PREVIEW_PAGES,
  MAX_SPREADSHEET_SAMPLE_ROWS,
  MAX_MCQ_SAMPLE_QUESTIONS,
  redactMcqPreview,
  buildPdfPreviewData,
  buildSpreadsheetPreviewData,
  buildBundlePreviewData,
  generateSafePreviewArtifact,
};
