import { Button, Card } from '../ui';
import { useQuizStore } from '../../store/quizStore';
import './QuizNavSidebar.css';

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
    </>
  );
}
