import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Lock, AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { Button, Spinner, showCustomDialog } from '../../components/ui';
import QuizEntryScreen from '../../components/quiz/QuizEntryScreen';
import QuizLayout from '../../components/platform/QuizLayout';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useQuizAttemptController } from '../../hooks/useQuizAttemptController';
import { useAuthStore } from '../../store/authStore';
import { useQuizStore } from '../../store/quizStore';
import api from '../../api/axios';
export default function Quiz() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  
  
  
  
  

  const collaborationContext = null;


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
      showCustomDialog({
        title: 'Sharing Error',
        message: 'Failed to initialize session sharing.',
        type: 'error',
      });
    }
  };

  const shareControl = null;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '72px 0' }}>
        <Spinner size={40} />
      </div>
    );
  }

  if (error) {
    const isAuthError = !user;
    return (
      <div style={{ maxWidth: 500, margin: '60px auto', padding: '36px 24px', textAlign: 'center', background: 'var(--color-surface)', borderRadius: 16, border: '1px solid var(--color-border)' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Lock size={26} style={{ color: '#EF4444' }} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--color-text)' }}>
          {error.includes('authorized') || error.includes('private') ? 'Private Quiz' : 'Unable to Open Quiz'}
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.5, marginBottom: 24, maxWidth: 380, margin: '0 auto 24px' }}>
          {error}
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {isAuthError ? (
            <Link to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}>
              <Button variant="primary">Log In to View</Button>
            </Link>
          ) : (
            <Button variant="secondary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate('/explore')}>
            Explore Public Quizzes
          </Button>
        </div>
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
