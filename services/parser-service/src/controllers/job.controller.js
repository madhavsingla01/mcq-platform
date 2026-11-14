/**
 * Parser Job Controller
 * Handles incoming educational resource parsing jobs from Media Service.
 */

import path from 'path';
import { processAssetJob } from '../services/parser/jobs.service.js';

/**
 * Handles POST /api/v1/parser/jobs and POST /jobs
 */
export async function createParseJob(req, res, next) {
  try {
    const { assetId, storagePath, mimeType, filename, ownerId, leaseToken } = req.body;

    if (!assetId || !storagePath) {
      return res.status(400).json({
        success: false,
        message: 'assetId and storagePath are required fields',
      });
    }

    const resolvedFilename = filename || path.basename(storagePath);

    const result = await processAssetJob({
      assetId,
      storagePath,
      mimeType,
      filename: resolvedFilename,
      ownerId,
      leaseToken,
    });

    // Return structured response
    const statusCode = result.success ? 200 : (result.status === 'quarantined' ? 422 : 400);
    return res.status(statusCode).json(result);
  } catch (err) {
    next(err);
  }
}

export default {
  createParseJob,
};
