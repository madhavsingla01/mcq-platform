import { create } from 'zustand';

const TIMER_STORAGE_KEY = 'mcq.timer.state.v1';
const WARNING_THRESHOLD = 0.2; // 20% remaining triggers warning

let rafHandle = null;
let lastFrameTime = 0;

const isBrowser = typeof window !== 'undefined';

const readTimerStorage = () => {
  if (!isBrowser) return null;
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeTimerStorage = (state) => {
  if (!isBrowser) return;
  try {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify({
      timerMode: state.timerMode,
      deadlineAt: state.deadlineAt,
      quizStartedAt: state.quizStartedAt,
      allowedDurationMs: state.allowedDurationMs,
      serverTimeOffset: state.serverTimeOffset,
      attemptId: state.attemptId,
    }));
  } catch {
    // ignore storage failures
  }
};

const clearTimerStorage = () => {
  if (!isBrowser) return;
  try {
    localStorage.removeItem(TIMER_STORAGE_KEY);
  } catch {
    // ignore
  }
};

const computeRemaining = (deadlineAt, serverTimeOffset) => {
  if (!deadlineAt) return 0;
  return Math.max(0, deadlineAt - (Date.now() + serverTimeOffset));
};

const computeElapsed = (quizStartedAt, serverTimeOffset) => {
  if (!quizStartedAt) return 0;
  return Math.max(0, Date.now() + serverTimeOffset - quizStartedAt);
};

const startAnimationLoop = () => {
  stopAnimationLoop();
  lastFrameTime = Date.now();

  const tick = () => {
    const now = Date.now();
    // Only update state every ~250ms to avoid excessive renders
    if (now - lastFrameTime >= 250) {
      lastFrameTime = now;
      useTimerStore.getState().tick();
    }
    rafHandle = requestAnimationFrame(tick);
  };

  rafHandle = requestAnimationFrame(tick);
};

const stopAnimationLoop = () => {
  if (rafHandle) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
};

