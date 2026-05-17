import { useEffect, useState, useRef, useCallback } from 'react';
import api from '../../api/axios';
import { Card, Spinner, Button } from '../ui';

export default function AttemptDetailView({ quizId, attemptId, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [expandedExplanations, setExpandedExplanations] = useState(new Set());
  const pageSize = 10;

  const questionRefs = useRef({});

  useEffect(() => {
    let cancelled = false;

    const fetchAttemptData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/quiz/${quizId}/attempt/${attemptId}/result`);
        if (!cancelled) {
          setData(res.data.data);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load attempt details');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchAttemptData();

    return () => {
      cancelled = true;
    };
  }, [quizId, attemptId]);

  useEffect(() => {
    setPage(1);
  }, [filter, searchQuery]);

  const toggleExplanation = useCallback((id) => {
    setExpandedExplanations(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const scrollToQuestion = useCallback((id) => {
    const el = questionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
        <Spinner size={40} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h3 style={{ color: 'var(--color-danger)' }}>{error}</h3>
        <div style={{ marginTop: 16 }}>
          <Button onClick={onBack}>Back to Attempts</Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { attempt, questions } = data;

  if (!attempt || !questions) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h3 style={{ color: 'var(--color-danger)' }}>Invalid attempt data</h3>
        <div style={{ marginTop: 16 }}>
          <Button onClick={onBack}>Back to Attempts</Button>
        </div>
      </div>
    );
  }

  const correctAnswers = attempt.correctCount ?? (attempt.answers || []).filter(a => a.isCorrect).length;
  const wrongAnswers = attempt.wrongCount ?? (attempt.answers || []).filter(a => !a.isCorrect && a.selectedAnswer !== null).length;
  const unansweredCount = attempt.unansweredCount ?? (attempt.answers || []).filter(a => a.selectedAnswer === null).length;
  const totalTimeMs = Number(attempt.totalTimeMs || 0) || Number(attempt.totalTime || 0) * 1000;

  const formatTime = (ms) => {
    const totalSeconds = Math.round(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatTimeSeconds = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const questionsWithStatus = questions.map(q => {
    const answerData = (attempt.answers || []).find(a => String(a.questionId) === String(q._id));
    let status = 'unanswered';
    if (answerData) {
      if (answerData.isCorrect) status = 'correct';
      else if (answerData.selectedAnswer !== null && answerData.selectedAnswer !== undefined) status = 'wrong';
    }
    return { ...q, answerData: answerData || null, status };
  });

  const filteredQuestions = questionsWithStatus.filter(q => {
    if (filter !== 'all' && q.status !== filter) return false;
    if (searchQuery && !q.questionText.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedQuestions = filteredQuestions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="attempt-detail-root">

      {/* Sticky Header */}
      <div className="attempt-detail-header">
        <button onClick={onBack} className="attempt-detail-back-btn" aria-label="Go back">
          ←
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px' }}>Attempt Review</h2>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Submitted on {new Date(attempt.completedAt || attempt.createdAt).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="attempt-detail-body">

        {/* Main Content */}
        <div className="attempt-detail-main">

          {/* Overview Stats */}
          <div className="attempt-stats-grid">
            <div className="attempt-stat-item">
              <div className="attempt-stat-label">Score</div>
              <div className="attempt-stat-value" style={{ color: (attempt.percentage || 0) >= 50 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {attempt.score}/{attempt.totalMarks || attempt.totalQuestions}
              </div>
            </div>
            <div className="attempt-stat-item">
              <div className="attempt-stat-label">Status</div>
              <div className="attempt-stat-value">{(attempt.percentage || 0) >= 50 ? 'Pass' : 'Fail'}</div>
            </div>
            <div className="attempt-stat-item">
              <div className="attempt-stat-label">Correct</div>
              <div className="attempt-stat-value" style={{ color: 'var(--color-success)' }}>{correctAnswers}</div>
            </div>
            <div className="attempt-stat-item">
              <div className="attempt-stat-label">Wrong</div>
              <div className="attempt-stat-value" style={{ color: 'var(--color-danger)' }}>{wrongAnswers}</div>
            </div>
            <div className="attempt-stat-item">
              <div className="attempt-stat-label">Skipped</div>
              <div className="attempt-stat-value" style={{ color: 'var(--color-warning)' }}>{unansweredCount}</div>
            </div>
            <div className="attempt-stat-item">
              <div className="attempt-stat-label">Time</div>
              <div className="attempt-stat-value">{formatTime(totalTimeMs)}</div>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="attempt-filters">
            <input
              type="text"
              placeholder="Search questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="attempt-search-input"
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="attempt-filter-select"
            >
              <option value="all">All Questions</option>
              <option value="correct">Correct Only</option>
              <option value="wrong">Wrong Only</option>
              <option value="unanswered">Unanswered Only</option>
            </select>
          </div>

          {/* Questions List */}
          {filteredQuestions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
              No questions match your criteria.
            </div>
          ) : (
            <div className="attempt-questions-list">
              {paginatedQuestions.map((q) => {
                const { answerData, status } = q;
                const isExpanded = expandedExplanations.has(q._id);
                const answerTimeMs = Number(answerData?.timeTakenMs || 0) || Number(answerData?.timeTaken || 0) * 1000;

                let borderColor = 'var(--color-border)';
                let statusLabel = 'Unanswered';
                let statusColor = 'var(--color-warning)';

                if (status === 'correct') {
                  borderColor = 'var(--color-success)';
                  statusLabel = 'Correct';
                  statusColor = 'var(--color-success)';
                } else if (status === 'wrong') {
                  borderColor = 'var(--color-danger)';
                  statusLabel = 'Wrong';
                  statusColor = 'var(--color-danger)';
                }

                return (
                  <Card
                    key={q._id}
                    ref={el => { questionRefs.current[q._id] = el; }}
                    style={{ borderLeft: `4px solid ${borderColor}`, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                      <h4 style={{ margin: 0, fontSize: '18px' }}>Question {q.questionNumber}</h4>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="attempt-status-pill" style={{ backgroundColor: `color-mix(in srgb, ${statusColor} 15%, transparent)`, color: statusColor }}>
                          {statusLabel}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Marks: {answerData?.marksAwarded ?? 0}/{q.marks ?? 1}</span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Time: {answerTimeMs > 0 ? formatTime(answerTimeMs) : `${answerData?.timeTaken || 0}s`}</span>
                      </div>
                    </div>

                    <p style={{ margin: 0, fontSize: '16px', lineHeight: '1.5' }}>{q.questionText}</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(q.options || []).map((opt) => {
                        const isSelected = answerData?.selectedAnswer === opt.label;
                        const isCorrectOption = opt.isCorrect === true || q.correctAnswer === opt.label;

                        let optionClass = 'attempt-option-neutral';
                        let indicatorText = null;

                        if (isCorrectOption) {
                          optionClass = 'attempt-option-correct';
                          indicatorText = isSelected ? 'Correctly Selected' : 'Correct Answer';
                        } else if (isSelected && !isCorrectOption) {
                          optionClass = 'attempt-option-wrong';
                          indicatorText = 'Your Answer';
                        }

                        return (
                          <div key={opt.label} className={`attempt-option ${optionClass}`}>
                            <span className="attempt-option-label-pill">{opt.label}</span>
                            <span style={{ flex: 1 }}>{opt.text}</span>
                            {indicatorText ? <span className="attempt-option-indicator">{indicatorText}</span> : null}
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation ? (
                      <div style={{ marginTop: '8px' }}>
                        <button
                          onClick={() => toggleExplanation(q._id)}
                          className="attempt-explanation-toggle"
                        >
                          {isExpanded ? 'Hide Explanation' : 'View Explanation'}
                        </button>

                        {isExpanded ? (
                          <div className="attempt-explanation-box animate-fade-in">
                            <strong style={{ display: 'block', marginBottom: '8px' }}>Solution:</strong>
                            {q.explanation}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </Card>
                );
              })}

              {totalPages > 1 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, color: 'var(--color-text-secondary)', fontSize: 13 }}>
                  <Button variant="secondary" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                    Previous
                  </Button>
                  <span>Page {currentPage} of {totalPages}</span>
                  <Button variant="secondary" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
                    Next
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Sidebar Palette */}
        <div className="attempt-palette-sidebar">
          <div className="attempt-palette-inner">
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Question Palette</h3>

            <div className="attempt-palette-grid">
              {questionsWithStatus.map((q) => {
                let bgColor = 'var(--color-warning)';
                if (q.status === 'correct') bgColor = 'var(--color-success)';
                else if (q.status === 'wrong') bgColor = 'var(--color-danger)';

                return (
                  <button
                    key={q._id}
                    onClick={() => scrollToQuestion(q._id)}
                    className="attempt-palette-btn"
                    style={{ backgroundColor: bgColor }}
                    title={`Question ${q.questionNumber}`}
                  >
                    {q.questionNumber}
                  </button>
                );
              })}
            </div>

            <div className="attempt-palette-legend">
              <div className="attempt-palette-legend-item">
                <span style={{ backgroundColor: 'var(--color-success)' }} /> Correct
              </div>
              <div className="attempt-palette-legend-item">
                <span style={{ backgroundColor: 'var(--color-danger)' }} /> Wrong
              </div>
              <div className="attempt-palette-legend-item">
                <span style={{ backgroundColor: 'var(--color-warning)' }} /> Unanswered
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{attemptDetailStyles}</style>
    </div>
  );
}

const attemptDetailStyles = `
  .attempt-detail-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .attempt-detail-header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: 16px;
    position: sticky;
    top: 0;
    background: var(--color-bg);
    z-index: 10;
    border-top-left-radius: 12px;
    border-top-right-radius: 12px;
  }

  .attempt-detail-back-btn {
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    color: var(--color-text);
    font-size: 16px;
    transition: background 0.2s;
  }

  .attempt-detail-back-btn:hover {
    background: var(--color-surface-hover);
  }

  .attempt-detail-body {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 24px;
  }

  .attempt-detail-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 24px;
    min-width: 0;
  }

  .attempt-stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 12px;
    background: var(--color-surface-alt);
    padding: 16px;
    border-radius: 12px;
    border: 1px solid var(--color-border);
  }

  .attempt-stat-item {
    text-align: center;
  }

  .attempt-stat-label {
    font-size: 12px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .attempt-stat-value {
    font-size: 18px;
    font-weight: bold;
  }

  .attempt-filters {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  .attempt-search-input {
    flex: 1;
    min-width: 180px;
    padding: 10px 16px;
    border-radius: 10px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    color: var(--color-text);
    font: inherit;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
  }

  .attempt-search-input:focus {
    border-color: var(--color-primary);
  }

  .attempt-filter-select {
    padding: 10px 16px;
    border-radius: 10px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    color: var(--color-text);
    font: inherit;
    font-size: 14px;
  }

  .attempt-questions-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .attempt-status-pill {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: bold;
  }

  .attempt-option {
    padding: 12px 16px;
    border-radius: 10px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    color: var(--color-text);
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .attempt-option-correct {
    background: var(--color-success-light);
    border-color: rgba(22, 163, 74, 0.25);
    color: var(--color-success);
  }

  .attempt-option-wrong {
    background: var(--color-danger-light);
    border-color: rgba(220, 38, 38, 0.25);
    color: var(--color-danger);
  }

  .attempt-option-label-pill {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1px solid currentColor;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    flex-shrink: 0;
  }

  .attempt-option-indicator {
    font-size: 12px;
    font-weight: bold;
    margin-left: auto;
    white-space: nowrap;
  }

  .attempt-explanation-toggle {
    background: none;
    border: none;
    color: var(--color-primary);
    cursor: pointer;
    padding: 0;
    font-size: 14px;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .attempt-explanation-toggle:hover {
    text-decoration: underline;
  }

  .attempt-explanation-box {
    margin-top: 12px;
    padding: 16px;
    background: rgba(79, 70, 229, 0.04);
    border-radius: 12px;
    font-size: 14px;
    color: var(--color-text);
    border-left: 3px solid var(--color-primary);
  }

  .attempt-palette-sidebar {
    width: 260px;
    flex-shrink: 0;
  }

  .attempt-palette-inner {
    position: sticky;
    top: 24px;
    background: var(--color-surface-alt);
    padding: 20px;
    border-radius: 12px;
    border: 1px solid var(--color-border);
  }

  .attempt-palette-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }

  .attempt-palette-btn {
    aspect-ratio: 1;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s ease;
  }

  .attempt-palette-btn:hover {
    transform: scale(1.1);
  }

  .attempt-palette-legend {
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .attempt-palette-legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .attempt-palette-legend-item span {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    display: inline-block;
  }

  @media (max-width: 860px) {
    .attempt-palette-sidebar {
      display: none;
    }

    .attempt-detail-body {
      padding: 16px;
    }
  }
`;
