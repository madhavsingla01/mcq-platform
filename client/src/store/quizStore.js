import { create } from 'zustand';
import api from '../api/axios';
import {
  clearAttemptSnapshot,
  createQuizBroadcastChannel,
  createSnapshotEnvelope,
  dedupeIsoTimestamps,
  getGuestSessionId,
  getTabId,
  loadActiveAttemptRef,
  loadAttemptSnapshot,
  saveAttemptSnapshot,
} from '../utils/quizSession';

const TIMER_TICK_MS = 1000;
const SYNC_INTERVAL_MS = 5000;
const ANSWER_SYNC_DEBOUNCE_MS = 450;
const MAX_PENDING_SYNC_JOBS = 50;

let timerHandle = null;
let syncHandle = null;
let debouncedSyncHandle = null;
let runtimeChannel = null;
let runtimeListenersAttached = false;

const createDefaultAnswerState = () => ({
  selectedAnswer: null,
  timeSpentMs: 0,
  visitTimestamps: [],
  submissionTimestamps: [],
  submittedAt: null,
  isLocked: false,
  lockedAt: null,
  lastClientUpdatedAt: null,
});

const normalizeIso = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const toMilliseconds = (value, fallbackSeconds = 0) => {
  const numeric = Number(value);

  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.round(numeric);
  }

  return Math.round((fallbackSeconds || 0) * 1000);
};

const cloneMarkedForReview = (markedForReview) => [...(markedForReview || [])];

const getQuestionIdAtIndex = (questions, index) => questions[index]?._id || null;

const appendUniqueIso = (items, value) => dedupeIsoTimestamps([...(items || []), value]);

const buildQuestionIndexLookup = (questions) => {
  const indexLookup = {};
  questions.forEach((question, index) => {
    indexLookup[question._id] = index;
  });
  return indexLookup;
};

const normalizeAnswerState = (answer = {}) => ({
  selectedAnswer: typeof answer.selectedAnswer === 'string' && answer.selectedAnswer.trim()
    ? answer.selectedAnswer.trim()
    : null,
  timeSpentMs: toMilliseconds(answer.timeSpentMs ?? answer.timeTakenMs, Number(answer.timeTaken || 0)),
  visitTimestamps: dedupeIsoTimestamps([
    ...(Array.isArray(answer.visitTimestamps) ? answer.visitTimestamps : []),
    answer.visitedAt,
    answer.firstVisitedAt,
    answer.lastVisitedAt,
  ]),
  submissionTimestamps: dedupeIsoTimestamps([
    ...(Array.isArray(answer.submissionTimestamps) ? answer.submissionTimestamps : []),
    answer.submittedAt,
  ]),
  submittedAt: normalizeIso(answer.submittedAt),
  isLocked: answer.isLocked === true,
  lockedAt: normalizeIso(answer.lockedAt),
  lastClientUpdatedAt: normalizeIso(answer.lastClientUpdatedAt) || normalizeIso(answer.submittedAt),
});

const mergeAnswerStates = (baseAnswer = createDefaultAnswerState(), incomingAnswer = createDefaultAnswerState()) => {
  const normalizedBase = normalizeAnswerState(baseAnswer);
  const normalizedIncoming = normalizeAnswerState(incomingAnswer);
  const baseSubmittedAt = normalizedBase.submittedAt ? new Date(normalizedBase.submittedAt).getTime() : 0;
  const incomingSubmittedAt = normalizedIncoming.submittedAt ? new Date(normalizedIncoming.submittedAt).getTime() : 0;
  const selectionConflict =
    normalizedBase.isLocked &&
    normalizedBase.selectedAnswer &&
    normalizedIncoming.selectedAnswer &&
    normalizedBase.selectedAnswer !== normalizedIncoming.selectedAnswer;

  let selectedAnswer = normalizedBase.selectedAnswer;

  if (!selectionConflict && normalizedIncoming.selectedAnswer) {
    if (!selectedAnswer || incomingSubmittedAt >= baseSubmittedAt) {
      selectedAnswer = normalizedIncoming.selectedAnswer;
    }
  }

  const isLocked = selectionConflict
    ? normalizedBase.isLocked
    : (normalizedBase.isLocked || normalizedIncoming.isLocked);

  const submittedAt = incomingSubmittedAt >= baseSubmittedAt
    ? (normalizedIncoming.submittedAt || normalizedBase.submittedAt)
    : (normalizedBase.submittedAt || normalizedIncoming.submittedAt);

  const lockedAt = normalizeIso(
    isLocked
      ? (normalizedBase.lockedAt || normalizedIncoming.lockedAt || submittedAt)
      : null
  );

  return {
    selectedAnswer: selectionConflict ? normalizedBase.selectedAnswer : selectedAnswer,
    timeSpentMs: Math.max(normalizedBase.timeSpentMs, normalizedIncoming.timeSpentMs),
    visitTimestamps: dedupeIsoTimestamps([
      ...normalizedBase.visitTimestamps,
      ...normalizedIncoming.visitTimestamps,
    ]),
    submissionTimestamps: dedupeIsoTimestamps([
      ...normalizedBase.submissionTimestamps,
      ...normalizedIncoming.submissionTimestamps,
    ]),
    submittedAt,
    isLocked,
    lockedAt,
    lastClientUpdatedAt: normalizeIso(
      normalizedIncoming.lastClientUpdatedAt ||
      normalizedBase.lastClientUpdatedAt ||
      submittedAt
    ),
  };
};

