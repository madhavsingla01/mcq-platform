import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { Badge, Button, Spinner } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { formatDurationMs, getGuestSessionId } from '../../utils/quizSession';

const getAnswerTimeMs = (answer) => Number(answer?.timeTakenMs || 0) || Number(answer?.timeTaken || 0) * 1000;

const SCORE_TIERS = [
  { min: 90, emoji: '🏆', label: 'Outstanding', color: '#f59e0b' },
  { min: 75, emoji: '⭐', label: 'Excellent', color: '#8b5cf6' },
  { min: 50, emoji: '👍', label: 'Good Work', color: '#22c55e' },
  { min: 0, emoji: '💪', label: 'Keep Practicing', color: '#6366f1' },
];

function getScoreTier(pct) {
  return SCORE_TIERS.find((t) => pct >= t.min) || SCORE_TIERS[SCORE_TIERS.length - 1];
}

/* ── Animated SVG Score Ring ── */
function ScoreRing({ percentage, size = 160, strokeWidth = 10 }) {
  const ringRef = useRef(null);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const tier = getScoreTier(percentage);

  useEffect(() => {
    if (ringRef.current) {
      ringRef.current.style.strokeDashoffset = circumference;
      requestAnimationFrame(() => {
        ringRef.current.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)';
        ringRef.current.style.strokeDashoffset = offset;
      });
    }
  }, [circumference, offset]);

  return (
    <div className="score-ring-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="var(--color-border-light)" strokeWidth={strokeWidth} />
        <circle ref={ringRef} cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={tier.color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="score-ring-inner">
        <span className="score-ring-pct">{percentage}%</span>
        <span className="score-ring-emoji">{tier.emoji}</span>
      </div>
    </div>
  );
}

