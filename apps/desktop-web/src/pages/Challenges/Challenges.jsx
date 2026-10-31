import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Flame,
  Star,
  Trophy,
  Code,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Users,
  Bookmark,
  Share2,
  Brain,
  Layers,
  Zap,
  Check,
  Play,
  TrendingUp,
  CheckCircle,
  Search,
  X,
} from 'lucide-react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { Spinner, EmptyState } from '../../components/ui';

const formatCount = (num) => {
  const n = Number(num) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
};

const getChallengeIcon = (category = '', contentKind = '') => {
  const cat = (category || '').toLowerCase();
  const kind = (contentKind || '').toLowerCase();
  if (cat.includes('code') || cat.includes('prog') || kind === 'coding') {
    return <Code size={20} color="#FF4500" />;
  }
  if (cat.includes('algo') || cat.includes('data')) {
    return <Share2 size={20} color="#FF4500" />;
  }
  if (cat.includes('logic') || cat.includes('brain') || cat.includes('reason')) {
    return <Brain size={20} color="#FF4500" />;
  }
  if (cat.includes('science') || cat.includes('math') || cat.includes('tech')) {
    return <Zap size={20} color="#FF4500" />;
  }
  return <Layers size={20} color="#FF4500" />;
};

export default function Challenges() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    stats: {
      dayStreak: 0,
      quizzesDone: 0,
      globalRank: '#-',
      accuracy: 0,
      correctAnswers: 0,
    },
    featuredChallenge: null,
    activeAttempts: [],
    trendingChallenges: [],
    topCreators: [],
    suggestedCreators: [],
  });
  const [followedMap, setFollowedMap] = useState({});
  const [bookmarkedMap, setBookmarkedMap] = useState({});

  useEffect(() => {
    let cancelled = false;

    const fetchChallenges = async () => {
      try {
        setLoading(true);
        const res = await api.get('/social/challenges-overview');
        if (!cancelled && res.data?.data) {
          const overview = res.data.data;
          setData(overview);

          const followState = {};
          [...(overview.topCreators || []), ...(overview.suggestedCreators || [])].forEach((cr) => {
            if (cr.name) followState[cr.name] = Boolean(cr.isFollowing);
          });
          setFollowedMap(followState);

          const bookmarkState = {};
          (overview.trendingChallenges || []).forEach((q) => {
            if (q._id) bookmarkState[q._id] = Boolean(q.isBookmarked);
          });
          if (overview.featuredChallenge?._id) {
            bookmarkState[overview.featuredChallenge._id] = Boolean(overview.featuredChallenge.isBookmarked);
          }
          setBookmarkedMap(bookmarkState);
        }
      } catch (err) {
        console.error('Failed to load challenges overview', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchChallenges();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleFollow = async (username) => {
    if (!username || username === user?.username) return;
    const isCurrentlyFollowed = Boolean(followedMap[username]);
    setFollowedMap((prev) => ({ ...prev, [username]: !isCurrentlyFollowed }));

    try {
      if (isCurrentlyFollowed) {
        await api.delete(`/social/users/${username}/follow`);
      } else {
        await api.post(`/social/users/${username}/follow`);
      }
    } catch {
      setFollowedMap((prev) => ({ ...prev, [username]: isCurrentlyFollowed }));
    }
  };

  const handleToggleBookmark = async (quizId) => {
    if (!quizId) return;
    const isCurrentlyBookmarked = Boolean(bookmarkedMap[quizId]);
    setBookmarkedMap((prev) => ({ ...prev, [quizId]: !isCurrentlyBookmarked }));

    try {
      if (isCurrentlyBookmarked) {
        await api.delete(`/social/quizzes/${quizId}/bookmark`);
      } else {
        await api.post(`/social/quizzes/${quizId}/bookmark`);
      }
    } catch {
      setBookmarkedMap((prev) => ({ ...prev, [quizId]: isCurrentlyBookmarked }));
    }
  };

  const displayName = user?.name?.split(' ')[0] || user?.username || 'Explorer';

  const filteredChallenges = (data.trendingChallenges || []).filter((item) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || [
      item.title,
      item.category,
      item.difficulty,
      item.contentKind,
      item.duration,
    ].some((value) => String(value || '').toLowerCase().includes(query));
    if (!matchesSearch) return false;
    if (activeTab === 'all') return true;
    if (activeTab === 'popular') return (item.joinedCount || 0) > 0 || (item.likeCount || 0) > 0;
    if (activeTab === 'recent') return true;
    if (activeTab === 'hardest') {
      const diff = (item.difficulty || '').toLowerCase();
      return diff === 'advanced' || diff === 'intermediate';
    }
    return true;
  }).sort((a, b) => {
    if (activeTab === 'popular') return (b.joinedCount || 0) - (a.joinedCount || 0);
    if (activeTab === 'recent') return new Date(b.createdAt) - new Date(a.createdAt);
    return 0;
  });

  const accuracy = Math.min(100, Math.max(0, data.stats?.accuracy ?? 0));
  const strokeDashoffset = 251.2 - (251.2 * accuracy) / 100;

  if (loading) {
    return (
      <div className="challenges-loading-container">
        <Spinner size="lg" />
        <p className="challenges-loading-text">Loading challenges...</p>
        <style>{`
          .challenges-loading-container {
            width: 100%;
            min-height: 80vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 16px;
            background: #000000;
          }
          .challenges-loading-text {
            color: #818181;
            font-size: 13.5px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="challenges-page">
      <header className="challenges-page-header consistent-page-header">
        <h1 className="consistent-page-title">Challenges</h1>
        <label className="challenges-search consistent-page-search consistent-search-field">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            className="consistent-search-input"
            placeholder="Search"
            aria-label="Search challenges"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </label>
      </header>
      <div className="challenges-layout-grid">
        {/* ========================================================
            LEFT MAIN COLUMN (70%)
            ======================================================== */}
        <div className="challenges-main-col">
          {/* Top Greeting Header */}
          <div className="challenges-welcome-row">
            <div className="challenges-welcome-text">
              <span className="challenges-eyebrow">WELCOME BACK,</span>
              <h2 className="challenges-title">{displayName} 👋</h2>
              <p className="challenges-subtitle">
                Ready for a new challenge? Your next achievement is just one challenge away.
              </p>
            </div>

            <div className="challenges-stat-pills">
              <div className="challenges-pill">
                <span className="pill-icon"><Flame size={16} color="#FF4500" /></span>
                <span className="pill-val">{data.stats?.dayStreak ?? 0}</span>
                <span className="pill-lbl">Day Streak</span>
              </div>
              <div className="challenges-pill">
                <span className="pill-icon"><Star size={16} color="#FBBF24" fill="#FBBF24" /></span>
                <span className="pill-val">{data.stats?.quizzesDone ?? 0}</span>
                <span className="pill-lbl">Challenges Solved</span>
              </div>
              <div className="challenges-pill">
                <span className="pill-icon"><Trophy size={16} color="#F59E0B" /></span>
                <span className="pill-val">{data.stats?.globalRank || '#-'}</span>
                <span className="pill-lbl">Global Rank</span>
              </div>
            </div>
          </div>

          {/* Featured Challenge Hero Card */}
          {data.featuredChallenge ? (
            <div className="challenges-hero-card">
              <img
                src={data.featuredChallenge.thumbnail || '/images/featured_challenge_bg.jpg'}
                alt={data.featuredChallenge.title}
                className="challenges-hero-bg"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div className="challenges-hero-overlay" />

              <div className="challenges-hero-content">
                <div className="challenges-hero-top">
                  <div className="challenges-hero-tag-wrap">
                    <div className="challenges-hero-code-icon">
                      <Code size={18} strokeWidth={2.5} />
                    </div>
                    <span className="challenges-hero-tag">FEATURED CHALLENGE</span>
                  </div>
                  <div className="challenges-hero-badge">
                    <span>Compete with the community</span>
                    <Zap size={13} fill="#FF4500" color="#FF4500" />
                  </div>
                </div>

                <h2 className="challenges-hero-title">{data.featuredChallenge.title}</h2>
                <div className="challenges-hero-meta">
                  <span>{data.featuredChallenge.questionCount} questions</span>
                  <span className="meta-sep">•</span>
                  <span>{data.featuredChallenge.difficulty}</span>
                  <span className="meta-sep">•</span>
                  <span>{data.featuredChallenge.duration}</span>
                </div>

                <div className="challenges-hero-bottom">
                  <div className="challenges-hero-joined">
                    <Users size={14} />
                    <span>{formatCount(data.featuredChallenge.joinedCount)} joined this challenge</span>
                  </div>

                  <button
                    type="button"
                    className="challenges-hero-btn"
                    onClick={() => navigate(`/quiz/${data.featuredChallenge._id}`)}
                  >
                    <span>Take Challenge</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="challenges-hero-card empty-hero">
              <div className="challenges-hero-content">
                <div className="challenges-hero-top">
                  <span className="challenges-hero-tag">COMPETITIVE CHALLENGE</span>
                </div>
                <h2 className="challenges-hero-title">Start or Host a Live Challenge</h2>
                <p className="challenges-subtitle">
                  Compete on strict live leaderboards with timed evaluations, or host your own community challenge.
                </p>
                <div className="challenges-hero-bottom">
                  <button
                    type="button"
                    className="challenges-hero-btn"
                    onClick={() => navigate('/create/challenge')}
                  >
                    <span>Create a Challenge</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Continue Solving Section */}
          <section className="challenges-section">
            <div className="challenges-section-header">
              <div className="section-title-wrap">
                <RotateCcw size={16} className="text-accent" />
                <h3>Continue Solving</h3>
              </div>
              <Link to="/dashboard" className="section-link">
                View all <ArrowRight size={13} />
              </Link>
            </div>

            {data.activeAttempts && data.activeAttempts.length > 0 ? (
              <div className="challenges-solving-grid">
                {data.activeAttempts.map((att) => (
                  <div key={att._id} className="solving-card">
                    <div className="solving-card-header">
                      <span className="solving-status-pill">
                        <span className="pulse-dot" />
                        <span>In Progress</span>
                      </span>
                      <span className="solving-date">{att.timeAgoText}</span>
                    </div>

                    <h4 className="solving-title" title={att.title}>
                      {att.title}
                    </h4>

                    <div className="solving-meta">
                      <Layers size={13} />
                      <span>{att.questionsCount} Questions</span>
                    </div>

                    <button
                      type="button"
                      className="solving-resume-btn"
                      onClick={() => navigate(`/quiz/${att.quizId}`)}
                    >
                      <Play size={13} fill="currentColor" />
                      <span>Resume Attempt</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="challenges-empty-card">
                <RotateCcw size={22} className="text-gray-500" />
                <h4 className="empty-title">No challenges in progress</h4>
                <p className="empty-subtitle">
                  All your started challenges are up to date! Pick a competitive challenge below or host a new one.
                </p>
                <Link to="/create/challenge" className="empty-action-btn">
                  Create a Challenge
                </Link>
              </div>
            )}
          </section>

          {/* Trending Challenges Section */}
          <section className="challenges-section">
            <div className="challenges-section-header">
              <div className="section-title-wrap">
                <Flame size={18} color="#FF4500" />
                <h3>Trending Challenges</h3>
              </div>

              <div className="challenges-filter-pills">
                {['all', 'popular', 'recent', 'hardest'].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`filter-pill ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {filteredChallenges.length > 0 ? (
              <div className="challenges-cards-grid">
                {filteredChallenges.map((item) => {
                  const isBookmarked = Boolean(bookmarkedMap[item._id]);
                  return (
                    <div key={item._id} className="challenge-card">
                      <div className="challenge-card-top">
                        <div className="challenge-icon-box">
                          {getChallengeIcon(item.category, item.contentKind)}
                        </div>
                      </div>

                      <h4 className="challenge-card-title" title={item.title}>
                        {item.title}
                      </h4>

                      <div className="challenge-pill-row">
                        <span className={`difficulty-tag ${(item.difficulty || 'intermediate').toLowerCase()}`}>
                          {item.difficulty || 'All Levels'}
                        </span>
                        <span className="duration-tag">⏱ {item.duration}</span>
                      </div>

                      <div className="challenge-card-footer">
                        <div className="challenge-participants">
                          <Users size={13} />
                          <span>{formatCount(item.joinedCount)}</span>
                        </div>

                        <div className="challenge-actions">
                          <button
                            type="button"
                            className={`btn-icon-bookmark ${isBookmarked ? 'active' : ''}`}
                            onClick={() => handleToggleBookmark(item._id)}
                            title={isBookmarked ? 'Bookmarked' : 'Bookmark'}
                          >
                            <Bookmark size={14} fill={isBookmarked ? '#FF4500' : 'none'} color={isBookmarked ? '#FF4500' : 'currentColor'} />
                          </button>
                          <button
                            type="button"
                            className="btn-circle-play"
                            onClick={() => navigate(`/quiz/${item._id}`)}
                            title="Start challenge"
                          >
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={<Sparkles size={24} />}
                title={searchQuery ? 'No matching challenges' : 'No challenges found'}
                description={searchQuery
                  ? `No challenges match “${searchQuery}” and the selected filter.`
                  : 'No challenges match this category yet. Explore quizzes to practice your skills!'}
                action={{
                  label: 'Explore Quizzes',
                  to: '/explore',
                }}
              />
            )}
          </section>
        </div>

        {/* ========================================================
            RIGHT SIDEBAR COLUMN (30%)
            ======================================================== */}
        <aside className="challenges-sidebar-col">
          {/* Panel 1: Your Progress */}
          <div className="challenges-panel">
            <div className="panel-header">
              <div className="panel-title-wrap">
                <TrendingUp size={16} className="text-accent" />
                <h4>Your Progress</h4>
              </div>
              <ArrowRight size={14} className="panel-arrow" />
            </div>

            <div className="progress-gauge-wrap">
              <svg className="progress-gauge-svg" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  className="gauge-bg"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  className="gauge-bar"
                  strokeDasharray="251.2"
                  strokeDashoffset={strokeDashoffset}
                />
              </svg>
              <div className="gauge-center-text">
                <span className="gauge-percent">{accuracy}%</span>
                <span className="gauge-label">Overall Accuracy</span>
              </div>
            </div>

            <div className="progress-metrics-list">
              <div className="progress-metric-item">
                <div className="metric-icon-wrap blue">
                  <CheckCircle size={15} />
                </div>
                <div className="metric-text">
                  <strong>{data.stats?.quizzesDone ?? 0}</strong>
                  <span>Quizzes Taken</span>
                </div>
              </div>
              <div className="progress-metric-item">
                <div className="metric-icon-wrap orange">
                  <Check size={15} strokeWidth={3} />
                </div>
                <div className="metric-text">
                  <strong>{data.stats?.correctAnswers ?? 0}</strong>
                  <span>Correct Answers</span>
                </div>
              </div>
              <div className="progress-metric-item">
                <div className="metric-icon-wrap fire">
                  <Flame size={15} />
                </div>
                <div className="metric-text">
                  <strong>{data.stats?.dayStreak ?? 0}</strong>
                  <span>Day Streak</span>
                </div>
              </div>
            </div>
          </div>

          {/* Panel 2: Top Creators */}
          <div className="challenges-panel">
            <div className="panel-header">
              <div className="panel-title-wrap">
                <Trophy size={16} color="#FBBF24" />
                <h4>Top Authors</h4>
              </div>
              <Link to="/explore" className="panel-view-all">View all <ArrowRight size={12} /></Link>
            </div>

            {data.topCreators && data.topCreators.length > 0 ? (
              <div className="creators-ranked-list">
                {data.topCreators.map((cr) => {
                  const isFollowed = Boolean(followedMap[cr.name]);
                  const isSelf = cr.name === user?.username;
                  return (
                    <div key={cr._id || cr.name} className="creator-rank-row">
                      <span className="creator-rank-num">{cr.rank}</span>
                      {cr.avatar ? (
                        <img src={cr.avatar} alt={cr.name} className="creator-avatar" />
                      ) : (
                        <div className="creator-avatar-fallback">
                          {(cr.name || cr.fullName || 'C').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="creator-meta">
                        <span className="creator-name" title={cr.name}>{cr.name}</span>
                        <span className="creator-followers">{formatCount(cr.followersCount)} followers</span>
                      </div>
                      {!isSelf && (
                        <button
                          type="button"
                          className={`btn-follow-toggle ${isFollowed ? 'following' : ''}`}
                          onClick={() => handleToggleFollow(cr.name)}
                        >
                          {isFollowed ? 'Following' : 'Follow'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="challenges-empty-panel-box">
                <Users size={20} className="text-orange" />
                <p>No creators registered yet.</p>
              </div>
            )}
          </div>

          {/* Panel 3: Suggested for You */}
          <div className="challenges-panel">
            <div className="panel-header">
              <div className="panel-title-wrap">
                <Users size={16} className="text-accent" />
                <h4>Suggested for You</h4>
              </div>
              <Link to="/explore" className="panel-view-all">View all <ArrowRight size={12} /></Link>
            </div>

            {data.suggestedCreators && data.suggestedCreators.length > 0 ? (
              <div className="creators-ranked-list">
                {data.suggestedCreators.map((cr) => {
                  const isFollowed = Boolean(followedMap[cr.name]);
                  const isSelf = cr.name === user?.username;
                  return (
                    <div key={cr._id || cr.name} className="creator-rank-row">
                      {cr.avatar ? (
                        <img src={cr.avatar} alt={cr.name} className="creator-avatar" />
                      ) : (
                        <div className="creator-avatar-fallback">
                          {(cr.name || cr.fullName || 'C').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="creator-meta">
                        <span className="creator-name" title={cr.name}>{cr.name}</span>
                        <span className="creator-followers">{formatCount(cr.followersCount)} followers</span>
                      </div>
                      {!isSelf && (
                        <button
                          type="button"
                          className={`btn-follow-toggle ${isFollowed ? 'following' : ''}`}
                          onClick={() => handleToggleFollow(cr.name)}
                        >
                          {isFollowed ? 'Following' : 'Follow'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="challenges-empty-panel-box">
                <CheckCircle size={20} className="text-orange" />
                <p>You are connected with all top creators!</p>
              </div>
            )}
          </div>

          {/* Panel 4: Create Your Own Quiz Banner */}
          <div className="create-promo-panel">
            <div className="create-promo-icon">
              <Zap size={22} fill="#FF4500" color="#FF4500" />
            </div>
            <h4 className="create-promo-title">Create Your Own Quiz</h4>
            <p className="create-promo-text">
              Share your knowledge with the community and earn rewards.
            </p>
            <Link to="/create" className="btn-create-promo">
              <span>Create Quiz</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </aside>
      </div>

      <style>{challengesStyles}</style>
    </div>
  );
}

const challengesStyles = `
  /* ===== MAIN CONTAINER ===== */
  .challenges-page {
    width: 100%;
    min-height: 100vh;
    background: #000000;
    color: #ffffff;
    padding: 24px 32px 60px;
    box-sizing: border-box;
  }

  .challenges-layout-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 28px;
    max-width: 1440px;
    margin: 0 auto;
  }

  /* ===== LEFT COLUMN ===== */
  .challenges-main-col {
    display: flex;
    flex-direction: column;
    gap: 26px;
    min-width: 0;
  }

  .challenges-page-header {
    width: 100%;
    max-width: 1440px;
    margin: 0 auto 26px;
  }

  .challenges-search button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    color: var(--text-secondary, #818181);
    background: transparent;
    border-radius: 7px;
    cursor: pointer;
  }

  /* Welcome Header */
  .challenges-welcome-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
  }

  .challenges-welcome-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 520px;
  }

  .challenges-eyebrow {
    font-size: 11px;
    font-weight: 850;
    color: #FF4500;
    letter-spacing: 0.08em;
  }

  .challenges-title {
    font-size: 28px;
    font-weight: 850;
    color: #ffffff;
    margin: 0;
    letter-spacing: -0.02em;
  }

  .challenges-subtitle {
    font-size: 13.5px;
    color: #818181;
    margin: 0;
    line-height: 1.45;
  }

  .challenges-stat-pills {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .challenges-pill {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 86px;
    padding: 10px 14px;
    border-radius: var(--radius-control, 4px);
    background: var(--color-surface, #000000);
    border: 1px solid var(--color-border);
    gap: 2px;
  }

  .challenges-pill .pill-icon {
    margin-bottom: 2px;
  }

  .challenges-pill .pill-val {
    font-size: 16px;
    font-weight: 800;
    color: #ffffff;
  }

  .challenges-pill .pill-lbl {
    font-size: 10.5px;
    color: #818181;
    font-weight: 600;
  }

  /* ===== FEATURED CHALLENGE HERO CARD ===== */
  .challenges-hero-card {
    position: relative;
    border-radius: var(--radius-container, 8px);
    overflow: hidden;
    background: var(--color-surface, #000000);
    border: 1px solid var(--color-border);
    min-height: 220px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .challenges-hero-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    opacity: 0.65;
  }

  .challenges-hero-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.7) 45%, rgba(0, 0, 0, 0.4) 100%);
    z-index: 1;
  }

  .challenges-hero-content {
    position: relative;
    z-index: 2;
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    height: 100%;
    box-sizing: border-box;
  }

  .challenges-hero-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .challenges-hero-tag-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .challenges-hero-code-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #FF4500;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .challenges-hero-tag {
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #FF4500;
  }

  .challenges-hero-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: #d4d4d8;
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid #222224;
    padding: 4px 10px;
    border-radius: 9999px;
    backdrop-filter: blur(4px);
  }

  .challenges-hero-title {
    font-size: 24px;
    font-weight: 850;
    color: #ffffff;
    margin: 0;
    letter-spacing: -0.01em;
  }

  .challenges-hero-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    color: #a1a1aa;
  }

  .challenges-hero-meta .meta-sep {
    color: #52525b;
  }

  .challenges-hero-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
  }

  .challenges-hero-joined {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #a1a1aa;
  }

  .challenges-hero-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #FF4500;
    color: #ffffff;
    font-size: 13px;
    font-weight: 700;
    padding: 9px 18px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .challenges-hero-btn:hover {
    background: #e03d00;
    transform: translateY(-1px);
  }

  /* ===== SECTIONS COMMON ===== */
  .challenges-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .challenges-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-title-wrap h3 {
    font-size: 17px;
    font-weight: 800;
    color: #ffffff;
    margin: 0;
  }

  .section-link {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 650;
    color: #FF4500;
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .section-link:hover {
    color: #e03d00;
    text-decoration: underline;
  }

  /* Continue Solving Grid */
  .challenges-solving-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .solving-card {
    background: #0a0a0b;
    border: 1px solid #222224;
    border-radius: 14px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: border-color 0.15s ease;
  }

  .solving-card:hover {
    border-color: #38383c;
  }

  .solving-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .solving-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 10.5px;
    font-weight: 700;
    color: #F59E0B;
    background: rgba(245, 158, 11, 0.12);
    padding: 2px 7px;
    border-radius: 6px;
  }

  .pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #F59E0B;
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.85); }
  }

  .solving-date {
    font-size: 11px;
    color: #71717a;
  }

  .solving-title {
    font-size: 14px;
    font-weight: 750;
    color: #ffffff;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .solving-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #a1a1aa;
  }

  .solving-resume-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 8px;
    border-radius: 8px;
    background: #FF4500;
    border: none;
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .solving-resume-btn:hover {
    background: #e03d00;
  }

  /* Trending Challenges Grid */
  .challenges-filter-pills {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .filter-pill {
    padding: 5px 12px;
    border-radius: 8px;
    border: 1px solid #222224;
    background: #0a0a0b;
    color: #818181;
    font-size: 11.5px;
    font-weight: 650;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .filter-pill:hover {
    color: #ffffff;
    border-color: #38383c;
  }

  .filter-pill.active {
    background: #FF4500;
    border-color: #FF4500;
    color: #ffffff;
  }

  .challenges-cards-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .challenge-card {
    background: var(--color-surface, #000000);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-container, 8px);
    padding: var(--space-4, 16px);
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: border-color 0.15s ease;
  }

  .challenge-card:hover {
    border-color: #38383c;
  }

  .challenge-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .challenge-icon-box {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: #141416;
    border: 1px solid #222224;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .challenge-card-title {
    font-size: 14.5px;
    font-weight: 750;
    color: #ffffff;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .challenge-pill-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .difficulty-tag {
    font-size: 10.5px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 6px;
  }

  .difficulty-tag.beginner {
    background: rgba(255, 69, 0, 0.08);
    color: #FF4500;
    border: 1px solid rgba(255, 69, 0, 0.25);
  }

  .difficulty-tag.intermediate {
    background: rgba(245, 158, 11, 0.12);
    color: #F59E0B;
    border: 1px solid rgba(245, 158, 11, 0.25);
  }

  .difficulty-tag.advanced {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.25);
  }

  .duration-tag {
    font-size: 11.5px;
    color: #71717a;
  }

  .challenge-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 4px;
  }

  .challenge-participants {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #a1a1aa;
  }

  .challenge-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-icon-bookmark {
    background: transparent;
    border: none;
    color: #71717a;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s ease;
  }

  .btn-icon-bookmark:hover {
    color: #ffffff;
  }

  .btn-circle-play {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #FF4500;
    border: none;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-circle-play:hover {
    background: #e03d00;
    transform: scale(1.05);
  }

  /* Recent Activity List */
  .challenges-activity-list {
    background: #0a0a0b;
    border: 1px solid #222224;
    border-radius: 14px;
    overflow: hidden;
  }

  .activity-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 18px;
    border-bottom: 1px solid #1a1a1c;
  }

  .activity-row:last-child {
    border-bottom: none;
  }

  .activity-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .activity-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
  }

  .activity-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .activity-user-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .activity-username {
    font-size: 13.5px;
    font-weight: 700;
    color: #ffffff;
  }

  .activity-follow-chip {
    font-size: 11px;
    font-weight: 700;
    color: #FF4500;
    background: rgba(255, 69, 0, 0.12);
    border: none;
    border-radius: 4px;
    padding: 2px 7px;
    cursor: pointer;
  }

  .activity-action {
    font-size: 12.5px;
    color: #a1a1aa;
  }

  .activity-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .activity-time {
    font-size: 12px;
    color: #71717a;
  }

  .activity-badge {
    font-size: 11.5px;
    font-weight: 750;
    padding: 3px 8px;
    border-radius: 6px;
  }

  .activity-badge.points {
    color: #FF4500;
    background: rgba(255, 69, 0, 0.12);
  }

  .activity-badge.status {
    color: #818181;
    background: #141416;
    border: 1px solid #222224;
  }

  .activity-badge.new {
    color: #ffffff;
    background: #FF4500;
  }

  /* ===== RIGHT SIDEBAR COLUMN ===== */
  .challenges-sidebar-col {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .challenges-panel {
    background: var(--color-surface, #000000);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-container, 8px);
    padding: var(--card-padding, 24px);
    display: flex;
    flex-direction: column;
    gap: var(--space-4, 16px);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panel-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .panel-title-wrap h4 {
    font-size: 14.5px;
    font-weight: 800;
    color: #ffffff;
    margin: 0;
  }

  .panel-arrow {
    color: #71717a;
  }

  .panel-view-all {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 11.5px;
    font-weight: 700;
    color: #FF4500;
    text-decoration: none;
  }

  .panel-view-all:hover {
    text-decoration: underline;
  }

  /* Progress Gauge */
  .progress-gauge-wrap {
    position: relative;
    width: 140px;
    height: 140px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .progress-gauge-svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .gauge-bg {
    fill: none;
    stroke: #18181b;
    stroke-width: 9;
  }

  .gauge-bar {
    fill: none;
    stroke: #FF4500;
    stroke-width: 9;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.5s ease;
  }

  .gauge-center-text {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .gauge-percent {
    font-size: 24px;
    font-weight: 850;
    color: #ffffff;
  }

  .gauge-label {
    font-size: 10px;
    color: #71717a;
    font-weight: 600;
  }

  .progress-metrics-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid #18181b;
    padding-top: 12px;
  }

  .progress-metric-item {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .metric-icon-wrap {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .metric-icon-wrap.blue {
    background: rgba(255, 69, 0, 0.12);
    color: #FF4500;
  }

  .metric-icon-wrap.orange {
    background: rgba(255, 69, 0, 0.12);
    color: #FF4500;
  }

  .metric-icon-wrap.fire {
    background: rgba(245, 158, 11, 0.12);
    color: #F59E0B;
  }

  .metric-text {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12px;
    color: #a1a1aa;
  }

  .metric-text strong {
    font-size: 14px;
    color: #ffffff;
  }

  /* Creators Ranked List */
  .creators-ranked-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .creator-rank-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .creator-rank-num {
    font-size: 12px;
    font-weight: 800;
    color: #71717a;
    width: 14px;
  }

  .creator-avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    object-fit: cover;
  }

  .creator-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .creator-name {
    font-size: 12.5px;
    font-weight: 700;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .creator-followers {
    font-size: 11px;
    color: #71717a;
  }

  .btn-follow-toggle {
    font-size: 11.5px;
    font-weight: 700;
    padding: 5px 12px;
    border-radius: 8px;
    border: 1px solid #FF4500;
    background: transparent;
    color: #FF4500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-follow-toggle:hover {
    background: #FF4500;
    color: #ffffff;
  }

  .btn-follow-toggle.following {
    border-color: #222224;
    background: #141416;
    color: #818181;
  }

  /* Create Promo Panel */
  .create-promo-panel {
    background: var(--color-surface, #000000);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-container, 8px);
    padding: var(--card-padding, 24px);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .create-promo-icon {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: rgba(255, 69, 0, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .create-promo-title {
    font-size: 15px;
    font-weight: 800;
    color: #ffffff;
    margin: 0;
  }

  .create-promo-text {
    font-size: 12.5px;
    color: #818181;
    line-height: 1.45;
    margin: 0;
  }

  .btn-create-promo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 4px;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid #FF4500;
    background: transparent;
    color: #FF4500;
    font-size: 13px;
    font-weight: 700;
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .btn-create-promo:hover {
    background: #FF4500;
    color: #ffffff;
  }

  /* Empty States & Fallbacks */
  .challenges-empty-card {
    grid-column: 1 / -1;
    background: #0a0a0b;
    border: 1px dashed #222224;
    border-radius: 14px;
    padding: 32px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 8px;
  }

  .empty-title {
    font-size: 14px;
    font-weight: 750;
    color: #ffffff;
    margin: 0;
  }

  .empty-subtitle {
    font-size: 12px;
    color: #818181;
    max-width: 380px;
    margin: 0;
    line-height: 1.45;
  }

  .empty-action-btn {
    margin-top: 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    color: #FF4500;
    background: rgba(255, 69, 0, 0.1);
    border: 1px solid rgba(255, 69, 0, 0.25);
    padding: 6px 14px;
    border-radius: 8px;
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .empty-action-btn:hover {
    background: #FF4500;
    color: #ffffff;
  }

  .challenges-empty-panel-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 20px 14px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-container, 8px);
    color: var(--color-text-secondary);
    font-size: 13px;
    text-align: center;
  }

  .challenges-empty-panel-box p {
    margin: 0;
  }

  .challenges-empty-inline {
    padding: 18px 12px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 12px;
    margin: 0;
  }

  .creator-avatar-fallback {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: #18181b;
    border: 1px solid #27272a;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 750;
    flex-shrink: 0;
  }

  .activity-follow-chip.following {
    background: #141416;
    color: #71717a;
    border: 1px solid #222224;
  }

  .challenges-hero-card.empty-hero {
    min-height: 160px;
    padding: 24px;
  }

  /* Responsive Breakpoints */
  @media (max-width: 1080px) {
    .challenges-layout-grid {
      grid-template-columns: 1fr;
    }
    .challenges-solving-grid,
    .challenges-cards-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .challenges-page {
      padding: 16px;
    }
    .challenges-solving-grid,
    .challenges-cards-grid {
      grid-template-columns: 1fr;
    }
    .challenges-hero-top {
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }
    .challenges-hero-bottom {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }
    .challenges-hero-btn {
      width: 100%;
      justify-content: center;
    }
  }
`;
