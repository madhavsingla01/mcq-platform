/**
 * Security Pipeline Coordinator
 * Coordinates file inspection (F4), macro detection (F5), decompression guards (F6),
 * and formula injection sanitization (F7).
 */

import { validateAndInspectFile } from './fileInspection.service.js';
import { detectMacrosAndExecutables, sanitizeErrorPath } from './macroDetector.service.js';
import { inspectDecompressionSafety, withTimeout, cleanupTempFiles } from './decompressionGuard.service.js';
import { sanitizeTabularData, sanitizeMetadata, isFormulaInjection, sanitizeFormulaPrefix } from './formulaSanitizer.service.js';
import { logger } from '../../utils/logger.js';

export class SecurityPipeline {
  /**
   * Runs the full security inspection pipeline on an uploaded educational asset.
   *
   * @param {Object} params
   * @param {string} [params.filePath] - Storage path to file
   * @param {Buffer} [params.buffer] - Raw file buffer
   * @param {string} params.filename - Original filename
   * @param {string} [params.declaredMimeType] - Client declared MIME
   * @param {number} [params.timeoutMs=15000] - Processing timeout bound
   * @returns {Promise<{ ok: boolean, status: string, detectedType: string, isMacroFree: boolean, failureReason?: string, failureCode?: string, metadata?: Object }>}
   */
  static async inspectUpload({ filePath, buffer, filename, declaredMimeType, timeoutMs = 15000 }) {
    return withTimeout(async () => {
      // Step 1: Execute authoritative format & security inspection
      const target = buffer || filePath;
      const inspection = await validateAndInspectFile(target, filename, declaredMimeType);

      if (!inspection.ok) {
        logger.warn(`Security inspection failed for ${filename}: [${inspection.failureCode}] ${inspection.failureReason}`);
        return {
          ok: false,
          status: inspection.status || 'rejected',
          detectedType: inspection.detectedType || 'unknown',
          isMacroFree: inspection.isMacroFree || false,
          failureReason: sanitizeErrorPath(inspection.failureReason || inspection.error),
          failureCode: inspection.failureCode || 'SECURITY_VALIDATION_FAILED',
        };
      }

      return {
        ok: true,
        status: 'ready',
        detectedType: inspection.detectedType,
        mimeType: inspection.mimeType,
        isMacroFree: true,
        safePath: inspection.safePath,
        metadata: inspection.metadata || {},
      };
    }, timeoutMs, async () => {
      if (filePath) {
        await cleanupTempFiles([filePath]);
      }
    });
  }

  /**
   * Sanitizes parsed tabular data (Excel / CSV).
   *
   * @param {Array<Object>|Array<Array<any>>} rows - Raw parsed rows
   * @returns {Array<Object>|Array<Array<any>>} - Sanitized rows
   */
  static sanitizeRows(rows) {
    return sanitizeTabularData(rows);
  }

  /**
   * Sanitizes educational resource metadata.
   *
   * @param {Object} metadata - Resource metadata
   * @returns {Object} - Sanitized metadata
   */
  static sanitizeResourceMetadata(metadata) {
    return sanitizeMetadata(metadata);
  }
}

export default SecurityPipeline;