const buildAnswersMap = (questions, serverAttempt = null, localAnswers = null) => {
  const serverAnswersByQuestionId = {};

  (serverAttempt?.answers || []).forEach((answer) => {
    serverAnswersByQuestionId[String(answer.questionId)] = normalizeAnswerState(answer);
  });

  const localAnswerMap = localAnswers || {};
  const answerMap = {};

  questions.forEach((question) => {
    const questionId = question._id;
    const baseState = mergeAnswerStates(
      createDefaultAnswerState(),
      serverAnswersByQuestionId[questionId] || {}
    );
    answerMap[questionId] = mergeAnswerStates(baseState, localAnswerMap[questionId] || {});
  });

  return answerMap;
};

const getQuestionIdForAttempt = (attempt, questions, questionIndexLookup, fallbackIndex = 0) => {
  const lastActiveQuestionId = attempt?.lastActiveQuestionId ? String(attempt.lastActiveQuestionId) : null;

  if (lastActiveQuestionId && Number.isInteger(questionIndexLookup[lastActiveQuestionId])) {
    return lastActiveQuestionId;
  }

  return getQuestionIdAtIndex(questions, fallbackIndex);
};

const commitElapsedToState = (state, now = Date.now()) => {
  if (!state.isStarted || state.isSubmitted || !state.lastElapsedUpdateAtMs) {
    return state;
  }

  const elapsedDelta = Math.max(0, now - state.lastElapsedUpdateAtMs);

  if (!elapsedDelta) {
    return state;
  }

  const currentQuestionId = getQuestionIdAtIndex(state.questions, state.currentIndex);
  const nextAnswers = { ...state.answers };

  if (currentQuestionId) {
    nextAnswers[currentQuestionId] = {
      ...(nextAnswers[currentQuestionId] || createDefaultAnswerState()),
      timeSpentMs: (nextAnswers[currentQuestionId]?.timeSpentMs || 0) + elapsedDelta,
      lastClientUpdatedAt: new Date(now).toISOString(),
    };
  }

  return {
    ...state,
    answers: nextAnswers,
    totalElapsedMs: state.totalElapsedMs + elapsedDelta,
    lastElapsedUpdateAtMs: now,
    snapshotVersion: state.snapshotVersion + 1,
    hasPendingSync: true,
  };
};

const queueSyncJob = (state, reason) => ({
  ...state,
  pendingSyncQueue: [
    ...state.pendingSyncQueue,
    {
      version: state.snapshotVersion,
      reason,
      createdAt: new Date().toISOString(),
    },
  ].slice(-MAX_PENDING_SYNC_JOBS),
  hasPendingSync: true,
});

const serializeSnapshot = (state) => {
  if (!state.attemptId || !state.quiz?._id) {
    return null;
  }

  return {
    attemptId: state.attemptId,
    quizId: state.quiz._id,
    quiz: state.quiz,
    questions: state.questions,
    attemptStartedAt: state.attemptStartedAt,
    currentIndex: state.currentIndex,
    answers: state.answers,
    markedForReview: cloneMarkedForReview(state.markedForReview),
    totalElapsedMs: state.totalElapsedMs,
    lastElapsedUpdateAtMs: state.lastElapsedUpdateAtMs,
    isQuickMode: state.isQuickMode,
    isStarted: state.isStarted,
    isSubmitted: state.isSubmitted,
    sessionId: state.sessionId,
    snapshotVersion: state.snapshotVersion,
    pendingSyncQueue: state.pendingSyncQueue,
    hasPendingSync: state.hasPendingSync,
    lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
    updatedAt: Date.now(),
    sourceTabId: state.tabId,
  };
};

