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

        {question.media?.url && (
          <img
            src={question.media.url}
            alt={question.questionText ? `Illustration for question: ${question.questionText}` : 'Question illustration'}
            className="question-media-image"
          />
        )}

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
          {options.map((option, index) => {
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
                className={`question-option-card ${variantClass} ${isLocked ? 'locked' : ''} question-option-stagger`}
                style={{ animationDelay: `${index * 45}ms` }}
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
    color: var(--color-text, #EDEFF1);
  }

  .question-card-body-copy p {
    margin: 0;
    color: inherit;
  }

  .question-media-image {
    display: block;
    width: 100%;
    max-height: 420px;
    object-fit: contain;
    border-radius: 12px;
    background: var(--color-surface, #17191c);
  }

  .question-feedback-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-radius: var(--radius-container, 14px);
    corner-shape: squircle;
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
    background: rgba(70, 209, 96, 0.12);
    border-color: rgba(70, 209, 96, 0.3);
  }

  .question-feedback-banner.danger {
    background: rgba(255, 79, 64, 0.12);
    border-color: rgba(255, 79, 64, 0.3);
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
    border-radius: var(--radius-container, 14px);
    corner-shape: squircle;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    transform: translateZ(0);
    transition: transform var(--duration-tap) var(--ease-out), border-color 140ms ease, background-color 140ms ease, opacity 140ms ease;
  }

  .question-option-card:active:not(.locked) {
    transform: scale(0.985);
  }

  @media (hover: hover) and (pointer: fine) {
    .question-option-card:hover:not(.locked) {
      transform: translateY(-1px);
      border-color: var(--color-primary);
    }
  }

  .question-option-stagger {
    animation: optionStaggerEnter 240ms var(--ease-out) backwards;
  }

  @keyframes optionStaggerEnter {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .question-option-card.selected {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }

  .question-option-card.correct {
    border-color: rgba(70, 209, 96, 0.3);
    background: rgba(70, 209, 96, 0.12);
  }

  .question-option-card.wrong {
    border-color: rgba(255, 79, 64, 0.3);
    background: rgba(255, 79, 64, 0.12);
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
    border-radius: var(--radius-full, 9999px);
    corner-shape: round;
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
    border-radius: var(--radius-container, 14px);
    corner-shape: squircle;
    background: var(--color-primary-light);
    border: 1px solid color-mix(in srgb, var(--color-primary) 18%, transparent);
    overflow: hidden;
    animation: explanationSlideUp 260ms var(--ease-out) forwards;
    transform-origin: top center;
  }

  @keyframes explanationSlideUp {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
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
