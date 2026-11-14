import { sanitizeFilename } from './middleware/security.js';

export { sanitizeFilename };

// Additive v1 error contract. Existing clients keep success/message/data.
export const errorCode = status => ({
  400: 'VALIDATION_ERROR', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN',
  404: 'RESOURCE_NOT_FOUND', 409: 'STATE_CONFLICT', 413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED', 502: 'DEPENDENCY_UNAVAILABLE', 503: 'SERVICE_UNAVAILABLE',
  504: 'DEPENDENCY_TIMEOUT',
}[status] || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED'));

export function errorBody(status, message, requestId) {
  return { success: false, message, data: null, error: { code: errorCode(status), message }, requestId };
}

export function proxyFailure(error) {
  const timeout = ['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(error?.code);
  return { status: timeout ? 504 : 502,
    message: timeout ? 'Downstream service timed out' : 'Downstream service unavailable' };
}

// End services verify tokens. Remove misleading client identity assertions even
// though no service may use these headers as authority.
export function sanitizeProxyRequest(proxyReq, req) {
  for (const name of Object.keys(req.headers || {})) {
    if (/^(x-user-|x-auth-|x-admin-|x-internal-|x-service-)/i.test(name) ||
      ['x-role', 'x-roles', 'x-permissions', 'x-forwarded-user', 'x-forwarded-email'].includes(name)) proxyReq.removeHeader(name);
  }
  proxyReq.setHeader('x-request-id', req.requestId);
  proxyReq.setHeader('x-forwarded-for', req.ip);
  if (req.headers && req.headers['x-filename']) {
    proxyReq.setHeader('x-filename', sanitizeFilename(req.headers['x-filename']));
  }
}
