import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle, Percent, Timer, Zap, ChevronDown, EyeOff, RotateCcw, LayoutDashboard } from 'lucide-react';
import api from '../../api/axios';
import { Badge, Button, Spinner } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { formatDurationMs, getGuestSessionId } from '../../utils/quizSession';
import './Result.css';

const getAnswerTimeMs = (answer) => Number(answer?.timeTakenMs || 0) || Number(answer?.timeTaken || 0) * 1000;

const SCORE_TIERS = [
  { min: 90, emoji: 'ðŸ†', label: 'Outstanding', color: 'var(--color-primary)' },
  { min: 75, emoji: 'â­', label: 'Excellent', color: 'var(--color-primary)' },
  { min: 50, emoji: 'ðŸ‘', label: 'Good Work', color: 'var(--color-primary)' },
  { min: 0, emoji: 'ðŸ’ª', label: 'Keep Practicing', color: 'var(--color-primary)' },
];

function getScoreTier(pct) {
  return SCORE_TIERS.find((t) => pct >= t.min) || SCORE_TIERS[SCORE_TIERS.length - 1];
}

/* â”€â”€ Animated SVG Score Ring â”€â”€ */
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
      } catch (err) {
        if (!cancelled) {
          console.error('[Result Load Error]:', err?.response?.data || err.message);
          setError(err?.response?.data?.message || 'Failed to load results');
        }
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
  const answeredCount = attempt.answers.filter((answer) => Boolean(answer.selectedAnswer)).length;
  const skippedCount = Math.max((attempt.totalQuestions || attempt.answers.length) - answeredCount, 0);
  const avgTimeMs = analytics.averageTimePerQuestionMs || (attempt.totalQuestions > 0 ? totalTimeMs / attempt.totalQuestions : 0);

  const retakePath = `/quiz/${attempt.quizId?._id}`;

  const isReviewAllowed = resultData?.allowReview !== false && resultData?.attempt?.quizId?.settings?.allowReview !== false;
  const isExplanationAllowed = resultData?.showExplanation !== false && resultData?.attempt?.quizId?.settings?.showExplanation !== false;

  const scrollToReview = (idx) => {
    setExpandedQ(idx);
    setTimeout(() => {
      reviewRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  return (
    <div className="r-shell">
        {/* â”€â”€ Hero Section â”€â”€ */}
        <div className="r-hero">
          <div className="r-hero-content">
            <ScoreRing percentage={attempt.percentage} />
            <div className="r-hero-text">
              <h1 className="r-hero-label">{tier.label}</h1>
              <p className="r-hero-title">{attempt.quizId?.title}</p>
              <div className="r-hero-summary">
                <span className="r-tag r-tag--success">âœ“ {correctCount} Correct</span>
                <span className="r-tag r-tag--danger">âœ— {wrongCount} Wrong</span>
                {skippedCount > 0 && <span className="r-tag r-tag--muted">â­ {skippedCount} Skipped</span>}
              </div>
              <div className="r-hero-badges">
                {attempt.instantFeedback && <Badge>Instant Feedback</Badge>}
                
              </div>
            </div>
          </div>
        </div>

        {/* â”€â”€ Stats Strip â”€â”€ */}
        <div className="r-stats-strip">
          <div className="r-stat">
            <span className="r-stat-icon"><CheckCircle size={18} /></span>
            <div><strong>{correctCount}/{attempt.totalQuestions}</strong><span>Score</span></div>
          </div>
          <div className="r-stat">
            <span className="r-stat-icon"><Percent size={18} /></span>
            <div><strong>{attempt.percentage}%</strong><span>Accuracy</span></div>
          </div>
          <div className="r-stat">
            <span className="r-stat-icon"><Timer size={18} /></span>
            <div><strong>{formatDurationMs(totalTimeMs)}</strong><span>Total Time</span></div>
          </div>
          <div className="r-stat">
            <span className="r-stat-icon"><Zap size={18} /></span>
            <div><strong>{formatDurationMs(avgTimeMs)}</strong><span>Avg / Question</span></div>
          </div>
        </div>

        {/* â”€â”€ Question Timeline â”€â”€ */}
        {isReviewAllowed && reviewItems.length > 0 ? (
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
        ) : null}

        {/* â”€â”€ Question Review (Accordion) â”€â”€ */}
        {isReviewAllowed && reviewItems.length > 0 ? (
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
                        {status === 'correct' ? 'âœ“' : status === 'wrong' ? 'âœ—' : 'â€”'}
                      </div>
                      <div className="r-review-info">
                        <span className="r-review-qnum">Q{idx + 1}</span>
                        <span className="r-review-qtext">{question.questionText}</span>
                      </div>
                      <ChevronDown
                        size={18}
                        className={`r-review-chevron ${isOpen ? 'r-review-chevron--open' : ''}`}
                      />
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
                        {isExplanationAllowed && question.explanation ? (
                          <div className="r-explanation">
                            <strong>Explanation</strong>
                            <p>{question.explanation}</p>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : !isReviewAllowed ? (
          <div className="r-section" style={{ textAlign: 'center', padding: '36px 20px', background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
            <EyeOff size={36} style={{ color: 'var(--color-text-secondary)', marginBottom: 12, margin: '0 auto 12px', display: 'block' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Question Review Restricted</h3>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', maxWidth: 440, margin: '0 auto' }}>
              Detailed question-by-question review is restricted by the creator for this quiz.
            </p>
          </div>
        ) : null}

        {/* â”€â”€ Actions â”€â”€ */}
        <div className="r-actions">
            <Link to={retakePath} style={{ textDecoration: 'none' }}>
              <Button variant="secondary">
                <RotateCcw size={16} />
                Retake Quiz
              </Button>
            </Link>
          <Link to="/dashboard" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">
              <LayoutDashboard size={16} />
              Dashboard
            </Button>
          </Link>
        </div>
      </div>
  );
}
