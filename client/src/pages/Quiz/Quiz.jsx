import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { Badge, Button, Card, Spinner } from '../../components/ui';
import QuestionCard from '../../components/quiz/QuestionCard';
import QuizNavSidebar from '../../components/quiz/QuizNavSidebar';
import { useQuizStore } from '../../store/quizStore';
import {
  clearAttemptSnapshot,
  formatDurationMs,
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
  const [quickModeToggle, setQuickModeToggle] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState('');

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
      const localSnapshot = activeAttemptRef?.attemptId
        ? loadAttemptSnapshot(activeAttemptRef.attemptId)
        : null;

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

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!isStarted || isSubmitted) {
        return;
      }

      if (event.key === 'ArrowRight') {
        nextQuestion();
      }

      if (event.key === 'ArrowLeft') {
        prevQuestion();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStarted, isSubmitted, nextQuestion, prevQuestion]);

  const handleStart = async () => {
    try {
      setLoading(true);
      setError('');
      const sessionId = getGuestSessionId();
      const activeAttemptRef = loadActiveAttemptRef(quizId);

      if (activeAttemptRef?.attemptId) {
        clearAttemptSnapshot({
          attemptId: activeAttemptRef.attemptId,
          quizId,
        });
      }

      const response = await api.post(
        `/quiz/${quizId}/attempt`,
        {
          isQuickMode: quiz?.quickModeEnabled !== false && quickModeToggle,
          forceNew: true,
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
    } catch (requestError) {
      setError('Failed to start attempt');
    } finally {
      setLoading(false);
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

  if (!isStarted) {
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
              <div className="quick-mode-panel">
                <div className="quick-mode-copy">
                  <span className="quick-mode-label">Quick Mode</span>
                  <h2>Reveal answer feedback instantly</h2>
                  <p>
                    Answers lock on selection. Correct answer, correctness state, and explanation are shown immediately.
                  </p>
                </div>

                <button
                  type="button"
                  className={`quick-mode-toggle ${quickModeToggle ? 'is-enabled' : ''}`}
                  aria-pressed={quickModeToggle && quiz?.quickModeEnabled !== false}
                  disabled={quiz?.quickModeEnabled === false}
                  onClick={() => setQuickModeToggle((value) => !value)}
                >
                  <span className="quick-mode-toggle-track" />
                  <span className="quick-mode-toggle-thumb" />
                </button>
              </div>

              <div className="quiz-entry-grid">
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
                <div className="quiz-status-banner info">{recoveryNotice}</div>
              ) : null}

              <Button
                size="lg"
                onClick={handleStart}
                style={{ width: '100%', fontSize: 18, padding: '16px 20px' }}
              >
                Start Quiz
              </Button>
            </div>
          </Card>
        </div>

        <style>{quizPageStyles}</style>
      </>
    );
  }

  return (
    <>
      <div className="quiz-session-shell">
        <div className="quiz-session-main">
          <Card className="quiz-session-header" style={{ padding: 20 }}>
            <div className="quiz-session-title-row">
              <div>
                <div className="quiz-session-badges">
                  <Badge>{answeredCount} / {questions.length} Answered</Badge>
                  {isQuickMode ? <Badge variant="success">Quick Mode</Badge> : null}
                  {!isOnline ? <Badge variant="warning">Offline</Badge> : null}
                  {hasPendingSync && isOnline ? <Badge>Sync Pending</Badge> : null}
                </div>
                <h2 className="quiz-session-title">{quiz?.title}</h2>
              </div>

              <div className="quiz-session-timer-block">
                <span className="quiz-session-timer-label">Elapsed Time</span>
                <strong>{formatDurationMs(totalElapsedMs)}</strong>
              </div>
            </div>

            <div className="quiz-session-progress-row">
              <div className="quiz-session-progress-copy">
                <span>Question {currentIndex + 1} of {questions.length}</span>
                <strong>{Math.round(((currentIndex + 1) / questions.length) * 100)}% through quiz</strong>
              </div>
              <div className="quiz-session-progress-bar">
                <div
                  className="quiz-session-progress-fill"
                  style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                />
              </div>
            </div>
          </Card>

          {recoveryNotice ? <div className="quiz-status-banner info">{recoveryNotice}</div> : null}
          {!isOnline ? (
            <div className="quiz-status-banner warning">
              Offline mode active. Timer is still running and progress is queued for sync.
            </div>
          ) : null}
          {lastSyncError ? <div className="quiz-status-banner danger">{lastSyncError}</div> : null}

          <Card className="quiz-question-card" style={{ padding: 24 }}>
            {currentQuestion ? (
              <QuestionCard
                question={currentQuestion}
                questionNumber={currentIndex + 1}
                showExplanation={quiz?.settings?.showExplanation !== false}
              />
            ) : null}

            <div className="quiz-nav-actions">
              <Button variant="secondary" onClick={prevQuestion} disabled={currentIndex === 0}>
                Previous
              </Button>
              {currentIndex === questions.length - 1 ? (
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Quiz'}
                </Button>
              ) : (
                <Button onClick={nextQuestion}>Next</Button>
              )}
            </div>
          </Card>
        </div>

        <QuizNavSidebar
          questions={questions}
          currentIndex={currentIndex}
          answers={answers}
          markedForReview={markedForReview}
          onSelect={setCurrentIndex}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      </div>

      <style>{quizPageStyles}</style>
    </>
  );
}