const persistRuntimeState = () => {
  const snapshot = serializeSnapshot(useQuizStore.getState());

  if (!snapshot) {
    return;
  }

  saveAttemptSnapshot(snapshot);

  if (runtimeChannel) {
    runtimeChannel.postMessage(createSnapshotEnvelope(snapshot));
  }
};

const scheduleImmediateSync = () => {
  if (debouncedSyncHandle) {
    clearTimeout(debouncedSyncHandle);
  }

  debouncedSyncHandle = setTimeout(() => {
    debouncedSyncHandle = null;
    useQuizStore.getState().syncWithBackend({ force: true });
  }, ANSWER_SYNC_DEBOUNCE_MS);
};

const startRuntimeLoops = () => {
  stopRuntimeLoops();
  timerHandle = setInterval(() => {
    useQuizStore.getState().tickClock();
  }, TIMER_TICK_MS);
  syncHandle = setInterval(() => {
    useQuizStore.getState().syncWithBackend();
  }, SYNC_INTERVAL_MS);
};

const stopRuntimeLoops = () => {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }

  if (syncHandle) {
    clearInterval(syncHandle);
    syncHandle = null;
  }

  if (debouncedSyncHandle) {
    clearTimeout(debouncedSyncHandle);
    debouncedSyncHandle = null;
  }
};

const buildSyncPayload = (state) => {
  const currentQuestionId = getQuestionIdAtIndex(state.questions, state.currentIndex);

  return {
    sessionId: state.sessionId,
    totalElapsedMs: Math.round(state.totalElapsedMs),
    clientTimestamp: new Date().toISOString(),
    currentQuestionId,
    stateVersion: state.snapshotVersion,
    questionStates: state.questions.map((question) => {
      const answer = state.answers[question._id] || createDefaultAnswerState();
      return {
        questionId: question._id,
        selectedAnswer: answer.selectedAnswer,
        timeSpentMs: Math.round(answer.timeSpentMs || 0),
        visitTimestamps: answer.visitTimestamps || [],
        submissionTimestamps: answer.submissionTimestamps || [],
        submittedAt: answer.submittedAt,
        isLocked: answer.isLocked === true,
        lockedAt: answer.lockedAt,
        lastClientUpdatedAt: answer.lastClientUpdatedAt,
      };
    }),
  };
};

const mergeStateWithSnapshot = (state, snapshot) => {
  if (!snapshot || snapshot.attemptId !== state.attemptId) {
    return state;
  }

  const answers = buildAnswersMap(state.questions, null, {
    ...state.answers,
    ...snapshot.answers,
  });
  const currentIndex = Number.isInteger(snapshot.currentIndex) &&
    snapshot.currentIndex >= 0 &&
    snapshot.currentIndex < state.questions.length
    ? snapshot.currentIndex
    : state.currentIndex;

  return {
    ...state,
    answers,
    currentIndex,
    markedForReview: Array.isArray(snapshot.markedForReview)
      ? [...new Set(snapshot.markedForReview)]
      : state.markedForReview,
    totalElapsedMs: Math.max(state.totalElapsedMs, Number(snapshot.totalElapsedMs || 0)),
    lastElapsedUpdateAtMs: Math.max(
      state.lastElapsedUpdateAtMs || 0,
      Number(snapshot.lastElapsedUpdateAtMs || 0)
    ),
    isQuickMode: snapshot.isQuickMode ?? state.isQuickMode,
    hasPendingSync: state.hasPendingSync || snapshot.hasPendingSync,
    pendingSyncQueue: [
      ...state.pendingSyncQueue,
      ...(Array.isArray(snapshot.pendingSyncQueue) ? snapshot.pendingSyncQueue : []),
    ].slice(-MAX_PENDING_SYNC_JOBS),
    snapshotVersion: Math.max(state.snapshotVersion, Number(snapshot.snapshotVersion || 0)),
  };
};

