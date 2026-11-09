import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.model.js';
import env from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';
import { clearCsrfCookie, setCsrfCookie } from '../middleware/csrf.middleware.js';
import { verifySessionToken } from '../utils/sessionToken.js';

const cookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'none' : 'lax',
  path: '/',
};

export function clearAuthCookies(res) {
  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);
  clearCsrfCookie(res);
}

const digest = token => 'sha256:' + createHash('sha256').update(token).digest('hex');

export function activeSessionFilter(id, version) {
  return {
    _id: id,
    tokenVersion: version === 0 ? { $in: [0, null] } : version,
    isDeleted: { $ne: true },
    isSuspended: { $ne: true },
    isActive: { $ne: false },
  };
}

function refreshFilter(token) {
  const claims = verifySessionToken(token, env.JWT_REFRESH_SECRET);
  return {
    ...activeSessionFilter(claims.id, claims.tokenVersion ?? 0),
    // Existing raw values are accepted only until the first successful rotation.
    refreshToken: { $in: [digest(token), token] },
  };
}

function signSession(id, tokenVersion) {
  const claims = { id: String(id), tokenVersion };
  return {
    accessToken: jwt.sign(claims, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: env.JWT_EXPIRES_IN }),
    refreshToken: jwt.sign(claims, env.JWT_REFRESH_SECRET, {
      algorithm: 'HS256', expiresIn: env.JWT_REFRESH_EXPIRES_IN, jwtid: randomUUID(),
    }),
  };
}

function setSessionCookies(req, res, tokens) {
  for (const [name, token] of Object.entries(tokens)) {
    const maxAge = Math.max(0, jwt.decode(token).exp * 1000 - Date.now());
    res.cookie(name, token, { ...cookieOptions, maxAge });
  }
  // Keep the browser's CSRF pair stable across parallel requests and tabs.
  setCsrfCookie(res, /^[a-f\d]{64}$/i.test(req.cookies?.csrfToken || '') ? req.cookies.csrfToken : undefined);
}

export async function issueSession(user, req, res) {
  const version = user.tokenVersion ?? 0;
  const tokens = signSession(user._id, version);
  const result = await User.updateOne(activeSessionFilter(user._id, version), {
    $set: { refreshToken: digest(tokens.refreshToken) },
  });
  if (!result.matchedCount) throw new AppError('Session changed. Please sign in again.', 401);
  setSessionCookies(req, res, tokens);
}

export async function rotateSession(req, res) {
  let filter;
  try { filter = refreshFilter(req.cookies?.refreshToken); }
  catch { return null; }

  const tokens = signSession(filter._id, typeof filter.tokenVersion === 'number' ? filter.tokenVersion : 0);
  const user = await User.findOneAndUpdate(filter, { $set: { refreshToken: digest(tokens.refreshToken) } }, { new: true });
  if (user) setSessionCookies(req, res, tokens);
  return user;
}

export async function endSession(req) {
  let filter;
  if (req.user?._id) {
    filter = activeSessionFilter(req.user._id, req.user.tokenVersion ?? 0);
  } else {
    try { filter = refreshFilter(req.cookies?.refreshToken); }
    catch { return null; }
  }
  const version = typeof filter.tokenVersion === 'number' ? filter.tokenVersion : 0;
  const result = await User.updateOne(filter, { $set: { tokenVersion: version + 1, refreshToken: null } });
  return result.modifiedCount ? filter._id : null;
}
