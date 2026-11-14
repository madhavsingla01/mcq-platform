/**
 * File Inspection Service (Feature F4: Multi-Format Ingestion & Inspection)
 * Inspects binary magic bytes, validates schemas, detects polyglot payloads,
 * and defends against MIME spoofing across PDF, Excel, CSV, JSON, and Bundles.
 */

import fs from 'fs';
import path from 'path';
import { detectMacrosAndExecutables, scanExecutableSignatures, sanitizeErrorPath } from './macroDetector.service.js';
import { inspectDecompressionSafety } from './decompressionGuard.service.js';

// Recognized binary magic signatures
const MAGIC_PDF = Buffer.from('%PDF-', 'utf8');
const MAGIC_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const MAGIC_ZIP_EMPTY = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const MAGIC_OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/**
 * Reads prefix bytes of a file.
 *
 * @param {string} filePath - Absolute path
 * @param {number} [bytes=4096] - Number of bytes to read
 * @returns {Promise<Buffer>}
 */
export async function readFilePrefix(filePath, bytes = 4096) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Validates PDF signature and checks for polyglot HTML/script injection.
 *
 * @param {Buffer} buffer - Header buffer
 * @returns {{ valid: boolean, error?: string, failureCode?: string }}
 */
export function inspectPdfSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) {
    return {
      valid: false,
      error: 'Invalid or truncated PDF header',
      failureCode: 'INVALID_PDF_HEADER',
    };
  }

  // Reject polyglot files with prepended HTML or XML tags (e.g. <html>%PDF-)
  const prefixStr = buffer.subarray(0, Math.min(buffer.length, 64)).toString('utf8').toLowerCase();
  if (
    prefixStr.startsWith('<html') ||
    prefixStr.startsWith('<!doctype') ||
    prefixStr.startsWith('<?xml')
  ) {
    return {
      valid: false,
      error: 'File rejected: Polyglot file with leading HTML/XML header detected.',
      failureCode: 'POLYGLOT_DETECTED',
    };
  }

  // Strict check: first 5 bytes must equal %PDF-
  const signature = buffer.subarray(0, 5);
  if (!signature.equals(MAGIC_PDF)) {
    return {
      valid: false,
      error: 'File rejected: Missing or invalid %PDF- signature at offset 0.',
      failureCode: 'INVALID_PDF_HEADER',
    };
  }

  return { valid: true };
}

/**
 * Validates CSV text heuristics (absence of null bytes, delimited structure).
 *
 * @param {Buffer|string} content - File content
 * @returns {{ valid: boolean, rowCount: number, error?: string, failureCode?: string }}
 */
export function inspectCsvHeuristics(content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');

  if (buf.length === 0) {
    return {
      valid: false,
      rowCount: 0,
      error: 'File rejected: Empty CSV content.',
      failureCode: 'EMPTY_FILE',
    };
  }

  // Reject binary null bytes (\0)
  if (buf.includes(0x00)) {
    return {
      valid: false,
      rowCount: 0,
      error: 'File rejected: CSV document contains illegal binary null bytes.',
      failureCode: 'BINARY_DATA_IN_CSV',
    };
  }

  // Normalize mixed line endings (\r\n and \n)
  const text = buf.toString('utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      valid: false,
      rowCount: lines.length,
      error: 'File rejected: CSV must contain at least a header and one data row.',
      failureCode: 'CSV_INSUFFICIENT_ROWS',
    };
  }

  // Verify presence of common delimiters in the first line
  const headerLine = lines[0];
  const hasDelimiter = [',', ';', '\t'].some((d) => headerLine.includes(d));
  if (!hasDelimiter) {
    return {
      valid: false,
      rowCount: lines.length,
      error: 'File rejected: No standard CSV delimiter (comma, semicolon, tab) found.',
      failureCode: 'CSV_NO_DELIMITER',
    };
  }

  return { valid: true, rowCount: lines.length };
}

/**
 * Validates QuizFocus Question Bank JSON schema.
 *
 * @param {Buffer|string|Object} content - JSON content or parsed object
 * @returns {{ valid: boolean, questionCount: number, error?: string, failureCode?: string }}
 */
