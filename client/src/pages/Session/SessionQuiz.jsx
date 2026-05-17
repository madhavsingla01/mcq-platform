/**
 * SessionQuiz — quiz workspace with live chat panel.
 * 3-panel layout: Navigator | Quiz | Chat
 * Wraps the existing quiz components with session socket lifecycle.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { Spinner, Badge, Button, Card } from '../../components/ui';
import { useQuizStore } from '../../store/quizStore';
import { useSessionStore } from '../../store/sessionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAIStore } from '../../store/aiStore';
import { useAuthStore } from '../../store/authStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import {
  clearAttemptSnapshot,
  getGuestSessionId,
  loadActiveAttemptRef,
  loadAttemptSnapshot,
} from '../../utils/quizSession';

import SessionHeader from '../../components/session/SessionHeader';
import ChatPanel from '../../components/session/ChatPanel';
import TopNavbar from '../../components/workspace/navbar/TopNavbar';
import NavigatorSidebar from '../../components/workspace/navigator/NavigatorSidebar';
import QuestionWorkspace from '../../components/workspace/question/QuestionWorkspace';
import SettingsDrawer from '../../components/workspace/settings/SettingsDrawer';

export default function SessionQuiz() {
  const { shareCode } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // Session store
  const {
    session,
    isChatOpen,
    fetchSession,
    joinSession,
    connectToSession,
    loadMessages,
    reset: resetSession,
  } = useSessionStore();

  // Quiz store (reuse existing)
  const {
    quiz,
    questions,
    currentIndex,
    answers,
    attemptId,
    isStarted,
    isQuickMode,
    isSubmitted,
    bootstrapQuiz,
    startAttemptFromServer,
    syncWithBackend,
    getSubmitPayload,
    setResult,
    setCurrentIndex,
    nextQuestion,
    prevQuestion,
    teardownRuntime,
    reset: resetQuiz,
  } = useQuizStore();

  // Settings store
  const {
    focusMode,
    panelWidths,
    isDrawerOpen,
    isNavigatorCollapsed,
  } = useSettingsStore();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [quizEntered, setQuizEntered] = useState(false);

  const currentQuestion = questions[currentIndex] || null;
  const answeredCount = useMemo(
    () => questions.filter((q) => Boolean(answers[q._id]?.selectedAnswer)).length,
    [answers, questions]
  );

  const navPercent = panelWidths?.navigator ?? 20;

  // ── Load session + quiz data ──
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setError('');

      try {
        // 1. Fetch session by shareCode
        const sessionData = await fetchSession(shareCode);
        if (cancelled) return;

        const quizId = sessionData.session.quiz?._id;
        if (!quizId) {
          setError('Quiz not found for this session');
          setLoading(false);
          return;
        }

        // 2. Join the session (idempotent)
        await joinSession(sessionData.session._id);
        if (cancelled) return;

        // 3. Load quiz data (reuse existing quiz loading logic)
        const sessionId = getGuestSessionId();
        const activeAttemptRef = loadActiveAttemptRef(quizId);
        let localSnapshot = activeAttemptRef?.attemptId
          ? loadAttemptSnapshot(activeAttemptRef.attemptId)
          : null;

        if (localSnapshot && (localSnapshot.isSubmitted || (localSnapshot.sessionId && localSnapshot.sessionId !== sessionId))) {
          clearAttemptSnapshot({ attemptId: localSnapshot.attemptId, quizId });
          localSnapshot = null;
        }

        let quizData = localSnapshot?.quiz || null;
        let questionData = localSnapshot?.questions || [];
        let activeAttempt = null;

        try {
          const [quizRes, questionRes] = await Promise.all([
            api.get(`/quiz/${quizId}`),
            api.get(`/quiz/${quizId}/questions`),
          ]);
          quizData = quizRes.data.data.quiz;
          questionData = questionRes.data.data.questions;

          const activeRes = await api.get(`/quiz/${quizId}/attempt/active`, {
            params: { sessionId, attemptId: localSnapshot?.attemptId || undefined },
            headers: { 'x-quiz-session-id': sessionId },
          });
          activeAttempt = activeRes.data.data.attempt;
        } catch (e) {
          if (!quizData || !questionData.length) throw e;
        }

        if (cancelled) return;

        bootstrapQuiz({
          quiz: quizData,
          questions: questionData,
          serverAttempt: activeAttempt,
          localSnapshot,
        });

        // 4. Connect to socket + load chat history
        connectToSession(sessionData.session._id);
        loadMessages(sessionData.session._id);
      } catch (e) {
        if (!cancelled) setError('Failed to load session');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    resetQuiz({ clearPersisted: false });
    init();

    return () => {
      cancelled = true;
      teardownRuntime();
      resetSession();
    };
  }, [shareCode]);

  // ── Start / Resume handlers ──
  const handleStart = async (forceNew = false) => {
    try {
      setLoading(true);
      setError('');
      const sessionId = getGuestSessionId();
      const quizId = session?.quiz?._id || quiz?._id;
      if (!quizId) return false;

      const activeAttemptRef = loadActiveAttemptRef(quizId);
      if (forceNew && activeAttemptRef?.attemptId) {
        clearAttemptSnapshot({ attemptId: activeAttemptRef.attemptId, quizId });
      }
      if (forceNew) resetQuiz({ clearPersisted: true });

      const response = await api.post(
        `/quiz/${quizId}/attempt`,
        { forceNew, sessionId },
        { headers: { 'x-quiz-session-id': sessionId } }
      );

      startAttemptFromServer({
        attempt: response.data.data.attempt,
        quiz,
        questions,
      });
      return true;
    } catch {
      setError('Failed to start attempt');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleResume = () => setQuizEntered(true);

  const handleStartNew = async () => {
    if (window.confirm('This will discard your current progress. Are you sure?')) {
      const success = await handleStart(true);
      if (success) setQuizEntered(true);
    }
  };

  const handleSubmit = async () => {
    if (submitting || !attemptId || !quiz?._id) return;
    if (!window.confirm('Submit this quiz now?')) return;

    setSubmitting(true);
    setError('');

    try {
      const sessionId = getGuestSessionId();
      await syncWithBackend({ force: true });
      const payload = getSubmitPayload();
      const response = await api.put(
        `/quiz/${quiz._id}/attempt/${attemptId}`,
        payload,
        { headers: { 'x-quiz-session-id': sessionId } }
      );
      setResult(response.data.data);
      navigate(`/result/${attemptId}`);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to submit quiz');
      setSubmitting(false);
    }
  };

  // Keyboard shortcuts
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
      if (currentQuestion) useQuizStore.getState().toggleReview(currentQuestion._id);
    },
    onSubmit: handleSubmit,
    enabled: isStarted && !isSubmitted && quizEntered,
  });

  // ── Loading ──
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '72px 0' }}>
        <Spinner size={40} />
      </div>
    );
  }

  // ── Error ──
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

  // ── Pre-quiz entry screen ──
  if (!quizEntered || isSubmitted) {
    return (
      <>
        <div className="session-quiz-entry-shell">
          <Card className="session-quiz-entry-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="session-quiz-entry-hero">
              <div className="session-quiz-entry-badges">
                <Badge>{questions.length} Questions</Badge>
                <Badge variant="warning">
                  {quiz?.settings?.timeLimit ? `${quiz.settings.timeLimit} min limit` : 'No time limit'}
                </Badge>
                <Badge>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 4 }}>group</span>
                  {session?.participantCount || 0} participants
                </Badge>
              </div>
              <h1 className="session-quiz-entry-title">{quiz?.title}</h1>
              <p className="session-quiz-entry-desc">
                {quiz?.description || 'Start solving at your own pace. Chat with others in the live sidebar.'}
              </p>
            </div>

            <div className="session-quiz-entry-body">
              <div className="session-quiz-entry-actions">
                {isStarted && !isSubmitted ? (
                  <>
                    <Button size="lg" onClick={handleResume} style={{ width: '100%', fontSize: 17, padding: '16px 20px' }}>
                      Resume Attempt
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={handleStartNew}
                      style={{ width: '100%', fontSize: 17, padding: '16px 20px', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                    >
                      Start New Attempt
                    </Button>
                  </>
                ) : (
                  <Button
                    size="lg"
                    onClick={async () => {
                      const success = await handleStart(true);
                      if (success) setQuizEntered(true);
                    }}
                    style={{ width: '100%', fontSize: 17, padding: '16px 20px' }}
                  >
                    Start Quiz
                  </Button>
                )}
              </div>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 8 }}>
                Tip: Progress is auto-saved. Chat remains active alongside the quiz.
              </p>
            </div>
          </Card>
        </div>

        <style>{sessionQuizEntryStyles}</style>
      </>
    );
  }

  // ── 3-panel quiz workspace with chat ──
  const creatorId = session?.creator?._id || session?.creatorId;

  return (
    <>
      <div className="session-quiz-layout">
        <SessionHeader
          quizTitle={quiz?.title}
          shareCode={shareCode}
        />

        <main className="session-quiz-main">
          <div className="session-quiz-panels">
            {/* Navigator */}
            {!focusMode && (
              <aside
                className="session-quiz-nav"
                style={{ flex: `0 0 ${isNavigatorCollapsed ? '64px' : `${navPercent}%`}` }}
              >
                <div className="session-quiz-nav-inner custom-scrollbar">
                  <NavigatorSidebar collapsed={isNavigatorCollapsed} />
                </div>
              </aside>
            )}

            {/* Quiz Workspace */}
            <div className="session-quiz-workspace">
              <QuestionWorkspace />
            </div>

            {/* Chat Panel */}
            {!focusMode && isChatOpen && (
              <aside className="session-quiz-chat">
                <ChatPanel creatorId={creatorId} />
              </aside>
            )}
          </div>
        </main>

        {isDrawerOpen && <SettingsDrawer />}
      </div>

      <style>{sessionQuizLayoutStyles}</style>
    </>
  );
}

