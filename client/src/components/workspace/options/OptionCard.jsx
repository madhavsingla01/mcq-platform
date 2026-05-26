import { memo } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const renderMarkdown = (content) => (
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
        whileTap={!isLocked && !shouldRevealFeedback ? { scale: 0.995 } : {}}
        className={`${containerClass} ${sizeClass}`}
      >
        <div className={`opt-pill ${isSelected && !shouldRevealFeedback ? 'opt-pill--selected' : ''} ${shouldRevealFeedback && isCorrect ? 'opt-pill--correct' : ''} ${shouldRevealFeedback && isWrongSelection ? 'opt-pill--wrong' : ''}`}>
          {option.label}
        </div>
        <div className="opt-text">
          {renderMarkdown(option.text)}
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
    padding: 16px 18px;
    border-radius: 16px;
    border: 1.5px solid #e4e4e7;
    background: #fff;
    color: #3f3f46;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
  }

  .opt-card--sm { padding: 12px 14px; }
  .opt-card--lg { padding: 20px 22px; }

  .opt-card:hover:not(.opt-card--locked):not(.opt-card--selected) {
    border-color: #c7d2fe;
    background: #fafaff;
    
  }

  .opt-card--selected {
    border-color: #6366f1;
    background: #eef2ff;
    color: #312e81;
    
  }

  .opt-card--correct-answer {
    border-color: #86efac;
    background: #f0fdf4;
    color: #14532d;
  }

  .opt-card--wrong {
    border-color: #fca5a5;
    background: #fef2f2;
    color: #7f1d1d;
  }

  .opt-card--dimmed {
    opacity: 0.5;
    border-color: #e4e4e7;
  }

  .opt-card--locked { cursor: default; }

  /* ── Pill ── */
  .opt-pill {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 1.5px solid #e4e4e7;
    background: #f4f4f5;
    color: #71717a;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    flex-shrink: 0;
    transition: all 0.2s;
  }

  .opt-pill--selected {
    background: #6366f1;
    border-color: #6366f1;
    color: #fff;
    
  }

  .opt-pill--correct {
    background: #22c55e;
    border-color: #22c55e;
    color: #fff;
  }

  .opt-pill--wrong {
    background: #ef4444;
    border-color: #ef4444;
    color: #fff;
  }

  /* ── Text ── */
  .opt-text {
    flex: 1;
    font-size: 15px;
    line-height: 1.6;
    min-width: 0;
  }

  .opt-card--sm .opt-text { font-size: 14px; }
  .opt-card--lg .opt-text { font-size: 16px; }

  /* ── Badge ── */
  .opt-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 3px 8px;
    border-radius: 6px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .opt-badge--correct { background: rgba(34, 197, 94, 0.12); color: #16a34a; }
  .opt-badge--wrong { background: rgba(239, 68, 68, 0.12); color: #dc2626; }
`;
