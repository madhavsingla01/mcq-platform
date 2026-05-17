import { create } from 'zustand';

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

export const useCacheStore = create((set, get) => ({
  questionCache: {},  // { [quizId]: { questions, fetchedAt } }
  quizCache: {},      // { [quizId]: { quiz, fetchedAt } }

  cacheQuestions: (quizId, questions) => {
    set((state) => ({
      questionCache: {
        ...state.questionCache,
        [quizId]: { questions, fetchedAt: Date.now() },
      },
    }));
  },

  getCachedQuestions: (quizId, maxAgeMs = DEFAULT_MAX_AGE_MS) => {
    const entry = get().questionCache[quizId];
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > maxAgeMs) return null;
    return entry.questions;
  },

  cacheQuiz: (quizId, quiz) => {
    set((state) => ({
      quizCache: {
        ...state.quizCache,
        [quizId]: { quiz, fetchedAt: Date.now() },
      },
    }));
  },

  getCachedQuiz: (quizId, maxAgeMs = DEFAULT_MAX_AGE_MS) => {
    const entry = get().quizCache[quizId];
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > maxAgeMs) return null;
    return entry.quiz;
  },

  invalidate: (quizId) => {
    set((state) => {
      const nextQuestionCache = { ...state.questionCache };
      const nextQuizCache = { ...state.quizCache };
      delete nextQuestionCache[quizId];
      delete nextQuizCache[quizId];
      return { questionCache: nextQuestionCache, quizCache: nextQuizCache };
    });
  },

  invalidateAll: () => {
    set({ questionCache: {}, quizCache: {} });
  },
}));
