import { useEffect, useState, useRef } from 'react';
import api from '../../api/axios';
import { Card, Spinner, Button } from '../ui';

export default function AttemptDetailView({ quizId, attemptId, onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'correct', 'wrong', 'unanswered'
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [expandedExplanations, setExpandedExplanations] = useState(new Set());
  const pageSize = 10;
  
  const questionRefs = useRef({});

  useEffect(() => {
    const fetchAttemptData = async () => {
      try {
        const res = await api.get(`/quiz/${quizId}/attempt/${attemptId}/result`);
        setData(res.data.data);
      } catch (err) {
        console.error(err);
        setError('Failed to load attempt details');
      } finally {
        setLoading(false);
      }
    };
    fetchAttemptData();
  }, [quizId, attemptId]);

  useEffect(() => {
    setPage(1);
  }, [filter, searchQuery]);

  const toggleExplanation = (id) => {
    setExpandedExplanations(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scrollToQuestion = (id) => {
    const el = questionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

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
        <Button onClick={onBack}>Back to Attempts</Button>
      </div>
    );
  }

  const { attempt, questions } = data;

  const correctAnswers = attempt.correctCount ?? attempt.answers.filter(a => a.isCorrect).length;
  const wrongAnswers = attempt.wrongCount ?? attempt.answers.filter(a => !a.isCorrect && a.selectedAnswer !== null).length;
  const unansweredCount = attempt.unansweredCount ?? attempt.answers.filter(a => a.selectedAnswer === null).length;
  const totalTime = Number(attempt.totalTime || 0) || attempt.answers.reduce((acc, curr) => acc + (curr.timeTaken || 0), 0);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Map each question to include its answer status for easy filtering
  const questionsWithStatus = questions.map(q => {
    const answerData = attempt.answers.find(a => String(a.questionId) === String(q._id));
    let status = 'unanswered';
    if (answerData) {
      if (answerData.isCorrect) status = 'correct';
      else if (answerData.selectedAnswer !== null) status = 'wrong';
    }
    return { ...q, answerData, status };
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', backgroundColor: '#000000', color: '#ffffff' }}>
      
      {/* Sticky Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border, #333)', display: 'flex', alignItems: 'center', gap: '16px', position: 'sticky', top: 0, backgroundColor: '#000000', zIndex: 10, borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#1a1a1a', color: '#ffffff' }}>
          ←
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px' }}>Attempt Review</h2>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary, #9ca3af)', marginTop: '4px' }}>
            Submitted on {new Date(attempt.createdAt).toLocaleString()}
          </div>
        </div>
      </div>

      <div style={{ padding: '24px', overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', gap: '24px' }}>
        
        {/* Main Content (Questions List) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Overview Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '12px', backgroundColor: '#1a1a1a', padding: '16px', borderRadius: '8px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#9ca3af' }}>Score</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: attempt.percentage >= 50 ? '#10b981' : '#ef4444' }}>{attempt.score}/{attempt.totalMarks || attempt.totalQuestions}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#9ca3af' }}>Status</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{attempt.percentage >= 50 ? 'Pass' : 'Fail'}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#9ca3af' }}>Correct</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>{correctAnswers}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#9ca3af' }}>Wrong</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ef4444' }}>{wrongAnswers}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#9ca3af' }}>Skipped</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f59e0b' }}>{unansweredCount}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#9ca3af' }}>Time</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{formatTime(totalTime)}</div>
            </div>
          </div>

          {/* Filters & Search */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input 
              type="text" 
              placeholder="Search questions..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, padding: '10px 16px', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#1a1a1a', color: '#fff' }}
            />
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)}
              style={{ padding: '10px 16px', borderRadius: '6px', border: '1px solid #333', backgroundColor: '#1a1a1a', color: '#fff' }}
            >
              <option value="all">All Questions</option>
              <option value="correct">Correct Only</option>
              <option value="wrong">Wrong Only</option>
              <option value="unanswered">Unanswered Only</option>
            </select>
          </div>

          {/* Questions List */}
          {filteredQuestions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
              No questions match your criteria.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {paginatedQuestions.map((q) => {
                const { answerData, status } = q;
                const isExpanded = expandedExplanations.has(q._id);
                
                let borderColor = '#333';
                let statusLabel = 'Unanswered';
                let statusColor = '#f59e0b'; // warning
                
                if (status === 'correct') {
                  borderColor = '#10b981'; // success
                  statusLabel = 'Correct';
                  statusColor = '#10b981';
                } else if (status === 'wrong') {
                  borderColor = '#ef4444'; // danger
                  statusLabel = 'Wrong';
                  statusColor = '#ef4444';
                }

                return (
                  <Card 
                    key={q._id} 
                    ref={el => questionRefs.current[q._id] = el}
                    style={{ borderLeft: `4px solid ${borderColor}`, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#111827', borderColor: '#333' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h4 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>Question {q.questionNumber}</h4>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '12px', backgroundColor: `${statusColor}20`, color: statusColor, fontWeight: 'bold' }}>
                          {statusLabel}
                        </span>
                        <span style={{ fontSize: '12px', color: '#9ca3af' }}>Marks: {answerData?.marksAwarded ?? 0}/{q.marks ?? 1}</span>
                        <span style={{ fontSize: '12px', color: '#9ca3af' }}>Time: {answerData?.timeTaken || 0}s</span>
                      </div>
                    </div>
                    
                    <p style={{ margin: 0, fontSize: '16px', lineHeight: '1.5', color: '#e5e7eb' }}>{q.questionText}</p>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {q.options.map((opt, i) => {
                        const isSelected = answerData?.selectedAnswer === opt.label;
                        const isCorrectOption = opt.isCorrect === true || q.correctAnswer === opt.label;
                        
                        let bg = '#000000';
                        let color = '#d1d5db';
                        let border = '1px solid #333';
                        let indicatorText = null;
                        
                        if (isCorrectOption) {
                          bg = 'rgba(16, 185, 129, 0.1)';
                          border = '1px solid #10b981';
                          color = '#10b981';
                          indicatorText = isSelected ? 'Correctly Selected' : 'Correct Answer';
                        } else if (isSelected && !isCorrectOption) {
                          bg = 'rgba(239, 68, 68, 0.1)';
                          border = '1px solid #ef4444';
                          color = '#ef4444';
                          indicatorText = 'Your Answer';
                        }

                        return (
                          <div key={i} style={{ padding: '12px 16px', borderRadius: '6px', backgroundColor: bg, border, color, display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid currentColor', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', flexShrink: 0 }}>
                              {opt.label}
                            </span>
                            <span style={{ flex: 1 }}>{opt.text}</span>
                            {indicatorText && <span style={{ fontSize: '12px', fontWeight: 'bold', marginLeft: 'auto' }}>{indicatorText}</span>}
                          </div>
                        );
                      })}
                    </div>
                    
                    {q.explanation && (
                      <div style={{ marginTop: '8px' }}>
                        <button 
                          onClick={() => toggleExplanation(q._id)}
                          style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 0, fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          {isExpanded ? 'Hide Explanation' : 'View Explanation'}
                        </button>
                        
                        {isExpanded && (
                          <div style={{ marginTop: '12px', padding: '16px', backgroundColor: '#1a1a1a', borderRadius: '8px', fontSize: '14px', color: '#d1d5db', borderLeft: '3px solid #3b82f6', animation: 'fadeIn 0.2s ease-in-out' }}>
                            <strong style={{ display: 'block', marginBottom: '8px', color: '#fff' }}>Solution:</strong>
                            {q.explanation}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}

              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, color: '#9ca3af', fontSize: 13 }}>
                  <Button variant="secondary" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                    Previous
                  </Button>
                  <span>Page {currentPage} of {totalPages}</span>
                  <Button variant="secondary" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar Palette */}
        <div style={{ width: '260px', flexShrink: 0, display: 'none', '@media(minWidth: 768px)': { display: 'block' } }} className="palette-sidebar">
          <div style={{ position: 'sticky', top: '24px', backgroundColor: '#1a1a1a', padding: '20px', borderRadius: '12px', border: '1px solid #333' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#fff' }}>Question Palette</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
              {questionsWithStatus.map((q, index) => {
                let bgColor = '#333';
                if (q.status === 'correct') bgColor = '#10b981';
                else if (q.status === 'wrong') bgColor = '#ef4444';
                else bgColor = '#f59e0b';
                
                return (
                  <button
                    key={q._id}
                    onClick={() => scrollToQuestion(q._id)}
                    style={{
                      aspectRatio: '1',
                      border: 'none',
                      borderRadius: '4px',
                      backgroundColor: bgColor,
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'transform 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    title={`Question ${q.questionNumber}`}
                  >
                    {q.questionNumber}
                  </button>
                );
              })}
            </div>
            
            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#9ca3af' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '12px', height: '12px', backgroundColor: '#10b981', borderRadius: '2px' }}></span> Correct
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '12px', height: '12px', backgroundColor: '#ef4444', borderRadius: '2px' }}></span> Wrong
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '12px', height: '12px', backgroundColor: '#f59e0b', borderRadius: '2px' }}></span> Unanswered
              </div>
            </div>
            
          </div>
        </div>

      </div>
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
          .palette-sidebar {
            display: none !important;
          }
        }
        .palette-sidebar {
          display: block;
        }
      `}</style>
    </div>
  );
}
