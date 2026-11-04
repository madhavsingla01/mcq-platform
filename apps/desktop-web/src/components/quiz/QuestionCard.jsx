import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Badge } from '../ui';
import { useQuizStore } from '../../store/quizStore';
import 'katex/dist/katex.min.css';
import './QuestionCard.css';

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
    </>
  );
}
