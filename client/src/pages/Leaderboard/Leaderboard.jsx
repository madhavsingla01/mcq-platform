import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Crown, Medal, Sparkles, Trophy, Users } from 'lucide-react';
import api from '../../api/axios';
import { Badge, Button, Card, Spinner } from '../../components/ui';

const tabs = [
  { key: 'learners', label: 'Learners', icon: Trophy },
  { key: 'creators', label: 'Creators', icon: Crown },
];

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function EmptyState({ label }) {
  return (
    <Card style={{ textAlign: 'center', padding: 42 }}>
      <Medal size={34} style={{ color: 'var(--color-text-muted)', margin: '0 auto 12px' }} />
      <p style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
    </Card>
  );
}

function UserCell({ user }) {
  return (
    <Link className="leader-user" to={`/@${user.username}`}>
      <span className="leader-avatar">
        {user.avatar ? <img src={user.avatar} alt={user.name || user.username} /> : (user.name || user.username || 'U')[0].toUpperCase()}
      </span>
      <span>
        <strong>{user.name || user.username}</strong>
        <small>@{user.username}</small>
      </span>
    </Link>
  );
}

export default function Leaderboard() {
  const [activeTab, setActiveTab] = useState('learners');
  const [learners, setLearners] = useState([]);
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [learnerRes, creatorRes] = await Promise.all([
          api.get('/leaderboard/global', { params: { limit: 50 } }),
          api.get('/leaderboard/creators', { params: { limit: 50 } }),
        ]);
        if (cancelled) return;
        setLearners(learnerRes.data.data.leaderboard || []);
        setCreators(creatorRes.data.data.creators || []);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Could not load leaderboard');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const rows = activeTab === 'learners' ? learners : creators;

  return (
    <>
      <div className="leader-shell">
        <section className="leader-hero">
          <div>
            <span className="leader-kicker"><Sparkles size={14} /> Global identity</span>
            <h1>Leaderboard</h1>
            <p>
              XP is aggregated from completed attempts across sessions. Creator trust is ranked from public quiz activity and outcomes.
            </p>
          </div>
          <Link to="/dashboard" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">Publish a Quiz</Button>
          </Link>
        </section>

        <div className="leader-tabs">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={activeTab === key ? 'active' : ''}
              onClick={() => setActiveTab(key)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="leader-loading"><Spinner size={36} /></div>
        ) : error ? (
          <Card style={{ color: 'var(--color-danger)', textAlign: 'center' }}>{error}</Card>
        ) : rows.length === 0 ? (
          <EmptyState label={activeTab === 'learners' ? 'No completed attempts yet.' : 'No public creator data yet.'} />
        ) : (
          <div className="leader-table">
            {rows.map((row) => (
              <Card className="leader-row" key={`${activeTab}-${row.user._id}`}>
                <div className="leader-rank">#{row.rank}</div>
                <UserCell user={row.user} />
                {activeTab === 'learners' ? (
                  <>
                    <div className="leader-stat">
                      <span>XP</span>
                      <strong>{row.xp}</strong>
                    </div>
                    <div className="leader-stat">
                      <span>Level</span>
                      <strong>{row.level}</strong>
                    </div>
                    <div className="leader-stat">
                      <span>Average</span>
                      <strong>{formatPercent(row.avgPercentage)}</strong>
                    </div>
                    <div className="leader-stat">
                      <span>Attempts</span>
                      <strong>{row.totalAttempts}</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="leader-stat">
                      <span>Trust</span>
                      <strong>{row.trustScore}</strong>
                    </div>
                    <div className="leader-stat">
                      <span>Public Quizzes</span>
                      <strong>{row.publicQuizCount}</strong>
                    </div>
                    <div className="leader-stat">
                      <span>Attempts</span>
                      <strong>{row.totalAttempts}</strong>
                    </div>
                    <div className="leader-stat">
                      <span>Avg Score</span>
                      <strong>{formatPercent(row.avgScore)}</strong>
                    </div>
                  </>
                )}
                <div className="leader-badges">
                  {(row.badges || []).length ? row.badges.map((badge) => (
                    <Badge key={badge} variant="success">{badge}</Badge>
                  )) : <Badge>New</Badge>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <style>{leaderboardStyles}</style>
    </>
  );
}

const leaderboardStyles = `
  .leader-shell {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding-bottom: 48px;
  }

  .leader-hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    padding: 26px;
    border: 1px solid var(--color-border);
    border-radius: 16px;
    background: var(--color-surface);
  }

  .leader-kicker {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 8px;
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .leader-hero h1 {
    margin: 0;
    font-size: 32px;
    line-height: 1.15;
  }

  .leader-hero p {
    max-width: 700px;
    margin: 8px 0 0;
    color: var(--color-text-secondary);
  }

  .leader-tabs {
    display: flex;
    gap: 8px;
  }

  .leader-tabs button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 14px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-weight: 700;
    cursor: pointer;
  }

  .leader-tabs button.active {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-primary-light);
  }

  .leader-loading {
    display: flex;
    justify-content: center;
    padding: 56px 0;
  }

  .leader-table {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .leader-row {
    display: grid;
    grid-template-columns: 58px minmax(220px, 1.2fr) repeat(4, minmax(96px, 1fr)) minmax(160px, 1fr);
    align-items: center;
    gap: 14px;
    border-color: var(--color-border) !important;
    border-radius: 12px !important;
  }

  .leader-rank {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: var(--color-primary-light);
    color: var(--color-primary);
    font-weight: 800;
  }

  .leader-user {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 11px;
    color: var(--color-text);
    text-decoration: none;
  }

  .leader-avatar {
    width: 42px;
    height: 42px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--color-surface-alt);
    color: var(--color-primary);
    font-weight: 800;
    overflow: hidden;
  }

  .leader-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .leader-user strong,
  .leader-user small,
  .leader-stat span,
  .leader-stat strong {
    display: block;
  }

  .leader-user strong,
  .leader-user small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .leader-user small,
  .leader-stat span {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .leader-stat strong {
    font-size: 18px;
  }

  .leader-badges {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  @media (max-width: 980px) {
    .leader-row {
      grid-template-columns: 48px 1fr;
    }

    .leader-stat,
    .leader-badges {
      grid-column: 2;
    }

    .leader-badges {
      justify-content: flex-start;
    }

    .leader-hero {
      align-items: stretch;
      flex-direction: column;
    }
  }
`;
