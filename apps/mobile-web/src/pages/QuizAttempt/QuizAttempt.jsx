import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Clock, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, Send } from 'lucide-react';
import { useQuizStore } from '../../store/quizStore';

export default function QuizAttempt() {
  const { quizId } = useParams();
  const navigate = useNavigate();

  const {
    currentQuiz,
    questions,
    currentIndex,
    selectedAnswers,
    timeRemaining,
    isLoading,
    isSubmitting,
    error,
    startQuizAttempt,
    selectOption,
    nextQuestion,
    prevQuestion,
    goToQuestion,
    tickTimer,
    submitAttempt,
    reset,
  } = useQuizStore();

  const [showExitModal, setShowExitModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Initialize Quiz Attempt from live backend
  useEffect(() => {
    if (quizId) {
      startQuizAttempt(quizId);
    }
    return () => {
      // clean up on unmount
    };
  }, [quizId]);

  // Live Timer Tick
  useEffect(() => {
    const timer = setInterval(() => {
      tickTimer();
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleFinish = async () => {
    setShowSubmitModal(false);
    const res = await submitAttempt();
    if (res?.attemptId) {
      navigate(`/result/${res.attemptId}`);
    } else {
      navigate('/dashboard');
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', background: 'var(--bg-base)' }}>
        <div style={{ width: '38px', height: '38px', borderRadius: '50%', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent)', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          Loading Quiz from Microservice...
        </span>
      </div>
    );
  }

  if (error || !questions || questions.length === 0) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', background: 'var(--bg-base)' }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: 'var(--radius-pill)',
          background: 'rgba(255, 69, 58, 0.12)',
          color: 'var(--color-danger)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
        }}>
          <AlertTriangle size={28} />
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-text)', marginBottom: '8px' }}>
          Unable to Open Quiz
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', maxWidth: '320px', lineHeight: 1.5, marginBottom: '24px' }}>
          {error || 'This quiz has no questions configured yet or is currently unavailable.'}
        </p>
        <button
          onClick={() => {
            reset();
            navigate('/explore');
          }}
          style={{
            height: '46px',
            padding: '0 24px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--color-accent)',
            color: '#000000',
            fontWeight: 800,
            fontSize: '14px',
          }}
        >
          Explore Other Quizzes
        </button>
      </div>
    );
  }

  const currentQ = questions[currentIndex] || questions[0];
  const progressPercent = ((currentIndex + 1) / questions.length) * 100;
  const answeredCount = Object.keys(selectedAnswers).length;
  const isFinalQuestion = currentIndex === questions.length - 1;
  const currentSelectedOption = selectedAnswers[currentIndex];

  // Options normalization
  const rawOptions = currentQ.options || [];
  const options = rawOptions.map((opt) => {
    if (typeof opt === 'object' && opt !== null) {
      return opt.text || opt.label || opt.value || '';
    }
    return String(opt);
  });

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-base)',
      position: 'relative',
    }}>
      {/* Sticky Header with Live Countdown Timer & Progress */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(10, 10, 12, 0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--color-border)',
        paddingTop: 'var(--safe-top)',
      }}>
        <div style={{
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
        }}>
          {/* Exit Button */}
          <button
            onClick={() => setShowExitModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: 'var(--color-text-secondary)',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            <ChevronLeft size={20} />
            <span>Exit</span>
          </button>

          {/* Question Counter Pill */}
          <div style={{
            fontSize: '13px',
            fontWeight: 700,
            background: 'var(--bg-elevated)',
            padding: '4px 12px',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--color-border)',
          }}>
            Question {currentIndex + 1} / {questions.length}
          </div>

          {/* Countdown Timer */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: timeRemaining < 120 ? 'var(--color-danger)' : 'var(--color-accent)',
            fontWeight: 700,
            fontSize: '14px',
            fontFamily: 'var(--font-mono)',
          }}>
            <Clock size={16} />
            <span>{formatTime(timeRemaining)}</span>
          </div>
        </div>

        {/* Linear Progress Bar */}
        <div style={{ width: '100%', height: '3px', background: 'var(--color-border)' }}>
          <div style={{
            width: `${progressPercent}%`,
            height: '100%',
            background: 'var(--color-accent)',
            transition: 'width var(--duration-normal) var(--ease-out)',
          }} />
        </div>
      </header>

      {/* Main Question Body */}
      <div style={{
        flex: 1,
        padding: '20px 16px 120px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        {/* Question Text from MongoDB */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          padding: '18px',
        }}>
          <h2 style={{
            fontSize: '17px',
            fontWeight: 700,
            lineHeight: 1.5,
            color: 'var(--color-text)',
            letterSpacing: '-0.3px',
          }}>
            {currentQ.questionText || currentQ.question || 'Select the correct answer below:'}
          </h2>

          {currentQ.codeSnippet && (
            <pre style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: 'var(--radius-control)',
              background: '#050505',
              border: '1px solid var(--color-border)',
              fontSize: '13px',
              fontFamily: 'var(--font-mono)',
              overflowX: 'auto',
              color: '#f4f4f5',
            }}>
              <code>{currentQ.codeSnippet}</code>
            </pre>
          )}
        </div>

        {/* 48px Tactile Radio Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {options.map((optionText, optIdx) => {
            const isSelected = currentSelectedOption === optIdx;
            const letter = String.fromCharCode(65 + optIdx); // A, B, C, D

            return (
              <div
                key={optIdx}
                onClick={() => selectOption(currentIndex, optIdx)}
                style={{
                  minHeight: '52px', /* Tactile 48px+ touch target */
                  background: isSelected ? 'rgba(255, 69, 0, 0.08)' : 'var(--bg-card)',
                  border: isSelected ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-card)',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  cursor: 'pointer',
                  transition: 'all var(--duration-fast) var(--ease-out)',
                  touchAction: 'manipulation',
                }}
                className="interactive-tap"
              >
                {/* Option Badge */}
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: isSelected ? 'var(--color-accent)' : 'var(--bg-elevated)',
                  color: isSelected ? '#000000' : 'var(--color-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '14px',
                  flexShrink: 0,
                  transition: 'background var(--duration-fast) var(--ease-out)',
                }}>
                  {letter}
                </div>

                {/* Option Text */}
                <span style={{
                  fontSize: '15px',
                  fontWeight: isSelected ? 600 : 400,
                  color: isSelected ? 'var(--color-text)' : 'var(--color-text-secondary)',
                  flex: 1,
                  lineHeight: 1.4,
                }}>
                  {optionText}
                </span>

                {isSelected && (
                  <CheckCircle2 size={18} color="var(--color-accent)" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Bottom Navigation Bar */}
      <footer style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        background: 'rgba(10, 10, 12, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--color-border)',
        padding: '12px 16px calc(12px + var(--safe-bottom)) 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        maxWidth: '480px',
        margin: '0 auto',
      }}>
        {/* Previous Button */}
        <button
          onClick={prevQuestion}
          disabled={currentIndex === 0}
          style={{
            height: '46px',
            padding: '0 16px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--color-border)',
            color: currentIndex === 0 ? 'var(--color-text-dim)' : 'var(--color-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 600,
            fontSize: '14px',
            opacity: currentIndex === 0 ? 0.5 : 1,
          }}
          className="interactive-tap"
        >
          <ArrowLeft size={16} />
          <span>Prev</span>
        </button>

        {/* Question Jump Dots */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', maxWidth: '120px', padding: '4px' }}>
          {questions.map((_, idx) => (
            <div
              key={idx}
              onClick={() => goToQuestion(idx)}
              style={{
                width: idx === currentIndex ? '16px' : '6px',
                height: '6px',
                borderRadius: 'var(--radius-pill)',
                background: idx === currentIndex 
                  ? 'var(--color-accent)' 
                  : selectedAnswers[idx] !== undefined 
                    ? 'var(--color-text-secondary)' 
                    : 'var(--color-border)',
                transition: 'all var(--duration-fast) var(--ease-out)',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>

        {/* Next / Submit Button */}
        {isFinalQuestion ? (
          <button
            onClick={() => setShowSubmitModal(true)}
            style={{
              height: '46px',
              padding: '0 20px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--color-accent)',
              color: '#000000',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 800,
              fontSize: '14px',
              boxShadow: 'none',
            }}
            className="interactive-tap"
          >
            <span>Submit</span>
            <Send size={15} />
          </button>
        ) : (
          <button
            onClick={nextQuestion}
            style={{
              height: '46px',
              padding: '0 20px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--color-accent)',
              color: '#000000',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 800,
              fontSize: '14px',
              boxShadow: 'none',
            }}
            className="interactive-tap"
          >
            <span>Next</span>
            <ArrowRight size={16} />
          </button>
        )}
      </footer>

      {/* Exit Confirmation Modal */}
      {showExitModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            padding: '22px',
            width: '100%',
            maxWidth: '340px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            textAlign: 'center',
          }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-pill)',
              background: 'rgba(255, 69, 58, 0.15)',
              color: 'var(--color-danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
            }}>
              <AlertTriangle size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '18px', color: 'var(--color-text)', marginBottom: '6px' }}>
                Exit Quiz?
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                Are you sure you want to exit? Your progress is saved in your session.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowExitModal(false)}
                style={{
                  flex: 1,
                  height: '42px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--color-text)',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Resume
              </button>
              <button
                onClick={() => {
                  setShowExitModal(false);
                  reset();
                  navigate('/dashboard');
                }}
                style={{
                  flex: 1,
                  height: '42px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--color-danger)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '14px',
                }}
              >
                Exit Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            padding: '22px',
            width: '100%',
            maxWidth: '340px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            textAlign: 'center',
          }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-pill)',
              background: 'rgba(255, 69, 0, 0.15)',
              color: 'var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto',
            }}>
              <CheckCircle2 size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '18px', color: 'var(--color-text)', marginBottom: '6px' }}>
                Submit to Backend?
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                You have answered {answeredCount} of {questions.length} questions. Ready to submit and evaluate your score?
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowSubmitModal(false)}
                style={{
                  flex: 1,
                  height: '42px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--color-text)',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Review
              </button>
              <button
                onClick={handleFinish}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  height: '42px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--color-accent)',
                  color: '#000000',
                  fontWeight: 800,
                  fontSize: '14px',
                  boxShadow: 'none',
                }}
              >
                {isSubmitting ? 'Evaluating...' : 'Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
