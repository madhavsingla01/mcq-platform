import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

const renderMarkdown = (content) => (
  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
    {content}
  </ReactMarkdown>
);

/**
 * Modular question renderer — routes to the correct sub-renderer by type.
 * Currently only supports single_choice. Extensible for multi_choice, code, etc.
 */
function QuestionRenderer({ question, questionNumber, type, onSelect, selectedAnswer, isLocked, instantFeedback, correctAnswer, showExplanation }) {
  const resolvedType = type || question.type || 'single_choice';

  switch (resolvedType) {
    case 'single_choice':
    default:
      return (
        <SingleChoiceRenderer
          question={question}
          questionNumber={questionNumber}
          onSelect={onSelect}
          selectedAnswer={selectedAnswer}
          isLocked={isLocked}
          instantFeedback={instantFeedback}
          correctAnswer={correctAnswer}
          showExplanation={showExplanation}
        />
      );
  }
}

export default memo(QuestionRenderer);

/**
 * SingleChoiceRenderer — extracted from QuestionCard.
 * Handles MCQ option display, selection, locking, and feedback.
 */
const SingleChoiceRenderer = memo(function SingleChoiceRenderer({
  question,
  questionNumber,
  onSelect,
  selectedAnswer,
  isLocked,
  instantFeedback,
  correctAnswer,
  showExplanation,
}) {
  const options = Array.isArray(question.options) ? question.options : [];
  const isCorrectSelection = Boolean(selectedAnswer) && selectedAnswer === correctAnswer;
  const shouldRevealFeedback = instantFeedback && isLocked && Boolean(selectedAnswer);

  return (
    <div className="qr-shell">
      {/* Question header */}
      <div className="qr-header">
        <div className="qr-number">Q{questionNumber ?? question.questionNumber}.</div>
        <div className="qr-body-text">
          {renderMarkdown(question.questionText)}
        </div>
      </div>

      {/* Feedback banner */}
      {shouldRevealFeedback && (
        <div className={`qr-feedback ${isCorrectSelection ? 'success' : 'danger'}`}>
          <div>
            <strong>{isCorrectSelection ? 'Correct' : 'Incorrect'}</strong>
            <span>
              {isCorrectSelection
                ? 'Your answer is correct.'
                : `Correct answer: ${correctAnswer}`}
            </span>
          </div>
          <span className={`qr-feedback-badge ${isCorrectSelection ? 'success' : 'danger'}`}>
            {isCorrectSelection ? '✓' : '✗'}
          </span>
        </div>
      )}

      {/* Options */}
      <div className="qr-options">
        {options.map((option) => {
          const isSelected = selectedAnswer === option.label;
          const isCorrectOption = correctAnswer === option.label;

          let variantClass = 'neutral';
          if (shouldRevealFeedback) {
            if (isCorrectOption) variantClass = 'correct';
            else if (isSelected && !isCorrectSelection) variantClass = 'wrong';
            else variantClass = 'muted';
          } else if (isSelected) {
            variantClass = 'selected';
          }

          return (
            <button
              key={option.label}
              type="button"
              className={`qr-option ${variantClass} ${isLocked ? 'locked' : ''}`}
              onClick={() => onSelect?.(question._id, option.label)}
              disabled={isLocked}
            >
              <span className="qr-option-pill">{option.label}</span>
              <span className="qr-option-text">{renderMarkdown(option.text)}</span>
              {shouldRevealFeedback && isCorrectOption && (
                <span className="qr-option-tag">Correct</span>
              )}
              {shouldRevealFeedback && isSelected && !isCorrectSelection && (
                <span className="qr-option-tag">Your Answer</span>
              )}
              {!shouldRevealFeedback && isSelected && (
                <span className="qr-option-tag">Selected</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Explanation */}
      {shouldRevealFeedback && showExplanation && question.explanation && (
        <div className="qr-explanation animate-fade-in">
          <span className="qr-explanation-label">Explanation</span>
          <div className="qr-explanation-content">
            {renderMarkdown(question.explanation)}
          </div>
        </div>
      )}
    </div>
  );
});
