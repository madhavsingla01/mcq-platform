import fileTypePkg from 'file-type';
import fs from 'fs';
import { AppError } from './error.middleware.js';

const fileTypeFromFile = fileTypePkg.fileTypeFromFile || fileTypePkg.fromFile;
const ALLOWED_EXTENSIONS = ['xlsx', 'xls', 'csv', 'json'];
const ALLOWED_SIGNATURES_BY_EXTENSION = {
  xlsx: ['xlsx', 'zip'],
  xls: ['xls', 'cfb'],
  csv: [],
  json: [],
};
const TEXT_EXTENSIONS = new Set(['csv', 'json']);
const DANGEROUS_SIGNATURES = new Set(['exe', 'dll', 'elf', 'macho', 'msi', 'scr', 'com']);

const removeUploadedFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const canImportAnywayError = (message, detail = null) => new AppError(message, 400, [
  {
    code: 'SECURITY_VALIDATION_FAILED',
    canImportAnyway: true,
    detail,
  },
]);

const isImportAnywayRequest = (value) => ['true', '1', 'yes'].includes(String(value || '').toLowerCase());

const readFilePrefix = async (filePath, bytes = 2048) => {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const validateTextImport = async (filePath, ext) => {
  const prefix = await readFilePrefix(filePath);

  if (prefix.includes(0)) {
    throw new AppError('Security Error: Text import contains binary data', 400);
  }

  if (ext === 'json') {
    const text = prefix.toString('utf8').replace(/^\uFEFF/, '').trimStart();
    if (text && !['{', '['].includes(text[0])) {
      throw canImportAnywayError('Security Warning: JSON file does not look like JSON data', {
        expected: 'JSON object or array',
      });
    }
  }
};

export const validateFileSecurity = async (req, res, next) => {
  if (!req.file) return next();

  try {
    // Additional security: check for file extension spoofing. This remains enforced
    // even when the user explicitly imports after a signature warning.
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      removeUploadedFile(req.file.path);
      return next(new AppError('Security Error: Extension not allowed', 400));
    }

    const detectedType = await fileTypeFromFile(req.file.path);
    req.detectedMimeType = detectedType?.mime || ({
      csv: 'text/csv',
      json: 'application/json',
    }[ext] || 'application/octet-stream');
    const allowedSignatures = ALLOWED_SIGNATURES_BY_EXTENSION[ext] || [];

    if (detectedType && DANGEROUS_SIGNATURES.has(detectedType.ext)) {
      removeUploadedFile(req.file.path);
      return next(new AppError(`Security Error: Dangerous file signature detected (${detectedType.ext})`, 400));
    }

    if (detectedType && !allowedSignatures.includes(detectedType.ext)) {
      removeUploadedFile(req.file.path);
      return next(new AppError(
        `Security Error: Invalid file signature detected. Expected ${ext} but got ${detectedType.ext}`,
        400,
        [{ code: 'SECURITY_VALIDATION_FAILED', detail: { detectedType: detectedType.ext } }]
      ));
    }

    if (TEXT_EXTENSIONS.has(ext)) {
      await validateTextImport(req.file.path, ext);
    }

    if (!TEXT_EXTENSIONS.has(ext) && !detectedType && !isImportAnywayRequest(req.body.importAnyway)) {
      removeUploadedFile(req.file.path);
      return next(canImportAnywayError(
        `Security Warning: Could not verify ${ext} file signature`,
        { detectedType: null }
      ));
    }

    if (isImportAnywayRequest(req.body.importAnyway)) {
      req.securityWarning = {
        code: 'SECURITY_VALIDATION_BYPASSED',
        message: 'File security signature validation warning was bypassed by user confirmation',
      };
    }
    req.sanitizationStatus = req.securityWarning ? 'warning' : 'validated';

    next();
  } catch (err) {
    removeUploadedFile(req.file?.path);
    if (err instanceof AppError) {
      return next(err);
    }
    next(canImportAnywayError('Security validation failed', err.message));
  }
};

/**
 * ============================================================================
 * MULTI-LAYER INJECTION & ATTACK DEFENSE
 * ============================================================================
 */

/**
 * Recursively sanitize keys to prevent MongoDB / NoSQL query injection.
 * Strips any object key that starts with '$' (e.g. $gt, $ne, $where) or contains dots.
 */
export const sanitizeMongoInput = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeMongoInput);
  }

  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    // Strip operators starting with $ or dot paths used in Mongo query injection
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }
    clean[key] = sanitizeMongoInput(val);
  }
  return clean;
};

export const mongoSanitizer = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeMongoInput(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeMongoInput(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeMongoInput(req.params);
  }
  next();
};

/**
 * SQL Injection detection and neutralization on text search & string inputs
 */
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|UNION|INSERT|DELETE|UPDATE|DROP|ALTER|CREATE|EXEC|EXECUTE)\b\s+)/i,
  /(--|\bOR\b\s+['"\d]+=['"\d]+|;\s*DROP\s+TABLE)/i,
  /('\s*OR\s*'\d+'='\d+)/i,
];

export const sqlSanitizer = (req, res, next) => {
  const checkValue = (val) => {
    if (typeof val === 'string') {
      for (const pattern of SQL_INJECTION_PATTERNS) {
        if (pattern.test(val)) {
          return true;
        }
      }
    }
    return false;
  };

  // Inspect query params (e.g. search, category, sort)
  if (req.query) {
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === 'string' && checkValue(v)) {
        return next(new AppError(`Potential SQL/Query injection detected in parameter: ${k}`, 400));
      }
    }
  }

  next();
};

/**
 * XSS Sanitizer: strips executable script tags, event handlers, and javascript: links
 */
const DANGEROUS_XSS_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>|javascript:\s*|data:\s*text\/html|vbscript:|on\w+\s*=\s*["'][^"']*["']/gi;

export const sanitizeXssString = (val) => {
  if (typeof val !== 'string') return val;
  return val.replace(DANGEROUS_XSS_REGEX, '');
};

const deepXssSanitize = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return typeof obj === 'string' ? sanitizeXssString(obj) : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(deepXssSanitize);
  }
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    clean[k] = deepXssSanitize(v);
  }
  return clean;
};

export const xssSanitizer = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = deepXssSanitize(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = deepXssSanitize(req.query);
  }
  next();
};

/**
 * HTTP Parameter Pollution (HPP) defense.
 * Normalizes query parameters that should be singular strings.
 */
const SINGULAR_QUERY_PARAMS = new Set([
  'page', 'limit', 'sort', 'search', 'category', 'difficulty',
  'builderMode', 'contentKind', 'visibility', 'theme', 'view',
]);

export const hppProtection = (req, res, next) => {
  if (req.query && typeof req.query === 'object') {
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value) && SINGULAR_QUERY_PARAMS.has(key)) {
        // Take the last item in the array to prevent pollution
        req.query[key] = value[value.length - 1];
      }
    }
  }
  next();
};
