import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Spinner } from '../../components/ui';
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
      alert('Failed to initialize sharing');
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
