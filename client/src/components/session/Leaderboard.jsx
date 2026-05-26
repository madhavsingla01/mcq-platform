import { useEffect, useState, useMemo } from 'react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { formatDurationMs } from '../../utils/quizSession';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function Leaderboard({ sessionId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const currentUser = useAuthStore((s) => s.user);
  const [expandedUsers, setExpandedUsers] = useState(new Set());

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    api.get(`/sessions/${sessionId}/leaderboard`)
      .then(({ data }) => {
        if (!cancelled) setEntries(data.data.leaderboard || []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  const groupedEntries = useMemo(() => {
    const groups = new Map();
    let currentRank = 1;
    const result = [];
    
    entries.forEach((entry) => {
      const userId = entry.user?._id || entry.user;
      if (!groups.has(userId)) {
        const bestEntry = { ...entry, rank: currentRank++, otherAttempts: [] };
        groups.set(userId, bestEntry);
        result.push(bestEntry);
      } else {
        groups.get(userId).otherAttempts.push(entry);
      }
    });
    return result;
  }, [entries]);

  const toggleExpand = (userId) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  if (loading) return null;
  if (!entries.length) return null;

  return (
    <>
      <div className="lb-card">
        <div className="lb-header">
          <div className="lb-header-left">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-primary)' }}>leaderboard</span>
            <span className="lb-title">Session Leaderboard</span>
          </div>
          <span className="lb-count">{groupedEntries.length} participants</span>
        </div>

        <div className="lb-list">
          {groupedEntries.map((entry) => {
            const userId = entry.user?._id || entry.user;
            const isYou = currentUser?._id === userId;
            const hasOthers = entry.otherAttempts.length > 0;
            const isExpanded = expandedUsers.has(userId);
            const pct = entry.totalQuestions > 0 ? Math.round((entry.score / entry.totalQuestions) * 100) : 0;
            
            return (
              <div key={userId} className="lb-group">
                <div 
                  className={`lb-row ${isYou ? 'lb-row--you' : ''} ${hasOthers ? 'lb-row--clickable' : ''}`}
                  onClick={() => hasOthers && toggleExpand(userId)}
                >
                  <div className="lb-rank-cell">
                    {entry.rank <= 3 ? (
                      <span className={`lb-medal lb-medal--${entry.rank}`}>
                        {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}
                      </span>
                    ) : (
                      <span className="lb-rank-num">#{entry.rank}</span>
                    )}
                  </div>
                  <div className="lb-user-cell">
                    <div className="lb-avatar">
                      {entry.user?.avatar ? (
                        <img src={entry.user.avatar} alt="" />
                      ) : (
                        <span>{(entry.user?.name || '?')[0].toUpperCase()}</span>
                      )}
                    </div>
                    <span className="lb-name">
                      {entry.user?.name || 'Anonymous'}
                      {isYou && <span className="lb-you-tag">You</span>}
                    </span>
                  </div>
                  <div className="lb-bar-cell">
                    <div className="lb-bar-track">
                      <div className="lb-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="lb-score-cell">
                    <strong>{entry.score}</strong>
                    <span>/{entry.totalQuestions}</span>
                  </div>
                  <div className="lb-time-cell">
                    {formatDurationMs(entry.totalTimeMs || 0)}
                  </div>
                  <div className="lb-expand-icon">
                    {hasOthers && (
                      isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />
                    )}
                  </div>
                </div>

                {isExpanded && hasOthers && (
                  <div className="lb-sub-list">
                    {entry.otherAttempts.map((sub, i) => {
                      const subPct = sub.totalQuestions > 0 ? Math.round((sub.score / sub.totalQuestions) * 100) : 0;
                      return (
                        <div key={i} className="lb-sub-row">
                          <div className="lb-sub-left">
                            <span className="lb-sub-bullet">•</span> Previous Attempt
                          </div>
                          <div className="lb-bar-cell">
                            <div className="lb-bar-track lb-bar-track--sub">
                              <div className="lb-bar-fill lb-bar-fill--sub" style={{ width: `${subPct}%` }} />
                            </div>
                          </div>
                          <div className="lb-score-cell">
                            <strong>{sub.score}</strong><span>/{sub.totalQuestions}</span>
                          </div>
                          <div className="lb-time-cell">
                            {formatDurationMs(sub.totalTimeMs || 0)}
                          </div>
                          <div className="lb-expand-icon"></div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <style>{leaderboardStyles}</style>
    </>
  );
}

const leaderboardStyles = `
  .lb-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 20px;
    overflow: hidden;
  }

  .lb-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border-light);
  }

  .lb-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .lb-title {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--color-text);
  }

  .lb-count {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-muted);
    background: var(--color-surface-alt);
    padding: 3px 10px;
    border-radius: 12px;
  }

  .lb-list {
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .lb-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .lb-row {
    display: grid;
    grid-template-columns: 48px 1fr 120px 72px 72px 24px;
    align-items: center;
    gap: 8px;
    padding: 10px 8px;
    border-radius: 12px;
    transition: background 0.15s;
  }

  .lb-row--clickable {
    cursor: pointer;
  }

  .lb-row:hover { background: var(--color-surface-alt); }

  .lb-row--you {
    background: rgba(79, 70, 229, 0.04);
    border: 1px solid rgba(79, 70, 229, 0.12);
  }

  .lb-rank-cell { text-align: center; }
  .lb-medal { font-size: 20px; }
  .lb-rank-num { font-size: 13px; font-weight: 700; color: var(--color-text-muted); }

  .lb-user-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }

  .lb-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--color-primary-light);
    color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
    overflow: hidden;
  }

  .lb-avatar img { width: 100%; height: 100%; object-fit: cover; }

  .lb-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .lb-you-tag {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-primary);
    background: var(--color-primary-light);
    padding: 1px 6px;
    border-radius: 6px;
  }

  .lb-bar-cell { padding: 0 4px; }

  .lb-bar-track {
    height: 6px;
    border-radius: 3px;
    background: var(--color-border-light);
    overflow: hidden;
  }

  .lb-bar-fill {
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(90deg, var(--color-primary), #818cf8);
    transition: width 0.5s ease;
  }
  
  .lb-bar-track--sub { height: 4px; background: rgba(0,0,0,0.04); }
  .lb-bar-fill--sub { background: #a1a1aa; }

  .lb-score-cell {
    text-align: right;
    font-size: 14px;
    white-space: nowrap;
  }

  .lb-score-cell strong { color: var(--color-text); }
  .lb-score-cell span { color: var(--color-text-muted); font-size: 12px; }

  .lb-time-cell {
    text-align: right;
    font-size: 12px;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .lb-expand-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
  }

  .lb-sub-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-left: 56px;
    padding-bottom: 8px;
  }

  .lb-sub-row {
    display: grid;
    grid-template-columns: 1fr 120px 72px 72px 24px;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 8px;
    background: rgba(0,0,0,0.015);
  }

  .lb-sub-left {
    font-size: 12px;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .lb-sub-bullet { font-size: 10px; opacity: 0.5; }

  @media (max-width: 640px) {
    .lb-row { grid-template-columns: 40px 1fr 60px 24px; }
    .lb-sub-row { grid-template-columns: 1fr 60px 24px; margin-left: 20px; }
    .lb-bar-cell, .lb-time-cell { display: none; }
  }
`;