export const useTimerStore = create((set, get) => ({
  timerMode: 'none',        // 'none' | 'soft' | 'strict'
  deadlineAt: null,          // epoch ms
  quizStartedAt: null,       // epoch ms
  allowedDurationMs: 0,
  remainingMs: 0,            // computed locally each tick
  elapsedMs: 0,              // total elapsed since quiz start
  isExpired: false,
  isWarning: false,          // < 20% remaining
  serverTimeOffset: 0,       // local clock - server clock (ms)
  attemptId: null,
  isRunning: false,
  hasDeadline: false,

  /**
   * Initialize timer from server attempt data.
   * Called when quiz attempt starts or is recovered.
   */
  initTimer: ({ timerMode, deadlineAt, startedAt, allowedDurationMs, attemptId }) => {
    const mode = timerMode || 'none';
    const deadlineEpoch = deadlineAt ? new Date(deadlineAt).getTime() : null;
    const startEpoch = startedAt ? new Date(startedAt).getTime() : Date.now();
    const duration = Number(allowedDurationMs) || 0;
    const hasDeadline = mode !== 'none' && deadlineEpoch != null && duration > 0;
    const offset = get().serverTimeOffset;

    const remaining = hasDeadline ? computeRemaining(deadlineEpoch, offset) : 0;
    const elapsed = computeElapsed(startEpoch, offset);
    const isExpired = hasDeadline && remaining <= 0;
    const isWarning = hasDeadline && !isExpired && remaining < duration * WARNING_THRESHOLD;

    set({
      timerMode: mode,
      deadlineAt: deadlineEpoch,
      quizStartedAt: startEpoch,
      allowedDurationMs: duration,
      remainingMs: remaining,
      elapsedMs: elapsed,
      isExpired,
      isWarning,
      attemptId: attemptId || null,
      isRunning: !isExpired,
      hasDeadline,
    });

    writeTimerStorage(get());

    if (!isExpired) {
      startAnimationLoop();
    } else {
      stopAnimationLoop();
    }
  },

  /**
   * Called by requestAnimationFrame loop (~4 times/second).
   * Only recomputes derived values — no backend calls.
   */
  tick: () => {
    const state = get();
    if (!state.isRunning) return;

    const elapsed = computeElapsed(state.quizStartedAt, state.serverTimeOffset);

    if (!state.hasDeadline) {
      // Untimed quiz: just track elapsed
      set({ elapsedMs: elapsed });
      return;
    }

    const remaining = computeRemaining(state.deadlineAt, state.serverTimeOffset);
    const isExpired = remaining <= 0;
    const isWarning = !isExpired && remaining < state.allowedDurationMs * WARNING_THRESHOLD;

    set({
      remainingMs: remaining,
      elapsedMs: elapsed,
      isExpired,
      isWarning,
      isRunning: !isExpired,
    });

    if (isExpired) {
      stopAnimationLoop();
    }
  },

  /**
   * Calibrate local clock against server time.
   * Called when sync response returns serverTime.
   */
  calibrateFromServer: (serverTimeIso) => {
    if (!serverTimeIso) return;

    const serverTime = new Date(serverTimeIso).getTime();
    if (Number.isNaN(serverTime)) return;

    const localTime = Date.now();
    const offset = localTime - serverTime;

    set({ serverTimeOffset: offset });
    writeTimerStorage(get());
  },

  /**
   * Recover timer state from localStorage on page refresh.
   * Returns true if recovery was successful.
   */
  recoverFromStorage: (attemptId) => {
    const stored = readTimerStorage();
    if (!stored || stored.attemptId !== attemptId) return false;

    const hasDeadline = stored.timerMode !== 'none' &&
      stored.deadlineAt != null &&
      stored.allowedDurationMs > 0;

    const offset = stored.serverTimeOffset || 0;
    const remaining = hasDeadline ? computeRemaining(stored.deadlineAt, offset) : 0;
    const elapsed = computeElapsed(stored.quizStartedAt, offset);
    const isExpired = hasDeadline && remaining <= 0;
    const isWarning = hasDeadline && !isExpired && remaining < stored.allowedDurationMs * WARNING_THRESHOLD;

    set({
      timerMode: stored.timerMode || 'none',
      deadlineAt: stored.deadlineAt,
      quizStartedAt: stored.quizStartedAt,
      allowedDurationMs: stored.allowedDurationMs || 0,
      remainingMs: remaining,
      elapsedMs: elapsed,
      isExpired,
      isWarning,
      serverTimeOffset: offset,
      attemptId,
      isRunning: !isExpired,
      hasDeadline,
    });

    if (!isExpired) {
      startAnimationLoop();
    }

    return true;
  },

  /**
   * Pause timer (e.g., when tab is hidden).
   */
  pause: () => {
    stopAnimationLoop();
    set({ isRunning: false });
  },

  /**
   * Resume timer after pause.
   */
  resume: () => {
    const state = get();
    if (state.isExpired || state.timerMode === 'none') return;
    set({ isRunning: true });
    startAnimationLoop();
  },

  /**
   * Reset all timer state.
   */
  reset: () => {
    stopAnimationLoop();
    clearTimerStorage();
    set({
      timerMode: 'none',
      deadlineAt: null,
      quizStartedAt: null,
      allowedDurationMs: 0,
      remainingMs: 0,
      elapsedMs: 0,
      isExpired: false,
      isWarning: false,
      serverTimeOffset: 0,
      attemptId: null,
      isRunning: false,
      hasDeadline: false,
    });
  },
}));

// Pause/resume on visibility change
if (isBrowser) {
  document.addEventListener('visibilitychange', () => {
    const store = useTimerStore.getState();
    if (!store.attemptId) return;

    if (document.visibilityState === 'hidden') {
      store.pause();
    } else {
      store.resume();
    }
  });
}
