/**
 * QuizFocus API Gateway - Structured Audit Logging Middleware
 * Captures upload and processing lifecycle events with zero sensitive data leakage.
 */

import type { Request, RequestHandler } from 'express';
import { isRecord } from '../request-types.js';

interface AuditEntry {
  timestamp?: string;
  requestContext?: string | undefined;
  userId?: string;
  action: string;
  event?: string;
  status: number;
  ip?: string;
  latency?: number;
  assetId?: string | undefined;
  reason?: string | undefined;
  meta?: unknown;
}

const auditLogBuffer: AuditEntry[] = [];
const MAX_AUDIT_BUFFER_SIZE = 500;

export function getAuditLogs() {
  return [...auditLogBuffer];
}

export function clearAuditLogs() {
  auditLogBuffer.length = 0;
}

export function extractUserIdFromAuth(req: Pick<Request, 'headers'> & { cookies?: unknown }) {
  const cookieToken = isRecord(req.cookies) ? req.cookies.accessToken : undefined;
  const token = req.headers?.authorization || cookieToken;
  if (!token || typeof token !== 'string') return 'anonymous';

  const raw = token.replace(/^Bearer\s+/i, '').trim();
  const parts = raw.split('.');
  const encodedPayload = parts[1];
  if (parts.length !== 3 || !encodedPayload) return 'anonymous';

  try {
    const payload: unknown = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!isRecord(payload)) return 'anonymous';
    const id = payload.userId || payload.id || payload.sub;
    return typeof id === 'string' ? id : 'anonymous';
  } catch {
    return 'anonymous';
  }
}

export function resolveAuditEventAction(req: Pick<Request, 'path' | 'originalUrl' | 'method'>) {
  const path = req.path || req.originalUrl || '';
  const method = req.method;

  if (path.includes('/assets/initiate')) return 'ASSET_UPLOAD_INITIATED';
  if (path.includes('/assets/') && path.includes('/upload')) return 'ASSET_UPLOAD_PAYLOAD';
  if (path.includes('/upload')) return 'ASSET_UPLOAD_PAYLOAD';
  if (path.includes('/jobs')) return 'PARSER_JOB_CREATE';
  if (path.includes('/parse')) return 'PARSER_PARSE';
  if (path.includes('/map')) return 'PARSER_MAP';
  if (path.includes('/images')) return 'IMAGE_UPLOAD';
  if (path.includes('/clips')) return 'CLIP_UPLOAD';
  if (method === 'PATCH' && path.includes('/status')) return 'ASSET_STATUS_UPDATE';
  return `${method}_UPLOAD_EVENT`;
}

export function recordAuditLog(entry: AuditEntry) {
  // Enforce zero sensitive metadata leakage:
  // Strictly redact/omit Authorization headers, bearer tokens, passwords, cookies, and raw questions/answers.
  const sanitizedEntry = {
    timestamp: entry.timestamp || new Date().toISOString(),
    requestContext: entry.requestContext,
    userId: entry.userId || 'anonymous',
    action: entry.action,
    event: entry.event || entry.action, // Supports both 'action' and 'event' contracts
    status: entry.status,
    ip: entry.ip || 'unknown',
    latency: entry.latency ?? 0,
    ...(entry.assetId ? { assetId: entry.assetId } : {}),
    ...(entry.reason ? { reason: entry.reason } : {}),
    ...(entry.meta ? { meta: entry.meta } : {}),
  };

  auditLogBuffer.push(sanitizedEntry);
  if (auditLogBuffer.length > MAX_AUDIT_BUFFER_SIZE) {
    auditLogBuffer.shift();
  }

  if (process.env.NODE_ENV !== 'test') {
    console.info(JSON.stringify({ service: 'api-gateway', audit: true, ...sanitizedEntry }));
  }

  return sanitizedEntry;
}

export function createAuditLogMiddleware(): RequestHandler {
  return function auditLogMiddleware(req, res, next) {
    const path = req.path || req.originalUrl || '';
    const isUploadEvent = (
      path.startsWith('/api/v1/media') ||
      path.startsWith('/media') ||
      path.startsWith('/api/v1/upload') ||
      path.startsWith('/api/v1/parser') ||
      path.startsWith('/uploads')
    );

    if (!isUploadEvent) return next();

    const startTime = Date.now();
    const requestContext = req.requestId;
    const userId = extractUserIdFromAuth(req);
    const action = resolveAuditEventAction(req);
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    // Extract assetId if in URL params (/assets/:id/...)
    const assetIdMatch = path.match(/\/assets\/([a-zA-Z0-9_-]+)/);
    const assetId = assetIdMatch ? assetIdMatch[1] : undefined;

    res.once('finish', () => {
      const latency = Math.max(0, Date.now() - startTime);
      const status = res.statusCode;

      let eventAction = action;
      let failureReason;

      if (status === 429) {
        eventAction = 'UPLOAD_RATE_LIMITED';
        failureReason = 'RATE_LIMIT_EXCEEDED';
      } else if (status >= 400 && status < 500) {
        failureReason = status === 403 ? 'FORBIDDEN' : status === 400 ? 'VALIDATION_ERROR' : 'CLIENT_ERROR';
      } else if (status >= 500) {
        failureReason = 'INTERNAL_GATEWAY_ERROR';
      }

      recordAuditLog({
        timestamp: new Date().toISOString(),
        requestContext,
        userId,
        action: eventAction,
        event: eventAction,
        status,
        ip,
        latency,
        assetId,
        reason: failureReason,
      });
    });

    next();
  };
}
