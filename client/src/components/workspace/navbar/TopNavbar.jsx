import { useMemo, useState } from 'react';
import { Settings, Maximize, Minimize, CheckCircle, Sparkles } from 'lucide-react';
import { useQuizStore } from '../../../store/quizStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { useTimerStore } from '../../../store/timerStore';
import { useAIStore } from '../../../store/aiStore';
import { formatDurationMs, getGuestSessionId } from '../../../utils/quizSession';
import api from '../../../api/axios';
import { motion, AnimatePresence } from 'framer-motion';

export default function TopNavbar() {
  const { quiz, questions, answers, submitAttempt, submitting, isSubmitted } = useQuizStore();
  const { toggleFocusMode, focusMode, toggleDrawer, toggleBothSidePanels, isNavigatorCollapsed, isAICollapsed } = useSettingsStore();
  const { toggleOpen: toggleAI, isOpen: isAIOpen } = useAIStore();

  const answeredCount = useMemo(
    () => questions.filter((q) => Boolean(answers[q._id]?.selectedAnswer)).length,
    [answers, questions]
  );
  const progressPercent = questions.length ? (answeredCount / questions.length) * 100 : 0;

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const [localSubmitting, setLocalSubmitting] = useState(false);

  const handleSubmitClick = async () => {
    // If store provides a submitAttempt handler, prefer that.
    if (typeof submitAttempt === 'function') {
      try {
        submitAttempt();
      } catch (err) {
        // swallow — store handler should manage errors
      }
      return;
    }

    // Fallback: perform the submit flow inline (mirrors Quiz.jsx)
    if (localSubmitting || submitting || isSubmitted) return;

    const attemptId = useQuizStore.getState().attemptId;
    const currentQuiz = useQuizStore.getState().quiz;

    if (!attemptId || !currentQuiz?._id) return;

    if (!window.confirm('Submit this quiz now?')) return;

    try {
      setLocalSubmitting(true);
      await useQuizStore.getState().syncWithBackend({ force: true });
      const payload = useQuizStore.getState().getSubmitPayload();
      const sessionId = useQuizStore.getState().sessionId || getGuestSessionId();

      const response = await api.put(
        `/quiz/${currentQuiz._id}/attempt/${attemptId}`,
        payload,
        {
          headers: {
            'x-quiz-session-id': sessionId,
          },
        }
      );

      useQuizStore.getState().setResult(response.data.data);
      // navigate to result page
      window.location.href = `/result/${attemptId}`;
    } catch (requestError) {
      // show a simple alert — Quiz page manages a nicer error UI
      alert(requestError.response?.data?.message || 'Failed to submit quiz');
      setLocalSubmitting(false);
    }
  };

  return (
    <header className="h-14 border-b border-zinc-200 bg-white/80 backdrop-blur-xl flex items-center justify-between px-4 z-50 shrink-0 sticky top-0 transition-all duration-300">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {/* Logo */}
        <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm shadow-indigo-600/20 shrink-0">
          Q
        </div>

        {/* Title & Breadcrumbs */}
        <div className="flex flex-col min-w-0">
          <h1 className="text-sm font-semibold text-zinc-900 truncate tracking-tight">{quiz?.title || 'Quiz'}</h1>
          <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider truncate flex items-center gap-2">
            <span>{quiz?.category || 'General'}</span>
            <span className="w-1 h-1 rounded-full bg-zinc-300" />
            <span>{questions.length} Questions</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center flex-1">
        {!focusMode && (
          <div className="flex items-center gap-4 bg-zinc-100/90 rounded-full pl-4 pr-3 py-2 border border-zinc-200/50 backdrop-blur-sm shadow-sm">
            <span className="text-sm font-semibold text-zinc-600 tracking-wide tabular-nums">
              {answeredCount}/{questions.length}
            </span>
            <div className="w-32 h-2.5 bg-zinc-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-indigo-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ ease: "easeOut", duration: 0.5 }}
              />
            </div>
            <TimerPill />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-1 justify-end">
        {!focusMode && (
          <button
            onClick={toggleAI}
            className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 ${isAIOpen ? 'bg-indigo-50 text-indigo-600' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}
            title="Toggle AI Explanations"
          >
            <Sparkles className="w-4 h-4" />
          </button>
        )}

        {/* Panels toggle - collapses/expands navigator and AI panels */}
        <button
          onClick={toggleBothSidePanels}
          className={`p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors`}
          title={isNavigatorCollapsed && isAICollapsed ? 'Expand side panels' : 'Collapse side panels'}
          aria-pressed={isNavigatorCollapsed && isAICollapsed}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <rect x="3" y="4" width="7" height="16" rx="1" />
            <rect x="14" y="4" width="7" height="16" rx="1" />
          </svg>
        </button>

        <button
          onClick={toggleFocusMode}
          className={`p-2 rounded-lg transition-colors ${focusMode ? 'bg-indigo-50 text-indigo-600' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}
          title="Toggle Focus Mode (Ctrl+Shift+F)"
        >
          {focusMode ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>

        <button
          onClick={toggleDrawer}
          className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-zinc-200 mx-1" />

        <button
          onClick={handleSubmitClick}
          disabled={submitting || localSubmitting || isSubmitted}
          className="ml-1 h-8 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium transition-all flex items-center gap-2 shadow-sm shadow-zinc-900/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting || localSubmitting ? 'Submitting...' : 'Submit'}
          {!submitting && !localSubmitting && <CheckCircle className="w-4 h-4 opacity-70" />}
        </button>
      </div>
    </header>
  );
}

function TimerPill() {
  const { timerMode, remainingMs, elapsedMs, isExpired, isWarning, hasDeadline } = useTimerStore();
  const { timerVisibility } = useSettingsStore();

  if (timerVisibility === 'hidden') return null;

  const displayTime = hasDeadline && timerMode !== 'none' ? remainingMs : elapsedMs;

  return (
    <div className={`px-3 py-1.5 rounded-full text-sm font-semibold font-mono tracking-tight flex items-center gap-2 transition-colors duration-300 min-w-[72px] ${isExpired ? 'bg-red-100 text-red-700' : isWarning ? 'bg-amber-100 text-amber-700' : 'bg-white text-zinc-700 shadow-sm border border-zinc-200/50'}`}>
      <span className={`w-2 h-2 rounded-full ${isExpired ? 'bg-red-500' : isWarning ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`} />
      {formatDurationMs(displayTime)}
    </div>
  );
}
