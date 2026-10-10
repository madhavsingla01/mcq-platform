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

    next();
  } catch (err) {
    removeUploadedFile(req.file?.path);
    if (err instanceof AppError) {
      return next(err);
    }
    next(canImportAnywayError('Security validation failed', err.message));
  }
};
