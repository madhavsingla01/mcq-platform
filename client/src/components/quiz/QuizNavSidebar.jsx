import { Button, Card } from '../ui';
import { useQuizStore } from '../../store/quizStore';

export default function QuizNavSidebar({
  questions,
  currentIndex,
  answers,
  markedForReview,
  onSelect,
  onSubmit,
  submitting = false,
}) {
  const { toggleMark, isQuickMode } = useQuizStore();
  const currentQuestionId = questions[currentIndex]?._id;
  const isMarked = markedForReview.includes(currentQuestionId);
  const answeredCount = questions.filter((question) => Boolean(answers[question._id]?.selectedAnswer)).length;

  return (
    <>
      <Card className="quiz-sidebar-shell" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="quiz-sidebar-header">
          <div>
            <h3>Question Navigator</h3>
            <span>{answeredCount} of {questions.length} answered</span>
          </div>
          {isQuickMode ? <span className="quiz-sidebar-mode">Quick</span> : null}
        </div>

        <div className="quiz-sidebar-grid-wrap">
          <div className="quiz-sidebar-grid">
            {questions.map((question, index) => {
              const questionAnswer = answers[question._id];
              const isAnswered = Boolean(questionAnswer?.selectedAnswer);
              const isLocked = questionAnswer?.isLocked === true;
              const isCurrent = index === currentIndex;
              const isReview = markedForReview.includes(question._id);

              return (
                <button
                  key={question._id}
                  type="button"
                  onClick={() => onSelect(index)}
                  className={[
                    'quiz-sidebar-index',
                    isCurrent ? 'current' : '',
                    isReview ? 'review' : '',
                    isAnswered ? 'answered' : '',
                    isLocked ? 'locked' : '',
                  ].join(' ').trim()}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </div>

        <div className="quiz-sidebar-actions">
          <Button
            variant="ghost"
            style={{ justifyContent: 'flex-start', color: isMarked ? 'var(--color-warning)' : 'var(--color-text)' }}
            onClick={() => toggleMark(currentQuestionId)}
          >
            {isMarked ? 'Unmark for Review' : 'Mark for Review'}
          </Button>
          <Button variant="secondary" onClick={onSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Quiz'}
          </Button>
        </div>
      </Card>

      <style>{sidebarStyles}</style>
    </>
  );
}

const sidebarStyles = `
  .quiz-sidebar-shell {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .quiz-sidebar-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 20px;
    border-bottom: 1px solid var(--color-border);
  }

  .quiz-sidebar-header h3 {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 600;
  }

  .quiz-sidebar-header span {
    color: var(--color-text-secondary);
    font-size: 13px;
  }

  .quiz-sidebar-mode {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 54px;
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--color-success-light);
    color: var(--color-success);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .quiz-sidebar-grid-wrap {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
  }

  .quiz-sidebar-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }

  .quiz-sidebar-index {
    aspect-ratio: 1 / 1;
    border-radius: 10px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    color: var(--color-text);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
  }

  .quiz-sidebar-index:hover {
    transform: translateY(-1px);
    border-color: var(--color-primary);
  }

  .quiz-sidebar-index.current {
    border-width: 2px;
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }

  .quiz-sidebar-index.answered {
    background: var(--color-primary-light);
    border-color: rgba(79, 70, 229, 0.25);
  }

  .quiz-sidebar-index.locked {
    background: var(--color-success-light);
    border-color: rgba(22, 163, 74, 0.25);
  }

  .quiz-sidebar-index.review {
    box-shadow: inset 0 0 0 1px var(--color-warning);
  }

  .quiz-sidebar-actions {
    padding: 18px 20px;
    border-top: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  @media (max-width: 1024px) {
    .quiz-sidebar-grid {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .quiz-sidebar-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }
`;
