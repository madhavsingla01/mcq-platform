import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, Button, Spinner, Badge } from '../../components/ui';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Eye, EyeOff, Link2, Share2, UserCircle } from 'lucide-react';
import api from '../../api/axios';
import QuizDetailsModal from '../../components/QuizModal/QuizDetailsModal';
import OpenLinkModal from '../../components/Dashboard/OpenLinkModal';
import { useAuthStore } from '../../store/authStore';

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
  const user = useAuthStore((state) => state.user);
  
  const [quizzes, setQuizzes] = useState([]);
  const [recentQuizzes, setRecentQuizzes] = useState([]);
  const [joinedSessions, setJoinedSessions] = useState([]);
  const [activeAttempts, setActiveAttempts] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedQuizId, setSelectedQuizId] = useState(null);
  const [isOpenLinkModalOpen, setIsOpenLinkModalOpen] = useState(false);
  const [publishingQuizId, setPublishingQuizId] = useState('');
  const [copiedQuizId, setCopiedQuizId] = useState('');

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

  const handleDeleteQuiz = async (e, quizId) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to permanently delete this quiz and all its data?')) return;
    try {
      await api.delete(`/quiz/${quizId}`);
      // Refresh the dashboard
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to delete quiz:', err);
      alert('Failed to delete quiz');
    }
  };

  const isPublicQuiz = (quiz) => quiz?.visibility === 'public' || quiz?.isPublic === true;

  const copyText = async (value) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  const handleTogglePublic = async (event, quiz) => {
    event.stopPropagation();
    const currentlyPublic = isPublicQuiz(quiz);

    try {
      setPublishingQuizId(quiz._id);
      const { data } = await api.put(`/quizzes/${quiz._id}`, {
        visibility: currentlyPublic ? 'private' : 'public',
      });
      const updatedQuiz = data.data.quiz;
      setQuizzes((items) => items.map((item) => (
        item._id === quiz._id ? { ...item, ...updatedQuiz } : item
      )));
    } catch (err) {
      alert(err.response?.data?.message || 'Could not update quiz visibility');
    } finally {
      setPublishingQuizId('');
    }
  };

  const handleCopyPublicQuizLink = async (event, quiz) => {
    event.stopPropagation();
    try {
      await copyText(`${window.location.origin}/quiz/${quiz._id}`);
      setCopiedQuizId(quiz._id);
      setTimeout(() => setCopiedQuizId(''), 1800);
    } catch {
      alert('Could not copy quiz link');
    }
  };

  const handleCopyProfileLink = async () => {
    if (!user?.username) return;
    try {
      await copyText(`${window.location.origin}/@${user.username}`);
      setCopiedQuizId('profile');
      setTimeout(() => setCopiedQuizId(''), 1800);
    } catch {
      alert('Could not copy profile link');
    }
  };

  const visibleJoinedSessions = useMemo(() => {
    const recentSessionIds = new Set(
      recentQuizzes
        .map((item) => item.sessionId?._id)
        .filter(Boolean)
    );
    const recentQuizIds = new Set(
      recentQuizzes
        .filter((item) => item.sessionId?._id)
        .map((item) => item.quizId?._id)
        .filter(Boolean)
    );

    return joinedSessions.filter((sessionItem) => {
      const sessionId = sessionItem.session?._id;
      const quizId = sessionItem.quiz?._id;
      return !recentSessionIds.has(sessionId) && !recentQuizIds.has(quizId);
    });
  }, [joinedSessions, recentQuizzes]);

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
            <p>Publish a quiz to make it appear on your public profile.</p>
          </div>
          <div className="flex items-center gap-3">
            {user?.username ? (
              <>
                <Link to={`/@${user.username}`} style={{ textDecoration: 'none' }}>
                  <Button variant="secondary" style={{ gap: 6 }}>
                    <UserCircle className="w-4 h-4" />
                    Public Profile
                  </Button>
                </Link>
                <Button variant="secondary" onClick={handleCopyProfileLink} style={{ gap: 6 }}>
                  <Copy className="w-4 h-4" />
                  {copiedQuizId === 'profile' ? 'Copied' : 'Copy Profile'}
                </Button>
              </>
            ) : null}
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
                  onClick={() => navigate(item.sessionId?.shareCode ? `/quiz/${item.quizId._id}?sessionId=${item.sessionId._id}&shareCode=${item.sessionId.shareCode}` : `/quiz/${item.quizId._id}`)}
                >
                  <div className="qf-dash-quiz-header">
                    <div className="qf-dash-quiz-icon" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>history</span>
                    </div>
                    <span className="qf-dash-quiz-date">Opened {timeAgo(item.lastOpenedAt)}</span>
                  </div>
                  <h3>{item.quizId?.title || 'Untitled'}</h3>
                  <div className="qf-dash-quiz-meta">
                    <Badge>{item.sessionId?.shareCode ? 'Shared Workspace' : (item.progress?.status || 'Opened')}</Badge>
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
        {!error && visibleJoinedSessions.length > 0 && (
          <section className="qf-dash-section">
            <h2 className="qf-dash-section-title">Recent Shared Quizzes</h2>
            <div className="qf-dash-grid">
              {visibleJoinedSessions.map(sessionItem => (
                <Card
                  key={sessionItem._id}
                  className="qf-dash-quiz-card"
                  onClick={() => navigate(`/quiz/${sessionItem.quiz?._id}?sessionId=${sessionItem.session._id}&shareCode=${sessionItem.session.shareCode}`)}
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
                  onClick={() => navigate(attempt.sharedSessionId?.shareCode ? `/quiz/${attempt.quizId._id}?sessionId=${attempt.sharedSessionId._id}&shareCode=${attempt.sharedSessionId.shareCode}` : `/quiz/${attempt.quizId._id}`)}
                >
                  <div className="qf-dash-quiz-header">
                    <div className="qf-dash-quiz-icon" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>pending_actions</span>
                    </div>
                    <span className="qf-dash-quiz-date">Started {timeAgo(attempt.createdAt)}</span>
                  </div>
                  <h3>{attempt.quizId?.title || 'Untitled'}</h3>
                  <div className="qf-dash-quiz-meta">
                    <Badge variant="warning">{attempt.sharedSessionId?.shareCode ? 'Shared In Progress' : 'In Progress'}</Badge>
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
                    <div className="qf-dash-quiz-status">
                      {isPublicQuiz(quiz) ? <Badge variant="success">Public</Badge> : <Badge>Private</Badge>}
                      <span className="qf-dash-quiz-date">{new Date(quiz.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <h3>{quiz.title}</h3>
                  <div className="qf-dash-quiz-meta" style={{ flexWrap: 'wrap' }}>
                    <span>{quiz.questionCount} Questions</span>
                    <span>•</span>
                    <span>{quiz.totalAttempts || 0} Attempts</span>
                    <span>•</span>
                    <span>{isPublicQuiz(quiz) ? 'Visible on profile' : 'Not on profile'}</span>
                  </div>
                  <div className="qf-dash-publish-help">
                    {isPublicQuiz(quiz)
                      ? 'This quiz is shown on your public profile and can be opened by anyone.'
                      : 'Publish this quiz to show it on your public profile.'}
                  </div>
                  <div style={{ marginTop: 'auto', paddingTop: 16, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <Button style={{ flex: '1 1 130px' }} variant="secondary">View Details</Button>
                    <Button
                      variant={isPublicQuiz(quiz) ? 'secondary' : 'primary'}
                      disabled={publishingQuizId === quiz._id}
                      onClick={(e) => handleTogglePublic(e, quiz)}
                      style={{ flex: '1 1 150px' }}
                    >
                      {isPublicQuiz(quiz) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      {publishingQuizId === quiz._id
                        ? 'Saving...'
                        : isPublicQuiz(quiz)
                          ? 'Unpublish'
                          : 'Publish to Profile'}
                    </Button>
                    {isPublicQuiz(quiz) ? (
                      <Button
                        variant="secondary"
                        onClick={(e) => handleCopyPublicQuizLink(e, quiz)}
                        style={{ flex: '1 1 130px' }}
                      >
                        <Share2 className="w-4 h-4" />
                        {copiedQuizId === quiz._id ? 'Copied' : 'Copy Link'}
                      </Button>
                    ) : null}
                    <Button 
                      variant="danger" 
                      onClick={(e) => handleDeleteQuiz(e, quiz._id)}
                      style={{ padding: '0 12px', background: '#fee2e2', color: '#ef4444', border: '1px solid #fca5a5' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
                    </Button>
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

  .qf-dash-quiz-status {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
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

  .qf-dash-publish-help {
    min-height: 38px;
    padding: 9px 10px;
    border: 1px dashed var(--color-border);
    border-radius: 10px;
    background: var(--color-surface-alt);
    color: var(--color-text-secondary);
    font-size: 12px;
    line-height: 1.35;
  }
`;
