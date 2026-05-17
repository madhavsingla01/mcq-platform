import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { Badge, Button, Card, Spinner } from '../../components/ui';
import { formatDurationMs, getGuestSessionId } from '../../utils/quizSession';

const getAnswerTimeMs = (answer) => Number(answer?.timeTakenMs || 0) || Number(answer?.timeTaken || 0) * 1000;

export default function Result() {
  const { attemptId } = useParams();
  const [loading, setLoading] = useState(true);
  const [resultData, setResultData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const fetchResult = async () => {
      try {
        const sessionId = getGuestSessionId();
        const response = await api.get(`/quiz/attempts/${attemptId}/result`, {
          headers: {
            'x-quiz-session-id': sessionId,
          },
        });

        if (!cancelled) {
          setResultData(response.data.data);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError('Failed to load results');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchResult();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  const reviewItems = useMemo(() => {
    if (!resultData) {
      return [];
    }

    const questionMap = new Map(resultData.questions.map((question) => [question._id, question]));

    return resultData.attempt.answers
      .map((answer) => {
        const question = questionMap.get(String(answer.questionId)) || questionMap.get(answer.questionId);

        if (!question) {
          return null;
        }

        return {
          answer,
          question,
        };
      })
      .filter(Boolean);
  }, [resultData]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '72px 0' }}>
        <Spinner size={40} />
      </div>
    );
  }

  if (error) {
    return <div style={{ color: 'var(--color-danger)', textAlign: 'center', padding: '48px 16px' }}>{error}</div>;
  }

  if (!resultData) {
    return null;
  }

  const { attempt } = resultData;
  const analytics = attempt.analytics || {};
  const totalTimeMs = Number(attempt.totalTimeMs || 0) || Number(attempt.totalTime || 0) * 1000;

  return (
    <>
      <div className="result-shell">
        <Card className="result-hero" style={{ padding: 32 }}>
          <div className="result-hero-header">
            <div>
              <div className="result-badges">
                <Badge variant={attempt.percentage >= 50 ? 'success' : 'danger'}>
                  {attempt.percentage >= 50 ? 'Passed' : 'Completed'}
                </Badge>
                {attempt.instantFeedback ? <Badge>Instant Feedback</Badge> : null}
              </div>
              <h1>Quiz Complete</h1>
              <p>{attempt.quizId?.title}</p>
            </div>
            <div className="result-score-block">
              <strong>{attempt.percentage}%</strong>
              <span>{attempt.score} / {attempt.totalQuestions}</span>
            </div>
          </div>

          <div className="result-stat-grid">
            <StatCard label="Total Time" value={formatDurationMs(totalTimeMs)} />
            <StatCard label="Answered" value={analytics.answeredCount ?? attempt.answers.filter((answer) => answer.selectedAnswer).length} />
            <StatCard label="Skipped" value={analytics.skippedCount ?? attempt.answers.filter((answer) => !answer.selectedAnswer).length} />
            <StatCard label="Avg / Question" value={formatDurationMs(analytics.averageTimePerQuestionMs || 0)} />
            <StatCard label="Correct Time" value={formatDurationMs(analytics.timeSpentCorrectMs || 0)} />
            <StatCard label="Wrong Time" value={formatDurationMs(analytics.timeSpentWrongMs || 0)} />
          </div>

          <div className="result-metrics-grid">
            <MetricCard
              title="Response Speed"
              value={analytics.responseSpeed?.speedBand || 'unclassified'}
              meta={`${analytics.responseSpeed?.answersPerMinute || 0} answers/min`}
            />
            <MetricCard
              title="Completion Efficiency"
              value={`${analytics.completionEfficiency?.efficiencyScore || 0}`}
              meta={`${analytics.completionEfficiency?.completionRate || 0}% completion`}
            />
            <MetricCard
              title="Fastest Solved"
              value={analytics.fastestSolvedQuestion?.questionNumber ? `Q${analytics.fastestSolvedQuestion.questionNumber}` : '-'}
              meta={analytics.fastestSolvedQuestion ? formatDurationMs(analytics.fastestSolvedQuestion.timeMs) : 'No solved question'}
            />
            <MetricCard
              title="Slowest Solved"
              value={analytics.slowestSolvedQuestion?.questionNumber ? `Q${analytics.slowestSolvedQuestion.questionNumber}` : '-'}
              meta={analytics.slowestSolvedQuestion ? formatDurationMs(analytics.slowestSolvedQuestion.timeMs) : 'No solved question'}
            />
          </div>

          <div className="result-actions">
            <Link to={`/quiz/${attempt.quizId?._id}`} style={{ textDecoration: 'none' }}>
              <Button variant="secondary">Retake Quiz</Button>
            </Link>
            <Link to="/upload" style={{ textDecoration: 'none' }}>
              <Button>Upload New File</Button>
            </Link>
          </div>
        </Card>

        <div className="result-review-list">
          {reviewItems.map(({ answer, question }, index) => {
            const answerTimeMs = getAnswerTimeMs(answer);

            return (
              <Card
                key={`${question._id}-${index}`}
                className={`result-review-card ${answer.isCorrect ? 'correct' : answer.selectedAnswer ? 'wrong' : 'skipped'}`}
              >
                <div className="result-review-header">
                  <div>
                    <h3>Question {question.questionNumber}</h3>
                    <p>{question.questionText}</p>
                  </div>
                  <div className="result-review-meta">
                    <Badge variant={answer.isCorrect ? 'success' : answer.selectedAnswer ? 'danger' : 'warning'}>
                      {answer.isCorrect ? 'Correct' : answer.selectedAnswer ? 'Incorrect' : 'Skipped'}
                    </Badge>
                    <span>{formatDurationMs(answerTimeMs)}</span>
                  </div>
                </div>

                <div className="result-options-list">
                  {question.options.map((option) => {
                    const isCorrectOption = option.label === question.correctAnswer;
                    const isSelected = option.label === answer.selectedAnswer;

                    return (
                      <div
                        key={option.label}
                        className={[
                          'result-option-chip',
                          isCorrectOption ? 'correct' : '',
                          isSelected && !answer.isCorrect ? 'wrong' : '',
                        ].join(' ').trim()}
                      >
                        <span className="result-option-label">{option.label}</span>
                        <span className="result-option-text">{option.text}</span>
                        {isCorrectOption ? <span className="result-option-status">Correct Answer</span> : null}
                        {isSelected && !answer.isCorrect ? <span className="result-option-status">Your Answer</span> : null}
                      </div>
                    );
                  })}
                </div>

                {question.explanation ? (
                  <div className="result-explanation-box">
                    <strong>Explanation</strong>
                    <p>{question.explanation}</p>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      </div>

      <style>{resultStyles}</style>
    </>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="result-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricCard({ title, value, meta }) {
  return (
    <div className="result-metric-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{meta}</small>
    </div>
  );
}

const resultStyles = `
  .result-shell {
    max-width: 1040px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .result-hero {
    background:
      radial-gradient(circle at top right, rgba(79, 70, 229, 0.05), transparent 30%),
      radial-gradient(circle at bottom left, rgba(99, 102, 241, 0.03), transparent 32%),
      var(--color-surface);
  }

  .result-hero-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }

  .result-badges {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .result-hero h1 {
    margin-bottom: 8px;
    font-size: clamp(28px, 4vw, 38px);
    letter-spacing: -0.03em;
  }

  .result-hero p {
    color: var(--color-text-secondary);
  }

  .result-score-block {
    min-width: 180px;
    padding: 18px 20px;
    border-radius: 20px;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }

  .result-score-block strong {
    font-size: 42px;
    line-height: 1;
    color: var(--color-primary);
  }

  .result-score-block span {
    color: var(--color-text-secondary);
  }

  .result-stat-grid,
  .result-metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 20px;
  }

  .result-metrics-grid {
    margin-top: 12px;
  }

  .result-stat-card,
  .result-metric-card {
    padding: 20px;
    border-radius: 16px;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .result-stat-card span,
  .result-metric-card span {
    color: var(--color-text-secondary);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .result-stat-card strong,
  .result-metric-card strong {
    font-size: 20px;
  }

  .result-metric-card small {
    color: var(--color-text-secondary);
    font-size: 12px;
  }

  .result-actions {
    margin-top: 28px;
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
  }

  .result-review-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .result-review-card.correct {
    border-left: 4px solid var(--color-success);
  }

  .result-review-card.wrong {
    border-left: 4px solid var(--color-danger);
  }

  .result-review-card.skipped {
    border-left: 4px solid var(--color-warning);
  }

  .result-review-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 16px;
  }

  .result-review-header h3 {
    margin-bottom: 8px;
    font-weight: 600;
  }

  .result-review-header p {
    color: var(--color-text);
    line-height: 1.5;
  }

  .result-review-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    min-width: 120px;
  }

  .result-review-meta span {
    color: var(--color-text-secondary);
    font-size: 13px;
  }

  .result-options-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .result-option-chip {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
  }

  .result-option-chip.correct {
    border-color: rgba(22, 163, 74, 0.25);
    background: var(--color-success-light);
  }

  .result-option-chip.wrong {
    border-color: rgba(220, 38, 38, 0.25);
    background: var(--color-danger-light);
  }

  .result-option-label {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
    font-weight: 700;
    font-size: 13px;
    background: var(--color-surface);
  }

  .result-option-text {
    line-height: 1.5;
  }

  .result-option-status {
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .result-explanation-box {
    margin-top: 16px;
    padding: 18px;
    border-radius: 12px;
    background: rgba(79, 70, 229, 0.04);
    border: 1px solid rgba(79, 70, 229, 0.12);
  }

  .result-explanation-box strong {
    display: inline-block;
    margin-bottom: 8px;
    color: var(--color-primary);
  }

  @media (max-width: 768px) {
    .result-hero-header,
    .result-review-header {
      flex-direction: column;
    }

    .result-score-block,
    .result-review-meta {
      align-items: flex-start;
      min-width: 0;
    }

    .result-actions a,
    .result-actions button {
      width: 100%;
    }

    .result-option-chip {
      grid-template-columns: 40px minmax(0, 1fr);
    }

    .result-option-status {
      grid-column: 2 / 3;
    }
  }
`;
