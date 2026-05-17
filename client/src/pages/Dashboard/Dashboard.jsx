import { useEffect, useState, useCallback } from 'react';
import { Card, Button, Spinner, Badge } from '../../components/ui';
import { Link, useNavigate } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import api from '../../api/axios';
import QuizDetailsModal from '../../components/QuizModal/QuizDetailsModal';
import OpenLinkModal from '../../components/Dashboard/OpenLinkModal';

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export default function Dashboard() {
  const navigate = useNavigate();
  
  const [quizzes, setQuizzes] = useState([]);
  const [recentQuizzes, setRecentQuizzes] = useState([]);
  const [joinedSessions, setJoinedSessions] = useState([]);
  const [activeAttempts, setActiveAttempts] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedQuizId, setSelectedQuizId] = useState(null);
  const [isOpenLinkModalOpen, setIsOpenLinkModalOpen] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [myQuizzesRes, joinedRes, attemptsRes, recentRes] = await Promise.all([
        api.get('/quiz/my'),
        api.get('/sessions/joined'),
        api.get('/attempts/in-progress'),
        api.get('/activity/recent-quizzes')
      ]);
      
      setQuizzes(myQuizzesRes.data.data.quizzes || []);
      setJoinedSessions(joinedRes.data.data.sessions || []);
      setActiveAttempts(attemptsRes.data.data.attempts || []);
      setRecentQuizzes(recentRes.data.data.quizzes || []);
    } catch {
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleModalClose = useCallback(() => {
    setSelectedQuizId(null);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <Spinner size={40} />
      </div>
    );
  }

  return (
    <>
      <div className="qf-dash-shell">
        <div className="qf-dash-header">
          <div>
            <h1>Dashboard</h1>
            <p>Welcome back. Pick up where you left off.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => setIsOpenLinkModalOpen(true)} style={{ gap: 6 }}>
              <Link2 className="w-4 h-4" />
              Open Link
            </Button>
            <Link to="/upload" style={{ textDecoration: 'none' }}>
              <Button>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                Upload New Quiz
              </Button>
            </Link>
          </div>
        </div>

        {error ? (
          <Card style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: 'var(--color-danger)', marginBottom: 16 }}>{error}</p>
            <Button variant="secondary" onClick={fetchDashboardData}>Retry</Button>
          </Card>
        ) : null}

        {!error && recentQuizzes.length > 0 && (
          <section className="qf-dash-section">
            <h2 className="qf-dash-section-title">Recent Workspaces</h2>
            <div className="qf-dash-grid">
              {recentQuizzes.map((item) => (
                <Card
                  key={item._id}
                  className="qf-dash-quiz-card"
                  onClick={() => navigate(item.sessionId?.shareCode ? `/session/${item.sessionId.shareCode}/quiz` : `/quiz/${item.quizId._id}`)}
                >
                  <div className="qf-dash-quiz-header">
                    <div className="qf-dash-quiz-icon" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>history</span>
                    </div>
                    <span className="qf-dash-quiz-date">Opened {timeAgo(item.lastOpenedAt)}</span>
                  </div>
                  <h3>{item.quizId?.title || 'Untitled'}</h3>
                  <div className="qf-dash-quiz-meta">
                    <Badge>{item.progress?.status || 'Opened'}</Badge>
                    <span>{item.progress?.percentage || 0}%</span>
                  </div>
                  <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                    <Button style={{ width: '100%' }} variant="secondary">Restore Workspace</Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* --- RECENT SHARED QUIZZES --- */}
        {!error && joinedSessions.length > 0 && (
          <section className="qf-dash-section">
            <h2 className="qf-dash-section-title">Recent Shared Quizzes</h2>
            <div className="qf-dash-grid">
              {joinedSessions.map(sessionItem => (
                <Card
                  key={sessionItem._id}
                  className="qf-dash-quiz-card"
                  onClick={() => navigate(`/session/${sessionItem.session.shareCode}/quiz`)}
                >
                  <div className="qf-dash-quiz-header">
                    <div className="qf-dash-quiz-icon" style={{ background: 'var(--color-success-light)', color: 'var(--color-success)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>group</span>
                    </div>
                    <span className="qf-dash-quiz-date">Last opened {timeAgo(sessionItem.lastOpenedAt)}</span>
                  </div>
                  <h3>{sessionItem.quiz?.title || 'Untitled'}</h3>
                  <div className="qf-dash-quiz-meta" style={{ flexWrap: 'wrap' }}>
                    <span>By {sessionItem.session.creatorName}</span>
                    <span>•</span>
                    <span>{sessionItem.quiz?.questionCount} Qs</span>
                    <span>•</span>
                    <span>{sessionItem.session.participantCount} joined</span>
                  </div>
                  <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                    <Button style={{ width: '100%' }} variant="secondary">Open Workspace</Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* --- CONTINUE SOLVING --- */}
        {!error && activeAttempts.length > 0 && (
          <section className="qf-dash-section">
            <h2 className="qf-dash-section-title">Continue Solving</h2>
            <div className="qf-dash-grid">
              {activeAttempts.map(attempt => (
                <Card
                  key={attempt._id}
                  className="qf-dash-quiz-card"
                  onClick={() => navigate(`/quiz/${attempt.quizId._id}`)}
                >
                  <div className="qf-dash-quiz-header">
                    <div className="qf-dash-quiz-icon" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>pending_actions</span>
                    </div>
                    <span className="qf-dash-quiz-date">Started {timeAgo(attempt.createdAt)}</span>
                  </div>
                  <h3>{attempt.quizId?.title || 'Untitled'}</h3>
                  <div className="qf-dash-quiz-meta">
                    <Badge variant="warning">In Progress</Badge>
                    <span>{attempt.quizId?.questionCount} Qs</span>
                  </div>
                  <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                    <Button style={{ width: '100%' }} variant="secondary">Resume Attempt</Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* --- MY UPLOADED QUIZZES --- */}
        <section className="qf-dash-section">
          <h2 className="qf-dash-section-title">My Uploaded Quizzes</h2>
          <div className="qf-dash-grid">
            {!error && quizzes.length === 0 ? (
              <Card style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 48 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--color-text-muted)', marginBottom: 16, display: 'block' }}>
                  quiz
                </span>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>You haven't uploaded any quizzes yet.</p>
                <Link to="/upload" style={{ textDecoration: 'none' }}>
                  <Button variant="secondary">Create your first quiz</Button>
                </Link>
              </Card>
            ) : (
              quizzes.map(quiz => (
                <Card
                  key={quiz._id}
                  className="qf-dash-quiz-card"
                  onClick={() => setSelectedQuizId(quiz._id)}
                >
                  <div className="qf-dash-quiz-header">
                    <div className="qf-dash-quiz-icon">
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>description</span>
                    </div>
                    <span className="qf-dash-quiz-date">{new Date(quiz.createdAt).toLocaleDateString()}</span>
                  </div>
                  <h3>{quiz.title}</h3>
                  <div className="qf-dash-quiz-meta">
                    <span>{quiz.questionCount} Questions</span>
                    <span>•</span>
                    <span>{quiz.totalAttempts || 0} Attempts</span>
                  </div>
                  <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                    <Button style={{ width: '100%' }} variant="secondary">View Details</Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </section>

        {selectedQuizId ? (
          <QuizDetailsModal
            quizId={selectedQuizId}
            onClose={handleModalClose}
          />
        ) : null}

        {isOpenLinkModalOpen && (
          <OpenLinkModal onClose={() => setIsOpenLinkModalOpen(false)} />
        )}
      </div>

      <style>{dashStyles}</style>
    </>
  );
}

const dashStyles = `
  .qf-dash-shell {
    display: flex;
    flex-direction: column;
    gap: 40px;
    padding-bottom: 40px;
  }

  .qf-dash-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
  }

  .qf-dash-header h1 {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .qf-dash-header p {
    color: var(--color-text-secondary);
    font-size: 15px;
    margin-top: 4px;
  }

  .qf-dash-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .qf-dash-section-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border-light);
  }

  .qf-dash-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
  }

  .qf-dash-quiz-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    cursor: pointer;
    transition: all 0.25s ease;
    border: 1px solid var(--color-border);
    border-radius: 16px;
    background: var(--color-surface);
  }

  .qf-dash-quiz-card:hover {
    box-shadow: 0 12px 24px -8px rgba(0,0,0,0.06);
    border-color: var(--color-border-hover, #d1d5db);
    transform: translateY(-2px);
  }

  .qf-dash-quiz-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .qf-dash-quiz-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--color-primary-light);
    color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .qf-dash-quiz-date {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .qf-dash-quiz-card h3 {
    font-size: 17px;
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: -0.01em;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .qf-dash-quiz-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--color-text-secondary);
  }
`;
