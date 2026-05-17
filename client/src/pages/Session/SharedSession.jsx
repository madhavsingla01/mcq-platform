/**
 * SharedSession — session landing/join page.
 * Shown when users open /session/:shareCode.
 * Displays quiz info, creator, participants, and a "Join Session" CTA.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../store/sessionStore';
import { useAuthStore } from '../../store/authStore';
import { Spinner, Button } from '../../components/ui';

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

export default function SharedSession() {
  const { shareCode } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { session, isLoading, error, fetchSession, joinSession, reset } = useSessionStore();
  const [joining, setJoining] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);

  useEffect(() => {
    reset();
    fetchSession(shareCode).then((data) => {
      if (data?.hasJoined) setHasJoined(true);
    }).catch(() => {});
    return () => reset();
  }, [shareCode, fetchSession, reset]);

  const handleJoin = async () => {
    if (!session?._id) return;
    setJoining(true);
    try {
      await joinSession(session._id);
      navigate(`/session/${shareCode}/quiz`);
    } catch {
      setJoining(false);
    }
  };

  const handleEnterSession = () => {
    navigate(`/session/${shareCode}/quiz`);
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '72px 0' }}>
        <Spinner size={40} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '72px 16px' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--color-text-muted)', marginBottom: 16 }}>
          search_off
        </span>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Session Not Found</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24 }}>
          This session link may have expired or doesn't exist.
        </p>
        <Button onClick={() => navigate('/')}>Go Home</Button>
      </div>
    );
  }

  if (!session) return null;

  const quiz = session.quiz || {};
  const creator = session.creator || {};

  return (
    <>
      <div className="shared-session-shell">
        <div className="shared-session-card">
          {/* Decorative top gradient */}
          <div className="shared-session-gradient" />

          <div className="shared-session-body">
            {/* Category badge */}
            {quiz.category && (
              <span className="shared-session-category">{quiz.category}</span>
            )}

            {/* Quiz title */}
            <h1 className="shared-session-title">{quiz.title || 'Untitled Quiz'}</h1>

            {/* Description */}
            {quiz.description && (
              <p className="shared-session-desc">{quiz.description}</p>
            )}

            {/* Meta row */}
            <div className="shared-session-meta">
              <div className="shared-session-meta-item">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person</span>
                <span>Created by <strong>{creator.name || 'Unknown'}</strong></span>
              </div>
              <div className="shared-session-meta-item">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>quiz</span>
                <span><strong>{quiz.questionCount || 0}</strong> Questions</span>
              </div>
              <div className="shared-session-meta-item">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>group</span>
                <span><strong>{session.participantCount || 0}</strong> Participants</span>
              </div>
              <div className="shared-session-meta-item">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>schedule</span>
                <span>{timeAgo(session.createdAt)}</span>
              </div>
            </div>

            {/* Stats chips */}
            <div className="shared-session-chips">
              {quiz.difficulty && (
                <span className="shared-session-chip">{quiz.difficulty}</span>
              )}
              {quiz.settings?.timeLimit ? (
                <span className="shared-session-chip">{quiz.settings.timeLimit} min limit</span>
              ) : (
                <span className="shared-session-chip">No time limit</span>
              )}
              {(quiz.tags || []).slice(0, 3).map((tag) => (
                <span key={tag} className="shared-session-chip">{tag}</span>
              ))}
            </div>

            {/* CTA */}
            <div className="shared-session-cta">
              {hasJoined ? (
                <Button size="lg" onClick={handleEnterSession} style={{ width: '100%', fontSize: 17, padding: '16px 24px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, marginRight: 8 }}>login</span>
                  Enter Session
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={handleJoin}
                  disabled={joining}
                  style={{ width: '100%', fontSize: 17, padding: '16px 24px' }}
                >
                  {joining ? (
                    <><Spinner size={18} /> Joining...</>
                  ) : (
                    <>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, marginRight: 8 }}>group_add</span>
                      Join Session
                    </>
                  )}
                </Button>
              )}
            </div>

            <p className="shared-session-hint">
              Solve the quiz at your own pace while chatting with other participants in real time.
            </p>
          </div>
        </div>
      </div>

      <style>{sharedSessionStyles}</style>
    </>
  );
}

const sharedSessionStyles = `
  .shared-session-shell {
    max-width: 520px;
    margin: 40px auto;
    padding: 0 16px;
  }

  .shared-session-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.02);
    position: relative;
  }

  .shared-session-gradient {
    height: 6px;
    background: linear-gradient(90deg, #4f46e5 0%, #7c3aed 50%, #a78bfa 100%);
  }

  .shared-session-body {
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .shared-session-category {
    display: inline-block;
    width: fit-content;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-primary);
    background: var(--color-primary-light);
    padding: 4px 12px;
    border-radius: 20px;
  }

  .shared-session-title {
    font-size: 28px;
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: -0.03em;
    color: var(--color-text);
  }

  .shared-session-desc {
    font-size: 15px;
    line-height: 1.6;
    color: var(--color-text-secondary);
  }

  .shared-session-meta {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    background: var(--color-surface-alt);
    border-radius: 12px;
    border: 1px solid var(--color-border-light);
  }

  .shared-session-meta-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--color-text-secondary);
  }

  .shared-session-meta-item strong {
    font-weight: 700;
    color: var(--color-text);
  }

  .shared-session-meta-item .material-symbols-outlined {
    color: var(--color-text-muted);
  }

  .shared-session-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .shared-session-chip {
    font-size: 12px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 16px;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border-light);
    color: var(--color-text-secondary);
  }

  .shared-session-cta {
    padding-top: 8px;
  }

  .shared-session-hint {
    font-size: 13px;
    color: var(--color-text-muted);
    text-align: center;
    line-height: 1.5;
  }

  @media (max-width: 640px) {
    .shared-session-shell {
      margin: 20px auto;
    }

    .shared-session-body {
      padding: 24px 20px;
    }

    .shared-session-title {
      font-size: 22px;
    }
  }
`;
