import AccessibleMedia from '../../media/AccessibleMedia';
import { memo } from 'react';
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
  isSelected,
  isCorrect,
  shouldRevealFeedback,
  isLocked,
  onSelect,
  multiple = false,
  fontSize,
  questionId, quizId, attemptId
}) {
  const isCorrectSelection = isSelected && isCorrect;
  const isWrongSelection = isSelected && !isCorrect;
  const optionId = option.optionId || option._id || option.label;

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
    <div className={`${containerClass} ${sizeClass} opt-card--accessible`}>
      <label className="opt-choice-label">
        <input className="opt-native-choice" type={multiple ? 'checkbox' : 'radio'} name={`question-${questionId}`} value={optionId}
          checked={isSelected} onChange={() => onSelect(optionId)} disabled={isLocked} aria-label={`${option.label}. ${option.text || option.accessibilityMedia?.[0]?.label || 'Media answer choice'}`} />
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
      </label>
      <AccessibleMedia clips={option.accessibilityMedia || []} text={option.text} quizId={quizId} attemptId={attemptId} />
    </div>
  );
}

export default memo(OptionCard);

