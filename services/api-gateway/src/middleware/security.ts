/**
 * QuizFocus API Gateway - Path Traversal & Safe Filename Security Middleware
 */

import path from 'node:path';
import type { RequestHandler } from 'express';
import { errorBody } from '../contracts.js';
import { requestIdOf } from '../request-types.js';

/**
 * Sanitizes any input filename removing path traversal sequences (.., /),
 * null bytes (\0, %00), and non-printable control characters.
 * Truncates to 255 characters.
 */
export function sanitizeFilename(input: unknown) {
  if (!input || typeof input !== 'string') return '';
  let clean = input.replace(/[\x00-\x1F\x7F]/g, '');
  try {
    clean = decodeURIComponent(clean);
    clean = clean.replace(/[\x00-\x1F\x7F]/g, '');
  } catch {}

  // Normalize Windows separators to POSIX
  clean = clean.replace(/\\/g, '/');

  // Extract basename to strip all directory traversal
  const basename = path.posix.basename(clean) || '';

  // Strip leading dots to prevent hidden files or leftover traversal
  const safe = basename.replace(/^\.+/, '');
  return safe.slice(0, 255);
}

/**
 * Path traversal defense middleware.
 * Traps null bytes, non-printable control characters, and dangerous traversal attempts in URLs or query strings.
 */
export const pathTraversalGuard: RequestHandler = (req, res, next) => {
  const url = req.originalUrl || req.url || '';

  // 1. Trap null bytes (%00 or \0)
  if (url.includes('\0') || /%00/i.test(url)) {
    return res.status(400).json(errorBody(400, 'Invalid request: null byte detected in path', requestIdOf(req)));
  }

  // 2. Trap non-printable control characters in path
  const [rawPath = ''] = url.split('?', 1);
  if (/[\x01-\x1F\x7F]/.test(url) || /%(?:0[1-9a-f]|1[0-9a-f]|7f)/i.test(rawPath)) {
    return res.status(400).json(errorBody(400, 'Invalid request: control character detected in path', requestIdOf(req)));
  }

  // 3. Sanitize filename query parameters if present
  if (req.query) {
    for (const key of ['filename', 'file', 'name']) {
      const value = req.query[key];
      if (typeof value === 'string') {
        if (value.includes('\0')) {
          return res.status(400).json(errorBody(400, 'Invalid request: null byte detected in query', requestIdOf(req)));
        }
        req.query[key] = sanitizeFilename(value);
      }
    }
  }

  // 4. Sanitize incoming x-filename header if present
  if (req.headers && req.headers['x-filename']) {
    req.headers['x-filename'] = sanitizeFilename(req.headers['x-filename']);
  }

  next();
};