const buildHydratedState = ({ quiz, questions, serverAttempt = null, localSnapshot = null }) => {
  const questionIndexLookup = buildQuestionIndexLookup(questions);
  let normalizedSnapshot = localSnapshot;

  if (normalizedSnapshot?.lastElapsedUpdateAtMs && normalizedSnapshot.isStarted && !normalizedSnapshot.isSubmitted) {
    const now = Date.now();
    const staleDelta = Math.max(0, now - normalizedSnapshot.lastElapsedUpdateAtMs);

    if (staleDelta > 0) {
      const recoveredAnswers = {
        ...(normalizedSnapshot.answers || {}),
      };
      const recoveredQuestionId = getQuestionIdAtIndex(questions, normalizedSnapshot.currentIndex || 0);

      if (recoveredQuestionId) {
        const existing = normalizeAnswerState(recoveredAnswers[recoveredQuestionId] || {});
        recoveredAnswers[recoveredQuestionId] = {
          ...existing,
          timeSpentMs: existing.timeSpentMs + staleDelta,
          lastClientUpdatedAt: new Date(now).toISOString(),
        };
      }

      normalizedSnapshot = {
        ...normalizedSnapshot,
        answers: recoveredAnswers,
        totalElapsedMs: Number(normalizedSnapshot.totalElapsedMs || 0) + staleDelta,
        lastElapsedUpdateAtMs: now,
      };
    }
  }

  const answers = buildAnswersMap(questions, serverAttempt, normalizedSnapshot?.answers);
  const currentIndex = Number.isInteger(normalizedSnapshot?.currentIndex) &&
    normalizedSnapshot.currentIndex >= 0 &&
    normalizedSnapshot.currentIndex < questions.length
    ? normalizedSnapshot.currentIndex
    : (
      questionIndexLookup[getQuestionIdForAttempt(serverAttempt, questions, questionIndexLookup, 0)] ?? 0
    );
  const isSubmitted = serverAttempt?.status === 'completed' || normalizedSnapshot?.isSubmitted === true;
  const isStarted = isSubmitted || serverAttempt?.status === 'in_progress' || normalizedSnapshot?.isStarted === true;
  const totalElapsedMs = Math.max(
    Number(serverAttempt?.totalTimeMs || 0),
    Number(normalizedSnapshot?.totalElapsedMs || 0)
  );

  return {
    quiz,
    questions,
    questionIndexLookup,
    currentIndex,
    answers,
    markedForReview: Array.isArray(normalizedSnapshot?.markedForReview)
      ? [...new Set(normalizedSnapshot.markedForReview)]
      : [],
    attemptId: serverAttempt?._id || normalizedSnapshot?.attemptId || null,
    sessionId: normalizedSnapshot?.sessionId || getGuestSessionId(),
    tabId: getTabId(),
    isStarted,
    isQuickMode: serverAttempt?.isQuickMode ?? normalizedSnapshot?.isQuickMode ?? false,
    isSubmitted,
    result: null,
    totalElapsedMs,
    attemptStartedAt: serverAttempt?.startedAt || normalizedSnapshot?.attemptStartedAt || new Date().toISOString(),
    lastElapsedUpdateAtMs: isStarted && !isSubmitted ? Date.now() : null,
    lastSuccessfulSyncAt: Number(normalizedSnapshot?.lastSuccessfulSyncAt || 0),
    lastSyncError: '',
    hasPendingSync: Boolean(normalizedSnapshot?.hasPendingSync),
    pendingSyncQueue: Array.isArray(normalizedSnapshot?.pendingSyncQueue)
      ? normalizedSnapshot.pendingSyncQueue.slice(-MAX_PENDING_SYNC_JOBS)
      : [],
    snapshotVersion: Math.max(
      Number(normalizedSnapshot?.snapshotVersion || 0),
      serverAttempt ? 1 : 0
    ),
    isSyncing: false,
    inFlightSyncVersion: null,
    isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
    recoveryMode: serverAttempt ? 'server' : normalizedSnapshot ? 'local' : 'fresh',
  };
};

