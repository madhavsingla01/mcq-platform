import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Spinner } from '../../components/ui';
import QuizEntryScreen from '../../components/quiz/QuizEntryScreen';
import QuizLayout from '../../components/workspace/QuizLayout';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useQuizAttemptController } from '../../hooks/useQuizAttemptController';
import { useQuizStore } from '../../store/quizStore';
import { useSessionStore } from '../../store/sessionStore';

export default function SessionQuiz() {
  const { shareCode } = useParams();
  const navigate = useNavigate();
  const fetchSession = useSessionStore((state) => state.fetchSession);
  const joinSession = useSessionStore((state) => state.joinSession);
  const connectToSession = useSessionStore((state) => state.connectToSession);
  const loadMessages = useSessionStore((state) => state.loadMessages);
  const resetSession = useSessionStore((state) => state.reset);

  const [sessionMeta, setSessionMeta] = useState(null);
  const [sessionQuizId, setSessionQuizId] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');

  const collaborationContext = useMemo(() => {
    if (!sessionMeta?._id) {
      return null;
    }

    return {
      sessionId: sessionMeta._id,
      shareCode: sessionMeta.shareCode || shareCode,
      participantCount: sessionMeta.participantCount || 0,
      creatorId: sessionMeta.creator?._id || sessionMeta.creatorId,
      creatorName: sessionMeta.creator?.name || sessionMeta.creatorName || '',
    };
  }, [sessionMeta, shareCode]);

  const {
    quiz,
    questions,
    currentQuestion,
    isStarted,
    isSubmitted,
    quizEntered,
    setQuizEntered,
    loading,
    error,
    recoveryNotice,
    handleStart,
    handleResume,
    handleStartNew,
    handleSubmit,
    nextQuestion,
    prevQuestion,
  } = useQuizAttemptController({
    quizId: sessionQuizId,
    enabled: Boolean(sessionQuizId && collaborationContext),
    collaborationContext,
    onSubmitted: (_, submittedAttemptId) => navigate(`/result/${submittedAttemptId}`),
  });

  useEffect(() => {
    let cancelled = false;

    const initSession = async () => {
      setSessionLoading(true);
      setSessionError('');
      resetSession();

      try {
        const data = await fetchSession(shareCode);
        if (cancelled) return;

        const fetchedSession = data.session;
        const quizId = fetchedSession?.quiz?._id;

        if (!fetchedSession?._id || !quizId) {
          setSessionError('Quiz not found for this workspace');
          return;
        }

        setSessionMeta(fetchedSession);
        setSessionQuizId(quizId);

        const joinData = await joinSession(fetchedSession._id);
        if (cancelled) return;

        setSessionMeta((current) => ({
          ...current,
          participantCount: joinData?.session?.participantCount ?? current?.participantCount ?? 0,
        }));

        connectToSession(fetchedSession._id);
        loadMessages(fetchedSession._id).catch(() => {});
      } catch (requestError) {
        if (!cancelled) {
          setSessionError(requestError.response?.data?.message || 'Failed to load shared workspace');
        }
      } finally {
        if (!cancelled) {
          setSessionLoading(false);
        }
      }
    };

    initSession();

    return () => {
      cancelled = true;
      resetSession();
    };
  }, [connectToSession, fetchSession, joinSession, loadMessages, resetSession, shareCode]);

  useKeyboardShortcuts({
    onPrev: prevQuestion,
    onNext: nextQuestion,
    onSelectOption: (index) => {
      if (!currentQuestion || !isStarted || isSubmitted) return;
      const options = currentQuestion.options || [];
      if (index < options.length) {
        useQuizStore.getState().selectAnswer(currentQuestion._id, options[index].label);
      }
    },
    onFlag: () => {
      if (currentQuestion) {
        useQuizStore.getState().toggleReview(currentQuestion._id);
      }
    },
    onSubmit: handleSubmit,
    enabled: isStarted && !isSubmitted && quizEntered,
  });

  if (sessionLoading || loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '72px 0' }}>
        <Spinner size={40} />
      </div>
    );
  }

  const visibleError = sessionError || error;

  if (visibleError) {
    return (
      <div style={{ color: 'var(--color-danger)', textAlign: 'center', padding: '48px 16px' }}>
        {visibleError}
      </div>
    );
  }

  if (!questions.length) {
    return <div style={{ textAlign: 'center', padding: '48px 16px' }}>No questions found.</div>;
  }

  if (!quizEntered || isSubmitted) {
    return (
      <QuizEntryScreen
        quiz={quiz}
        questions={questions}
        isStarted={isStarted}
        isSubmitted={isSubmitted}
        recoveryNotice={recoveryNotice}
        collaboration={collaborationContext}
        onResume={handleResume}
        onStartNew={handleStartNew}
        onStart={async () => {
          const success = await handleStart(true);
          if (success) {
            setQuizEntered(true);
          }
        }}
      />
    );
  }

  return <QuizLayout collaboration={collaborationContext} />;
}