const sessionQuizEntryStyles = `
  .session-quiz-entry-shell {
    max-width: 560px;
    margin: 40px auto;
    padding: 0 16px;
  }

  .session-quiz-entry-card {
    background:
      radial-gradient(circle at top right, rgba(91, 80, 214, 0.04), transparent 40%),
      var(--color-surface);
  }

  .session-quiz-entry-hero {
    padding: 32px;
    border-bottom: 1px solid var(--color-border);
  }

  .session-quiz-entry-badges {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .session-quiz-entry-title {
    font-size: 28px;
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: -0.02em;
    margin-bottom: 10px;
  }

  .session-quiz-entry-desc {
    font-size: 15px;
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .session-quiz-entry-body {
    padding: 28px 32px;
  }

  .session-quiz-entry-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  @media (max-width: 640px) {
    .session-quiz-entry-shell {
      margin: 20px auto;
    }

    .session-quiz-entry-hero,
    .session-quiz-entry-body {
      padding: 24px 20px;
    }

    .session-quiz-entry-title {
      font-size: 22px;
    }
  }
`;

const sessionQuizLayoutStyles = `
  .session-quiz-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--color-bg);
    font-family: var(--font-sans);
  }

  .session-quiz-main {
    flex: 1;
    min-height: 0;
  }

  .session-quiz-panels {
    display: flex;
    height: 100%;
  }

  .session-quiz-nav {
    background: #fcfcfc;
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
  }

  .session-quiz-nav-inner {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }

  .session-quiz-workspace {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
  }

  .session-quiz-chat {
    flex: 0 0 320px;
    max-width: 380px;
    min-width: 260px;
    display: flex;
    flex-direction: column;
  }

  @media (max-width: 1024px) {
    .session-quiz-chat {
      position: fixed;
      right: 0;
      top: 52px;
      bottom: 0;
      width: 320px;
      z-index: 100;
      box-shadow: -4px 0 24px rgba(0, 0, 0, 0.08);
    }

    .session-quiz-nav {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .session-quiz-chat {
      width: 100%;
      max-width: 100%;
      border-radius: 16px 16px 0 0;
      top: auto;
      height: 60vh;
    }
  }
`;
