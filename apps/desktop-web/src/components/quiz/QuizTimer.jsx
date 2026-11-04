import { memo, useEffect, useRef } from 'react';
import { useTimerStore } from '../../store/timerStore';
import { formatDurationMs } from '../../utils/quizSession';
import './QuizTimer.css';

/**
 * QuizTimer — displays countdown or elapsed time.
 * Reads entirely from timerStore (frontend-driven).
 * No backend calls.
 */
function QuizTimer({ compact = false, onExpired }) {
  const {
    timerMode,
    remainingMs,
    elapsedMs,
    isExpired,
    isWarning,
    hasDeadline,
  } = useTimerStore();

  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (isExpired && (timerMode === 'strict' || hasDeadline) && onExpired && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      onExpired();
    }
  }, [isExpired, timerMode, hasDeadline, onExpired]);

  if (timerMode === 'none' && !hasDeadline) {
    return null;
  }

  // Timed quiz: show countdown
  const timerClass = [
    'quiz-timer',
    compact ? 'compact' : '',
    isWarning ? 'warning' : '',
    isExpired ? 'expired' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={timerClass}>
      <span className="quiz-timer-label">
        {isExpired ? 'Time Expired' : 'Time Left'}
      </span>
      <strong className="quiz-timer-value">
        {isExpired ? '00:00' : formatDurationMs(remainingMs)}
      </strong>
      {timerMode === 'soft' && isExpired && (
        <span className="quiz-timer-soft-hint">You may continue</span>
      )}
    </div>
  );
}

export default memo(QuizTimer);