export function inspectJsonQuestionBank(content) {
  let parsed;
  if (typeof content === 'object' && content !== null && !Buffer.isBuffer(content)) {
    parsed = content;
  } else {
    try {
      const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
      if (buf.length === 0) {
        return {
          valid: false,
          questionCount: 0,
          error: 'File rejected: Empty JSON file.',
          failureCode: 'EMPTY_FILE',
        };
      }
      const rawText = buf.toString('utf8').replace(/^\uFEFF/, '').trim();
      parsed = JSON.parse(rawText);
    } catch (err) {
      return {
        valid: false,
        questionCount: 0,
        error: sanitizeErrorPath(`Malformed JSON syntax: ${err.message}`),
        failureCode: 'INVALID_JSON_SYNTAX',
      };
    }
  }

  // Support array root or wrapper object with questions/mcqs/data array
  let questions = [];
  if (Array.isArray(parsed)) {
    questions = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const candidateKeys = ['questions', 'data', 'items', 'mcqs'];
    for (const key of candidateKeys) {
      if (Array.isArray(parsed[key])) {
        questions = parsed[key];
        break;
      }
    }
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    return {
      valid: false,
      questionCount: 0,
      error: 'File rejected: QuizFocus JSON question bank requires at least one assessment question.',
      failureCode: 'EMPTY_QUESTION_BANK',
    };
  }

  // Validate question items
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q || typeof q !== 'object') {
      return {
        valid: false,
        questionCount: questions.length,
        error: `File rejected: Question at index ${i} is not a valid question object.`,
        failureCode: 'INVALID_QUESTION_SCHEMA',
      };
    }

    if (!q.prompt && !q.question) {
      return {
        valid: false,
        questionCount: questions.length,
        error: `File rejected: Question at index ${i} is missing required 'prompt' field.`,
        failureCode: 'MISSING_PROMPT',
      };
    }

    if (!Array.isArray(q.options) || q.options.length < 2) {
      return {
        valid: false,
        questionCount: questions.length,
        error: `File rejected: Question at index ${i} requires an options array with at least 2 choices.`,
        failureCode: 'INVALID_OPTIONS_ARRAY',
      };
    }
  }

  return { valid: true, questionCount: questions.length };
}

/**
 * Authoritative File Inspection function (F4, F5, F6).
 * Performs magic byte validation, MIME spoof defense, macro rejection, and decompression bomb pre-checks.
 *
 * @param {string|Buffer} filePathOrBuffer - Path or file buffer
 * @param {string} originalFilename - Original filename
 * @param {string} [declaredMimeType] - MIME type declared by client
 * @returns {Promise<{ ok: boolean, detectedType: string, mimeType: string, isMacroFree: boolean, safePath: string, error?: string, failureReason?: string, failureCode?: string, status: string, metadata?: Object }>}
 */
