import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  Calendar,
  Edit3,
  ExternalLink,
  Grid3X3,
  Link as LinkIcon,
  MessageSquare,
  User,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { Button, Spinner } from '../../components/ui';
import SocialPostCard from '../../components/social/SocialPostCard';

const formatDate = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const normalizeUrl = (value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`);

function ListModal({ title, username, kind, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/users/${username}/${kind}`, { params: { limit: 50 } });
        setUsers(data.data.users || []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [kind, username]);

  return (
    <div className="profile-modal-backdrop" onClick={onClose}>
      <section className="profile-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>{title}</strong>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        {loading ? (
          <div className="profile-modal-state"><Spinner size={28} /></div>
        ) : users.length === 0 ? (
          <div className="profile-modal-state">No users found.</div>
        ) : (
          <div className="profile-user-list">
            {users.map((item) => (
              <Link key={item._id} to={`/@${item.username}`} onClick={onClose}>
                <span className="profile-list-avatar">{item.avatar ? <img src={item.avatar} alt="" /> : <User size={17} />}</span>
                <span>
                  <strong>{item.name || item.username}</strong>
                  <small>@{item.username} / {item.followersCount || 0} followers</small>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function PublicProfile() {
  const { profileId, username: routeUsername } = useParams();
  const routeProfileId = routeUsername || profileId || '';
  const username = routeProfileId.replace(/^@/, '').toLowerCase();
  const isAtProfilePath = routeProfileId.startsWith('@');
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();

  const [profile, setProfile] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [activities, setActivities] = useState([]);
  const [activeTab, setActiveTab] = useState('quizzes');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [followBusy, setFollowBusy] = useState(false);
  const [modal, setModal] = useState(null);

  const fetchProfile = async () => {
    if (!username || !isAtProfilePath) return;
    setLoading(true);
    setError('');
    try {
      const [profileRes, quizzesRes, activityRes] = await Promise.all([
        api.get(`/users/${username}`),
        api.get(`/users/${username}/quizzes`, { params: { limit: 20 } }),
        api.get(`/users/${username}/activity`, { params: { limit: 20 } }),
      ]);
      setProfile(profileRes.data.data.profile);
      setQuizzes(quizzesRes.data.data.quizzes || []);
      setActivities(activityRes.data.data.activities || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Profile not found');
      setProfile(null);
      setQuizzes([]);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [username, isAtProfilePath]);

  const toggleFollow = async () => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    setFollowBusy(true);
    try {
      const method = profile.isFollowing ? 'delete' : 'post';
      const { data } = await api[method](`/users/${profile.username}/follow`);
      setProfile(data.data.profile);
    } finally {
      setFollowBusy(false);
    }
  };

  const handleQuizUpdate = (updatedQuiz) => {
    setQuizzes((current) => current.map((quiz) => (
      quiz._id === updatedQuiz._id ? updatedQuiz : quiz
    )));
  };

  const isOwnProfile = profile && user && (user.username === profile.username || user._id === profile._id);

  if (!isAtProfilePath) {
    return (
      <div className="profile-state">
        <strong>Profile links start with @username.</strong>
        <Link to="/">Back to feed</Link>
      </div>
    );
  }

  if (loading) {
    return <div className="profile-state"><Spinner size={36} /></div>;
  }

  if (error || !profile) {
    return (
      <div className="profile-state">
        <strong>{error || 'Profile not found'}</strong>
        <Link to="/explore">Explore public quizzes</Link>
      </div>
    );
  }

  return (
    <>
      <div className="profile-shell">
        <header className="profile-header">
          <div className="profile-photo">
            {profile.avatar ? <img src={profile.avatar} alt="" /> : <User size={54} />}
          </div>
          <div className="profile-copy">
            <div className="profile-title-row">
              <div>
                <h1>@{profile.username}</h1>
                <p>{profile.name || profile.username}</p>
              </div>
              <div className="profile-actions">
                {isOwnProfile ? (
                  <Link to="/settings/public" className="profile-action-link"><Edit3 size={17} /> Edit profile</Link>
                ) : (
                  <Button variant={profile.isFollowing ? 'secondary' : 'primary'} onClick={toggleFollow} disabled={followBusy}>
                    {profile.isFollowing ? <UserMinus size={17} /> : <UserPlus size={17} />}
                    {profile.isFollowing ? 'Following' : 'Follow'}
                  </Button>
                )}
              </div>
            </div>

            <div className="profile-stats">
              <button type="button"><strong>{profile.quizCount || 0}</strong><span>quizzes</span></button>
              <button type="button" onClick={() => setModal('followers')}><strong>{profile.followersCount || 0}</strong><span>followers</span></button>
              <button type="button" onClick={() => setModal('following')}><strong>{profile.followingCount || 0}</strong><span>following</span></button>
            </div>

            {profile.bio ? <p className="profile-bio">{profile.bio}</p> : null}

            <div className="profile-meta">
              <span><Calendar size={14} /> Joined {formatDate(profile.createdAt)}</span>
              {(profile.socialLinks || []).slice(0, 4).map((link) => (
                <a key={`${link.platform}-${link.url}`} href={normalizeUrl(link.url)} target="_blank" rel="noreferrer">
                  <LinkIcon size={14} /> {link.platform || 'Link'} <ExternalLink size={12} />
                </a>
              ))}
            </div>
          </div>
        </header>

        <nav className="profile-tabs" aria-label="Profile content">
          <button type="button" className={activeTab === 'quizzes' ? 'active' : ''} onClick={() => setActiveTab('quizzes')}>
            <Grid3X3 size={17} /> Quizzes
          </button>
          <button type="button" className={activeTab === 'activity' ? 'active' : ''} onClick={() => setActiveTab('activity')}>
            <Activity size={17} /> Activity
          </button>
        </nav>

        {activeTab === 'quizzes' ? (
          <section className="profile-feed">
            {quizzes.length === 0 ? (
              <div className="profile-empty">No public quizzes yet.</div>
            ) : quizzes.map((quiz) => (
              <SocialPostCard key={quiz._id} quiz={quiz} onQuizUpdate={handleQuizUpdate} />
            ))}
          </section>
        ) : (
          <section className="activity-list">
            {activities.length === 0 ? (
              <div className="profile-empty">No public activity yet.</div>
            ) : activities.map((activity) => (
              <Link key={activity._id} to={activity.quiz?._id ? `/quiz/${activity.quiz._id}` : activity.targetUser?.username ? `/@${activity.targetUser.username}` : '#'} className="activity-row">
                <span><MessageSquare size={18} /></span>
                <div>
                  <strong>{activity.verb.replaceAll('_', ' ')}</strong>
                  <small>{activity.quiz?.title || activity.targetUser?.username || 'Profile activity'}</small>
                </div>
              </Link>
            ))}
          </section>
        )}
      </div>

      {modal ? (
        <ListModal
          title={modal === 'followers' ? 'Followers' : 'Following'}
          username={profile.username}
          kind={modal}
          onClose={() => setModal(null)}
        />
      ) : null}

      <style>{styles}</style>
    </>
  );
}

const styles = `
  .profile-shell {
    width: min(960px, 100%);
    margin: 0 auto;
  }

  .profile-state,
  .profile-empty {
    min-height: 260px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 12px;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    text-align: center;
  }

  .profile-state strong {
    color: var(--color-text);
  }

  .profile-state a {
    color: var(--color-text);
    font-weight: 800;
  }

  .profile-header {
    display: grid;
    grid-template-columns: 160px minmax(0, 1fr);
    gap: 38px;
    align-items: start;
    padding: 20px 0 28px;
    border-bottom: 1px solid var(--color-border);
  }

  .profile-photo {
    width: 160px;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
  }

  .profile-photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .profile-copy {
    min-width: 0;
  }

  .profile-title-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: start;
  }

  .profile-title-row h1 {
    margin: 0;
    color: var(--color-text);
    font-size: 28px;
    line-height: 1;
    font-weight: 900;
  }

  .profile-title-row p {
    margin: 8px 0 0;
    color: var(--color-text-secondary);
    font-size: 15px;
  }

  .profile-actions {
    flex: 0 0 auto;
  }

  .profile-action-link {
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    border: 1px solid var(--color-border);
    color: var(--color-text);
    text-decoration: none;
    font-size: 14px;
    font-weight: 800;
  }

  .profile-stats {
    display: flex;
    gap: 0;
    margin-top: 24px;
    border: 1px solid var(--color-border);
    width: fit-content;
  }

  .profile-stats button {
    min-width: 118px;
    min-height: 58px;
    border: none;
    border-right: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
  }

  .profile-stats button:last-child {
    border-right: none;
  }

  .profile-stats strong,
  .profile-stats span {
    display: block;
  }

  .profile-stats strong {
    font-size: 17px;
    font-weight: 900;
  }

  .profile-stats span {
    margin-top: 2px;
    color: var(--color-text-muted);
    font-size: 12px;
    text-transform: uppercase;
    font-weight: 800;
  }

  .profile-bio {
    max-width: 640px;
    margin: 20px 0 0;
    color: var(--color-text-secondary);
    font-size: 14px;
    line-height: 1.55;
  }

  .profile-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 14px;
    margin-top: 16px;
    color: var(--color-text-muted);
    font-size: 12px;
    font-weight: 700;
  }

  .profile-meta span,
  .profile-meta a {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--color-text-muted);
    text-decoration: none;
  }

  .profile-tabs {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    border: 1px solid var(--color-border);
    border-top: none;
    margin-bottom: 22px;
  }

  .profile-tabs button {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: none;
    border-right: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-muted);
    font: inherit;
    font-size: 13px;
    font-weight: 900;
    cursor: pointer;
    text-transform: uppercase;
  }

  .profile-tabs button:last-child {
    border-right: none;
  }

  .profile-tabs button.active {
    background: var(--color-text);
    color: var(--color-bg);
  }

  .profile-feed {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 720px;
    margin: 0 auto;
  }

  .activity-list {
    max-width: 720px;
    margin: 0 auto;
    border: 1px solid var(--color-border);
  }

  .activity-row {
    min-height: 64px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text);
    text-decoration: none;
  }

  .activity-row:last-child {
    border-bottom: none;
  }

  .activity-row > span {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
  }

  .activity-row strong,
  .activity-row small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .activity-row strong {
    text-transform: capitalize;
    font-size: 14px;
  }

  .activity-row small {
    margin-top: 4px;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .profile-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    background: rgba(0, 0, 0, 0.74);
  }

  .profile-modal {
    width: min(420px, 100%);
    max-height: min(620px, 90vh);
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border);
    background: var(--color-bg);
  }

  .profile-modal header {
    min-height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 14px;
    border-bottom: 1px solid var(--color-border);
  }

  .profile-modal header button {
    border: none;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .profile-modal-state {
    min-height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
  }

  .profile-user-list {
    overflow-y: auto;
  }

  .profile-user-list a {
    min-height: 62px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text);
    text-decoration: none;
  }

  .profile-list-avatar {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--color-border);
  }

  .profile-list-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .profile-user-list strong,
  .profile-user-list small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-user-list small {
    margin-top: 3px;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  @media (max-width: 720px) {
    .profile-header {
      grid-template-columns: 96px minmax(0, 1fr);
      gap: 18px;
    }

    .profile-photo {
      width: 96px;
    }

    .profile-title-row {
      flex-direction: column;
    }

    .profile-stats {
      width: 100%;
    }

    .profile-stats button {
      min-width: 0;
      flex: 1;
    }
  }
`;
