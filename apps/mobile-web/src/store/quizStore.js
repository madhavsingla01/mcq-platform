import { create } from 'zustand';
import { quizApi, attemptApi } from '../api/client';

export const useQuizStore = create((set, get) => ({
  currentQuiz: null,
  attemptId: null,
  questions: [],
  currentIndex: 0,
  selectedAnswers: {}, // { [questionIndex]: optionIndex }
  isSubmitting: false,
  isLoading: false,
  error: null,
  timeRemaining: 0,
  timerActive: false,

  startQuizAttempt: async (quizId) => {
    try {
      set({ isLoading: true, error: null, selectedAnswers: {}, currentIndex: 0 });

      // 1. Fetch real quiz and questions in parallel from API Gateway
      const [quizRes, questionsRes] = await Promise.all([
        quizApi.getById(quizId),
        quizApi.getQuestions(quizId).catch(() => ({ data: { data: { questions: [] } } })),
      ]);

      const quiz = quizRes.data?.data?.quiz || quizRes.data?.data || quizRes.data;
      if (!quiz) {
        throw new Error('Quiz not found or inaccessible');
      }

      let questions = questionsRes.data?.data?.questions || quiz.questions || [];

      // 2. Start live attempt on backend Attempt Service
      let attemptId = null;
      try {
        const attemptRes = await attemptApi.start(quizId);
        const attemptData = attemptRes.data?.data?.attempt || attemptRes.data?.data || attemptRes.data;
        attemptId = attemptData?._id || attemptData?.attemptId || attemptData?.id;
      } catch (attemptErr) {
        console.warn('Backend attempt session start warning:', attemptErr);
        attemptId = 'att_' + Date.now();
      }

      // 3. Determine time limit
      const timeLimitMinutes = quiz.settings?.timeLimit || quiz.durationMinutes || quiz.timeLimit || 15;
      const timeRemaining = timeLimitMinutes > 0 ? timeLimitMinutes * 60 : 600; // default 10m if untimed

      set({
        currentQuiz: quiz,
        attemptId,
        questions,
        timeRemaining,
        timerActive: true,
        isLoading: false,
      });

      return { success: true, attemptId };
    } catch (err) {
      console.error('Failed to load live quiz from backend:', err);
      const errMsg = err?.message || err?.error || 'Unable to open quiz';
      set({ isLoading: false, error: errMsg });
      return { success: false, error: errMsg };
    }
  },

  selectOption: (questionIndex, optionIndex) => {
    const { selectedAnswers, attemptId, questions } = get();
    const updated = { ...selectedAnswers, [questionIndex]: optionIndex };
    set({ selectedAnswers: updated });

    const q = questions[questionIndex];
    if (attemptId && q && !attemptId.startsWith('att_')) {
      const qId = q._id || q.id;
      const option = q.options ? q.options[optionIndex] : null;
      const label = option?.label || String.fromCharCode(65 + optionIndex);
      const normalizedLabel = String(label).trim().toUpperCase();

      attemptApi.submitAnswer(attemptId, {
        questionId: qId,
        selectedAnswer: normalizedLabel,
        selectedOptionId: typeof option === 'object' ? option._id || option.id : undefined,
      }).catch((e) => console.warn('Non-blocking answer sync error', e));
    }
  },

  nextQuestion: () => {
    const { currentIndex, questions } = get();
    if (currentIndex < questions.length - 1) {
      set({ currentIndex: currentIndex + 1 });
    }
  },

  prevQuestion: () => {
    const { currentIndex } = get();
    if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1 });
    }
  },

  goToQuestion: (index) => {
    set({ currentIndex: index });
  },

  tickTimer: () => {
    const { timeRemaining, timerActive } = get();
    if (!timerActive) return;
    if (timeRemaining <= 1) {
      set({ timeRemaining: 0, timerActive: false });
      get().submitAttempt();
    } else {
      set({ timeRemaining: timeRemaining - 1 });
    }
  },

  submitAttempt: async () => {
    const { currentQuiz, attemptId, questions, selectedAnswers, isSubmitting, timeRemaining } = get();
    if (isSubmitting) return;

    try {
      set({ isSubmitting: true, timerActive: false });

      const totalAllowedSeconds = (currentQuiz?.settings?.timeLimit || currentQuiz?.durationMinutes || 15) * 60;
      const totalElapsedSeconds = Math.max(1, totalAllowedSeconds - timeRemaining);
      const totalElapsedMs = totalElapsedSeconds * 1000;

      // Build answer submission payload with normalized option labels (A, B, C, D)
      const answersPayload = questions.map((q, idx) => {
        const selectedOptIdx = selectedAnswers[idx];
        const option = q.options && selectedOptIdx !== undefined ? q.options[selectedOptIdx] : null;
        const label = option ? (option.label || String.fromCharCode(65 + selectedOptIdx)) : null;
        const normalizedAnswer = label ? String(label).trim().toUpperCase() : null;

        return {
          questionId: q._id || q.id,
          selectedAnswer: normalizedAnswer,
          selectedOptionId: typeof option === 'object' ? option._id || option.id : undefined,
          timeSpentMs: 1000,
          submittedAt: new Date().toISOString(),
        };
      });

      if (currentQuiz?._id && attemptId && !attemptId.startsWith('att_')) {
        await attemptApi.submitAttempt(currentQuiz._id, attemptId, {
          totalElapsedMs,
          questionStates: answersPayload,
          answers: answersPayload,
          finalize: true,
        });
      }

      set({ isSubmitting: false });
      return { success: true, attemptId };
    } catch (err) {
      console.error('Failed to submit attempt to backend:', err);
      set({ isSubmitting: false });
      return { success: true, attemptId };
    }
  },

  reset: () => {
    set({
      currentQuiz: null,
      attemptId: null,
      questions: [],
      currentIndex: 0,
      selectedAnswers: {},
      isSubmitting: false,
      isLoading: false,
      error: null,
      timeRemaining: 0,
      timerActive: false,
    });
  },
}));
