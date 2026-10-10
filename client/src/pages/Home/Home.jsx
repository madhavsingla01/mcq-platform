import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Compass, PlusSquare, RefreshCw } from 'lucide-react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { Button, Spinner } from '../../components/ui';
import SocialPostCard from '../../components/social/SocialPostCard';

export default function Home() {
  const { isAuthenticated, user } = useAuthStore();
  const [scope, setScope] = useState('all');
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchFeed = async (nextScope = scope) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/social/feed', {
        params: {
          scope: nextScope,
          sort: 'active',
          limit: 12,
        },
      });
      setItems(data.data.items || []);
      setPagination(data.data.pagination || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load feed.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed(scope);
  }, [scope]);

  const handleQuizUpdate = (updatedQuiz) => {
    setItems((current) => current.map((item) => (
      item.quiz?._id === updatedQuiz._id ? { ...item, quiz: updatedQuiz } : item
    )));
  };

  return (
    <>
      <div className="feed-shell">
        <section className="feed-main" aria-label="Social quiz feed">
          <div className="feed-toolbar">
            <div>
              <h1>Feed</h1>
              <p>{isAuthenticated ? `Signed in as @${user?.username}` : 'Public quiz activity from QuizFocus creators'}</p>
            </div>
            <button type="button" onClick={() => fetchFeed(scope)} title="Refresh feed">
              <RefreshCw size={18} />
            </button>
          </div>

          <div className="feed-tabs" role="tablist" aria-label="Feed scope">
            <button type="button" className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>For you</button>
            <button type="button" className={scope === 'following' ? 'active' : ''} onClick={() => setScope('following')} disabled={!isAuthenticated}>Following</button>
          </div>

          {loading ? (
            <div className="feed-state"><Spinner size={34} /></div>
          ) : error ? (
            <div className="feed-empty">
              <strong>{error}</strong>
              <Button variant="secondary" onClick={() => fetchFeed(scope)}>Retry</Button>
            </div>
          ) : items.length === 0 ? (
            <div className="feed-empty">
              <strong>No posts yet</strong>
              <span>{scope === 'following' ? 'Follow creators to build your feed.' : 'Publish a quiz to start the feed.'}</span>
              <Link to="/create"><PlusSquare size={18} /> Create quiz</Link>
            </div>
          ) : (
            <div className="feed-list">
              {items.map((item) => (
                <SocialPostCard
                  key={`${item.type}-${item.quiz?._id}`}
                  quiz={item.quiz}
                  onQuizUpdate={handleQuizUpdate}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="feed-rail" aria-label="QuizFocus shortcuts">
          <div className="feed-rail-profile">
            <span className="rail-avatar">
              {user?.avatar ? <img src={user.avatar} alt="" /> : (user?.name?.[0] || user?.username?.[0] || 'Q').toUpperCase()}
            </span>
            <div>
              <strong>{isAuthenticated ? user?.name || user?.username : 'QuizFocus'}</strong>
              <span>{isAuthenticated ? `@${user?.username}` : 'Social quiz platform'}</span>
            </div>
          </div>

          <Link to="/explore" className="feed-rail-link">
            <Compass size={19} />
            <span>Discover public quizzes</span>
          </Link>
          <Link to="/create" className="feed-rail-link">
            <PlusSquare size={19} />
            <span>Upload or build a quiz</span>
          </Link>
          <Link to={isAuthenticated ? '/notifications' : '/login'} className="feed-rail-link">
            <Bell size={19} />
            <span>Notifications</span>
          </Link>

          <div className="feed-rail-note">
            <strong>Real-time social data</strong>
            <span>Likes, comments, saves, shares and follows are persisted to MongoDB with indexed edge collections.</span>
          </div>

          {pagination ? (
            <div className="feed-rail-note">
              <strong>{pagination.total || 0} public quizzes</strong>
              <span>Sorted by recent social activity.</span>
            </div>
          ) : null}
        </aside>
      </div>

      <style>{styles}</style>
    </>
  );
}

const styles = `
  .feed-shell {
    width: min(1120px, 100%);
    margin: 0 auto;
    display: grid;
    grid-template-columns: minmax(0, 680px) 320px;
    gap: 34px;
    align-items: start;
  }

  .feed-main {
    min-width: 0;
  }

  .feed-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
  }

  .feed-toolbar h1 {
    margin: 0;
    color: var(--color-text);
    font-size: 28px;
    line-height: 1;
    font-weight: 900;
    letter-spacing: 0;
  }

  .feed-toolbar p {
    margin: 7px 0 0;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .feed-toolbar button {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-text);
    cursor: pointer;
  }

  .feed-tabs {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    border: 1px solid var(--color-border);
    margin-bottom: 18px;
  }

  .feed-tabs button {
    min-height: 42px;
    border: none;
    border-right: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-muted);
    font: inherit;
    font-size: 13px;
    font-weight: 850;
    cursor: pointer;
  }

  .feed-tabs button:last-child {
    border-right: none;
  }

  .feed-tabs button.active {
    background: var(--color-text);
    color: var(--color-bg);
  }

  .feed-tabs button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .feed-list {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .feed-state,
  .feed-empty {
    min-height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 14px;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    text-align: center;
  }

  .feed-empty strong {
    color: var(--color-text);
    font-size: 18px;
  }

  .feed-empty a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 0 14px;
    border: 1px solid var(--color-border);
    color: var(--color-text);
    text-decoration: none;
    font-weight: 800;
  }

  .feed-rail {
    position: sticky;
    top: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .feed-rail-profile,
  .feed-rail-link,
  .feed-rail-note {
    border: 1px solid var(--color-border);
    background: var(--color-bg);
  }

  .feed-rail-profile {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    padding: 12px;
  }

  .rail-avatar {
    width: 48px;
    height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    font-weight: 900;
  }

  .rail-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .feed-rail-profile strong,
  .feed-rail-profile span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .feed-rail-profile strong {
    font-size: 14px;
  }

  .feed-rail-profile span {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .feed-rail-link {
    min-height: 46px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    color: var(--color-text);
    text-decoration: none;
    font-size: 13px;
    font-weight: 800;
  }

  .feed-rail-link:hover {
    background: var(--color-surface-hover);
  }

  .feed-rail-note {
    padding: 13px 12px;
  }

  .feed-rail-note strong,
  .feed-rail-note span {
    display: block;
  }

  .feed-rail-note strong {
    color: var(--color-text);
    font-size: 13px;
  }

  .feed-rail-note span {
    margin-top: 6px;
    color: var(--color-text-muted);
    font-size: 12px;
    line-height: 1.45;
  }

  @media (max-width: 1100px) {
    .feed-shell {
      grid-template-columns: minmax(0, 680px);
      justify-content: center;
    }

    .feed-rail {
      display: none;
    }
  }
`;
