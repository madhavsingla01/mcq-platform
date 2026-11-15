import { createHmac, timingSafeEqual } from 'node:crypto';

const header = 'x-internal-quizfocus-delegation';

function permits(req) {
  const pathname = req.originalUrl.split('?')[0];
  const method = req.method;
  if (method === 'GET') return /^\/api\/v1\/quiz\/(my|drafts)(?:\/[a-f\d]{24})?$/i.test(pathname);
  if (method === 'POST' && pathname === '/api/v1/quiz/manual') return req.body?.isDraft === true && req.body?.visibility === 'private';
  if (method === 'POST') return /^\/api\/v1\/quiz\/drafts\/[a-f\d]{24}\/(questions|validate)$/i.test(pathname);
  return false;
}

export function delegatedAccount(req) {
  const value = req.get(header);
  if (value === undefined) return undefined;
  const secret = process.env.INTEGRATION_DELEGATION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32 || secret === process.env.JWT_SECRET || !permits(req)) return null;
  if (!/^[a-zA-Z0-9_-]{1,2048}\.[a-zA-Z0-9_-]{43}$/.test(value)) return null;
  const [payload, signature] = value.split('.');
  const expected = createHmac('sha256', secret).update(payload).digest();
  const provided = Buffer.from(signature, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (claims.method !== req.method || claims.target !== req.originalUrl ||
        !Number.isInteger(claims.expires) || claims.expires <= now || claims.expires > now + 21 ||
        typeof claims.userId !== 'string' || !/^[a-f\d]{24}$/i.test(claims.userId)) return null;
    return claims.userId;
  } catch {
    return null;
  }
}