export const useQuizStore = create((set, get) => ({
  quiz: null,
  questions: [],
  questionIndexLookup: {},
  currentIndex: 0,
  answers: {},
  markedForReview: [],
  attemptId: null,
  sessionId: getGuestSessionId(),
  tabId: getTabId(),
  isStarted: false,
  isQuickMode: false,
  isSubmitted: false,
  result: null,
  totalElapsedMs: 0,
  attemptStartedAt: null,
  lastElapsedUpdateAtMs: null,
  lastSuccessfulSyncAt: 0,
  lastSyncError: '',
  hasPendingSync: false,
  pendingSyncQueue: [],
  snapshotVersion: 0,
  isSyncing: false,
  inFlightSyncVersion: null,
  isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  recoveryMode: 'fresh',

  bootstrapQuiz: ({ quiz, questions, serverAttempt = null, localSnapshot = null }) => {
    const hydratedState = buildHydratedState({
      quiz,
      questions,
      serverAttempt,
      localSnapshot,
    });

    set(hydratedState);
    ensureRuntimeInfrastructure();

    if (hydratedState.isStarted && !hydratedState.isSubmitted) {
      startRuntimeLoops();
    } else {
      stopRuntimeLoops();
    }

    persistRuntimeState();
  },

  tickClock: () => {
    set((state) => commitElapsedToState(state));
    persistRuntimeState();
  },

  commitElapsed: () => {
    set((state) => commitElapsedToState(state));
    persistRuntimeState();
  },

  setCurrentIndex: (index) => {
    set((state) => {
      if (!Number.isInteger(index) || index < 0 || index >= state.questions.length) {
        return state;
      }

      let nextState = commitElapsedToState(state);

      if (nextState.currentIndex === index) {
        return nextState;
      }

      const visitedAt = new Date().toISOString();
      const questionId = state.questions[index]?._id;
      const currentAnswer = normalizeAnswerState(nextState.answers[questionId] || {});

      nextState = {
        ...nextState,
        currentIndex: index,
        answers: {
          ...nextState.answers,
          [questionId]: {
            ...currentAnswer,
            visitTimestamps: appendUniqueIso(currentAnswer.visitTimestamps, visitedAt),
            lastClientUpdatedAt: visitedAt,
          },
        },
        snapshotVersion: nextState.snapshotVersion + 1,
      };

      return queueSyncJob(nextState, 'question-visit');
    });

    persistRuntimeState();
  },

  startAttemptFromServer: ({ attempt, quiz, questions }) => {
    const snapshot = loadAttemptSnapshot(attempt._id);
    get().bootstrapQuiz({
      quiz,
      questions,
      serverAttempt: attempt,
      localSnapshot: snapshot,
    });

    set((state) => {
      if (state.questions.length === 0) {
        return state;
      }

      const firstQuestionId = getQuestionIdAtIndex(state.questions, state.currentIndex);
      const currentAnswer = normalizeAnswerState(state.answers[firstQuestionId] || {});
      const visitedAt = currentAnswer.visitTimestamps.length > 0
        ? null
        : new Date().toISOString();

      if (!visitedAt) {
        return {
          ...state,
          isStarted: true,
          isQuickMode: attempt.isQuickMode === true,
          attemptId: attempt._id,
          attemptStartedAt: attempt.startedAt,
          lastElapsedUpdateAtMs: Date.now(),
        };
      }

      return queueSyncJob({
        ...state,
        isStarted: true,
        isQuickMode: attempt.isQuickMode === true,
        attemptId: attempt._id,
        attemptStartedAt: attempt.startedAt,
        lastElapsedUpdateAtMs: Date.now(),
        answers: {
          ...state.answers,
          [firstQuestionId]: {
            ...currentAnswer,
            visitTimestamps: appendUniqueIso(currentAnswer.visitTimestamps, visitedAt),
            lastClientUpdatedAt: visitedAt,
          },
        },
        snapshotVersion: state.snapshotVersion + 1,
      }, 'quiz-start');
    });

    startRuntimeLoops();
    persistRuntimeState();
  },

  selectAnswer: (questionId, selectedAnswer) => {
    set((state) => {
      const currentAnswer = normalizeAnswerState(state.answers[questionId] || {});

      if (state.isSubmitted || currentAnswer.isLocked) {
        return state;
      }

      let nextState = commitElapsedToState(state);
      const answeredAt = new Date().toISOString();
      const lockedAt = state.isQuickMode ? answeredAt : null;
      const nextAnswerState = {
        ...currentAnswer,
        selectedAnswer,
        submissionTimestamps: appendUniqueIso(currentAnswer.submissionTimestamps, answeredAt),
        submittedAt: answeredAt,
        isLocked: state.isQuickMode ? true : currentAnswer.isLocked,
        lockedAt: state.isQuickMode ? lockedAt : currentAnswer.lockedAt,
        lastClientUpdatedAt: answeredAt,
      };

      nextState = {
        ...nextState,
        answers: {
          ...nextState.answers,
          [questionId]: nextAnswerState,
        },
        snapshotVersion: nextState.snapshotVersion + 1,
      };

      return queueSyncJob(nextState, state.isQuickMode ? 'quick-answer-lock' : 'answer-update');
    });

    persistRuntimeState();
    scheduleImmediateSync();
  },

  toggleMark: (questionId) => {
    set((state) => {
      const markedForReview = state.markedForReview.includes(questionId)
        ? state.markedForReview.filter((item) => item !== questionId)
        : [...state.markedForReview, questionId];

      return {
        ...state,
        markedForReview,
        snapshotVersion: state.snapshotVersion + 1,
      };
    });

    persistRuntimeState();
  },

  nextQuestion: () => {
    const { currentIndex, questions } = get();
    if (currentIndex < questions.length - 1) {
      get().setCurrentIndex(currentIndex + 1);
    }
  },

  prevQuestion: () => {
    const { currentIndex } = get();
    if (currentIndex > 0) {
      get().setCurrentIndex(currentIndex - 1);
    }
  },

  syncWithBackend: async ({ force = false } = {}) => {
    const stateBeforeCommit = get();

    if (
      !stateBeforeCommit.attemptId ||
      !stateBeforeCommit.quiz?._id ||
      !stateBeforeCommit.isStarted ||
      stateBeforeCommit.isSubmitted ||
      stateBeforeCommit.isSyncing
    ) {
      return null;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      set({ isOnline: false, hasPendingSync: true });
      persistRuntimeState();
      return null;
    }

    get().commitElapsed();
    const state = get();
    const needsSync = force ||
      state.hasPendingSync ||
      state.pendingSyncQueue.length > 0 ||
      (Date.now() - state.lastSuccessfulSyncAt >= SYNC_INTERVAL_MS);

    if (!needsSync) {
      return null;
    }

    const payload = buildSyncPayload(state);
    const syncVersion = state.snapshotVersion;

    set({
      isSyncing: true,
      inFlightSyncVersion: syncVersion,
      isOnline: true,
      lastSyncError: '',
    });

    try {
      const response = await api.put(
        `/quiz/${state.quiz._id}/attempt/${state.attemptId}/sync`,
        payload,
        {
          headers: {
            'x-quiz-session-id': state.sessionId,
          },
        }
      );

      const serverAttempt = response.data.data.attempt;

      set((current) => {
        const mergedState = buildHydratedState({
          quiz: current.quiz,
          questions: current.questions,
          serverAttempt,
          localSnapshot: serializeSnapshot(current),
        });

        return {
          ...current,
          ...mergedState,
          markedForReview: current.markedForReview,
          result: current.result,
          isStarted: current.isStarted,
          isSubmitted: current.isSubmitted,
          pendingSyncQueue: current.pendingSyncQueue.filter((job) => job.version > syncVersion),
          hasPendingSync:
            current.snapshotVersion > syncVersion ||
            current.pendingSyncQueue.some((job) => job.version > syncVersion),
          snapshotVersion: Math.max(current.snapshotVersion, mergedState.snapshotVersion),
          lastSuccessfulSyncAt: Date.now(),
          isSyncing: false,
          inFlightSyncVersion: null,
          isOnline: true,
          lastSyncError: '',
          recoveryMode: 'server',
        };
      });

      persistRuntimeState();
      return response.data.data;
    } catch (error) {
      const isOfflineError = !error.response;
      set({
        isSyncing: false,
        inFlightSyncVersion: null,
        isOnline: typeof navigator === 'undefined' ? !isOfflineError : navigator.onLine !== false,
        lastSyncError: error.response?.data?.message || 'Failed to sync quiz progress',
        hasPendingSync: true,
      });
      persistRuntimeState();
      return null;
    }
  },

  getSubmitPayload: () => {
    get().commitElapsed();
    const state = get();
    return buildSyncPayload(state);
  },

  setResult: (result) => {
    stopRuntimeLoops();
    const current = get();

    clearAttemptSnapshot({
      attemptId: current.attemptId,
      quizId: current.quiz?._id,
    });

    set((state) => ({
      ...state,
      result,
      isStarted: false,
      isSubmitted: true,
      hasPendingSync: false,
      pendingSyncQueue: [],
      lastElapsedUpdateAtMs: null,
      lastSyncError: '',
      isSyncing: false,
      inFlightSyncVersion: null,
    }));
  },

  hydrateFromRecovery: ({ quiz, questions, serverAttempt = null }) => {
    const activeAttemptRef = loadActiveAttemptRef(quiz._id);
    const attemptId = serverAttempt?._id || activeAttemptRef?.attemptId || null;
    const localSnapshot = attemptId ? loadAttemptSnapshot(attemptId) : null;
    get().bootstrapQuiz({
      quiz,
      questions,
      serverAttempt,
      localSnapshot,
    });
  },

  mergeIncomingSnapshot: (snapshot) => {
    set((state) => mergeStateWithSnapshot(state, snapshot));
  },

  setOnlineStatus: (isOnline) => {
    set({ isOnline });

    if (isOnline) {
      get().syncWithBackend({ force: true });
    }
  },

  teardownRuntime: () => {
    get().commitElapsed();
    stopRuntimeLoops();
    persistRuntimeState();
  },

  reset: ({ clearPersisted = false } = {}) => {
    const current = get();
    stopRuntimeLoops();

    if (clearPersisted) {
      clearAttemptSnapshot({
        attemptId: current.attemptId,
        quizId: current.quiz?._id,
      });
    } else {
      persistRuntimeState();
    }

    set({
      quiz: null,
      questions: [],
      questionIndexLookup: {},
      currentIndex: 0,
      answers: {},
      markedForReview: [],
      attemptId: null,
      sessionId: getGuestSessionId(),
      tabId: getTabId(),
      isStarted: false,
      isQuickMode: false,
      isSubmitted: false,
      result: null,
      totalElapsedMs: 0,
      attemptStartedAt: null,
      lastElapsedUpdateAtMs: null,
      lastSuccessfulSyncAt: 0,
      lastSyncError: '',
      hasPendingSync: false,
      pendingSyncQueue: [],
      snapshotVersion: 0,
      isSyncing: false,
      inFlightSyncVersion: null,
      isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
      recoveryMode: 'fresh',
    });
  },
}));

