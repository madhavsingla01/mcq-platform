import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
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

export async function pruneExpiredSessions(now = new Date()) {
  return User.updateMany(
    { 'sessions.expiresAt': { $lte: now } },
    { $pull: { sessions: { expiresAt: { $lte: now } } } }
  );
}

export function activeSessionFilter(id, version) {
  return {
    _id: id,
    tokenVersion: version === 0 ? { $in: [0, null] } : version,
    isDeleted: { $ne: true },
    isSuspended: { $ne: true },
    isActive: { $ne: false },
  };
}

function sessionFilter(token) {
  const claims = verifySessionToken(token, env.JWT_REFRESH_SECRET);
  const version = claims.tokenVersion ?? 0;
  const filter = activeSessionFilter(claims.id, version);
  if (claims.sid) {
    filter.sessions = {
      $elemMatch: {
        sessionId: claims.sid,
        refreshToken: { $in: [digest(token), token] },
        expiresAt: { $gt: new Date() },
      },
    };
  } else {
    // Legacy refresh credentials are accepted only until their next rotation.
    filter.refreshToken = { $in: [digest(token), token] };
  }
  return { claims, filter };
}

function deviceName(userAgent = '') {
  const browser = /Edg(?:e|A|iOS)?\//i.test(userAgent) ? 'Microsoft Edge'
    : /OPR\//i.test(userAgent) ? 'Opera'
      : /Firefox\//i.test(userAgent) ? 'Firefox'
        : /Chrome\//i.test(userAgent) ? 'Google Chrome'
          : /Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent) ? 'Safari'
            : 'Unknown browser';
  const operatingSystem = /Windows NT/i.test(userAgent) ? 'Windows'
    : /Android/i.test(userAgent) ? 'Android'
      : /iPhone|iPad|iPod/i.test(userAgent) ? 'iOS'
        : /Mac OS X|Macintosh/i.test(userAgent) ? 'macOS'
          : /Linux/i.test(userAgent) ? 'Linux'
            : 'Unknown OS';
  const deviceType = /iPad|Tablet/i.test(userAgent) ? 'Tablet'
    : /Mobile|Android|iPhone|iPod/i.test(userAgent) ? 'Mobile'
      : 'Desktop';
  return { browser, operatingSystem, deviceType, device: `${browser} on ${operatingSystem}` };
}

function requestMetadata(req) {
  const userAgent = String(req.get?.('user-agent') || '').slice(0, 300);
  const metadata = deviceName(userAgent);
  const rawIp = String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
  const ipAddress = isIP(rawIp) ? rawIp.replace(/^::ffff:/i, '') : 'Unknown';
  const locale = String(req.get?.('x-client-locale') || '').slice(0, 35);
  const timeZone = String(req.get?.('x-client-timezone') || '').slice(0, 80);
  const language = String(req.get?.('accept-language') || '').slice(0, 120);
  const readNumber = name => {
    const value = req.get?.(name);
    return typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  };
  const latitude = readNumber('x-client-location-latitude');
  const longitude = readNumber('x-client-location-longitude');
  const accuracy = readNumber('x-client-location-accuracy');
  const location = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
    Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 10000000
    ? { latitude, longitude, accuracy, capturedAt: new Date() }
    : undefined;
  return { ...metadata, ipAddress, locale, timeZone, language, userAgent, ...(location ? { location } : {}) };
}

function createSessionRecord(sessionId, tokens, req) {
  const now = new Date();
  return {
    sessionId,
    refreshToken: digest(tokens.refreshToken),
    ...requestMetadata(req),
    createdAt: now,
    lastActiveAt: now,
    expiresAt: new Date(jwt.decode(tokens.refreshToken).exp * 1000),
  };
}

function signSession(id, tokenVersion, sessionId) {
  const claims = { id: String(id), tokenVersion, sid: sessionId };
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
  setCsrfCookie(res, /^[a-f\d]{64}$/i.test(req.cookies?.csrfToken || '') ? req.cookies.csrfToken : undefined);
}

