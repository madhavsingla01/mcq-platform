import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const OptionMarkdown = memo(function OptionMarkdown({ content }) {
  if (!content) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ node, ...props }) => <span {...props} />
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

function OptionCard({
  option,
  index,
  isSelected,
  isCorrect,
  shouldRevealFeedback,
  isLocked,
  onSelect,
  fontSize
}) {
  const isCorrectSelection = isSelected && isCorrect;
  const isWrongSelection = isSelected && !isCorrect;

  let containerClass = 'opt-card';
  if (shouldRevealFeedback) {
    if (isCorrect) containerClass += ' opt-card--correct-answer';
    else if (isWrongSelection) containerClass += ' opt-card--wrong';
    else containerClass += ' opt-card--dimmed';
  } else if (isSelected) {
    containerClass += ' opt-card--selected';
  }

  if (isLocked) containerClass += ' opt-card--locked';

  const sizeClass = fontSize === 'lg' ? 'opt-card--lg' : fontSize === 'sm' ? 'opt-card--sm' : '';

  return (
    <>
      <motion.button
        type="button"
        onClick={onSelect}
        disabled={isLocked}
        whileHover={!isLocked && !shouldRevealFeedback ? { y: -1 } : {}}
        whileTap={!isLocked && !shouldRevealFeedback ? { scale: 0.98 } : {}}
        className={`${containerClass} ${sizeClass}`}
      >
        <div
          className={`opt-pill ${
            isSelected && !shouldRevealFeedback ? 'opt-pill--selected' : ''
          } ${shouldRevealFeedback && isCorrect ? 'opt-pill--correct' : ''} ${
            shouldRevealFeedback && isWrongSelection ? 'opt-pill--wrong' : ''
          }`}
        >
          {option.label}
        </div>
        <div className="opt-text">
          <OptionMarkdown content={option.text} />
        </div>
        {shouldRevealFeedback && isSelected && !isCorrect && (
          <span className="opt-badge opt-badge--wrong">Your Answer</span>
        )}
        {shouldRevealFeedback && isCorrect && (
          <span className="opt-badge opt-badge--correct">Correct</span>
        )}
      </motion.button>
      <style>{optionStyles}</style>
    </>
  );
}

export default memo(OptionCard);

const optionStyles = `
  .opt-card {
    width: 100%;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 15px 18px;
    border-radius: var(--radius-container, 14px);
    corner-shape: squircle;
    border: 1px solid var(--border-default, #343536);
    background: var(--bg-surface, #1A1A1B);
    color: var(--text-primary, #FFFFFF);
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    transition: transform var(--duration-tap) var(--ease-out), border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease;
    position: relative;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }

  .opt-card--sm { padding: 11px 14px; }
  .opt-card--lg { padding: 18px 22px; }

  @media (hover: hover) and (pointer: fine) {
    .opt-card:hover:not(.opt-card--locked):not(.opt-card--selected) {
      border-color: var(--accent-primary, #FF4500);
      background: var(--bg-elevated, #272729);
    }
  }

  .opt-card--selected {
    border-color: var(--accent-primary, #FF4500);
    background: rgba(255, 69, 0, 0.12);
    color: var(--text-primary, #FFFFFF);
  }

  .opt-card--correct-answer {
    border-color: var(--success, #46D160);
    background: rgba(70, 209, 96, 0.12);
    color: var(--text-primary, #FFFFFF);
  }

  .opt-card--wrong {
    border-color: var(--error, #FF4F40);
    background: rgba(255, 79, 64, 0.12);
    color: var(--text-primary, #FFFFFF);
  }

  .opt-card--dimmed {
    opacity: 0.45;
  }

  .opt-card--locked { cursor: default; }

  /* ── Pill ── */
  .opt-pill {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-full, 9999px);
    corner-shape: round;
    border: 1px solid var(--border-default, #343536);
    background: var(--bg-elevated, #272729);
    color: var(--text-secondary, #818181);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13.5px;
    font-weight: 750;
    flex-shrink: 0;
    transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
  }

  .opt-card:hover:not(.opt-card--locked) .opt-pill {
    border-color: var(--accent-primary, #FF4500);
    color: var(--text-primary, #FFFFFF);
  }

  .opt-pill--selected {
    background: var(--accent-primary, #FF4500);
    border-color: var(--accent-primary, #FF4500);
    color: #ffffff;
  }

  .opt-pill--correct {
    background: var(--success, #46D160);
    border-color: var(--success, #46D160);
    color: #ffffff;
  }

  .opt-pill--wrong {
    background: var(--error, #FF4F40);
    border-color: var(--error, #FF4F40);
    color: #ffffff;
  }

  /* ── Text ── */
  .opt-text {
    flex: 1;
    font-size: 15px;
    line-height: 1.55;
    min-width: 0;
  }

  .opt-card--sm .opt-text { font-size: 14px; }
  .opt-card--lg .opt-text { font-size: 16px; }

  /* ── Badge ── */
  .opt-badge {
    font-size: 10px;
    font-weight: 750;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 3px 8px;
    border-radius: var(--radius-sm, 6px);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .opt-badge--correct {
    background: rgba(70, 209, 96, 0.15);
    color: var(--success, #46D160);
    border: 1px solid rgba(70, 209, 96, 0.3);
  }
  .opt-badge--wrong {
    background: rgba(255, 79, 64, 0.15);
    color: var(--error, #FF4F40);
    border: 1px solid rgba(255, 79, 64, 0.3);
  }
`;