function sendUnloadSync() {
  const state = useQuizStore.getState();

  if (
    !state.attemptId ||
    !state.quiz?._id ||
    !state.isStarted ||
    state.isSubmitted ||
    !state.hasPendingSync ||
    typeof navigator === 'undefined' ||
    typeof navigator.sendBeacon !== 'function'
  ) {
    return;
  }

  const payload = buildSyncPayload(state);
  const endpoint = `/api/v1/quiz/${state.quiz._id}/attempt/${state.attemptId}/sync`;
  const blob = new Blob([JSON.stringify(payload)], {
    type: 'application/json',
  });

  try {
    navigator.sendBeacon(endpoint, blob);
  } catch {
    // ignore unload sync failures
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    useQuizStore.getState().commitElapsed();
    sendUnloadSync();
  }
}

function handleStorageEvent(event) {
  const state = useQuizStore.getState();

  if (!state.attemptId) {
    return;
  }

  if (!event.key || !event.key.endsWith(state.attemptId)) {
    return;
  }

  const snapshot = loadAttemptSnapshot(state.attemptId);

  if (!snapshot || snapshot.sourceTabId === state.tabId) {
    return;
  }

  useQuizStore.getState().mergeIncomingSnapshot(snapshot);
}

function handleBroadcastMessage(event) {
  const snapshot = event?.data?.snapshot;
  const state = useQuizStore.getState();

  if (!snapshot || !state.attemptId || snapshot.attemptId !== state.attemptId || snapshot.sourceTabId === state.tabId) {
    return;
  }

  useQuizStore.getState().mergeIncomingSnapshot(snapshot);
}

function ensureRuntimeInfrastructure() {
  if (runtimeListenersAttached || typeof window === 'undefined') {
    return;
  }

  runtimeChannel = createQuizBroadcastChannel();

  window.addEventListener('online', () => useQuizStore.getState().setOnlineStatus(true));
  window.addEventListener('offline', () => useQuizStore.getState().setOnlineStatus(false));
  window.addEventListener('storage', handleStorageEvent);
  window.addEventListener('beforeunload', () => {
    useQuizStore.getState().commitElapsed();
    persistRuntimeState();
    sendUnloadSync();
  });
  document.addEventListener('visibilitychange', handleVisibilityChange);

  if (runtimeChannel) {
    runtimeChannel.onmessage = handleBroadcastMessage;
  }

  runtimeListenersAttached = true;
}