export async function issueSession(user, req, res, { preserveVersion = false } = {}) {
  let version = user.tokenVersion ?? 0;
  const activeFilter = activeSessionFilter(user._id, version);
  const sessionId = randomUUID();
  await User.updateOne(activeFilter, { $pull: { sessions: { expiresAt: { $lte: new Date() } } } });

  const untrackedFilter = {
    ...activeFilter,
    sessions: { $not: { $elemMatch: { sessionId: { $exists: true } } } },
  };
  const hasUntrackedSessions = preserveVersion ? false : await User.exists(untrackedFilter);
  if (hasUntrackedSessions) {
    const migrated = await User.findOneAndUpdate(
      untrackedFilter,
      { $set: { tokenVersion: version + 1, refreshToken: null } },
      { new: true }
    ).select('tokenVersion').lean();
    if (migrated) {
      version = migrated.tokenVersion;
    }
  }

  const currentUser = await User.findById(user._id).select('tokenVersion').lean();
  if (!currentUser) throw new AppError('Session changed. Please sign in again.', 401);
  version = currentUser.tokenVersion ?? version;
  const tokens = signSession(user._id, version, sessionId);
  const filter = activeSessionFilter(user._id, version);
  const result = await User.updateOne(filter, {
    $set: { refreshToken: digest(tokens.refreshToken) },
    $push: { sessions: createSessionRecord(sessionId, tokens, req) },
  });
  if (!result.matchedCount) throw new AppError('Session changed. Please sign in again.', 401);
  setSessionCookies(req, res, tokens);
}

export async function rotateSession(req, res) {
  let parsed;
  try { parsed = sessionFilter(req.cookies?.refreshToken); }
  catch { return null; }

  const { claims, filter } = parsed;
  const sessionId = claims.sid || randomUUID();
  const tokenVersion = claims.tokenVersion ?? 0;
  const nextVersion = claims.sid ? tokenVersion : tokenVersion + 1;
  const tokens = signSession(claims.id, nextVersion, sessionId);
  const update = claims.sid
    ? {
        $set: {
          'sessions.$.refreshToken': digest(tokens.refreshToken),
          'sessions.$.lastActiveAt': new Date(),
          refreshToken: digest(tokens.refreshToken),
          ...Object.fromEntries(
            Object.entries(requestMetadata(req)).map(([key, value]) => [`sessions.$.${key}`, value])
          ),
        },
      }
    : {
        $set: {
          tokenVersion: nextVersion,
          refreshToken: digest(tokens.refreshToken),
          sessions: [createSessionRecord(sessionId, tokens, req)],
        },
      };
  const user = await User.findOneAndUpdate(filter, update, { new: true }).select('+sessions');
  if (user) {
    req.authSessionId = sessionId;
    req.activeSessions = user.sessions || [];
    user.sessions = undefined;
    setSessionCookies(req, res, tokens);
  }
  return user;
}

export async function endSession(req) {
  let parsed;
  if (!req.authSessionId && req.cookies?.refreshToken) {
    try { parsed = sessionFilter(req.cookies.refreshToken); }
    catch { return null; }
  }

  if (req.authSessionId) {
    const claims = { id: String(req.user._id), tokenVersion: req.user.tokenVersion ?? 0, sid: req.authSessionId };
    const filter = {
      ...activeSessionFilter(claims.id, claims.tokenVersion),
      'sessions.sessionId': claims.sid,
    };
    const result = await User.updateOne(filter, {
      $pull: { sessions: { sessionId: claims.sid } },
      $set: { refreshToken: null },
    });
    return result.modifiedCount ? claims.id : null;
  }

  const claims = parsed?.claims || (req.user?._id ? {
    id: String(req.user._id),
    tokenVersion: req.user.tokenVersion ?? 0,
  } : null);
  if (!claims?.id) return null;
  if (claims.sid) {
    const result = await User.updateOne(parsed.filter, {
      $pull: { sessions: { sessionId: claims.sid } },
      $set: { refreshToken: null },
    });
    return result.modifiedCount ? claims.id : null;
  }

  const version = claims.tokenVersion ?? 0;
  const result = await User.updateOne(activeSessionFilter(claims.id, version), {
    $set: { tokenVersion: version + 1, refreshToken: null, sessions: [] },
  });
  return result.modifiedCount ? claims.id : null;
}
