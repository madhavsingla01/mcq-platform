import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Badge } from '../ui';
import { useQuizStore } from '../../store/quizStore';
import 'katex/dist/katex.min.css';

const renderMarkdown = (content) => (
  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
    {content}
  </ReactMarkdown>
);

export default function QuestionCard({ question, questionNumber, showExplanation = true }) {
  const { answers, isQuickMode, selectAnswer } = useQuizStore();
  const answerState = answers[question._id] || {};
  const selectedAnswer = answerState.selectedAnswer || null;
  const isLocked = answerState.isLocked === true;
  const options = Array.isArray(question.options) ? question.options : [];
  const correctAnswer = question.correctAnswer;
  const isCorrectSelection = Boolean(selectedAnswer) && selectedAnswer === correctAnswer;
  const shouldRevealFeedback = isQuickMode && isLocked && Boolean(selectedAnswer);

  return (
    <>
      <div className="question-card-shell animate-fade-in" key={question._id}>
        <div className="question-card-header">
          <div className="question-card-number">Q{questionNumber ?? question.questionNumber}.</div>
          <div className="question-card-body-copy">
            {renderMarkdown(question.questionText)}
          </div>
        </div>

        {shouldRevealFeedback ? (
          <div className={`question-feedback-banner ${isCorrectSelection ? 'success' : 'danger'}`}>
            <div>
              <strong>{isCorrectSelection ? 'Correct answer locked' : 'Wrong answer locked'}</strong>
              <span>
                {isCorrectSelection
                  ? 'Quick Mode confirmed your answer instantly.'
                  : `Correct answer: ${correctAnswer}`}
              </span>
            </div>
            <Badge variant={isCorrectSelection ? 'success' : 'danger'}>
              {isCorrectSelection ? 'Correct' : 'Incorrect'}
            </Badge>
          </div>
        ) : null}

        <div className="question-options-list">
          {options.map((option) => {
            const isSelected = selectedAnswer === option.label;
            const isCorrectOption = correctAnswer === option.label;

            let variantClass = 'neutral';

            if (shouldRevealFeedback) {
              if (isCorrectOption) {
                variantClass = 'correct';
              } else if (isSelected && !isCorrectSelection) {
                variantClass = 'wrong';
              } else {
                variantClass = 'muted';
              }
            } else if (isSelected) {
              variantClass = 'selected';
            }

            return (
              <button
                key={option.label}
                type="button"
                className={`question-option-card ${variantClass} ${isLocked ? 'locked' : ''}`}
                onClick={() => selectAnswer(question._id, option.label)}
                disabled={isLocked}
              >
                <span className="question-option-pill">{option.label}</span>
                <span className="question-option-text">{renderMarkdown(option.text)}</span>
                {shouldRevealFeedback && isCorrectOption ? (
                  <span className="question-option-indicator">Correct Answer</span>
                ) : null}
                {shouldRevealFeedback && isSelected && !isCorrectSelection ? (
                  <span className="question-option-indicator">Your Answer</span>
                ) : null}
                {!shouldRevealFeedback && isSelected ? (
                  <span className="question-option-indicator">Selected</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {shouldRevealFeedback && showExplanation && question.explanation ? (
          <div className="question-explanation-panel animate-fade-in-scale">
            <span className="question-explanation-label">Explanation</span>
            <div className="question-explanation-content">
              {renderMarkdown(question.explanation)}
            </div>
          </div>
        ) : null}
      </div>

      <style>{questionCardStyles}</style>
    </>
  );
}

const questionCardStyles = `
  .question-card-shell {
    display: flex;
    flex-direction: column;
    gap: 20px;
    min-height: 100%;
  }

  .question-card-header {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }

  .question-card-number {
    font-size: 22px;
    font-weight: 800;
    color: var(--color-primary);
    flex-shrink: 0;
  }

  .question-card-body-copy {
    font-size: 18px;
    line-height: 1.7;
    min-width: 0;
  }

  .question-card-body-copy p {
    margin: 0;
  }

  .question-feedback-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-radius: 16px;
    border: 1px solid transparent;
    animation: fadeIn 0.25s ease;
  }

  .question-feedback-banner strong {
    display: block;
    margin-bottom: 4px;
  }

  .question-feedback-banner span {
    color: var(--color-text-secondary);
    font-size: 14px;
  }

  .question-feedback-banner.success {
    background: var(--color-success-light);
    border-color: rgba(22, 163, 74, 0.2);
  }

  .question-feedback-banner.danger {
    background: var(--color-danger-light);
    border-color: rgba(220, 38, 38, 0.2);
  }

  .question-options-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .question-option-card {
    width: 100%;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    padding: 16px 18px;
    border-radius: 14px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    text-align: left;
    cursor: pointer;
    transform: translateZ(0);
    transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease;
  }

  .question-option-card:hover:not(.locked) {
    transform: translateY(-1px);
    border-color: var(--color-primary);
    box-shadow: 0 2px 8px rgba(79, 70, 229, 0.06);
  }

  .question-option-card.selected {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.08);
  }

  .question-option-card.correct {
    border-color: rgba(22, 163, 74, 0.3);
    background: var(--color-success-light);
  }

  .question-option-card.wrong {
    border-color: rgba(220, 38, 38, 0.3);
    background: var(--color-danger-light);
  }

  .question-option-card.muted {
    opacity: 0.6;
  }

  .question-option-card.locked {
    cursor: default;
  }

  .question-option-pill {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid var(--color-border);
    font-weight: 700;
    background: var(--color-surface-alt);
    font-size: 14px;
  }

  .question-option-text {
    min-width: 0;
    font-size: 15px;
    line-height: 1.6;
  }

  .question-option-text p {
    margin: 0;
  }

  .question-option-indicator {
    font-size: 12px;
    font-weight: 700;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .question-explanation-panel {
    padding: 18px;
    border-radius: 16px;
    background: rgba(79, 70, 229, 0.04);
    border: 1px solid rgba(79, 70, 229, 0.12);
    overflow: hidden;
  }

  .question-explanation-label {
    display: inline-flex;
    margin-bottom: 10px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-primary);
  }

  .question-explanation-content {
    font-size: 14px;
    line-height: 1.7;
  }

  .question-explanation-content p {
    margin: 0;
  }

  @media (max-width: 640px) {
    .question-card-header {
      flex-direction: column;
      gap: 10px;
    }

    .question-option-card {
      grid-template-columns: 38px minmax(0, 1fr);
    }

    .question-option-indicator {
      grid-column: 2 / 3;
    }
  }
`;
