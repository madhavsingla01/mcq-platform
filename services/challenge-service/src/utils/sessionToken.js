import jwt from 'jsonwebtoken';

// Older sessions can omit tokenVersion. Account checks treat that as version zero.
export function verifySessionToken(token, key) {
  const claims = jwt.verify(token, key, { algorithms: ['HS256'] });
  if (!claims || typeof claims.id !== 'string' || !/^[a-f\d]{24}$/i.test(claims.id) ||
      !Number.isSafeInteger(claims.exp) || claims.aud !== undefined || claims.scope !== undefined ||
      claims.iss !== undefined ||
      (claims.tokenVersion !== undefined && (!Number.isSafeInteger(claims.tokenVersion) || claims.tokenVersion < 0))) {
    throw new Error('Invalid session claims');
  }
  return claims;
}
