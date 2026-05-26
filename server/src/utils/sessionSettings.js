export const LINK_TYPES = ['anyone', 'logged_in', 'invite_only'];
export const SESSION_LIFETIMES = ['forever', 'auto_expire', 'manual'];
export const PARTICIPANT_VISIBILITY = ['all', 'count_only', 'hidden'];
export const CHAT_SETTINGS = ['enabled', 'disabled', 'read_only'];
export const CHAT_FILE_SHARING = ['images_only', 'images_files', 'text_only'];
export const POST_SUBMISSION_ACCESS = ['review_answers', 'reopen_quiz', 'results_only'];

export const SESSION_INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_SESSION_SETTINGS = {
  linkType: 'anyone',
  lifetime: 'forever',
  participantVisibility: 'all',
  chatSettings: 'enabled',
  chatFileSharing: 'images_only',
  postSubmissionAccess: 'review_answers',
  invitees: [],
  expiresAt: null,
};

const enumSet = (items) => new Set(items);

const LINK_TYPE_SET = enumSet(LINK_TYPES);
const LIFETIME_SET = enumSet(SESSION_LIFETIMES);
const VISIBILITY_SET = enumSet(PARTICIPANT_VISIBILITY);
const CHAT_SET = enumSet(CHAT_SETTINGS);
const FILE_SET = enumSet(CHAT_FILE_SHARING);
const POST_ACCESS_SET = enumSet(POST_SUBMISSION_ACCESS);

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

const normalizeInvitees = (invitees) => {
  if (!Array.isArray(invitees)) return [];

  return [...new Set(
    invitees
      .map((invitee) => String(invitee || '').trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 100)
  )];
};

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const defaultManualExpiry = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

export function normalizeSessionSettings(incoming = {}, existing = {}) {
  const base = {
    ...DEFAULT_SESSION_SETTINGS,
    ...(existing?.toObject ? existing.toObject() : existing || {}),
  };

  const next = { ...base };

  if (hasOwn(incoming, 'linkType') && LINK_TYPE_SET.has(incoming.linkType)) {
    next.linkType = incoming.linkType;
  }

  if (hasOwn(incoming, 'lifetime') && LIFETIME_SET.has(incoming.lifetime)) {
    next.lifetime = incoming.lifetime;
  }

  if (hasOwn(incoming, 'participantVisibility') && VISIBILITY_SET.has(incoming.participantVisibility)) {
    next.participantVisibility = incoming.participantVisibility;
  }

  if (hasOwn(incoming, 'chatSettings') && CHAT_SET.has(incoming.chatSettings)) {
    next.chatSettings = incoming.chatSettings;
  }

  if (hasOwn(incoming, 'chatFileSharing') && FILE_SET.has(incoming.chatFileSharing)) {
    next.chatFileSharing = incoming.chatFileSharing;
  }

  if (hasOwn(incoming, 'postSubmissionAccess') && POST_ACCESS_SET.has(incoming.postSubmissionAccess)) {
    next.postSubmissionAccess = incoming.postSubmissionAccess;
  }

  if (hasOwn(incoming, 'invitees')) {
    next.invitees = normalizeInvitees(incoming.invitees);
  } else {
    next.invitees = normalizeInvitees(next.invitees);
  }

  const incomingExpiry = normalizeDate(incoming.expiresAt || incoming.manualExpiresAt);
  const existingExpiry = normalizeDate(next.expiresAt);

  if (next.lifetime === 'manual') {
    next.expiresAt = incomingExpiry || existingExpiry || defaultManualExpiry();
  } else {
    next.expiresAt = null;
  }

  return next;
}

export function getSessionExpiry(session) {
  const settings = session?.settings || {};
  const lifetime = settings.lifetime || DEFAULT_SESSION_SETTINGS.lifetime;

  if (lifetime === 'manual') {
    return normalizeDate(settings.expiresAt);
  }

  if (lifetime === 'auto_expire') {
    const activityDate = normalizeDate(session.lastActivityAt || session.updatedAt || session.createdAt);
    return activityDate ? new Date(activityDate.getTime() + SESSION_INACTIVITY_TIMEOUT_MS) : null;
  }

  return null;
}

export function isSessionExpired(session, now = new Date()) {
  const expiry = getSessionExpiry(session);
  return Boolean(expiry && expiry.getTime() <= now.getTime());
}

export function getSessionExpirationLabel(session) {
  const expiry = getSessionExpiry(session);
  return expiry ? expiry.toISOString() : null;
}

const getObjectIdString = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value._id) return getObjectIdString(value._id);
  if (typeof value.toString === 'function') return value.toString();
  return '';
};

export function isSessionCreator(session, user) {
  if (!session || !user) return false;
  return getObjectIdString(session.creatorId) === getObjectIdString(user._id);
}

const getUserInviteKeys = (user) => [
  user?.username,
  user?.email,
  user?.name,
  getObjectIdString(user?._id),
].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);

export function getSessionAccess(session, user) {
  if (!session) {
    return { allowed: false, status: 404, message: 'Session not found.' };
  }

  if (session.isActive === false || isSessionExpired(session)) {
    return {
      allowed: false,
      status: 410,
      message: 'This session link has expired or was deactivated by the creator.',
    };
  }

  const settings = session.settings || DEFAULT_SESSION_SETTINGS;
  const linkType = settings.linkType || DEFAULT_SESSION_SETTINGS.linkType;

  if (linkType === 'logged_in' && !user) {
    return {
      allowed: false,
      status: 401,
      message: 'Please log in to open this shared quiz.',
    };
  }

  if (linkType === 'invite_only') {
    if (!user) {
      return {
        allowed: false,
        status: 401,
        message: 'Please log in to open this invite-only quiz.',
      };
    }

    if (isSessionCreator(session, user)) {
      return { allowed: true };
    }

    const invitees = normalizeInvitees(settings.invitees);
    const userKeys = getUserInviteKeys(user);
    const isInvited = userKeys.some((key) => invitees.includes(key));

    if (!isInvited) {
      return {
        allowed: false,
        status: 403,
        message: 'This session is invite-only. You do not have permission to join.',
      };
    }
  }

  return { allowed: true };
}

export function publicSessionSettings(settings = {}) {
  const normalized = normalizeSessionSettings({}, settings);
  return {
    linkType: normalized.linkType,
    lifetime: normalized.lifetime,
    participantVisibility: normalized.participantVisibility,
    chatSettings: normalized.chatSettings,
    chatFileSharing: normalized.chatFileSharing,
    postSubmissionAccess: normalized.postSubmissionAccess,
    expiresAt: normalized.expiresAt,
    inviteeCount: normalizeInvitees(normalized.invitees).length,
  };
}
