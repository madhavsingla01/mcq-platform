import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import './OptionCard.css';

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
    <motion.button
      type="button"
      onClick={onSelect}
      disabled={isLocked}
      whileHover={!isLocked && !shouldRevealFeedback ? { y: -1 } : {}}
      whileTap={!isLocked && !shouldRevealFeedback ? { scale: 0.97 } : {}}
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
  );
}

export default memo(OptionCard);

