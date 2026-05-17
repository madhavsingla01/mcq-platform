import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { Badge, Button, Card, Spinner } from '../../components/ui';
import QuizLayout from '../../components/workspace/QuizLayout';
import { useQuizStore } from '../../store/quizStore';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useSessionStore } from '../../store/sessionStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import {
  clearAttemptSnapshot,
  getGuestSessionId,
  loadActiveAttemptRef,
  loadAttemptSnapshot,
} from '../../utils/quizSession';

export default function Quiz() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const {
    quiz,
    questions,
    currentIndex,
    answers,
    markedForReview,
    attemptId,
    isStarted,
    isQuickMode,
    isSubmitted,
    totalElapsedMs,
    isOnline,
    hasPendingSync,
    recoveryMode,
    lastSyncError,
    bootstrapQuiz,
    startAttemptFromServer,
    syncWithBackend,
    getSubmitPayload,
    setResult,
    setCurrentIndex,
    nextQuestion,
    prevQuestion,
    teardownRuntime,
    reset,
  } = useQuizStore();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [quizEntered, setQuizEntered] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const user = useAuthStore((s) => s.user);
  const { createSession } = useSessionStore();

  const isCreator = user && quiz?.uploader && (quiz.uploader === user._id || quiz.uploader?._id === user._id);

  const currentQuestion = questions[currentIndex] || null;
  const answeredCount = useMemo(
    () => questions.filter((question) => Boolean(answers[question._id]?.selectedAnswer)).length,
    [answers, questions]
  );

  useEffect(() => {
    let cancelled = false;

    const loadQuiz = async () => {
      setLoading(true);
      setError('');
      setRecoveryNotice('');

      const sessionId = getGuestSessionId();
      const activeAttemptRef = loadActiveAttemptRef(quizId);
      let localSnapshot = activeAttemptRef?.attemptId
        ? loadAttemptSnapshot(activeAttemptRef.attemptId)
        : null;

      // Discard stale snapshots: completed attempts or session mismatch
      if (localSnapshot && (localSnapshot.isSubmitted || (localSnapshot.sessionId && localSnapshot.sessionId !== sessionId))) {
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
            api.get(`/quiz/${quizId}`),
            api.get(`/quiz/${quizId}/questions`),
          ]);

          quizData = quizResponse.data.data.quiz;
          questionData = questionResponse.data.data.questions;

          const activeAttemptResponse = await api.get(`/quiz/${quizId}/attempt/active`, {
            params: {
              sessionId,
              attemptId: localSnapshot?.attemptId || undefined,
            },
            headers: {
              'x-quiz-session-id': sessionId,
            },
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

        bootstrapQuiz({
          quiz: quizData,
          questions: questionData,
          serverAttempt: activeAttempt,
          localSnapshot,
        });

        if (recoveredOffline) {
          setRecoveryNotice('Recovered locally. Progress will sync when the connection returns.');
        } else if (activeAttempt) {
          setRecoveryNotice('Recovered active attempt.');
        }
      } catch (requestError) {
        if (cancelled) {
          return;
        }

        setError('Failed to load quiz');
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
  }, [bootstrapQuiz, quizId, reset, teardownRuntime]);


  const handleStart = async (forceNewAttempt = false) => {
    try {
      setLoading(true);
      setError('');
      const sessionId = getGuestSessionId();
      const activeAttemptRef = loadActiveAttemptRef(quizId);

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
          sessionId,
        },
        {
          headers: {
            'x-quiz-session-id': sessionId,
          },
        }
      );

      startAttemptFromServer({
        attempt: response.data.data.attempt,
        quiz,
        questions,
      });
      setRecoveryNotice('');
      return true;
    } catch (requestError) {
      setError('Failed to start attempt');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleResume = () => {
    setQuizEntered(true);
  };

  const handleStartNew = async () => {
    if (window.confirm('This will discard your current progress. Are you sure?')) {
      const success = await handleStart(true);
      if (success) {
        setQuizEntered(true);
      }
    }
  };

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }

    if (!attemptId || !quiz?._id) {
      return;
    }

    if (!window.confirm('Submit this quiz now?')) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const sessionId = getGuestSessionId();
      await syncWithBackend({ force: true });
      const payload = getSubmitPayload();
      const response = await api.put(
        `/quiz/${quiz._id}/attempt/${attemptId}`,
        payload,
        {
          headers: {
            'x-quiz-session-id': sessionId,
          },
        }
      );

      setResult(response.data.data);
      navigate(`/result/${attemptId}`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to submit quiz');
      setSubmitting(false);
    }
  };

  // Keyboard shortcuts via centralized hook
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
      <>
        <div className="quiz-entry-shell">
          <Card className="quiz-entry-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="quiz-entry-hero">
              <div>
                <div className="quiz-entry-badges">
                  <Badge>{questions.length} Questions</Badge>
                  <Badge variant="warning">
                    {quiz?.settings?.timeLimit ? `${quiz.settings.timeLimit} min limit` : 'No time limit'}
                  </Badge>
                </div>
                <h1 className="quiz-entry-title">{quiz?.title}</h1>
                <p className="quiz-entry-description">
                  {quiz?.description || 'Start when ready. Progress is recovered automatically if the session is interrupted.'}
                </p>
              </div>
            </div>

            <div className="quiz-entry-body">
              <div className="quiz-entry-body-grid">
                <div className="entry-left">
                  <div className="quiz-entry-grid">
                    <div className="quiz-entry-stat">
                      <span>Timer Mode</span>
                      <strong>{quiz?.settings?.timerMode === 'strict' ? 'Strict' : quiz?.settings?.timerMode === 'soft' ? 'Soft' : 'None'}</strong>
                    </div>
                    <div className="quiz-entry-stat">
                      <span>Instant Feedback</span>
                      <strong>{quiz?.settings?.instantFeedback ? 'Enabled' : 'Disabled'}</strong>
                    </div>
                    <div className="quiz-entry-stat">
                      <span>Question Review</span>
                      <strong>{quiz?.settings?.allowReview === false ? 'Restricted' : 'Allowed'}</strong>
                    </div>
                    <div className="quiz-entry-stat">
                      <span>Explanation Reveal</span>
                      <strong>{quiz?.settings?.showExplanation === false ? 'Hidden' : 'Available'}</strong>
                    </div>
                    <div className="quiz-entry-stat">
                      <span>Recovery</span>
                      <strong>Auto Resume</strong>
                    </div>
                  </div>

                  {recoveryNotice ? (
                    <div className="quiz-status-banner info" style={{ marginTop: 16 }}>{recoveryNotice}</div>
                  ) : null}
                </div>

                <aside className="entry-actions">
                  <div className="entry-actions-card">
                    <div className="quiz-entry-badges" style={{ marginBottom: 8 }}>
                      <Badge>{questions.length} Questions</Badge>
                      <Badge variant="warning">
                        {quiz?.settings?.timeLimit ? `${quiz.settings.timeLimit} min limit` : 'No time limit'}
                      </Badge>
                    </div>
                    <div className="entry-actions-title">{quiz?.title}</div>
                    <div className="entry-actions-desc">{quiz?.description || 'Start when ready. Progress is recovered automatically if the session is interrupted.'}</div>
                  </div>

                  <div className="entry-actions-buttons">
                    {isStarted && !isSubmitted ? (
                      <>
                        <Button size="lg" onClick={handleResume} style={{ width: '100%', fontSize: 18, padding: '16px 20px', marginBottom: 10 }}>
                          Resume Attempt
                        </Button>
                        <Button size="lg" variant="outline" onClick={handleStartNew} style={{ width: '100%', fontSize: 18, padding: '16px 20px', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}>
                          Start New Attempt
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="lg"
                        onClick={async () => {
                          const success = await handleStart(true);
                          if (success) {
                            setQuizEntered(true);
                          }
                        }}
                        style={{ width: '100%', fontSize: 18, padding: '16px 20px' }}
                      >
                        Start Quiz
                      </Button>
                    )}
                  </div>

                  {/* Share Quiz Button — creator only */}
                  {isCreator && (
                    <div style={{ marginTop: 12 }}>
                      {shareUrl ? (
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(`${window.location.origin}${shareUrl}`);
                              setShareCopied(true);
                              setTimeout(() => setShareCopied(false), 2000);
                            } catch {}
                          }}
                          style={{
                            width: '100%', padding: '12px 16px', borderRadius: 10,
                            border: '1px solid var(--color-primary)', background: 'var(--color-primary-light)',
                            color: 'var(--color-primary)', fontWeight: 700, fontSize: 14,
                            cursor: 'pointer', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: 6,
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                            {shareCopied ? 'check' : 'content_copy'}
                          </span>
                          {shareCopied ? 'Link Copied!' : 'Copy Share Link'}
                        </button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={async () => {
                            try {
                              const data = await createSession(quiz._id);
                              setShareUrl(data.shareUrl);
                            } catch {}
                          }}
                          style={{ width: '100%', fontSize: 14, padding: '12px 16px' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18, marginRight: 6 }}>share</span>
                          Share Quiz
                        </Button>
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: 12, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    Tip: Your progress is auto-saved and recoverable across sessions.
                  </div>
                </aside>
              </div>
            </div>
          </Card>
        </div>

        <style>{quizPageStyles}</style>
      </>
    );
  }

  return <QuizLayout />;
}

const quizPageStyles = `
  .quiz-entry-shell {
    max-width: 860px;
    margin: 32px auto;
    padding: 0 16px;
  }

  .quiz-entry-card {
    background:
      radial-gradient(circle at top right, rgba(91, 80, 214, 0.04), transparent 40%),
      radial-gradient(circle at bottom left, rgba(124, 110, 240, 0.03), transparent 35%),
      var(--color-surface);
  }

  .quiz-entry-hero {
    padding: 32px;
    border-bottom: 1px solid var(--color-border);
  }

  .quiz-entry-badges {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .quiz-entry-title {
    font-size: 32px;
    font-weight: 800;
    line-height: 1.2;
    margin-bottom: 12px;
    letter-spacing: -0.02em;
  }

  .quiz-entry-description {
    font-size: 16px;
    color: var(--color-text-secondary);
    max-width: 600px;
  }

  .quiz-entry-body {
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .quiz-entry-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
  }

  .quiz-entry-stat {
    padding: 16px;
    border-radius: 12px;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border-light);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .quiz-entry-stat span {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
  }

  .quiz-entry-stat strong {
    font-size: 18px;
    font-weight: 700;
    min-height: 0;
  }

  .quiz-entry-body-grid {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 24px;
    align-items: start;
  }

  .entry-left {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .entry-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .entry-actions-card {
    padding: 16px;
    border-radius: 12px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .entry-actions-title {
    font-size: 18px;
    font-weight: 800;
    margin-top: 8px;
  }

  .entry-actions-desc {
    color: var(--color-text-secondary);
    margin-top: 8px;
    font-size: 14px;
    max-height: 120px;
    overflow: auto;
  }

  .entry-actions-buttons {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .quiz-nav-actions {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: auto;
    padding-top: 24px;
    border-top: 1px solid var(--color-border);
  }

  .quiz-status-banner {
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid var(--color-border);
    font-size: 14px;
  }

  .quiz-status-banner.info {
    background: rgba(79, 70, 229, 0.05);
    border-color: rgba(79, 70, 229, 0.15);
    color: var(--color-text);
  }

  .quiz-status-banner.warning {
    background: var(--color-warning-light);
    border-color: rgba(217, 119, 6, 0.2);
    color: var(--color-text);
  }

  .quiz-status-banner.danger {
    background: var(--color-danger-light);
    border-color: rgba(220, 38, 38, 0.2);
    color: var(--color-text);
  }

  @media (max-width: 1024px) {
    .quiz-session-shell {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .quiz-entry-hero,
    .quiz-entry-body {
      padding: 24px 20px;
    }

    .quick-mode-panel,
    .quiz-session-title-row,
    .quiz-session-progress-row {
      flex-direction: column;
      align-items: stretch;
    }

    .quiz-session-timer-block {
      align-items: flex-start;
      min-width: 0;
    }

    .quiz-entry-grid {
      grid-template-columns: 1fr;
    }

    .quiz-entry-body-grid {
      grid-template-columns: 1fr;
    }

    .entry-actions {
      border-left: none;
    }

    .quiz-nav-actions {
      flex-direction: column-reverse;
    }

    .quiz-nav-actions button {
      width: 100%;
    }
  }
`;
