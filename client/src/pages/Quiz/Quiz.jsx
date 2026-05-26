import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Spinner } from '../../components/ui';
import QuizEntryScreen from '../../components/quiz/QuizEntryScreen';
import QuizLayout from '../../components/workspace/QuizLayout';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useQuizAttemptController } from '../../hooks/useQuizAttemptController';
import { useAuthStore } from '../../store/authStore';
import { useQuizStore } from '../../store/quizStore';
import { useSessionStore } from '../../store/sessionStore';
import api from '../../api/axios';
import ShareSettingsModal from '../../components/session/ShareSettingsModal';

export default function Quiz() {
  const { quizId } = useParams();
  const [searchParams] = useSearchParams();
  const sessionIdParam = searchParams.get('sessionId');
  const shareCodeParam = searchParams.get('shareCode');
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const createSession = useSessionStore((state) => state.createSession);
  const regenerateShareLink = useSessionStore((state) => state.regenerateShareLink);
  const activeSession = useSessionStore((state) => state.session);
  const [showShareSettings, setShowShareSettings] = useState(false);
  const [currentSessionInfo, setCurrentSessionInfo] = useState(null);

  const collaborationContext = useMemo(() => {
    if (!sessionIdParam) return null;
    const activeSessionMatches = activeSession?._id === sessionIdParam;

    return {
      sessionId: sessionIdParam,
      shareCode: shareCodeParam || '',
      participantCount: activeSessionMatches ? activeSession?.participantCount || 0 : 0,
      creatorId: activeSessionMatches ? activeSession?.creator?._id || activeSession?.creatorId || null : null,
      creatorName: activeSessionMatches ? activeSession?.creator?.name || activeSession?.creatorName || '' : '',
      settings: activeSessionMatches ? activeSession?.settings || null : null,
      expiresAt: activeSessionMatches ? activeSession?.expiresAt || null : null,
    };
  }, [activeSession, sessionIdParam, shareCodeParam]);

  useEffect(() => {
    if (!sessionIdParam) return;
    const sessionStore = useSessionStore.getState();
    // Join session (idempotent)
    sessionStore.joinSession(sessionIdParam)
      .then(() => sessionStore.loadMessages(sessionIdParam).catch(() => {}))
      .catch(() => {});
    // Connect socket
    if (user) {
      sessionStore.connectToSession(sessionIdParam);
    }
    // Persist session reopen event for activity history
    api.post('/activity/events', {
      eventType: 'SESSION_REOPENED',
      category: 'session',
      sessionId: sessionIdParam,
      metadata: { shareCode: shareCodeParam, quizId },
    }).catch(() => {});
    return () => sessionStore.reset();
  }, [quizId, sessionIdParam, shareCodeParam, user]);

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
    quizId,
    collaborationContext,
    onSubmitted: (_, submittedAttemptId) => navigate(`/result/${submittedAttemptId}`),
  });

  const isCreator = user && quiz?.uploader && (
    quiz.uploader === user._id ||
    quiz.uploader?._id === user._id
  );

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

  const openSharePanel = async () => {
    try {
      const data = currentSessionInfo || await createSession(quiz._id);
      setCurrentSessionInfo(data);
      setShowShareSettings(true);
    } catch {
      alert('Failed to initialize sharing');
    }
  };

  const shareControl = isCreator ? (
    <div style={{ marginTop: 12 }}>
      <Button
        variant="outline"
        onClick={openSharePanel}
        style={{ width: '100%', fontSize: 14, padding: '12px 16px' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18, marginRight: 6 }}>share</span>
        Share Link
      </Button>

      {showShareSettings && currentSessionInfo && (
        <ShareSettingsModal 
          shareCode={currentSessionInfo.session.shareCode}
          initialSettings={currentSessionInfo.session.settings}
          onSave={async (settings) => {
            const data = await createSession(quiz._id, settings);
            setCurrentSessionInfo(data);
            return data;
          }}
          onRegenerate={async () => {
            const data = await regenerateShareLink(currentSessionInfo.session._id);
            setCurrentSessionInfo(data);
            return data;
          }}
          onClose={() => setShowShareSettings(false)}
        />
      )}
    </div>
  ) : null;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '72px 0' }}>
        <Spinner size={40} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: 'var(--color-danger)', textAlign: 'center', padding: '48px 16px' }}>
        {error}
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
        actionsExtra={shareControl}
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
