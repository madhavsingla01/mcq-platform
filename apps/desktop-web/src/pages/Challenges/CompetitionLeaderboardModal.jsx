import { useState, useEffect, useRef } from 'react';
import { Trophy, Clock, Shield, Medal, X, RefreshCw, AlertCircle, Users } from 'lucide-react';
import { Spinner } from '../../components/ui';
import ChallengeService from '../../services/challenge.service';
import './CompetitionLeaderboardModal.css';

function formatDuration(ms) {
  if (!ms || Number.isNaN(ms)) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatCountdown(targetDate) {
  if (!targetDate) return 'Deadline pending';
  const diff = new Date(targetDate) - new Date();
  if (diff <= 0) return 'Deadline reached';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h ${minutes}m`;
  }
  return `${hours}h ${minutes}m ${seconds}s`;
}

export default function CompetitionLeaderboardModal({
  isOpen,
  onClose,
  challengeId,
  challengeTitle = 'Competition Standings',
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState('');
  const timerRef = useRef(null);

  const fetchStandings = async () => {
    if (!challengeId) return;
    setLoading(true);
    setError('');
    try {
      const res = await ChallengeService.getLeaderboard(challengeId);
      setData(res);
      if (res?.quarantined && res?.deadlineAt) {
        setCountdown(formatCountdown(res.deadlineAt));
      }
    } catch (err) {
      console.error('Failed to load leaderboard', err);
      setError(err?.response?.data?.message || 'Failed to fetch leaderboard standings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && challengeId) {
      fetchStandings();
    } else {
      setData(null);
      setError('');
    }
  }, [isOpen, challengeId]);

  useEffect(() => {
    if (data?.quarantined && data?.deadlineAt) {
      timerRef.current = setInterval(() => {
        const remaining = formatCountdown(data.deadlineAt);
        setCountdown(remaining);
        if (new Date(data.deadlineAt) <= new Date()) {
          clearInterval(timerRef.current);
          fetchStandings();
        }
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [data?.quarantined, data?.deadlineAt]);

  if (!isOpen) return null;

  const isQuarantined = Boolean(data?.quarantined);
  const leaderboard = data?.leaderboard || [];
  const topThree = leaderboard.slice(0, 3);
  const restList = leaderboard.slice(3);

  const getPodiumBadge = (rank) => {
    if (rank === 1) return { label: '1st', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', icon: '🥇' };
    if (rank === 2) return { label: '2nd', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.15)', icon: '🥈' };
    if (rank === 3) return { label: '3rd', color: '#D97706', bg: 'rgba(217, 119, 6, 0.15)', icon: '🥉' };
    return { label: `#${rank}`, color: '#FF4500', bg: 'rgba(255, 69, 0, 0.12)', icon: '' };
  };

  return (
    <div className="comp-lb-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="comp-lb-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="comp-lb-header">
          <div className="comp-lb-header-title-wrap">
            <div className="comp-lb-trophy-badge">
              <Trophy size={20} color="#FF4500" />
            </div>
            <div>
              <h2 className="comp-lb-title">{challengeTitle}</h2>
              <span className="comp-lb-subtitle">Official Competition Standings</span>
            </div>
          </div>
          <div className="comp-lb-header-actions">
            <button
              type="button"
              className="comp-lb-icon-btn"
              onClick={fetchStandings}
              title="Refresh standings"
              disabled={loading}
              aria-label="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              className="comp-lb-icon-btn close-btn"
              onClick={onClose}
              title="Close modal"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="comp-lb-body">
          {loading ? (
            <div className="comp-lb-loading">
              <Spinner size={32} />
              <p>Fetching official standings...</p>
            </div>
          ) : error ? (
            <div className="comp-lb-error">
              <AlertCircle size={32} color="#EF4444" />
              <h3>Standings Unavailable</h3>
              <p>{error}</p>
              <button type="button" className="comp-lb-retry-btn" onClick={fetchStandings}>
                Try Again
              </button>
            </div>
          ) : isQuarantined ? (
            /* Quarantined State */
            <div className="comp-lb-quarantine">
              <div className="comp-lb-quarantine-icon-wrap">
                <Shield size={36} color="#FF4500" />
              </div>
              <h3 className="comp-lb-quarantine-title">Standings & Scores Quarantined</h3>
              <p className="comp-lb-quarantine-notice">
                Rankings and solutions are sealed until the finalization deadline.
              </p>

              <div className="comp-lb-countdown-card">
                <div className="countdown-label">
                  <Clock size={16} color="#FF4500" />
                  <span>Time Until Reveal</span>
                </div>
                <div className="countdown-value">{countdown}</div>
                <span className="countdown-target">
                  {data?.deadlineAt ? `Deadline: ${new Date(data.deadlineAt).toLocaleString()}` : ''}
                </span>
              </div>

              <div className="comp-lb-quarantine-info">
                <span>🛡️ Anti-collusion protection enabled</span>
                <span>•</span>
                <span>All submitted attempts are safely locked in database</span>
              </div>
            </div>
          ) : leaderboard.length === 0 ? (
            /* Unquarantined but empty */
            <div className="comp-lb-empty">
              <Users size={32} color="#A1A1AA" />
              <h3>No Submissions Yet</h3>
              <p>Be the first competitor to finish and claim the top podium spot!</p>
            </div>
          ) : (
            /* Unquarantined Standings & Podium */
            <div className="comp-lb-results">
              {/* Podium (Top 3) */}
              <div className="comp-lb-podium">
                {topThree.map((item) => {
                  const badge = getPodiumBadge(item.rank);
                  return (
                    <div key={item.attemptId || item.rank} className={`podium-card rank-${item.rank}`}>
                      <div className="podium-badge" style={{ color: badge.color, backgroundColor: badge.bg }}>
                        <span>{badge.icon}</span>
                        <span>{badge.label}</span>
                      </div>
                      <div className="podium-avatar-wrap">
                        {item.user?.avatar ? (
                          <img src={item.user.avatar} alt={item.user.name} className="podium-avatar" />
                        ) : (
                          <div className="podium-avatar fallback">
                            {(item.user?.name || item.user?.username || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className="podium-name" title={item.user?.name || item.user?.username}>
                        {item.user?.name || item.user?.username || 'Competitor'}
                      </span>
                      <div className="podium-score">
                        <strong>{item.score} pts</strong>
                        <span>({item.percentage}%)</span>
                      </div>
                      <span className="podium-time">{formatDuration(item.totalTimeMs)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Table of all ranks */}
              <div className="comp-lb-table-wrap">
                <table className="comp-lb-table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>Rank</th>
                      <th>Participant</th>
                      <th style={{ textAlign: 'right' }}>Score</th>
                      <th style={{ textAlign: 'right' }}>Accuracy</th>
                      <th style={{ textAlign: 'right' }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((row) => (
                      <tr key={row.attemptId || row.rank} className={row.rank <= 3 ? `top-row rank-${row.rank}` : ''}>
                        <td className="rank-cell">
                          <span className={`rank-pill rank-${row.rank}`}>
                            {row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : `#${row.rank}`}
                          </span>
                        </td>
                        <td className="user-cell">
                          <div className="user-row-meta">
                            {row.user?.avatar ? (
                              <img src={row.user.avatar} alt="" className="row-avatar" />
                            ) : (
                              <div className="row-avatar fallback">
                                {(row.user?.name || row.user?.username || 'C').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="user-text">
                              <span className="user-name">{row.user?.name || row.user?.username || 'Competitor'}</span>
                              <span className="user-handle">@{row.user?.username || 'competitor'}</span>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary, #FF4500)' }}>
                          {row.score} pts
                        </td>
                        <td style={{ textAlign: 'right' }}>{row.percentage}%</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-text-secondary, #A1A1AA)' }}>
                          {formatDuration(row.totalTimeMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
