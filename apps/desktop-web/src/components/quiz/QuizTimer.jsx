import { memo, useEffect, useRef } from 'react';
import { useTimerStore } from '../../store/timerStore';
import { formatDurationMs } from '../../utils/quizSession';

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
    <>
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

      <style>{timerStyles}</style>
    </>
  );
}

export default memo(QuizTimer);

const timerStyles = `
  .quiz-timer {
    min-width: 140px;
    padding: 12px 16px;
    border-radius: 14px;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    transition: all 0.3s ease;
  }

  .quiz-timer.compact {
    min-width: auto;
    padding: 8px 12px;
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  .quiz-timer.compact .quiz-timer-label {
    margin-bottom: 0;
  }

  .quiz-timer-label {
    font-size: 11px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }

  .quiz-timer-value {
    font-size: 24px;
    letter-spacing: 0.02em;
    color: var(--color-text);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .quiz-timer.compact .quiz-timer-value {
    font-size: 16px;
  }

  .quiz-timer.warning {
    border-color: rgba(217, 119, 6, 0.3);
    background: var(--color-warning-light);
    animation: timer-pulse 1.5s ease-in-out infinite;
  }

  .quiz-timer.warning .quiz-timer-value {
    color: var(--color-warning);
  }

  .quiz-timer.expired {
    border-color: rgba(220, 38, 38, 0.3);
    background: var(--color-danger-light);
    animation: none;
  }

  .quiz-timer.expired .quiz-timer-value {
    color: var(--color-danger);
  }

  .quiz-timer-soft-hint {
    font-size: 11px;
    color: var(--color-text-secondary);
    font-style: italic;
  }

  @keyframes timer-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.02); }
  }
`;