export async function validateAndInspectFile(filePathOrBuffer, originalFilename, declaredMimeType = '') {
  let buffer;
  let filePath = typeof filePathOrBuffer === 'string' ? filePathOrBuffer : '';

  if (Buffer.isBuffer(filePathOrBuffer)) {
    buffer = filePathOrBuffer;
  } else if (filePath) {
    try {
      buffer = await fs.promises.readFile(filePath);
    } catch (err) {
      return {
        ok: false,
        detectedType: 'unknown',
        mimeType: declaredMimeType,
        isMacroFree: false,
        safePath: filePath,
        error: sanitizeErrorPath(`File read failed: ${err.message}`),
        failureReason: 'File could not be accessed on server.',
        failureCode: 'FILE_READ_ERROR',
        status: 'rejected',
      };
    }
  }

  // 1. Zero-byte file rejection
  if (!buffer || buffer.length === 0) {
    return {
      ok: false,
      detectedType: 'empty',
      mimeType: declaredMimeType,
      isMacroFree: false,
      safePath: filePath,
      error: 'File rejected: File is empty (0 bytes).',
      failureReason: 'File is empty (0 bytes).',
      failureCode: 'EMPTY_FILE',
      status: 'rejected',
    };
  }

  const filename = originalFilename || (filePath ? path.basename(filePath) : 'unknown');
  const ext = path.extname(filename).replace(/^\./, '').toLowerCase();

  // 2. Executable Header Inspection (Defends against MIME spoofing: e.g. .exe disguised as .pdf)
  const execCheck = scanExecutableSignatures(buffer);
  if (execCheck.isExecutable) {
    return {
      ok: false,
      detectedType: 'executable',
      mimeType: 'application/x-dosexec',
      isMacroFree: false,
      safePath: filePath,
      error: sanitizeErrorPath(`File rejected: Malicious binary header detected (${execCheck.type}).`),
      failureReason: 'MALICIOUS_HEADER_DETECTED',
      failureCode: 'MALICIOUS_HEADER_DETECTED',
      status: 'quarantined',
    };
  }

  // 2b. Polyglot check: reject leading HTML/XML prepended content before document headers
  const prefixStr = buffer.subarray(0, Math.min(buffer.length, 64)).toString('utf8').toLowerCase();
  if (
    prefixStr.startsWith('<html') ||
    prefixStr.startsWith('<!doctype') ||
    prefixStr.startsWith('<?xml')
  ) {
    return {
      ok: false,
      detectedType: 'polyglot',
      mimeType: declaredMimeType,
      isMacroFree: true,
      safePath: filePath,
      error: 'File rejected: Polyglot file with leading HTML/XML header detected.',
      failureReason: 'File rejected: Polyglot file with leading HTML/XML header detected.',
      failureCode: 'POLYGLOT_DETECTED',
      status: 'rejected',
    };
  }

  // 3. Macro Extension Inspection
  const macroCheck = await detectMacrosAndExecutables({ buffer, filename });
  if (!macroCheck.isClean) {
    return {
      ok: false,
      detectedType: ext || 'macro',
      mimeType: declaredMimeType,
      isMacroFree: false,
      safePath: filePath,
      error: macroCheck.failureReason,
      failureReason: macroCheck.failureCode || 'MACRO_STREAM_DETECTED',
      failureCode: macroCheck.failureCode || 'MACRO_STREAM_DETECTED',
      status: macroCheck.status || 'quarantined',
    };
  }

  // 4. Magic Byte & Format Detection
  let detectedType = 'unknown';
  let mimeType = declaredMimeType;

  // Check PDF
  if (buffer.length >= 5 && buffer.subarray(0, 5).equals(MAGIC_PDF)) {
    const pdfInspection = inspectPdfSignature(buffer);
    if (!pdfInspection.valid) {
      return {
        ok: false,
        detectedType: 'pdf',
        mimeType: 'application/pdf',
        isMacroFree: true,
        safePath: filePath,
        error: pdfInspection.error,
        failureReason: pdfInspection.error,
        failureCode: pdfInspection.failureCode,
        status: 'rejected',
      };
    }
    detectedType = 'pdf';
    mimeType = 'application/pdf';
  } else if (
    (buffer.length >= 4 && buffer.subarray(0, 4).equals(MAGIC_ZIP)) ||
    (buffer.length >= 4 && buffer.subarray(0, 4).equals(MAGIC_ZIP_EMPTY))
  ) {
    // ZIP container: can be XLSX, bundle, or raw zip
    detectedType = ext === 'bundle' || ext === 'zip' ? 'bundle' : 'xlsx';
    mimeType =
      detectedType === 'bundle'
        ? 'application/zip'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    // Run Decompression Bomb defense on ZIP containers (F6)
    const decompSafety = await inspectDecompressionSafety(buffer);
    if (!decompSafety.ok) {
      return {
        ok: false,
        detectedType,
        mimeType,
        isMacroFree: true,
        safePath: filePath,
        error: decompSafety.error,
        failureReason: decompSafety.error,
        failureCode: decompSafety.failureCode || 'DECOMPRESSION_BOMB_DETECTED',
        status: 'rejected',
      };
    }
  } else if (buffer.length >= 8 && buffer.subarray(0, 8).equals(MAGIC_OLE)) {
    // OLE Compound File: legacy XLS
    detectedType = 'xls';
    mimeType = 'application/vnd.ms-excel';
  } else {
    // Text-based formats: CSV or JSON
    const isCsvExtension =
      ext === 'csv' ||
      (typeof declaredMimeType === 'string' &&
        (declaredMimeType.toLowerCase().includes('text/csv') ||
          declaredMimeType.toLowerCase().includes('application/csv')));

    if (isCsvExtension) {
      // Direct CSV inspection: preserves and propagates specific diagnostic failure codes
      // such as CSV_INSUFFICIENT_ROWS, CSV_NO_DELIMITER, BINARY_DATA_IN_CSV
      const csvInspection = inspectCsvHeuristics(buffer);
      if (csvInspection.valid) {
        detectedType = 'csv';
        mimeType = 'text/csv';
      } else {
        return {
          ok: false,
          detectedType: 'csv',
          mimeType: declaredMimeType || 'text/csv',
          isMacroFree: true,
          safePath: filePath,
          error: csvInspection.error,
          failureReason: csvInspection.error,
          failureCode: csvInspection.failureCode,
          status: 'rejected',
        };
      }
    } else if (!buffer.includes(0x00)) {
      const textSample = buffer.toString('utf8').replace(/^\uFEFF/, '').trimStart();

      if (textSample.startsWith('{') || textSample.startsWith('[')) {
        // Attempt JSON question bank inspection
        const jsonInspection = inspectJsonQuestionBank(buffer);
        if (jsonInspection.valid) {
          detectedType = 'json';
          mimeType = 'application/json';
        } else {
          return {
            ok: false,
            detectedType: 'json',
            mimeType: 'application/json',
            isMacroFree: true,
            safePath: filePath,
            error: jsonInspection.error,
            failureReason: jsonInspection.error,
            failureCode: jsonInspection.failureCode,
            status: 'rejected',
          };
        }
      } else {
        // Check CSV heuristics for untyped text
        const csvInspection = inspectCsvHeuristics(buffer);
        if (csvInspection.valid) {
          detectedType = 'csv';
          mimeType = 'text/csv';
        }
      }
    }
  }

  // 5. Cross-Check Declared MIME vs Detected Type (MIME spoof defense)
  if (detectedType === 'unknown') {
    // Check if filename had pdf extension but magic bytes were missing
    if (ext === 'pdf') {
      return {
        ok: false,
        detectedType: 'unknown',
        mimeType: declaredMimeType,
        isMacroFree: true,
        safePath: filePath,
        error: 'File rejected: Missing or invalid %PDF- signature at offset 0.',
        failureReason: 'Missing or invalid %PDF- signature at offset 0.',
        failureCode: 'INVALID_PDF_HEADER',
        status: 'rejected',
      };
    }

    return {
      ok: false,
      detectedType: 'unknown',
      mimeType: declaredMimeType,
      isMacroFree: true,
      safePath: filePath,
      error: 'File rejected: Unsupported or unrecognized file format.',
      failureReason: 'Unsupported or unrecognized file format.',
      failureCode: 'UNSUPPORTED_FORMAT',
      status: 'rejected',
    };
  }

  // Check for polyglot HTML before PDF
  if (detectedType === 'pdf') {
    const pdfInspection = inspectPdfSignature(buffer);
    if (!pdfInspection.valid) {
      return {
        ok: false,
        detectedType: 'pdf',
        mimeType: 'application/pdf',
        isMacroFree: true,
        safePath: filePath,
        error: pdfInspection.error,
        failureReason: pdfInspection.error,
        failureCode: pdfInspection.failureCode,
        status: 'rejected',
      };
    }
  }

  return {
    ok: true,
    detectedType,
    mimeType,
    isMacroFree: true,
    safePath: filePath,
    status: 'ready',
    metadata: {
      fileSize: buffer.length,
      originalFilename: filename,
      detectedType,
      inspectedAt: new Date().toISOString(),
    },
  };
}

export default {
  readFilePrefix,
  inspectPdfSignature,
  inspectCsvHeuristics,
  inspectJsonQuestionBank,
  validateAndInspectFile,
};
