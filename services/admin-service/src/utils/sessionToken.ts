import jwt from 'jsonwebtoken';

export interface SessionClaims {
  id: string;
  exp: number;
  sid?: string;
  tokenVersion?: number;
}

export interface SessionAccount {
  tokenVersion?: number | null | undefined;
  sessions?: readonly { sessionId: string; expiresAt: Date | string | number }[];
}

// Older sessions can omit tokenVersion. Account checks treat that as version zero.
export function verifySessionToken(token: unknown, key: string): SessionClaims {
  if (typeof token !== 'string' || token.length === 0) throw new Error('Invalid session token');
  const claims: unknown = jwt.verify(token, key, { algorithms: ['HS256'] });
  if (typeof claims !== 'object' || claims === null) throw new Error('Invalid session claims');
  const id = 'id' in claims ? claims.id : undefined;
  const exp = 'exp' in claims ? claims.exp : undefined;
  const sid = 'sid' in claims ? claims.sid : undefined;
  const tokenVersion = 'tokenVersion' in claims ? claims.tokenVersion : undefined;
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id) ||
      typeof exp !== 'number' || !Number.isSafeInteger(exp) ||
      ('aud' in claims && claims.aud !== undefined) ||
      ('scope' in claims && claims.scope !== undefined) ||
      ('iss' in claims && claims.iss !== undefined) ||
      (sid !== undefined && (typeof sid !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(sid))) ||
      (tokenVersion !== undefined && (typeof tokenVersion !== 'number' || !Number.isSafeInteger(tokenVersion) || tokenVersion < 0))) {
    throw new Error('Invalid session claims');
  }
  return {
    id, exp,
    ...(sid === undefined ? {} : { sid }),
    ...(tokenVersion === undefined ? {} : { tokenVersion }),
  };
}

export function isCurrentSession(user: SessionAccount, claims: Pick<SessionClaims, 'tokenVersion' | 'sid'>, now = Date.now()) {
  return (claims.tokenVersion ?? 0) === (user.tokenVersion ?? 0) &&
    (!claims.sid || user.sessions?.some(session =>
      session.sessionId === claims.sid && new Date(session.expiresAt).getTime() > now
    ));
}
