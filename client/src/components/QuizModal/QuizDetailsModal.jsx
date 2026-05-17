import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { Badge, Button, ProgressBar, Spinner } from '../ui';
import AttemptDetailView from './AttemptDetailView';

const DEFAULT_PAGINATION = {
  total: 0,
  page: 1,
  limit: 10,
  pages: 1,
};

const formatDateTime = (value) => {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString();
};

const formatPercent = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0%';

  return `${Math.round(number)}%`;
};

const formatDuration = (attempt) => {
  const seconds = Number(attempt?.totalTime || 0);
  const milliseconds = Number(attempt?.totalTimeMs || 0);
  const totalSeconds = milliseconds > 0 ? Math.round(milliseconds / 1000) : seconds;

  if (!totalSeconds) return '0s';

  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;

  if (!minutes) return `${remainder}s`;
  if (!remainder) return `${minutes}m`;

  return `${minutes}m ${remainder}s`;
};

export default function QuizDetailsModal({ quizId, onClose }) {
  const [quiz, setQuiz] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [sortBy, setSortBy] = useState('latest');
  const [selectedAttemptId, setSelectedAttemptId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    const fetchDetails = async () => {
      setLoading(true);
      setError('');
      setSelectedAttemptId(null);

      try {
        const [quizResponse, analyticsResponse, attemptsResponse] = await Promise.all([
          api.get(`/quiz/${quizId}`),
          api.get(`/quiz/${quizId}/analytics`),
          api.get(`/quiz/${quizId}/attempts`, { params: { limit: DEFAULT_PAGINATION.limit } }),
        ]);

        if (cancelled) return;

        setQuiz(quizResponse.data.data.quiz);
        setAnalytics(analyticsResponse.data.data.analytics);
        setAttempts(attemptsResponse.data.data.attempts || []);
        setPagination(attemptsResponse.data.data.pagination || DEFAULT_PAGINATION);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.response?.data?.message || 'Failed to load quiz details');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchDetails();

    return () => {
      cancelled = true;
    };
  }, [quizId]);

  const initialSortRef = useRef(true);

  useEffect(() => {
    if (loading) return undefined;

    // Skip the first render — the main useEffect already fetched attempts
    if (initialSortRef.current) {
      initialSortRef.current = false;
      return undefined;
    }

    let cancelled = false;

    const fetchAttempts = async () => {
      setAttemptsLoading(true);

      try {
        const response = await api.get(`/quiz/${quizId}/attempts`, {
          params: {
            sortBy,
            page: 1,
            limit: pagination.limit || DEFAULT_PAGINATION.limit,
          },
        });

        if (cancelled) return;

        setAttempts(response.data.data.attempts || []);
        setPagination(response.data.data.pagination || DEFAULT_PAGINATION);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.response?.data?.message || 'Failed to load attempts');
        }
      } finally {
        if (!cancelled) {
          setAttemptsLoading(false);
        }
      }
    };

    fetchAttempts();

    return () => {
      cancelled = true;
    };
  }, [quizId, sortBy]);

  const stats = useMemo(() => {
    const totalAttempts = Number(quiz?.totalAttempts || pagination.total || attempts.length || 0);
    const averageScore = Number(quiz?.avgScore ?? analytics?.averageScore ?? 0);
    const highestScore = attempts.reduce((max, attempt) => Math.max(max, Number(attempt.percentage || 0)), 0);
    const completedAttempts = attempts.filter((attempt) => attempt.status === 'completed').length;

    return [
      { label: 'Questions', value: quiz?.questionCount || 0 },
      { label: 'Attempts', value: totalAttempts },
      { label: 'Average Score', value: formatPercent(averageScore) },
      { label: 'Best Recent', value: formatPercent(highestScore) },
      { label: 'Completed', value: completedAttempts },
    ];
  }, [analytics, attempts, pagination.total, quiz]);

  const handleOverlayMouseDown = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const loadPage = async (page) => {
    if (page < 1 || page > pagination.pages || attemptsLoading) return;

    setAttemptsLoading(true);
    setError('');

    try {
      const response = await api.get(`/quiz/${quizId}/attempts`, {
        params: {
          sortBy,
          page,
          limit: pagination.limit || DEFAULT_PAGINATION.limit,
        },
      });

      setAttempts(response.data.data.attempts || []);
      setPagination(response.data.data.pagination || DEFAULT_PAGINATION);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to load attempts');
    } finally {
      setAttemptsLoading(false);
    }
  };

  return (
    <div className="quiz-modal-overlay" onMouseDown={handleOverlayMouseDown} role="presentation">
      <section
        className="quiz-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {selectedAttemptId ? (
          <AttemptDetailView
            quizId={quizId}
            attemptId={selectedAttemptId}
            onBack={() => setSelectedAttemptId(null)}
          />
        ) : (
          <>
            <header className="quiz-modal-header">
              <div>
                <span className="quiz-modal-eyebrow">Quiz Details</span>
                <h2 id="quiz-details-title">{quiz?.title || 'Quiz'}</h2>
              </div>
              <button type="button" className="quiz-modal-close" onClick={onClose} aria-label="Close quiz details">
                ×
              </button>
            </header>

            {loading ? (
              <div className="quiz-modal-state">
                <Spinner size={40} />
              </div>
            ) : error && !quiz ? (
              <div className="quiz-modal-state error">{error}</div>
            ) : (
              <div className="quiz-modal-content">
                {error ? <div className="quiz-modal-alert">{error}</div> : null}

                <div className="quiz-modal-summary">
                  <div>
                    <div className="quiz-modal-badges">
                      <Badge>{quiz?.category || 'General'}</Badge>
                      <Badge variant="warning">{quiz?.difficulty || 'All Levels'}</Badge>
                      {quiz?.settings?.timeLimit ? <Badge>{quiz.settings.timeLimit} min</Badge> : <Badge variant="success">No time limit</Badge>}
                    </div>
                    <p>{quiz?.description || 'No description added for this quiz.'}</p>
                  </div>
                  <Link to={`/quiz/${quizId}`} className="quiz-modal-start-link">
                    <Button>Start Quiz</Button>
                  </Link>
                </div>

                <div className="quiz-stat-grid">
                  {stats.map((item) => (
                    <div className="quiz-stat-card" key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>

                <div className="quiz-meta-grid">
                  <div>
                    <span>Created</span>
                    <strong>{formatDateTime(quiz?.createdAt)}</strong>
                  </div>
                  <div>
                    <span>Source File</span>
                    <strong>{quiz?.sourceFile?.name || '-'}</strong>
                  </div>
                  <div>
                    <span>Review</span>
                    <strong>{quiz?.settings?.allowReview === false ? 'Disabled' : 'Enabled'}</strong>
                  </div>
                  <div>
                    <span>Explanations</span>
                    <strong>{quiz?.settings?.showExplanation === false ? 'Hidden' : 'Visible'}</strong>
                  </div>
                </div>

                <section className="quiz-attempts-section">
                  <div className="quiz-attempts-header">
                    <div>
                      <h3>Recent Attempts</h3>
                      <p>{pagination.total || 0} completed attempt{pagination.total === 1 ? '' : 's'}</p>
                    </div>
                    <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} disabled={attemptsLoading}>
                      <option value="latest">Latest</option>
                      <option value="highest">Highest score</option>
                      <option value="lowest">Lowest score</option>
                    </select>
                  </div>

                  {attemptsLoading ? (
                    <div className="quiz-modal-state compact">
                      <Spinner />
                    </div>
                  ) : attempts.length === 0 ? (
                    <div className="quiz-empty-attempts">No completed attempts yet.</div>
                  ) : (
                    <div className="quiz-attempt-list">
                      {attempts.map((attempt) => (
                        <button
                          type="button"
                          className="quiz-attempt-row"
                          key={attempt._id}
                          onClick={() => setSelectedAttemptId(attempt._id)}
                        >
                          <div>
                            <strong>{formatPercent(attempt.percentage)}</strong>
                            <span>{attempt.score || 0} / {attempt.totalQuestions || quiz?.questionCount || 0}</span>
                          </div>
                          <div className="quiz-attempt-progress">
                            <ProgressBar value={Number(attempt.percentage || 0)} />
                          </div>
                          <div className="quiz-attempt-meta">
                            <span>{formatDuration(attempt)}</span>
                            <small>{formatDateTime(attempt.completedAt || attempt.createdAt)}</small>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {pagination.pages > 1 ? (
                    <div className="quiz-pagination">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={pagination.page <= 1 || attemptsLoading}
                        onClick={() => loadPage(pagination.page - 1)}
                      >
                        Previous
                      </Button>
                      <span>
                        Page {pagination.page} of {pagination.pages}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={pagination.page >= pagination.pages || attemptsLoading}
                        onClick={() => loadPage(pagination.page + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  ) : null}
                </section>
              </div>
            )}
          </>
        )}
      </section>

      <style>{quizDetailsModalStyles}</style>
    </div>
  );
}

const quizDetailsModalStyles = `
  .quiz-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
  }

  .quiz-details-modal {
    width: min(1080px, 100%);
    max-height: min(860px, calc(100vh - 48px));
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: 24px;
    background: var(--color-bg);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.12);
    display: flex;
    flex-direction: column;
  }

  .quiz-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    padding: 24px 28px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  .quiz-modal-eyebrow {
    display: block;
    margin-bottom: 6px;
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .quiz-modal-header h2 {
    margin: 0;
    font-size: 24px;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .quiz-modal-close {
    width: 40px;
    height: 40px;
    border: 1px solid var(--color-border);
    border-radius: 50%;
    background: var(--color-surface-alt);
    color: var(--color-text);
    cursor: pointer;
    font-size: 26px;
    line-height: 1;
    transition: background 0.2s;
  }

  .quiz-modal-close:hover {
    background: var(--color-surface-hover);
  }

  .quiz-modal-content {
    flex: 1;
    overflow: auto;
    padding: 24px 28px 28px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .quiz-modal-state {
    min-height: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
  }

  .quiz-modal-state.compact {
    min-height: 120px;
  }

  .quiz-modal-state.error,
  .quiz-modal-alert {
    color: var(--color-danger);
  }

  .quiz-modal-alert {
    padding: 12px 14px;
    border: 1px solid rgba(220, 38, 38, 0.15);
    border-radius: 12px;
    background: var(--color-danger-light);
    font-size: 14px;
  }

  .quiz-modal-summary {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }

  .quiz-modal-summary p {
    max-width: 720px;
    margin: 12px 0 0;
    color: var(--color-text-secondary);
    line-height: 1.6;
  }

  .quiz-modal-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .quiz-modal-start-link {
    flex-shrink: 0;
    text-decoration: none;
  }

  .quiz-stat-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 14px;
  }

  .quiz-stat-card,
  .quiz-meta-grid > div {
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--color-border);
    border-radius: 14px;
    background: var(--color-surface);
  }

  .quiz-stat-card span,
  .quiz-meta-grid span {
    display: block;
    margin-bottom: 8px;
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .quiz-stat-card strong {
    font-size: 24px;
  }

  .quiz-meta-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .quiz-meta-grid strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
  }

  .quiz-attempts-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .quiz-attempts-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .quiz-attempts-header h3 {
    margin: 0 0 4px;
    font-weight: 600;
  }

  .quiz-attempts-header p {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 13px;
  }

  .quiz-attempts-header select {
    min-width: 150px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: 14px;
  }

  .quiz-empty-attempts {
    padding: 32px;
    border: 1px dashed var(--color-border);
    border-radius: 16px;
    color: var(--color-text-secondary);
    text-align: center;
  }

  .quiz-attempt-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .quiz-attempt-row {
    width: 100%;
    display: grid;
    grid-template-columns: 120px minmax(160px, 1fr) 180px;
    align-items: center;
    gap: 18px;
    padding: 14px 16px;
    border: 1px solid var(--color-border);
    border-radius: 14px;
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
    text-align: left;
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
  }

  .quiz-attempt-row:hover {
    transform: translateY(-1px);
    border-color: var(--color-primary);
    background: var(--color-surface-alt);
    box-shadow: 0 2px 8px rgba(79, 70, 229, 0.04);
  }

  .quiz-attempt-row strong,
  .quiz-attempt-row span,
  .quiz-attempt-row small {
    display: block;
  }

  .quiz-attempt-row strong {
    font-size: 20px;
  }

  .quiz-attempt-row span,
  .quiz-attempt-row small {
    color: var(--color-text-secondary);
    font-size: 13px;
  }

  .quiz-attempt-meta {
    text-align: right;
  }

  .quiz-pagination {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    color: var(--color-text-secondary);
    font-size: 13px;
  }

  @media (max-width: 860px) {
    .quiz-modal-overlay {
      padding: 12px;
      align-items: stretch;
    }

    .quiz-details-modal {
      max-height: calc(100vh - 24px);
      border-radius: 18px;
    }

    .quiz-modal-header,
    .quiz-modal-content {
      padding-left: 18px;
      padding-right: 18px;
    }

    .quiz-modal-summary,
    .quiz-attempts-header {
      flex-direction: column;
      align-items: stretch;
    }

    .quiz-modal-start-link,
    .quiz-modal-start-link button {
      width: 100%;
    }

    .quiz-stat-grid,
    .quiz-meta-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .quiz-attempt-row {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .quiz-attempt-meta {
      text-align: left;
    }
  }

  @media (max-width: 520px) {
    .quiz-stat-grid,
    .quiz-meta-grid {
      grid-template-columns: 1fr;
    }

    .quiz-pagination {
      justify-content: stretch;
      flex-wrap: wrap;
    }

    .quiz-pagination button {
      flex: 1;
    }
  }
`;
