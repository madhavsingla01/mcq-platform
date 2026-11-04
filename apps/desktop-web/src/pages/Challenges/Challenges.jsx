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
import './Challenges.css';

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
        const res = await api.get('/challenges/overview');
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
              <h2 className="challenges-title">{displayName} ðŸ‘‹</h2>
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
              {data.featuredChallenge.thumbnail && (
                <img
                  src={data.featuredChallenge.thumbnail}
                  alt={data.featuredChallenge.title}
                  className="challenges-hero-bg"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              <div className="challenges-hero-overlay" />

              <div className="challenges-hero-content">
                <div className="challenges-hero-top">
                  <div className="challenges-hero-tag-wrap">
                    <div className="challenges-hero-code-icon">
                      <Code size={18} strokeWidth={2.5} />
                    </div>
                    <span className="challenges-hero-tag">FEATURED CHALLENGE</span>
                  </div>
                </div>

                <h2 className="challenges-hero-title">{data.featuredChallenge.title}</h2>
                <div className="challenges-hero-meta">
                  <span>{data.featuredChallenge.questionCount} questions</span>
                  <span className="meta-sep">â€¢</span>
                  <span>{data.featuredChallenge.difficulty}</span>
                  <span className="meta-sep">â€¢</span>
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
                        <span className="duration-tag">â± {item.duration}</span>
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
                  ? `No challenges match â€œ${searchQuery}â€ and the selected filter.`
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
    </div>
  );
}
