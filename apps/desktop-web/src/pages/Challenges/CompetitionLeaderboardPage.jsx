import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Trophy, Clock, Shield, ArrowLeft, RefreshCw, AlertCircle, Users, CheckCircle } from 'lucide-react';
import { Spinner, Button } from '../../components/ui';
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

export default function CompetitionLeaderboardPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [challenge, setChallenge] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState('');
  const timerRef = useRef(null);

  const fetchStandings = async () => {
    if (!quizId) return;
    setLoading(true);
    setError('');
    try {
      const [chData, lbData] = await Promise.all([
        ChallengeService.getChallengeByIdOrCode(quizId).catch(() => ({})),
        ChallengeService.getLeaderboard(quizId),
      ]);
      setChallenge(chData);
      setData(lbData);
      if (lbData?.quarantined && lbData?.deadlineAt) {
        setCountdown(formatCountdown(lbData.deadlineAt));
      }
    } catch (err) {
      console.error('Failed to load competition leaderboard', err);
      setError(err?.response?.data?.message || 'Failed to fetch leaderboard standings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStandings();
  }, [quizId]);

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

  const isQuarantined = Boolean(data?.quarantined);
  const leaderboard = data?.leaderboard || [];
  const topThree = leaderboard.slice(0, 3);

  const getPodiumBadge = (rank) => {
    if (rank === 1) return { label: '1st', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', icon: '🥇' };
    if (rank === 2) return { label: '2nd', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.15)', icon: '🥈' };
    if (rank === 3) return { label: '3rd', color: '#D97706', bg: 'rgba(217, 119, 6, 0.15)', icon: '🥉' };
    return { label: `#${rank}`, color: '#FF4500', bg: 'rgba(255, 69, 0, 0.12)', icon: '' };
  };

  const title = challenge?.title || data?.title || 'Contest Standings';

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      {/* Top Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => navigate('/challenges')}
          className="comp-lb-page-back-btn"
        >
          <ArrowLeft size={16} />
          <span>Back to Arena</span>
        </button>

        <button
          type="button"
          onClick={fetchStandings}
          disabled={loading}
          className="comp-lb-page-refresh-btn"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Header Banner */}
      <header
        style={{
          background: '#121214',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 16,
          padding: '24px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'rgba(255, 69, 0, 0.12)',
            border: '1px solid rgba(255, 69, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Trophy size={24} color="#FF4500" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#FFFFFF' }}>{title}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#A1A1AA' }}>
            Official Competition Standings & Leaderboard
          </p>
        </div>
      </header>

      {/* Body Content */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 12 }}>
          <Spinner size={36} />
          <p style={{ color: '#A1A1AA', fontSize: 14 }}>Loading competition leaderboard...</p>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#121214', borderRadius: 16, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <AlertCircle size={36} color="#EF4444" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ color: '#FFFFFF', fontSize: 18, marginBottom: 8 }}>Standings Unavailable</h3>
          <p style={{ color: '#A1A1AA', fontSize: 14, marginBottom: 16 }}>{error}</p>
          <Button variant="primary" onClick={fetchStandings}>Retry</Button>
        </div>
      ) : isQuarantined ? (
        /* Quarantined State */
        <div
          style={{
            background: '#121214',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: '36px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'rgba(255, 69, 0, 0.12)',
              border: '1px solid rgba(255, 69, 0, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Shield size={36} color="#FF4500" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF', margin: '0 0 8px' }}>
            Standings & Scores Quarantined
          </h2>
          <p
            style={{
              fontSize: 14,
              color: '#FBBF24',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              padding: '10px 20px',
              borderRadius: 8,
              maxWidth: 480,
              margin: '0 0 24px',
            }}
          >
            Rankings and solutions are sealed until the finalization deadline.
          </p>

          <div className="comp-lb-countdown-card" style={{ maxWidth: 460 }}>
            <div className="countdown-label">
              <Clock size={16} color="#FF4500" />
              <span>Time Until Reveal</span>
            </div>
            <div className="countdown-value">{countdown}</div>
            <span className="countdown-target">
              {data?.deadlineAt ? `Deadline: ${new Date(data.deadlineAt).toLocaleString()}` : ''}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 12, color: '#71717A', fontSize: 13, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span>🛡️ Anti-collusion protection enabled</span>
            <span>•</span>
            <span>All submissions are securely sealed in database</span>
          </div>
        </div>
      ) : leaderboard.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#121214', borderRadius: 16, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <Users size={36} color="#71717A" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ color: '#FFFFFF', fontSize: 18, marginBottom: 8 }}>No Submissions Yet</h3>
          <p style={{ color: '#A1A1AA', fontSize: 14 }}>Be the first competitor to finish and claim the top podium spot!</p>
        </div>
      ) : (
        /* Unquarantined Standings */
        <div>
          {/* Top 3 Podium */}
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

          {/* Full Table */}
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
  );
}
