import { sanitizeFilename } from './middleware/security.js';
import type { IncomingHttpHeaders } from 'node:http';
import { isRecord } from './request-types.js';

export { sanitizeFilename };

// Additive v1 error contract. Existing clients keep success/message/data.
const errorCodes: Readonly<Record<number, string>> = {
  400: 'VALIDATION_ERROR', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN',
  404: 'RESOURCE_NOT_FOUND', 409: 'STATE_CONFLICT', 413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED', 502: 'DEPENDENCY_UNAVAILABLE', 503: 'SERVICE_UNAVAILABLE',
  504: 'DEPENDENCY_TIMEOUT',
};

export const errorCode = (status: number) => errorCodes[status] || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED');

export function errorBody(status: number, message: string, requestId: string) {
  return { success: false as const, message, data: null, error: { code: errorCode(status), message }, requestId };
}

export function proxyFailure(error: unknown) {
  const code = isRecord(error) ? error.code : undefined;
  const timeout = code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT';
  return { status: timeout ? 504 : 502,
    message: timeout ? 'Downstream service timed out' : 'Downstream service unavailable' };
}

// End services verify tokens. Remove misleading client identity assertions even
// though no service may use these headers as authority.
interface ProxyRequestContext {
  headers: IncomingHttpHeaders;
  requestId: string;
  ip: string | undefined;
}

interface ProxyHeaders {
  setHeader(name: string, value: string | number | readonly string[]): void;
  removeHeader(name: string): void;
}

export function sanitizeProxyRequest(proxyReq: ProxyHeaders, req: ProxyRequestContext) {
  for (const name of Object.keys(req.headers || {})) {
    const lowerName = name.toLowerCase();
    if (
      /^(x-user|x-auth|x-admin|x-internal|x-service)(?:-|$)/i.test(lowerName) ||
      ['x-role', 'x-roles', 'x-permissions', 'x-forwarded-user', 'x-forwarded-email'].includes(lowerName)
    ) {
      proxyReq.removeHeader(name);
    }
  }
  proxyReq.setHeader('x-request-id', req.requestId);
  if (req.ip) proxyReq.setHeader('x-forwarded-for', req.ip);
  else proxyReq.removeHeader('x-forwarded-for');
  if (req.headers && req.headers['x-filename']) {
    proxyReq.setHeader('x-filename', sanitizeFilename(req.headers['x-filename']));
  }
}
