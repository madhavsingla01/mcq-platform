import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useQuizStore } from '../store/quizStore';
import { useSettingsStore } from '../store/settingsStore';
import {
  clearAttemptSnapshot,
  getGuestSessionId,
  loadActiveAttemptRef,
  loadAttemptSnapshot,
} from '../utils/quizSession';

const getAttemptHeaders = (clientSessionId, sharedSessionId) => {
  const headers = {
    'x-quiz-session-id': clientSessionId,
  };

  if (sharedSessionId) {
    headers['x-shared-session-id'] = sharedSessionId;
  }

  return headers;
};

const getAttemptPayload = (clientSessionId, sharedSessionId) => ({
  sessionId: clientSessionId,
  ...(sharedSessionId ? { sharedSessionId } : {}),
});

export function useQuizAttemptController({
  quizId,
  enabled = true,
  collaborationContext = null,
  onSubmitted,
} = {}) {
  const quizState = useQuizStore();
  const {
    quiz,
    questions,
    currentIndex,
    answers,
    attemptId,
    isStarted,
    isSubmitted,
    bootstrapQuiz,
    startAttemptFromServer,
    syncWithBackend,
    getSubmitPayload,
    setInstantFeedback,
    setResult,
    teardownRuntime,
    reset,
  } = quizState;

  const [loading, setLoading] = useState(Boolean(enabled && quizId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [quizEntered, setQuizEntered] = useState(false);

  const sharedSessionId = collaborationContext?.sessionId || null;
  const sharedShareCode = collaborationContext?.shareCode || null;
  const attemptCollaborationContext = useMemo(() => (
    sharedSessionId
      ? {
          sessionId: sharedSessionId,
          shareCode: sharedShareCode,
        }
      : null
  ), [sharedSessionId, sharedShareCode]);

  const currentQuestion = questions[currentIndex] || null;
  const answeredCount = useMemo(
    () => questions.filter((question) => Boolean(answers[question._id]?.selectedAnswer)).length,
    [answers, questions]
  );

  useEffect(() => {
    if (!enabled || !quizId) {
      return undefined;
    }

    let cancelled = false;

    const loadQuiz = async () => {
      setLoading(true);
      setError('');
      setRecoveryNotice('');
      setSubmitting(false);
      setQuizEntered(false);

      const clientSessionId = getGuestSessionId();
      const activeAttemptRef = loadActiveAttemptRef(quizId);
      let localSnapshot = activeAttemptRef?.attemptId
        ? loadAttemptSnapshot(activeAttemptRef.attemptId)
        : null;

      if (localSnapshot && (localSnapshot.isSubmitted || (localSnapshot.sessionId && localSnapshot.sessionId !== clientSessionId))) {
        clearAttemptSnapshot({
          attemptId: localSnapshot.attemptId,
          quizId,
        });
        localSnapshot = null;
      }

      try {
        let quizData = localSnapshot?.quiz || null;
        let questionData = localSnapshot?.questions || [];
        let activeAttempt = null;
        let recoveredOffline = false;

        try {
          const [quizResponse, questionResponse] = await Promise.all([
            api.get(`/quiz/${quizId}`, {
              headers: getAttemptHeaders(clientSessionId, sharedSessionId),
            }),
            api.get(`/quiz/${quizId}/questions`, {
              headers: getAttemptHeaders(clientSessionId, sharedSessionId),
            }),
          ]);

          quizData = quizResponse.data.data.quiz;
          questionData = questionResponse.data.data.questions;

          const activeAttemptResponse = await api.get(`/quiz/${quizId}/attempt/active`, {
            params: {
              sessionId: clientSessionId,
              attemptId: localSnapshot?.attemptId || undefined,
              sharedSessionId: sharedSessionId || undefined,
            },
            headers: getAttemptHeaders(clientSessionId, sharedSessionId),
          });

          activeAttempt = activeAttemptResponse.data.data.attempt;
        } catch (requestError) {
          if (!quizData || !questionData.length) {
            throw requestError;
          }

          recoveredOffline = true;
        }

        if (cancelled) {
          return;
        }

        const userInstantFeedback = useSettingsStore.getState().showCorrectAnswerInstantly === true;
        bootstrapQuiz({
          quiz: quizData,
          questions: questionData,
          serverAttempt: activeAttempt,
          localSnapshot,
          collaborationContext: attemptCollaborationContext,
        });
        setInstantFeedback(
          activeAttempt?.instantFeedback === true ||
          activeAttempt?.isQuickMode === true ||
          quizData?.settings?.instantFeedback === true ||
          userInstantFeedback
        );


        if (recoveredOffline) {
          setRecoveryNotice('Recovered locally. Progress will sync when the connection returns.');
        } else if (activeAttempt) {
          setRecoveryNotice('Recovered active attempt.');
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.response?.data?.message || 'Failed to load quiz');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    reset({ clearPersisted: false });
    loadQuiz();

    return () => {
      cancelled = true;
      teardownRuntime();
    };
  }, [
    attemptCollaborationContext,
    bootstrapQuiz,
    enabled,
    quizId,
    reset,
    setInstantFeedback,
    sharedSessionId,
    teardownRuntime,
  ]);

  const handleStart = useCallback(async (forceNewAttempt = false) => {
    if (!quizId) {
      return false;
    }

    try {
      setLoading(true);
      setError('');

      const clientSessionId = getGuestSessionId();
      const activeAttemptRef = loadActiveAttemptRef(quizId);
      const loadedQuiz = useQuizStore.getState().quiz;
      const loadedQuestions = useQuizStore.getState().questions;
      const instantFeedback =
        loadedQuiz?.settings?.instantFeedback === true ||
        useSettingsStore.getState().showCorrectAnswerInstantly === true;

      if (forceNewAttempt && activeAttemptRef?.attemptId) {
        clearAttemptSnapshot({
          attemptId: activeAttemptRef.attemptId,
          quizId,
        });
      }

      if (forceNewAttempt) {
        reset({ clearPersisted: true });
      }

      const response = await api.post(
        `/quiz/${quizId}/attempt`,
        {
          forceNew: forceNewAttempt,
          instantFeedback,
          ...getAttemptPayload(clientSessionId, sharedSessionId),
        },
        {
          headers: getAttemptHeaders(clientSessionId, sharedSessionId),
        }
      );

      startAttemptFromServer({
        attempt: response.data.data.attempt,
        quiz: loadedQuiz,
        questions: loadedQuestions,
        collaborationContext: attemptCollaborationContext,
      });
      setRecoveryNotice('');
      return true;
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to start attempt');
      return false;
    } finally {
      setLoading(false);
    }
  }, [attemptCollaborationContext, quizId, reset, sharedSessionId, startAttemptFromServer]);

  const handleResume = useCallback(() => {
    setQuizEntered(true);
  }, []);

  const handleStartNew = useCallback(async () => {
    if (!window.confirm('This will discard your current progress. Are you sure?')) {
      return false;
    }

    const success = await handleStart(true);
    if (success) {
      setQuizEntered(true);
    }

    return success;
  }, [handleStart]);

  const handleSubmit = useCallback(async () => {
    if (submitting) {
      return;
    }

    const currentState = useQuizStore.getState();
    const currentAttemptId = currentState.attemptId;
    const currentQuizId = currentState.quiz?._id;

    if (!currentAttemptId || !currentQuizId) {
      return;
    }


    setSubmitting(true);
    setError('');

    try {
      const clientSessionId = getGuestSessionId();
      await syncWithBackend({ force: true });
      const payload = {
        ...getSubmitPayload(),
        ...(sharedSessionId ? { sharedSessionId } : {}),
      };
      const response = await api.put(
        `/quiz/${currentQuizId}/attempt/${currentAttemptId}`,
        payload,
        {
          headers: getAttemptHeaders(clientSessionId, sharedSessionId),
        }
      );

      setResult(response.data.data);
      onSubmitted?.(response.data.data, currentAttemptId);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to submit quiz');
      setSubmitting(false);
    }
  }, [getSubmitPayload, onSubmitted, setResult, sharedSessionId, submitting, syncWithBackend]);

  return {
    ...quizState,
    currentQuestion,
    answeredCount,
    loading,
    submitting,
    error,
    recoveryNotice,
    quizEntered,
    setQuizEntered,
    handleStart,
    handleResume,
    handleStartNew,
    handleSubmit,
  };
}