const quizPageStyles = `
  .quiz-entry-shell {
    max-width: 860px;
    margin: 32px auto;
    padding: 0 16px;
  }

  .quiz-entry-card {
    background:
      radial-gradient(circle at top right, rgba(99, 102, 241, 0.16), transparent 34%),
      radial-gradient(circle at bottom left, rgba(6, 182, 212, 0.14), transparent 28%),
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
    font-size: clamp(28px, 4vw, 38px);
    line-height: 1.1;
    margin-bottom: 12px;
  }

  .quiz-entry-description {
    color: var(--color-text-secondary);
    font-size: 15px;
    max-width: 620px;
  }

  .quiz-entry-body {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 32px;
  }

  .quick-mode-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 20px;
    border: 1px solid var(--color-border);
    border-radius: 16px;
    background: var(--color-surface-alt);
  }

  .quick-mode-copy h2 {
    margin: 6px 0;
    font-size: 20px;
  }

  .quick-mode-copy p {
    color: var(--color-text-secondary);
    font-size: 14px;
  }

  .quick-mode-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--color-accent);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .quick-mode-toggle {
    position: relative;
    width: 74px;
    min-width: 74px;
    height: 40px;
    border: none;
    border-radius: 999px;
    background: transparent;
    cursor: pointer;
    padding: 0;
  }

  .quick-mode-toggle:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .quick-mode-toggle-track {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: rgba(148, 163, 184, 0.24);
    border: 1px solid var(--color-border-light);
    transition: all 0.25s ease;
  }

  .quick-mode-toggle-thumb {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: var(--shadow-md);
    transition: transform 0.25s ease;
  }

  .quick-mode-toggle.is-enabled .quick-mode-toggle-track {
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    border-color: transparent;
  }

  .quick-mode-toggle.is-enabled .quick-mode-toggle-thumb {
    transform: translateX(34px);
  }

  .quiz-entry-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .quiz-entry-stat {
    padding: 16px;
    border-radius: 14px;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .quiz-entry-stat span {
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .quiz-entry-stat strong {
    font-size: 15px;
  }

  .quiz-session-shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 24px;
    min-height: calc(100vh - 120px);
  }

  .quiz-session-main {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  .quiz-session-header {
    background:
      radial-gradient(circle at top right, rgba(99, 102, 241, 0.12), transparent 30%),
      var(--color-surface);
  }

  .quiz-session-title-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
  }

  .quiz-session-badges {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .quiz-session-title {
    font-size: clamp(22px, 3vw, 28px);
    line-height: 1.1;
  }

  .quiz-session-timer-block {
    min-width: 156px;
    padding: 14px 18px;
    border-radius: 16px;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }

  .quiz-session-timer-block strong {
    font-size: 28px;
    letter-spacing: 0.04em;
  }

  .quiz-session-timer-label {
    font-size: 12px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .quiz-session-progress-row {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-top: 18px;
  }

  .quiz-session-progress-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 190px;
  }

  .quiz-session-progress-copy span {
    color: var(--color-text-secondary);
    font-size: 13px;
  }

  .quiz-session-progress-copy strong {
    font-size: 15px;
  }

  .quiz-session-progress-bar {
    flex: 1;
    height: 12px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--color-border);
  }

  .quiz-session-progress-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
    transition: width 0.35s ease;
  }

  .quiz-question-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 520px;
  }

  .quiz-nav-actions {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: auto;
    padding-top: 24px;
  }

  .quiz-status-banner {
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid var(--color-border);
    font-size: 14px;
  }

  .quiz-status-banner.info {
    background: rgba(59, 130, 246, 0.08);
    border-color: rgba(59, 130, 246, 0.24);
    color: var(--color-text);
  }

  .quiz-status-banner.warning {
    background: var(--color-warning-light);
    border-color: rgba(245, 158, 11, 0.28);
    color: var(--color-text);
  }

  .quiz-status-banner.danger {
    background: var(--color-danger-light);
    border-color: rgba(239, 68, 68, 0.28);
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

    .quiz-nav-actions {
      flex-direction: column-reverse;
    }

    .quiz-nav-actions button {
      width: 100%;
    }
  }
`;
