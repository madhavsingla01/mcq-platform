import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Award, CheckCircle, XCircle, RotateCcw, Compass, ArrowRight, Share2, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { attemptApi } from '../../api/client';
import { useQuizStore } from '../../store/quizStore';

export default function Result() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const { currentQuiz, reset } = useQuizStore();

  const [resultData, setResultData] = useState(null);
  const [reviewQuestions, setReviewQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedIndex, setExpandedIndex] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    async function loadResult() {
      try {
        const resultRes = await attemptApi.getResult(attemptId);
        if (!mounted) return;

        const payload = resultRes.data?.data || resultRes.data || {};
        const attempt = payload.attempt || payload;
        const rawQuestions = payload.questions || [];

        setResultData(attempt);

        // Build combined review list mapping user's answer to question details
        const answersMap = new Map((attempt.answers || []).map((a) => [String(a.questionId), a]));
        const combined = (rawQuestions || []).map((q, idx) => {
          const userAns = answersMap.get(String(q._id));
          const selectedLabel = userAns?.selectedAnswer || null;
          const isCorrect = userAns ? Boolean(userAns.isCorrect) : false;

          // Find option texts
          const selectedOption = (q.options || []).find((opt) => opt.label === selectedLabel);
          const correctOption = (q.options || []).find((opt) => opt.label === q.correctAnswer || opt.isCorrect);

          const selectedText = selectedLabel
            ? (selectedOption ? `${selectedLabel}. ${selectedOption.text}` : selectedLabel)
            : 'Skipped / Unanswered';
          const correctText = q.correctAnswer
            ? (correctOption ? `${q.correctAnswer}. ${correctOption.text}` : q.correctAnswer)
            : 'N/A';

          return {
            ...q,
            selectedAnswer: selectedText,
            correctAnswer: correctText,
            isCorrect,
            explanation: q.explanation || '',
          };
        });

        setReviewQuestions(combined);
      } catch (err) {
        console.error('Failed to load attempt result from backend:', err);
        if (mounted) setError('Could not load attempt details.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (attemptId) {
      loadResult();
    }

    return () => { mounted = false; };
  }, [attemptId]);

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>Evaluating Results with Backend...</span>
      </div>
    );
  }

  const scorePercent = Math.round(resultData?.percentage ?? 0);
  const correctCount = resultData?.correctCount ?? 0;
  const totalCount = resultData?.totalQuestions || (resultData?.correctCount || 0) + (resultData?.wrongCount || 0) || 1;
  const incorrectCount = resultData?.wrongCount ?? Math.max(0, totalCount - correctCount);
  const passed = scorePercent >= 60;

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Result Hero Header */}
      <div style={{
        background: 'linear-gradient(145deg, #18181B 0%, #101012 100%)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '14px',
      }}>
        {/* Real Score Circle */}
        <div style={{
          width: '96px',
          height: '96px',
          borderRadius: '50%',
          border: `4px solid ${passed ? 'var(--color-success)' : 'var(--color-accent)'}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255, 255, 255, 0.02)',
        }}>
          <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.5px' }}>
            {scorePercent}%
          </span>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Score
          </span>
        </div>

        <div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-text)', marginBottom: '4px' }}>
            {passed ? 'Quiz Passed! Outstanding' : 'Attempt Complete'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            {passed ? 'Your submission has been evaluated and recorded.' : 'Review your breakdown below to strengthen weak areas.'}
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '6px' }}>
          <button
            onClick={() => {
              reset();
              navigate('/explore');
            }}
            style={{
              flex: 1,
              height: '44px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--color-accent)',
              color: '#000000',
              fontWeight: 800,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: 'none',
            }}
            className="interactive-tap"
          >
            <Compass size={16} fill="#000000" />
            <span>Next Quiz</span>
          </button>

          <button
            onClick={() => {
              reset();
              navigate('/dashboard');
            }}
            style={{
              flex: 1,
              height: '44px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              fontWeight: 700,
              fontSize: '14px',
            }}
            className="interactive-tap"
          >
            Dashboard
          </button>
        </div>
      </div>

      {/* Real Breakdown Grid from Backend */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-control)',
          padding: '12px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-success)' }}>
            {correctCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Correct</div>
        </div>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-control)',
          padding: '12px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-danger)' }}>
            {incorrectCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Incorrect</div>
        </div>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-control)',
          padding: '12px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-info)' }}>
            {totalCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Total MCQs</div>
        </div>
      </div>

      {/* Real Question Review Accordion from Backend */}
      {reviewQuestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
            Detailed Review ({reviewQuestions.length} Questions)
          </div>

          {reviewQuestions.map((q, idx) => {
            const isCorrect = Boolean(q.isCorrect);
            const isExpanded = expandedIndex === idx;

            return (
              <div
                key={q._id || q.questionId || idx}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-card)',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div 
                  onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {isCorrect ? (
                      <CheckCircle size={18} color="var(--color-success)" />
                    ) : (
                      <XCircle size={18} color="var(--color-danger)" />
                    )}
                    <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text)' }}>
                      Question {idx + 1}
                    </span>
                  </div>
                  {isExpanded ? <ChevronUp size={16} color="var(--color-text-muted)" /> : <ChevronDown size={16} color="var(--color-text-muted)" />}
                </div>

                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                  {q.questionText || q.question || 'Question Prompt'}
                </div>

                {isExpanded && (
                  <div style={{
                    paddingTop: '10px',
                    borderTop: '1px solid var(--color-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    fontSize: '12px',
                  }}>
                    {q.correctAnswer && (
                      <div style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                        Correct: {typeof q.correctAnswer === 'object' ? (q.correctAnswer.text || q.correctAnswer.label) : q.correctAnswer}
                      </div>
                    )}
                    {q.selectedAnswer && !isCorrect && (
                      <div style={{ color: 'var(--color-danger)', fontWeight: 500 }}>
                        Your Answer: {typeof q.selectedAnswer === 'object' ? (q.selectedAnswer.text || q.selectedAnswer.label) : q.selectedAnswer}
                      </div>
                    )}
                    {q.explanation && (
                      <div style={{ color: 'var(--color-text-muted)', background: 'var(--bg-elevated)', padding: '8px 10px', borderRadius: '8px', lineHeight: 1.4 }}>
                        💡 {q.explanation}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
