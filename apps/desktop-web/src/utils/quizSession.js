const GUEST_SESSION_KEY = 'mcq.quiz.guest-session.v2';
const TAB_ID_KEY = 'mcq.quiz.tab-id.v2';
const ATTEMPT_SNAPSHOT_PREFIX = 'mcq.quiz.attempt.';
const ACTIVE_ATTEMPT_PREFIX = 'mcq.quiz.active.';
const QUIZ_CHANNEL_NAME = 'mcq-quiz-attempts-v2';

const isBrowser = typeof window !== 'undefined';

const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `mcq-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const safeParse = (value) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const readStorage = (storage, key) => {
  if (!isBrowser) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (storage, key, value) => {
  if (!isBrowser) {
    return;
  }

  try {
    storage.setItem(key, value);
  } catch {
    // ignore storage quota and private mode failures
  }
};

const removeStorage = (storage, key) => {
  if (!isBrowser) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // ignore storage failures
  }
};

export const getGuestSessionId = () => {
  if (!isBrowser) {
    return 'server-session';
  }

  const existing = readStorage(window.localStorage, GUEST_SESSION_KEY);

  if (existing) {
    return existing;
  }

  const sessionId = generateId();
  writeStorage(window.localStorage, GUEST_SESSION_KEY, sessionId);
  return sessionId;
};

export const getTabId = () => {
  if (!isBrowser) {
    return 'server-tab';
  }

  const existing = readStorage(window.sessionStorage, TAB_ID_KEY);

  if (existing) {
    return existing;
  }

  const tabId = generateId();
  writeStorage(window.sessionStorage, TAB_ID_KEY, tabId);
  return tabId;
};

export const getAttemptSnapshotKey = (attemptId) => `${ATTEMPT_SNAPSHOT_PREFIX}${attemptId}`;
export const getActiveAttemptKey = (quizId) => `${ACTIVE_ATTEMPT_PREFIX}${quizId}`;

export const saveAttemptSnapshot = (snapshot) => {
  if (!snapshot?.attemptId) {
    return;
  }

  writeStorage(
    window.localStorage,
    getAttemptSnapshotKey(snapshot.attemptId),
    JSON.stringify(snapshot)
  );

  if (snapshot.quizId) {
    writeStorage(
      window.localStorage,
      getActiveAttemptKey(snapshot.quizId),
      JSON.stringify({
        attemptId: snapshot.attemptId,
        quizId: snapshot.quizId,
        updatedAt: snapshot.updatedAt,
      })
    );
  }
};

export const loadAttemptSnapshot = (attemptId) => {
  if (!attemptId) {
    return null;
  }

  return safeParse(readStorage(window.localStorage, getAttemptSnapshotKey(attemptId)));
};

export const loadActiveAttemptRef = (quizId) => {
  if (!quizId) {
    return null;
  }

  return safeParse(readStorage(window.localStorage, getActiveAttemptKey(quizId)));
};

export const clearAttemptSnapshot = ({ attemptId, quizId }) => {
  if (attemptId) {
    removeStorage(window.localStorage, getAttemptSnapshotKey(attemptId));
  }

  if (quizId) {
    removeStorage(window.localStorage, getActiveAttemptKey(quizId));
  }
};

export const createQuizBroadcastChannel = () => {
  if (!isBrowser || typeof BroadcastChannel === 'undefined') {
    return null;
  }

  try {
    return new BroadcastChannel(QUIZ_CHANNEL_NAME);
  } catch {
    return null;
  }
};

export const dedupeIsoTimestamps = (timestamps = []) => {
  const seen = new Set();
  const normalized = [];

  timestamps.forEach((value) => {
    if (!value) {
      return;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return;
    }

    const iso = parsed.toISOString();

    if (seen.has(iso)) {
      return;
    }

    seen.add(iso);
    normalized.push(iso);
  });

  normalized.sort((left, right) => new Date(left).getTime() - new Date(right).getTime());

  return normalized;
};

export const formatDurationMs = (durationMs) => {
  const safeDuration = Math.max(0, Math.floor((durationMs || 0) / 1000));
  const hours = Math.floor(safeDuration / 3600);
  const minutes = Math.floor((safeDuration % 3600) / 60);
  const seconds = safeDuration % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const createSnapshotEnvelope = (snapshot) => ({
  type: 'attempt_snapshot',
  snapshot,
});
