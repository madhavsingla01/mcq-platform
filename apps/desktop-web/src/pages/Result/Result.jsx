import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle, Percent, Timer, Zap, ChevronDown, EyeOff, RotateCcw, LayoutDashboard, Shield, Trophy, Lock } from 'lucide-react';
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
        ringRef.current.style.transition = 'stroke-dashoffset 0.3s cubic-bezier(0.23, 1, 0.32, 1)';
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
  const tier = getScoreTier(attempt.percentage ?? 0);

  const isChallenge = Boolean(
    resultData?.isChallenge ||
    attempt?.isChallenge ||
    attempt?.quizId?.isChallenge
  );
  const challengeId = attempt?.quizId?._id || attempt?.quizId;
  const deadlinePassed = resultData?.deadlinePassed ?? (
    attempt?.quizId?.deadlineAt ? new Date() >= new Date(attempt.quizId.deadlineAt) : true
  );
  const isQuarantined = isChallenge && (!deadlinePassed || attempt.percentage === null || attempt.score === null);

  const correctCount = attempt.correctCount ?? analytics.correctCount ?? 0;
  const wrongCount = attempt.wrongCount ?? analytics.wrongCount ?? 0;
  const answeredCount = attempt.answers.filter((answer) => Boolean(answer.selectedAnswer)).length;
  const skippedCount = Math.max((attempt.totalQuestions || attempt.answers.length) - answeredCount, 0);
  const avgTimeMs = analytics.averageTimePerQuestionMs || (attempt.totalQuestions > 0 ? totalTimeMs / attempt.totalQuestions : 0);

  const retakePath = `/quiz/${attempt.quizId?._id}`;

  const isReviewAllowed = !isQuarantined && resultData?.allowReview !== false && resultData?.attempt?.quizId?.settings?.allowReview !== false;
  const isExplanationAllowed = !isQuarantined && resultData?.showExplanation !== false && resultData?.attempt?.quizId?.settings?.showExplanation !== false;

  const scrollToReview = (idx) => {
    setExpandedQ(idx);
    setTimeout(() => {
      reviewRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  return (
    <div className="r-shell">
        {/* Sealed Submission Quarantine Banner */}
        {isQuarantined && (
          <div
            className="r-quarantine-banner"
            style={{
              background: 'rgba(255, 69, 0, 0.08)',
              border: '1px solid rgba(255, 69, 0, 0.3)',
              borderRadius: 12,
              padding: '16px 20px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(255, 69, 0, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#FF4500',
              }}
            >
              <Shield size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>
                Contest Submission Sealed
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#FBBF24', lineHeight: 1.4 }}>
                Your answers have been submitted. Scores and correct answers are quarantined until the contest deadline.
              </p>
            </div>
          </div>
        )}

        {/* ── Hero Section ── */}
        <div className="r-hero">
          <div className="r-hero-content">
            {isQuarantined ? (
              <div
                className="score-ring-wrap"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 160,
                  height: 160,
                  borderRadius: '50%',
                  background: 'rgba(255, 69, 0, 0.08)',
                  border: '2px dashed rgba(255, 69, 0, 0.4)',
                }}
              >
                <Lock size={36} color="#FF4500" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#FF4500', marginTop: 8 }}>
                  SEALED
                </span>
              </div>
            ) : (
              <ScoreRing percentage={attempt.percentage ?? 0} />
            )}
            <div className="r-hero-text">
              <h1 className="r-hero-label">{isQuarantined ? 'Submission Sealed' : tier.label}</h1>
              <p className="r-hero-title">{attempt.quizId?.title || (isChallenge ? 'Competitive Contest' : 'Quiz')}</p>
              {!isQuarantined ? (
                <div className="r-hero-summary">
                  <span className="r-tag r-tag--success">✓ {correctCount} Correct</span>
                  <span className="r-tag r-tag--danger">✗ {wrongCount} Wrong</span>
                  {skippedCount > 0 && <span className="r-tag r-tag--muted">⭘ {skippedCount} Skipped</span>}
                </div>
              ) : (
                <div className="r-hero-summary">
                  <span className="r-tag r-tag--muted">Answers Recorded</span>
                  <span className="r-tag r-tag--muted">Single Attempt Finalized</span>
                </div>
              )}
              <div className="r-hero-badges">
                {isChallenge && <Badge variant="warning">Competitive Contest</Badge>}
                {attempt.instantFeedback && <Badge>Instant Feedback</Badge>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats Strip ── */}
        <div className="r-stats-strip">
          <div className="r-stat">
            <span className="r-stat-icon">{isQuarantined ? <Lock size={18} /> : <CheckCircle size={18} />}</span>
            <div><strong>{isQuarantined ? 'Sealed' : `${correctCount}/${attempt.totalQuestions}`}</strong><span>Score</span></div>
          </div>
          <div className="r-stat">
            <span className="r-stat-icon">{isQuarantined ? <Shield size={18} /> : <Percent size={18} />}</span>
            <div><strong>{isQuarantined ? 'Quarantined' : `${attempt.percentage}%`}</strong><span>Accuracy</span></div>
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

        {/* ── Actions ── */}
        <div className="r-actions">
          {isChallenge ? (
            <Link to={`/challenges/${challengeId}/leaderboard`} style={{ textDecoration: 'none' }}>
              <Button variant="primary">
                <Trophy size={16} />
                View Contest Standings
              </Button>
            </Link>
          ) : (
            <Link to={retakePath} style={{ textDecoration: 'none' }}>
              <Button variant="secondary">
                <RotateCcw size={16} />
                Retake Quiz
              </Button>
            </Link>
          )}
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
