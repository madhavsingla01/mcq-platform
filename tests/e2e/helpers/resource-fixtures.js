/**
 * QuizFocus Phase 4 Resource Test Fixtures
 * Programmatic builders for educational content fixtures:
 * PDF, Excel (.xlsx/.xls), CSV, JSON, Macro files, High-ratio archives, and Formula prefixes.
 */

import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

// Dynamically resolve xlsx from parser-service or quiz-service
let XLSX = null;
try {
  const require = createRequire(import.meta.url);
  XLSX = require('../../../services/parser-service/node_modules/xlsx');
} catch {
  try {
    const require = createRequire(import.meta.url);
    XLSX = require('../../../services/quiz-service/node_modules/xlsx');
  } catch {
    XLSX = null;
  }
}

/**
 * Computes SHA-256 hex digest of a Buffer or string.
 * @param {Buffer|string} input
 * @returns {string}
 */
export function computeSha256(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Creates a valid, minimal programmatic PDF Buffer.
 * @param {Object} options
 * @param {number} [options.pageCount=1]
 * @param {string} [options.text='QuizFocus Educational Resource']
 * @param {string} [options.watermark]
 * @param {boolean} [options.corrupted=false]
 * @returns {Buffer}
 */
export function buildPdfFixture({ pageCount = 1, text = 'QuizFocus Educational Resource', watermark, corrupted = false } = {}) {
  if (corrupted) {
    return Buffer.from('NOT_A_VALID_PDF_HEADER_STREAM_DATA', 'utf8');
  }

  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');

  const pageRefs = [];
  for (let i = 0; i < pageCount; i++) {
    const objNum = 3 + i * 2;
    pageRefs.push(`${objNum} 0 R`);
  }
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageCount} >>\nendobj`);

  for (let i = 0; i < pageCount; i++) {
    const pageObjNum = 3 + i * 2;
    const contentObjNum = 4 + i * 2;
    const streamText = watermark
      ? `BT /F1 12 Tf 72 712 Td (${text} - Page ${i + 1}) Tj ET\nBT /F1 24 Tf 150 400 Td (${watermark}) Tj ET`
      : `BT /F1 12 Tf 72 712 Td (${text} - Page ${i + 1}) Tj ET`;
    const streamLen = Buffer.byteLength(streamText, 'utf8');

    objects.push(`${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjNum} 0 R >>\nendobj`);
    objects.push(`${contentObjNum} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamText}\nendstream\nendobj`);
  }

  let pdfBody = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdfBody, 'utf8'));
    pdfBody += `${obj}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdfBody, 'utf8');
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdfBody += xref;
  pdfBody += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdfBody, 'utf8');
}

/**
 * Creates a valid programmatic Excel spreadsheet Buffer.
 * @param {Object} options
 * @param {string} [options.sheetName='Questions']
 * @param {Array<Array<any>>} [options.data]
 * @param {string} [options.format='xlsx'] - 'xlsx' or 'xls'
 * @returns {Buffer}
 */
export function buildExcelFixture({
  sheetName = 'Questions',
  data = [
    ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Explanation'],
    ['What is the time complexity of binary search?', 'O(n)', 'O(log n)', 'O(n^2)', 'O(1)', 'B', 'Halves search space each step'],
    ['Which data structure uses LIFO order?', 'Queue', 'Stack', 'Array', 'Linked List', 'B', 'Last In First Out is Stack'],
  ],
  format = 'xlsx',
} = {}) {
  if (XLSX) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { type: 'buffer', bookType: format });
  }

  // Fallback: minimal valid zip with workbook if XLSX not available
  const csvContent = data.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  return Buffer.from(csvContent, 'utf8');
}

/**
 * Creates a valid CSV string or Buffer.
 * @param {Object} options
 * @param {Array<string>} [options.headers]
 * @param {Array<Array<any>>} [options.rows]
 * @param {string} [options.delimiter=',']
 * @returns {string}
 */
