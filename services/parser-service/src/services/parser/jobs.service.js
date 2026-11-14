/**
 * Parser Jobs Service (Milestone 2 Ingestion & Inter-Service Job Handling)
 * Orchestrates file inspection, macro detection, decompression defense,
 * formula sanitization, and lifecycle status updates to Media Service.
 */

import SecurityPipeline from '../security/securityPipeline.js';
import ParserRegistry from './strategies/ParserRegistry.js';
import { sanitizeErrorPath } from '../security/macroDetector.service.js';
import { generateSafePreviewArtifact } from '../preview/safePreview.service.js';
import { memoryCache } from '../cache/cache.service.js';
import { logger } from '../../utils/logger.js';

export const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL || 'http://localhost:5007';

/**
 * Dispatches lifecycle status update to Media Service.
 *
 * @param {string} assetId - Media asset ID
 * @param {Object} statusPayload - Status update payload
 * @returns {Promise<{ ok: boolean, status: number, data?: any }>}
 */
export async function sendMediaStatusUpdate(assetId, statusPayload) {
  const url = `${MEDIA_SERVICE_URL}/api/v1/media/assets/${assetId}/status`;

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(statusPayload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      logger.warn(`Media Service status update rejected [HTTP ${res.status}]:`, data);
      return { ok: false, status: res.status, data };
    }

    return { ok: true, status: res.status, data };
  } catch (err) {
    logger.warn(`Failed to connect to Media Service at ${url}: ${err.message}`);
    return { ok: false, status: 0, error: err.message };
  }
}

/**
 * Processes an educational asset ingestion job.
 *
 * @param {Object} jobParams
 * @param {string} jobParams.assetId - Asset ID
 * @param {string} jobParams.storagePath - Path to stored file binary
 * @param {string} [jobParams.mimeType] - Declared MIME type
 * @param {string} jobParams.filename - Original filename
 * @param {string} [jobParams.ownerId] - Creator/owner ID
 * @param {string} [jobParams.leaseToken] - Optional lease token
 * @returns {Promise<{ success: boolean, status: string, assetId: string, detectedType?: string, failureReason?: string, failureCode?: string }>}
 */
export async function processAssetJob({ assetId, storagePath, mimeType, filename, ownerId, leaseToken }) {
  if (!assetId || !storagePath) {
    throw new Error('assetId and storagePath are required to process asset job');
  }

  // 1. Transition lifecycle status to 'scanning'
  await sendMediaStatusUpdate(assetId, {
    status: 'scanning',
    leaseToken,
  });

  // 2. Execute security and format inspection pipeline
  const inspection = await SecurityPipeline.inspectUpload({
    filePath: storagePath,
    filename,
    declaredMimeType: mimeType,
  });

  // 3. Handle security threat or rejection
  if (!inspection.ok) {
    const failureStatus = inspection.status === 'quarantined' ? 'quarantined' : 'rejected';
    const failureReason = sanitizeErrorPath(inspection.failureReason || 'Security validation failed');
    const failureCode = inspection.failureCode || (failureStatus === 'quarantined' ? 'MACRO_STREAM_DETECTED' : 'SECURITY_VALIDATION_FAILED');

    await sendMediaStatusUpdate(assetId, {
      status: failureStatus,
      failureReason,
      failureCode,
      leaseToken,
    });

    return {
      success: false,
      status: failureStatus,
      assetId,
      failureReason,
      failureCode,
    };
  }

  // 4. Transition to 'processing'
  await sendMediaStatusUpdate(assetId, {
    status: 'processing',
    metadata: {
      detectedType: inspection.detectedType,
      inspectedAt: new Date().toISOString(),
    },
    leaseToken,
  });

  // 5. Parse and sanitize content
  let parseResult = null;
  try {
    parseResult = await ParserRegistry.parse(inspection.detectedType, storagePath);
  } catch (err) {
    logger.warn(`Parser error for ${filename} (${inspection.detectedType}): ${err.message}`);
    // If format parsing fails unexpectedly, transition to failed
    const errorMsg = sanitizeErrorPath(err.message);
    await sendMediaStatusUpdate(assetId, {
      status: 'failed',
      failureReason: errorMsg,
      failureCode: 'PARSING_FAILED',
      leaseToken,
    });

    return {
      success: false,
      status: 'failed',
      assetId,
      failureReason: errorMsg,
      failureCode: 'PARSING_FAILED',
    };
  }

  // 6. Transition to 'ready'
  const finalMetadata = {
    detectedType: inspection.detectedType,
    sanitized: true,
    processedAt: new Date().toISOString(),
    ...(parseResult?.metadata || {}),
  };

  // Generate Safe Preview Artifact matching PROJECT.md interface contract
  const artifact = generateSafePreviewArtifact(
    assetId,
    inspection.detectedType,
    parseResult
  );

  // Cache preview artifact in memoryCache
  memoryCache.set(`preview:${assetId}`, artifact, 300000); // 5 minutes TTL

  const previewRef = {
    previewType: inspection.detectedType,
    ready: true,
    samplePageCount: artifact.previewData?.pdf?.samplePageCount,
    totalQuestions: artifact.previewData?.mcq?.totalQuestions,
    watermarked: Boolean(artifact.previewData?.pdf),
    previewUrl: `/api/v1/media/assets/${assetId}/preview`,
    artifact,
    previewData: artifact.previewData,
    generatedAt: artifact.generatedAt,
  };

  await sendMediaStatusUpdate(assetId, {
    status: 'ready',
    metadata: finalMetadata,
    previewRef,
    leaseToken,
  });

  return {
    success: true,
    status: 'ready',
    assetId,
    detectedType: inspection.detectedType,
    metadata: finalMetadata,
    previewRef,
  };
}

export default {
  MEDIA_SERVICE_URL,
  sendMediaStatusUpdate,
  processAssetJob,
};