export default function Result() {
  const { attemptId } = useParams();
  const [loading, setLoading] = useState(true);
  const [resultData, setResultData] = useState(null);
  const [error, setError] = useState('');
  const [expandedQ, setExpandedQ] = useState(null);
  const currentUser = useAuthStore((s) => s.user);
  const reviewRefs = useRef({});

  useEffect(() => {
    let cancelled = false;
    const fetchResult = async () => {
      try {
        const sessionId = getGuestSessionId();
        const response = await api.get(`/quiz/attempts/${attemptId}/result`, {
          headers: { 'x-quiz-session-id': sessionId },
        });
        if (!cancelled) setResultData(response.data.data);
      } catch {
        if (!cancelled) setError('Failed to load results');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchResult();
    return () => { cancelled = true; };
  }, [attemptId]);

  const reviewItems = useMemo(() => {
    if (!resultData) return [];
    const questionMap = new Map(resultData.questions.map((q) => [q._id, q]));
    return resultData.attempt.answers
      .map((answer) => {
        const question = questionMap.get(String(answer.questionId)) || questionMap.get(answer.questionId);
        return question ? { answer, question } : null;
      })
      .filter(Boolean);
  }, [resultData]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '72px 0' }}><Spinner size={40} /></div>;
  }
  if (error) {
    return <div style={{ color: 'var(--color-danger)', textAlign: 'center', padding: '48px 16px' }}>{error}</div>;
  }
  if (!resultData) return null;

  const { attempt } = resultData;
  const analytics = attempt.analytics || {};
  const totalTimeMs = Number(attempt.totalTimeMs || 0) || Number(attempt.totalTime || 0) * 1000;
  const tier = getScoreTier(attempt.percentage);

  const correctCount = attempt.correctCount ?? analytics.correctCount ?? 0;
  const wrongCount = attempt.wrongCount ?? analytics.wrongCount ?? 0;
  const skippedCount = analytics.skippedCount ?? attempt.answers.filter((a) => !a.selectedAnswer).length;
  const avgTimeMs = analytics.averageTimePerQuestionMs || (attempt.totalQuestions > 0 ? totalTimeMs / attempt.totalQuestions : 0);

  const retakePath = `/quiz/${attempt.quizId?._id}`;

  const scrollToReview = (idx) => {
    setExpandedQ(idx);
    setTimeout(() => {
      reviewRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  return (
    <>
      <div className="r-shell">
        {/* ── Hero Section ── */}
        <div className="r-hero">
          <div className="r-hero-content">
            <ScoreRing percentage={attempt.percentage} />
            <div className="r-hero-text">
              <h1 className="r-hero-label">{tier.label}</h1>
              <p className="r-hero-title">{attempt.quizId?.title}</p>
              <div className="r-hero-summary">
                <span className="r-tag r-tag--success">✓ {correctCount} Correct</span>
                <span className="r-tag r-tag--danger">✗ {wrongCount} Wrong</span>
                {skippedCount > 0 && <span className="r-tag r-tag--muted">⏭ {skippedCount} Skipped</span>}
              </div>
              <div className="r-hero-badges">
                {attempt.instantFeedback && <Badge>Instant Feedback</Badge>}
                
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats Strip ── */}
        <div className="r-stats-strip">
          <div className="r-stat">
            <span className="r-stat-icon material-symbols-outlined">check_circle</span>
            <div><strong>{correctCount}/{attempt.totalQuestions}</strong><span>Score</span></div>
          </div>
          <div className="r-stat">
            <span className="r-stat-icon material-symbols-outlined">percent</span>
            <div><strong>{attempt.percentage}%</strong><span>Accuracy</span></div>
          </div>
          <div className="r-stat">
            <span className="r-stat-icon material-symbols-outlined">timer</span>
            <div><strong>{formatDurationMs(totalTimeMs)}</strong><span>Total Time</span></div>
          </div>
          <div className="r-stat">
            <span className="r-stat-icon material-symbols-outlined">avg_pace</span>
            <div><strong>{formatDurationMs(avgTimeMs)}</strong><span>Avg / Question</span></div>
          </div>
        </div>

        {/* ── Question Timeline ── */}
          <div className="r-section">
            <h2 className="r-section-title">Question Timeline</h2>
            <div className="r-timeline">
              {reviewItems.map(({ answer }, idx) => {
                const status = answer.isCorrect ? 'correct' : answer.selectedAnswer ? 'wrong' : 'skipped';
                const isOpen = expandedQ === idx;
                return (
                  <div key={answer.questionId || idx} className="r-pill-container" style={{ position: 'relative' }}>
                    <button
                      className={`r-pill r-pill--${status}`}
                      onClick={() => scrollToReview(idx)}
                      title={`Q${idx + 1}`}
                    >
                      {idx + 1}
                    </button>
                    {isOpen && <div className="r-timeline-active-dot" />}
                  </div>
                );
              })}
            </div>
          </div>

        {/* ── Question Review (Accordion) ── */}
          <div className="r-section">
            <h2 className="r-section-title">Review Answers</h2>
            <div className="r-review-list">
              {reviewItems.map(({ answer, question }, idx) => {
                const isOpen = expandedQ === idx;
                const status = answer.isCorrect ? 'correct' : answer.selectedAnswer ? 'wrong' : 'skipped';
                return (
                  <div key={`${question._id}-${idx}`} ref={(el) => (reviewRefs.current[idx] = el)}
                    className={`r-review ${isOpen ? 'r-review--open' : ''}`}>
                    <button className="r-review-header" onClick={() => setExpandedQ(isOpen ? null : idx)}>
                      <div className={`r-review-indicator r-review-indicator--${status}`}>
                        {status === 'correct' ? '✓' : status === 'wrong' ? '✗' : '—'}
                      </div>
                      <div className="r-review-info">
                        <span className="r-review-qnum">Q{idx + 1}</span>
                        <span className="r-review-qtext">{question.questionText}</span>
                      </div>
                      <span className={`material-symbols-outlined r-review-chevron ${isOpen ? 'r-review-chevron--open' : ''}`}>
                        expand_more
                      </span>
                    </button>

                    {isOpen && (
                      <div className="r-review-body">
                        <div className="r-review-meta">
                          <Badge variant={answer.isCorrect ? 'success' : answer.selectedAnswer ? 'danger' : 'warning'}>
                            {answer.isCorrect ? 'Correct' : answer.selectedAnswer ? 'Incorrect' : 'Skipped'}
                          </Badge>
                          <span className="r-review-time">{formatDurationMs(getAnswerTimeMs(answer))}</span>
                        </div>
                        <div className="r-review-options">
                          {question.options.map((option) => {
                            const isCorrectOpt = option.label === question.correctAnswer;
                            const isSelected = option.label === answer.selectedAnswer;
                            return (
                              <div key={option.label}
                                className={`r-opt ${isCorrectOpt ? 'r-opt--correct' : ''} ${isSelected && !answer.isCorrect ? 'r-opt--wrong' : ''}`}>
                                <span className="r-opt-label">{option.label}</span>
                                <span className="r-opt-text">{option.text}</span>
                                {isCorrectOpt && <span className="r-opt-badge">Correct</span>}
                                {isSelected && !answer.isCorrect && <span className="r-opt-badge r-opt-badge--wrong">Your Answer</span>}
                              </div>
                            );
                          })}
                        </div>
                        {question.explanation && (
                          <div className="r-explanation">
                            <strong>Explanation</strong>
                            <p>{question.explanation}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        {/* ── Actions ── */}
        <div className="r-actions">
            <Link to={retakePath} style={{ textDecoration: 'none' }}>
              <Button variant="secondary">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>replay</span>
                Retake Quiz
              </Button>
            </Link>
          <Link to="/dashboard" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>dashboard</span>
              Dashboard
            </Button>
          </Link>
          <Link to="/upload" style={{ textDecoration: 'none' }}>
            <Button>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>upload_file</span>
              Upload New
            </Button>
          </Link>
        </div>
      </div>

      <style>{resultStyles}</style>
    </>
  );
}

const resultStyles = `
  .r-shell {
    max-width: 860px;
    margin: 0 auto;
    padding: 24px 16px 48px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* ── Hero ── */
  .r-hero {
    background:
      radial-gradient(circle at 20% 30%, rgba(99, 102, 241, 0.06), transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(168, 85, 247, 0.04), transparent 50%),
      var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 24px;
    padding: 40px 32px;
  }

  .r-hero-content {
    display: flex;
    align-items: center;
    gap: 36px;
  }

  .score-ring-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .score-ring-inner {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .score-ring-pct {
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -0.04em;
    color: var(--color-text);
    line-height: 1;
  }

  .score-ring-emoji {
    font-size: 22px;
    margin-top: 4px;
  }

  .r-hero-text { flex: 1; min-width: 0; }

  .r-hero-label {
    font-size: clamp(26px, 4vw, 34px);
    font-weight: 800;
    letter-spacing: -0.03em;
    margin: 0 0 6px;
    color: var(--color-text);
  }

  .r-hero-title {
    font-size: 15px;
    color: var(--color-text-secondary);
    margin: 0 0 16px;
  }

  .r-hero-summary {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .r-tag {
    font-size: 13px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 10px;
  }

  .r-tag--success { background: rgba(34, 197, 94, 0.1); color: #16a34a; }
  .r-tag--danger { background: rgba(239, 68, 68, 0.1); color: #dc2626; }
  .r-tag--muted { background: var(--color-surface-alt); color: var(--color-text-muted); }

  .r-hero-badges { display: flex; gap: 8px; }

  /* ── Stats Strip ── */
  .r-stats-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .r-stat {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-radius: 16px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
  }

  .r-stat-icon {
    font-size: 22px;
    color: var(--color-primary);
    background: var(--color-primary-light);
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .r-stat div { display: flex; flex-direction: column; gap: 2px; }
  .r-stat strong { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; color: var(--color-text); }
  .r-stat span { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-muted); }

  /* ── Section ── */
  .r-section-title {
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin: 0 0 14px;
    color: var(--color-text);
  }

  /* ── Timeline ── */
  .r-timeline {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .r-pill {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }

  .r-pill:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }

  .r-pill--correct { background: rgba(34, 197, 94, 0.1); border-color: rgba(34, 197, 94, 0.3); color: #16a34a; }
  .r-pill--wrong { background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); color: #dc2626; }
  .r-pill--skipped { background: var(--color-surface-alt); color: var(--color-text-muted); }

  /* ── Review Accordion ── */
  .r-review-list { display: flex; flex-direction: column; gap: 6px; }

  .r-review {
    border: 1px solid var(--color-border);
    border-radius: 14px;
    overflow: hidden;
    background: var(--color-surface);
    transition: box-shadow 0.2s;
  }

  .r-review--open { box-shadow: 0 4px 20px rgba(0,0,0,0.06); }

  .r-review-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border: none;
    background: none;
    width: 100%;
    cursor: pointer;
    text-align: left;
  }

  .r-review-indicator {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 14px;
    flex-shrink: 0;
  }

  .r-review-indicator--correct { background: rgba(34, 197, 94, 0.12); color: #16a34a; }
  .r-review-indicator--wrong { background: rgba(239, 68, 68, 0.12); color: #dc2626; }
  .r-review-indicator--skipped { background: var(--color-surface-alt); color: var(--color-text-muted); }

  .r-review-info { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; }
  .r-review-qnum { font-size: 13px; font-weight: 700; color: var(--color-text-muted); flex-shrink: 0; }
  .r-review-qtext { font-size: 14px; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .r-review-chevron {
    font-size: 20px;
    color: var(--color-text-muted);
    transition: transform 0.2s;
    flex-shrink: 0;
  }

  .r-review-chevron--open { transform: rotate(180deg); }

  .r-review-body { padding: 0 16px 16px; }

  .r-review-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  .r-review-time { font-size: 13px; color: var(--color-text-muted); }

  .r-review-options { display: flex; flex-direction: column; gap: 8px; }

  .r-opt {
    display: grid;
    grid-template-columns: 36px 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
  }

  .r-opt--correct { border-color: rgba(22, 163, 74, 0.3); background: rgba(34, 197, 94, 0.06); }
  .r-opt--wrong { border-color: rgba(220, 38, 38, 0.3); background: rgba(239, 68, 68, 0.06); }

  .r-opt-label {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
    font-weight: 700;
    font-size: 12px;
    background: var(--color-surface);
  }

  .r-opt-text { font-size: 14px; line-height: 1.5; color: var(--color-text); }

  .r-opt-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    border-radius: 6px;
    background: rgba(34, 197, 94, 0.1);
    color: #16a34a;
    white-space: nowrap;
  }

  .r-opt-badge--wrong { background: rgba(239, 68, 68, 0.1); color: #dc2626; }

  .r-explanation {
    margin-top: 14px;
    padding: 16px;
    border-radius: 12px;
    background: rgba(79, 70, 229, 0.04);
    border: 1px solid rgba(79, 70, 229, 0.12);
  }

  .r-explanation strong { display: block; margin-bottom: 6px; color: var(--color-primary); font-size: 13px; }
  .r-explanation p { margin: 0; font-size: 14px; line-height: 1.6; color: var(--color-text-secondary); }

  /* ── Actions ── */
  .r-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    padding-top: 8px;
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .r-hero-content { flex-direction: column; text-align: center; }
    .r-hero-summary { justify-content: center; }
    .r-hero-badges { justify-content: center; }
    .r-stats-strip { grid-template-columns: repeat(2, 1fr); }
    .r-opt { grid-template-columns: 36px 1fr; }
    .r-opt-badge { grid-column: 2 / 3; }
  }

  @media (max-width: 480px) {
    .r-stats-strip { grid-template-columns: 1fr; }
    .r-actions { flex-direction: column; }
    .r-actions a, .r-actions button { width: 100%; }
  }
`;