export function buildCsvFixture({
  headers = ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer'],
  rows = [
    ['What is HTTP status 200?', 'Not Found', 'OK', 'Internal Error', 'Forbidden', 'B'],
    ['What does DNS stand for?', 'Domain Name System', 'Data Network Service', 'Digital Node Server', 'Direct Name Source', 'A'],
  ],
  delimiter = ',',
} = {}) {
  const allRows = headers ? [headers, ...rows] : rows;
  return allRows
    .map(row =>
      row
        .map(val => {
          const str = String(val ?? '');
          return str.includes(delimiter) || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(delimiter)
    )
    .join('\n');
}

/**
 * Creates a standard QuizFocus educational question bank JSON object or string.
 * @param {Object} options
 * @param {number} [options.questionCount=2]
 * @param {string} [options.title='Computer Science Fundamentals']
 * @param {boolean} [options.asString=false]
 * @returns {Object|string}
 */
export function buildJsonFixture({
  questionCount = 2,
  title = 'Computer Science Fundamentals',
  asString = false,
} = {}) {
  const questions = [];
  for (let i = 1; i <= questionCount; i++) {
    questions.push({
      id: `q_${i}`,
      prompt: `Sample Assessment Question ${i}: What is the purpose of hashing?`,
      options: ['Deterministic one-way mapping', 'Encryption only', 'Data sorting', 'Network routing'],
      correctAnswer: 0,
      explanation: 'Hash functions map arbitrary data to fixed-size digest values.',
      difficulty: 'medium',
      tags: ['algorithms', 'cryptography'],
    });
  }

  const payload = {
    title,
    description: 'High-quality computer science assessment bank for students.',
    version: '1.0.0',
    resourceType: 'mcq_bank',
    totalQuestions: questions.length,
    questions,
  };

  return asString ? JSON.stringify(payload, null, 2) : payload;
}

/**
 * Creates a macro-enabled workbook or file containing macro signature indicators.
 * @param {Object} options
 * @param {string} [options.type='xlsm']
 * @returns {Buffer}
 */
/**
 * Computes CRC-32 for raw buffer data.
 * @param {Buffer} buf
 * @returns {number}
 */
function computeCrc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ -1) >>> 0;
}

/**
 * Creates a valid PKZIP macro-enabled workbook buffer containing xl/vbaProject.bin.
 * Structure contains a valid 30-byte local file header, uncompressed VBA stream,
 * 46-byte central directory header, and 22-byte EOCD record.
 * @param {Object} options
 * @param {string} [options.type='xlsm']
 * @returns {Buffer}
 */
export function buildMacroSpreadsheetFixture({ type = 'xlsm' } = {}) {
  const fileNameStr = 'xl/vbaProject.bin';
  const fileName = Buffer.from(fileNameStr, 'utf8');
  const contentBuf = Buffer.from('VBA_PROJECT_SIGNATURE_DATA_TEST_MOCK', 'utf8');
  const crc = computeCrc32(contentBuf);
  const size = contentBuf.length;

  // Local file header (30 bytes + filename)
  const lfh = Buffer.alloc(30);
  lfh.writeUInt32LE(0x04034b50, 0); // signature PK\x03\x04
  lfh.writeUInt16LE(20, 4); // version needed to extract (2.0)
  lfh.writeUInt16LE(0, 6); // general purpose bit flag
  lfh.writeUInt16LE(0, 8); // compression: 0 (store)
  lfh.writeUInt16LE(0, 10); // last mod file time
  lfh.writeUInt16LE(0, 12); // last mod file date
  lfh.writeUInt32LE(crc, 14); // crc-32
  lfh.writeUInt32LE(size, 18); // compressed size
  lfh.writeUInt32LE(size, 22); // uncompressed size
  lfh.writeUInt16LE(fileName.length, 26); // file name length
  lfh.writeUInt16LE(0, 28); // extra field length

  const localFile = Buffer.concat([lfh, fileName, contentBuf]);

  // Central directory header (46 bytes + filename)
  const cdh = Buffer.alloc(46);
  cdh.writeUInt32LE(0x02014b50, 0); // signature PK\x01\x02
  cdh.writeUInt16LE(20, 4); // version made by
  cdh.writeUInt16LE(20, 6); // version needed to extract
  cdh.writeUInt16LE(0, 8); // general purpose bit flag
  cdh.writeUInt16LE(0, 10); // compression method
  cdh.writeUInt16LE(0, 12); // last mod file time
  cdh.writeUInt16LE(0, 14); // last mod file date
  cdh.writeUInt32LE(crc, 16); // crc-32
  cdh.writeUInt32LE(size, 20); // compressed size
  cdh.writeUInt32LE(size, 24); // uncompressed size
  cdh.writeUInt16LE(fileName.length, 28); // file name length
  cdh.writeUInt16LE(0, 30); // extra field length
  cdh.writeUInt16LE(0, 32); // file comment length
  cdh.writeUInt16LE(0, 34); // disk number start
  cdh.writeUInt16LE(0, 36); // internal file attributes
  cdh.writeUInt32LE(0, 38); // external file attributes
  cdh.writeUInt32LE(0, 42); // relative offset of local header

  const cdEntry = Buffer.concat([cdh, fileName]);

  // End of Central Directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature PK\x05\x06
  eocd.writeUInt16LE(0, 4); // number of this disk
  eocd.writeUInt16LE(0, 6); // number of disk with start of central directory
  eocd.writeUInt16LE(1, 8); // total entries on this disk
  eocd.writeUInt16LE(1, 10); // total entries in central directory
  eocd.writeUInt32LE(cdEntry.length, 12); // size of central directory
  eocd.writeUInt32LE(localFile.length, 16); // offset of start of central directory
  eocd.writeUInt16LE(0, 20); // zipfile comment length

  return Buffer.concat([localFile, cdEntry, eocd]);
}

