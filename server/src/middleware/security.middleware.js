import fileTypePkg from 'file-type';
import fs from 'fs';
import { AppError } from './error.middleware.js';

const fileTypeFromFile = fileTypePkg.fileTypeFromFile || fileTypePkg.fromFile;
const ALLOWED_EXTENSIONS = ['xlsx', 'xls', 'csv', 'json'];
const ALLOWED_SPREADSHEET_SIGNATURES = ['zip', 'xls', 'xlsx'];

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

    if (isImportAnywayRequest(req.body.importAnyway)) {
      req.securityWarning = {
        code: 'SECURITY_VALIDATION_BYPASSED',
        message: 'File security signature validation was bypassed by user confirmation',
      };
      return next();
    }

    // Basic CSV/JSON files might not have a strong magic number that file-type detects properly.
    // file-type mainly works for binary files like excel (.xlsx), images, pdfs.
    
    // Check if it's supposed to be an excel file
    if (req.file.mimetype.includes('spreadsheet') || req.file.mimetype.includes('excel')) {
      const type = await fileTypeFromFile(req.file.path);
      
      // type might be null for plain text files. 
      // If it has a type, ensure it's not an executable or dangerous type.
      if (type && !ALLOWED_SPREADSHEET_SIGNATURES.includes(type.ext)) {
        removeUploadedFile(req.file.path);
        return next(canImportAnywayError(
          `Security Error: Invalid file signature detected. Expected spreadsheet but got ${type.ext}`,
          { detectedType: type.ext }
        ));
      }
    }

    next();
  } catch (err) {
    removeUploadedFile(req.file?.path);
    next(canImportAnywayError('Security validation failed', err.message));
  }
};