/**
 * Creates a high-compression test buffer (decompression bomb simulator).
 * Compresses an expansive byte stream into a compact container.
 * @param {Object} options
 * @param {number} [options.expandedSize=10485760] - default 10MB
 * @returns {Buffer}
 */
export function buildDecompressionBombFixture({ expandedSize = 10 * 1024 * 1024 } = {}) {
  const zeros = Buffer.alloc(expandedSize, 0x41); // 'A' repeats
  const deflated = zlib.deflateSync(zeros, { level: 9 });
  return deflated;
}

/**
 * Returns a comprehensive catalog of formula injection test vectors.
 * Tests prefixes: =, +, -, @, tab (\t), carriage return (\r).
 * @returns {Array<{ prefix: string, payload: string, description: string }>}
 */
export function getFormulaInjectionPayloads() {
  return [
    { prefix: '=', payload: '=SUM(1+1)', description: 'Basic calculation formula' },
    { prefix: '=', payload: '=10+20', description: 'Arithmetic formula' },
    { prefix: '+', payload: '+5+5', description: 'Positive prefix formula' },
    { prefix: '-', payload: '-10+2', description: 'Negative prefix formula' },
    { prefix: '@', payload: '@SUM(A1:A5)', description: 'At-symbol function reference' },
    { prefix: '\t', payload: '\t=1+1', description: 'Tab-prefixed formula bypass' },
    { prefix: '\r', payload: '\r=1+1', description: 'Carriage-return prefixed formula bypass' },
    { prefix: '=', payload: '=HYPERLINK("http://external-site.com","Click")', description: 'External hyperlink trigger' },
    { prefix: '=', payload: '="nested"&CHAR(65)', description: 'String concatenation formula' },
  ];
}

/**
 * Checks if a string starts with a formula injection trigger character,
 * while preserving valid numeric negative and positive numbers.
 * @param {string} val
 * @returns {boolean}
 */
export function isFormulaInjection(val) {
  if (typeof val !== 'string' || val.length === 0) return false;
  const leadingSpaces = (val.match(/^ */) || [''])[0];
  const rest = val.slice(leadingSpaces.length);
  if (/^[+-]?\d+(\.\d+)?$/.test(rest.trimStart())) return false;
  const triggerChars = ['=', '+', '-', '@', '\t', '\r'];
  return triggerChars.some(char => rest.startsWith(char));
}

/**
 * Safely sanitizes formula prefix by prepending a single quote before the trigger character,
 * correctly handling leading whitespace and preserving valid numeric negative/positive numbers.
 * @param {string} val
 * @returns {string}
 */
export function sanitizeFormulaPrefix(val) {
  if (typeof val !== 'string') return val;
  const leadingSpaces = (val.match(/^ */) || [''])[0];
  const rest = val.slice(leadingSpaces.length);
  if (/^[+-]?\d+(\.\d+)?$/.test(rest.trimStart())) {
    return val;
  }
  const triggerChars = ['=', '+', '-', '@', '\t', '\r'];
  if (triggerChars.some(c => rest.startsWith(c))) {
    return `${leadingSpaces}'${rest}`;
  }
  return val;
}

/**
 * Safely generates an MCQ preview by redacting correct answers and explanations.
 * Enforces Zero Leakage of answers/explanations and sets answerRedacted: true.
 * @param {Array<Object>} questions
 * @param {Object} [options]
 * @param {number} [options.maxItems=3]
 * @returns {Array<Object>}
 */
export function redactMcqPreview(questions, { maxItems = 3 } = {}) {
  if (!Array.isArray(questions)) return [];
  return questions.slice(0, maxItems).map(q => {
    const prompt = q.prompt || q.text || q.question || '';
    const options = q.options || q.choices || [];
    return {
      prompt,
      options,
      answerRedacted: true,
    };
  });
}

/**
 * Creates a spoofed MIME fixture (e.g. binary disguised as document).
 * @param {Object} options
 * @param {string} [options.disguise='pdf']
 * @returns {Buffer}
 */
export function buildSpoofedMimeFixture({ disguise = 'pdf' } = {}) {
  // Executable magic signature (MZ) pretending to be PDF/XLSX
  const mzHeader = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
  const payload = Buffer.from('FAKE_BINARY_PAYLOAD_FOR_INSPECTION_TEST', 'utf8');
  return Buffer.concat([mzHeader, payload]);
}
