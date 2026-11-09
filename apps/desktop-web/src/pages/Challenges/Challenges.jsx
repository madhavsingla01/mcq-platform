import { usePageSearch, useSearchPage } from '../../components/search/PageSearchContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
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
  Shield,
  Medal,
  Clock,
  Eye,
  PlusCircle,
} from 'lucide-react';
import api from '../../api/axios';
import { ChallengeService } from '../../services/challenge.service';
import { useAuthStore } from '../../store/authStore';
import { Spinner, EmptyState, QuizCard, Button } from '../../components/ui';
import CompetitionLeaderboardModal from './CompetitionLeaderboardModal';
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

const CATEGORIES = [
  { id: 'all', label: 'All Categories' },
  { id: 'Coding', label: 'Coding' },
  { id: 'Algorithms', label: 'Algorithms' },
  { id: 'Math & Logic', label: 'Math & Logic' },
  { id: 'Science', label: 'Science' },
  { id: 'General', label: 'General' },
];

export default function Challenges() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Invariant state variables: activeTab, loading/setLoading, fetchChallenges
  const [activeTab, setActiveTab] = useState('active');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const { query: searchQuery } = usePageSearch();
  const [difficulty, setDifficulty] = useState('');
  const [page, setPage] = useSearchPage(searchQuery);
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [listError, setListError] = useState('');
  const [loading, setLoading] = useState(true);
  const listRequest = useRef(0);

  const [data, setData] = useState({
    stats: {
      dayStreak: 0,
      quizzesDone: 0,
      globalRank: null,
    },
    featuredChallenge: null,
    activeAttempts: [],
    trendingChallenges: [],
    topCreators: [],
    suggestedCreators: [],
  });

  const [challengeList, setChallengeList] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [followedMap, setFollowedMap] = useState({});
  const [bookmarkedMap, setBookmarkedMap] = useState({});
  const [bookmarkPending, setBookmarkPending] = useState({});

  // Leaderboard modal state
  const [leaderboardModalOpen, setLeaderboardModalOpen] = useState(false);
  const [activeChallengeForLeaderboard, setActiveChallengeForLeaderboard] = useState(null);

  /**
   * Authoritative data fetcher for Arena overview and challenges listing
   * Invariant: `fetchChallenges` and `setLoading` must remain defined in scope.
   */
  const fetchChallenges = useCallback(async () => {
    const request = ++listRequest.current;
    setListError('');
    try {
      setLoading(true);
      const statusParam = activeTab === 'ended' ? 'ended' : 'active';
      const [overview, listRes] = await Promise.all([
        ChallengeService.getOverview().catch((err) => {
          console.warn('[Challenges] Overview fallback:', err.message);
          return {};
        }),
        ChallengeService.listChallenges({
          status: statusParam,
          page,
          difficulty: difficulty || undefined,
          search: searchQuery.trim() || undefined,
          match: searchQuery.trim() ? 'closest' : undefined,
          category: selectedCategory && selectedCategory !== 'all' ? selectedCategory : undefined,
        }),
      ]);

      if (request !== listRequest.current) return;
      setData(overview || {});
      setChallengeList(listRes.challenges || []);
      setPagination(listRes.pagination || { page: 1, totalPages: 1, total: 0 });

      // Follow state keyed on username
      const followState = {};
      [...(overview?.topCreators || []), ...(overview?.suggestedCreators || [])].forEach((cr) => {
        if (cr?.username) {
          followState[cr.username] = Boolean(cr.isFollowing);
        }
      });
      setFollowedMap((prev) => ({ ...prev, ...followState }));

      // Bookmark state
      const bookmarkState = {};
      (listRes.challenges || []).forEach((c) => {
        if (c?._id) bookmarkState[c._id] = Boolean(c.isBookmarked);
      });
      if (overview?.featuredChallenge?._id) {
        bookmarkState[overview.featuredChallenge._id] = Boolean(overview.featuredChallenge.isBookmarked);
      }
      setBookmarkedMap((prev) => ({ ...prev, ...bookmarkState }));
    } catch (err) {
      if (request === listRequest.current) setListError(err.response?.data?.message || 'Could not load competitions.');
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [activeTab, selectedCategory, searchQuery, difficulty, page]);

  useEffect(() => {
    const timer = setTimeout(fetchChallenges, searchQuery ? 250 : 0);
    return () => { clearTimeout(timer); listRequest.current += 1; };
  }, [fetchChallenges, searchQuery]);

  /**
   * Fix Defect 5: Key on cr.username (not cr.name) and call /social/users/${username}/follow
   */
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
    if (!quizId || bookmarkPending[quizId]) return;
    const isCurrentlyBookmarked = Boolean(bookmarkedMap[quizId]);
    setBookmarkPending(previous => ({ ...previous, [quizId]: true }));
    setBookmarkedMap((prev) => ({ ...prev, [quizId]: !isCurrentlyBookmarked }));

    try {
      if (isCurrentlyBookmarked) {
        await api.delete(`/social/quizzes/${quizId}/bookmark`);
      } else {
        await api.post(`/social/quizzes/${quizId}/bookmark`);
      }
    } catch {
      setBookmarkedMap((prev) => ({ ...prev, [quizId]: isCurrentlyBookmarked }));
    } finally {
      setBookmarkPending(previous => ({ ...previous, [quizId]: false }));
    }
  };

  const handleOpenLeaderboard = (ch) => {
    if (!ch) return;
    setActiveChallengeForLeaderboard(ch);
    setLeaderboardModalOpen(true);
  };

  async function joinByCode(event) {
    event.preventDefault();
    const contestCode = code.trim();
    if (!/^!?[a-z\d-]{4,32}$/i.test(contestCode)) {
      setJoinError('Enter a valid contest code.');
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      const cleanCode = contestCode.replace(/^!/, '');
      const { challenge, deadlinePassed } = await ChallengeService.getChallengeByIdOrCode(cleanCode);
      if (!challenge?._id) throw new Error('Competition not found.');
      if (deadlinePassed) handleOpenLeaderboard(challenge);
      else navigate(`/challenges/${challenge._id}`);
    } catch (error) {
      setJoinError(error.response?.data?.message || error.message || 'Could not open this competition.');
    } finally { setJoining(false); }
  }


  return (
    <div className="challenges-page">
      {/* Page Header */}
      <div className="challenges-page-header app-page-tools"><span className="challenges-header-badge">Ranked Matches</span>
      </div>

      <section className="arena-quick-actions" aria-label="Competition actions">
        <div><h2>Find your next competition</h2><p>Browse live events or open a competition by code.</p></div>
        <form onSubmit={joinByCode} className="arena-join-form">
          <input aria-label="Contest code" placeholder="Contest code" value={code} maxLength={33}
            onChange={event => { setCode(event.target.value); setJoinError(''); }} required />
          <Button type="submit" variant="secondary" disabled={joining}>{joining ? 'Opening…' : 'Open by code'}</Button>
        </form>
        <Link to="/create/challenge" className="challenges-hero-btn">Host competition <ArrowRight size={16} /></Link>
        {joinError && <p className="arena-join-error" role="alert">{joinError}</p>}
      </section>

      <div className="challenges-layout-grid">
        {/* ========================================================
            LEFT MAIN COLUMN (70%)
            ======================================================== */}
        <div className="challenges-main-col">
          {/* Fix Defect 6: Featured Challenge Hero Card with "Enter Competition" and "View Standings" */}
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
                      <Trophy size={18} strokeWidth={2.5} color="#FF4500" />
                    </div>
                    <span className="challenges-hero-tag">FEATURED COMPETITION</span>
                  </div>
                  {data.featuredChallenge.deadlineAt && (
                    <span className="hero-deadline-badge">
                      <Clock size={13} />
                      Ends {new Date(data.featuredChallenge.deadlineAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <h2 className="challenges-hero-title">{data.featuredChallenge.title}</h2>
                <div className="challenges-hero-meta">
                  <span>{data.featuredChallenge.questionCount || data.featuredChallenge.questions?.length || 10} questions</span>
                  <span className="meta-sep">•</span>
                  <span>{data.featuredChallenge.difficulty || 'Intermediate'}</span>
                  <span className="meta-sep">•</span>
                  <span>{data.featuredChallenge.durationMinutes ? `${data.featuredChallenge.durationMinutes} mins` : 'Timed'}</span>
                </div>

                <div className="challenges-hero-bottom">
                  <div className="challenges-hero-joined">
                    <Users size={14} />
                    <span>{formatCount(data.featuredChallenge.totalAttempts || data.featuredChallenge.joinedCount)} registered contenders</span>
                  </div>

                  <div className="challenges-hero-btn-group">
                    <button
                      type="button"
                      className="challenges-hero-btn-secondary"
                      onClick={() => handleOpenLeaderboard(data.featuredChallenge)}
                    >
                      <Trophy size={15} />
                      <span>View Standings</span>
                    </button>
                    <button
                      type="button"
                      className="challenges-hero-btn"
                      onClick={() => navigate(`/challenges/${data.featuredChallenge._id}`)}
                    >
                      <span>Enter Competition</span>
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Fix Defect 1: Continue Solving Section (Never routes to /quiz/[object Object]) */}
          {data.activeAttempts?.length > 0 && <section className="challenges-section">
            <div className="challenges-section-header">
              <div className="section-title-wrap">
                <RotateCcw size={16} className="text-accent" />
                <h3>Continue Solving</h3>
              </div>
              <Link to="/dashboard" className="section-link">
                View all in Dashboard <ArrowRight size={13} />
              </Link>
            </div>

              <div className="challenges-solving-grid">
                {data.activeAttempts.map((att) => {
                  const qId = att.quizId?._id || att.quizId;
                  const qTitle = att.quizId?.title || att.title || 'Active Contest';
                  const totalQ = att.quizId?.questionCount || att.quizId?.questions?.length || att.questionsCount || 10;
                  return (
                    <QuizCard
                      key={att._id}
                      variant="attempt"
                      attempt={{
                        ...att,
                        title: qTitle,
                        quizId: qId,
                        questionsCount: totalQ,
                      }}
                      onResume={() => navigate(`/challenges/${qId}`)}
                    />
                  );
                })}
              </div>
          </section>}

          {/* Fix Defect 3: Dynamic Tabs for Live vs Ended Contests with server-side filters */}
          <section className="challenges-section">
            <div className="challenges-section-header challenges-tab-header">
              <div className="challenges-status-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab !== 'ended'}
                  className={`comp-status-tab ${activeTab !== 'ended' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('active'); setPage(1); }}
                >
                  <Zap size={15} />
                  <span>Live & Upcoming Contests</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'ended'}
                  className={`comp-status-tab ${activeTab === 'ended' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('ended'); setPage(1); }}
                >
                  <Trophy size={15} />
                  <span>Concluded Contests</span>
                </button>
              </div>

              {/* Category Pills */}
              <div className="challenges-category-pills">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`category-pill ${selectedCategory === cat.id ? 'active' : ''}`}
                    aria-pressed={selectedCategory === cat.id}
                    onClick={() => { setSelectedCategory(cat.id); setPage(1); }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <label className="arena-difficulty">Difficulty
                <select value={difficulty} onChange={event => { setDifficulty(event.target.value); setPage(1); }}>
                  <option value="">All levels</option>
                  {['Beginner', 'Intermediate', 'Advanced'].map(level => <option key={level}>{level}</option>)}
                </select>
              </label>
            </div>

            {listError ? (
              <div className="arena-list-status" role="alert">{listError} <Button onClick={fetchChallenges}>Retry</Button></div>
            ) : loading ? (
              <div className="arena-list-status" role="status"><Spinner size={24} /> Loading competitions…</div>
            ) : challengeList.length > 0 ? (
              <div className="challenges-cards-grid">
                {challengeList.map((item) => {
                  const isEnded = activeTab === 'ended' || (item.deadlineAt && new Date(item.deadlineAt) <= new Date());
                  return (
                    <article key={item._id} className="competition-item-card">
                      <div className="comp-card-top">
                        <div className="comp-card-icon-wrap">
                          {getChallengeIcon(item.category, item.contentKind)}
                        </div>
                        <span className={`comp-card-status-badge ${isEnded ? 'ended' : 'live'}`}>
                          {isEnded ? 'CONCLUDED' : 'LIVE CONTEST'}
                        </span>
                      </div>

                      <h3 className="comp-card-title" title={item.title}>
                        {item.title}
                      </h3>

                      <div className="comp-card-tags">
                        <span className="comp-tag-diff">{item.difficulty || 'All Levels'}</span>
                        <span className="comp-tag-duration">
                          ⏱ {item.durationMinutes ? `${item.durationMinutes}m` : 'Untimed'}
                        </span>
                        {item.category && <span className="comp-tag-cat">{item.category}</span>}
                      </div>

                      <div className="comp-card-footer">
                        <div className="comp-card-entrants">
                          <Users size={13} />
                          <span>{formatCount(item.totalAttempts || item.joinedCount || 0)}</span>
                        </div>

                        <div className="comp-card-actions">
                          <button
                            type="button"
                            className={`btn-icon-bookmark ${Boolean(bookmarkedMap[item._id]) ? 'active' : ''}`}
                            onClick={() => handleToggleBookmark(item._id)}
                            title="Bookmark contest"
                            aria-label="Bookmark contest"
                            aria-pressed={Boolean(bookmarkedMap[item._id])}
                            disabled={Boolean(bookmarkPending[item._id])}
                          >
                            <Bookmark
                              size={14}
                              fill={Boolean(bookmarkedMap[item._id]) ? '#FF4500' : 'none'}
                              color={Boolean(bookmarkedMap[item._id]) ? '#FF4500' : 'currentColor'}
                            />
                          </button>

                          {isEnded ? (
                            <button
                              type="button"
                              className="comp-card-standings-btn"
                              onClick={() => handleOpenLeaderboard(item)}
                              title="View Standings"
                            >
                              <Trophy size={13} />
                              <span>View Standings</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="comp-card-enter-btn"
                              onClick={() => navigate(`/challenges/${item._id}`)}
                              title="Enter Competition"
                            >
                              <span>Enter Competition</span>
                              <ArrowRight size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={<Sparkles size={24} />}
                title={searchQuery ? 'No matching competitions found' : 'No competitions in this view'}
                description={
                  searchQuery
                    ? `No contests match “${searchQuery}” in the ${activeTab === 'ended' ? 'concluded' : 'active'} arena.`
                    : activeTab === 'ended'
                    ? 'No completed competitions found in this category.'
                    : 'No active competitions found right now. Host your own competition or explore standard practice quizzes!'
                }
                action={{
                  label: 'Host a Competition',
                  onClick: () => navigate('/create/challenge'),
                }}
                secondaryAction={{
                  label: 'Explore Quizzes',
                  to: '/explore',
                }}
              />
            )}
            {!loading && !listError && pagination.totalPages > 1 && <nav className="arena-pagination" aria-label="Competition pages">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>Previous</Button>
              <span>Page {page} of {pagination.totalPages}</span>
              <Button variant="secondary" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(current => current + 1)}>Next</Button>
            </nav>}
          </section>
        </div>

        {/* ========================================================
            RIGHT SIDEBAR COLUMN (30%)
            ======================================================== */}
        <aside className="challenges-sidebar-col">
          {/* Fix Defect 2: Real Progress Panel (no fake 0% accuracy or disconnected counters) */}
          <div className="challenges-panel">
            <div className="panel-header">
              <div className="panel-title-wrap">
                <Trophy size={16} className="text-accent" color="#FF4500" />
                <h4>Contender Overview</h4>
              </div>
            </div>

            <div className="contender-overview-grid">
              <div className="contender-stat-card">
                <span className="stat-card-label">Contests Completed</span>
                <span className="stat-card-value">{data.stats?.quizzesDone ?? 0}</span>
                <span className="stat-card-sub">Ranked attempts</span>
              </div>
              <div className="contender-stat-card">
                <span className="stat-card-label">Active Streak</span>
                <span className="stat-card-value">{data.stats?.dayStreak ?? 0}d</span>
                <span className="stat-card-sub">Consecutive days</span>
              </div>
              <div className="contender-stat-card">
                <span className="stat-card-label">Active Contests</span>
                <span className="stat-card-value">{data.activeAttempts?.length ?? 0}</span>
                <span className="stat-card-sub">In progress</span>
              </div>
              <div className="contender-stat-card">
                <span className="stat-card-label">Global Arena Rank</span>
                <span className="stat-card-value">{data.stats?.globalRank || '#-'}</span>
                <span className="stat-card-sub">Leaderboard position</span>
              </div>
            </div>
          </div>

          {/* Fix Defect 5: Top Authors List (keyed on cr.username) */}
          <div className="challenges-panel">
            <div className="panel-header">
              <div className="panel-title-wrap">
                <Medal size={16} color="#FBBF24" />
                <h4>Top Contest Authors</h4>
              </div>
              <Link to="/explore" className="panel-view-all">View all <ArrowRight size={12} /></Link>
            </div>

            {data.topCreators && data.topCreators.length > 0 ? (
              <div className="creators-ranked-list">
                {data.topCreators.map((cr, idx) => {
                  const followKey = cr.username || cr.name;
                  const isFollowed = Boolean(followedMap[followKey]);
                  const isSelf = cr.username === user?.username;
                  return (
                    <div key={cr._id || cr.username || idx} className="creator-rank-row">
                      <span className="creator-rank-num">{idx + 1}</span>
                      {cr.avatar ? (
                        <img src={cr.avatar} alt={cr.name || cr.username} className="creator-avatar" />
                      ) : (
                        <div className="creator-avatar-fallback">
                          {(cr.name || cr.username || 'A').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="creator-meta">
                        <span className="creator-name" title={cr.name || cr.username}>
                          {cr.name || cr.username}
                        </span>
                        <span className="creator-followers">
                          {cr.quizCount ? `${cr.quizCount} contests` : `@${cr.username || 'author'}`}
                        </span>
                      </div>
                      {!isSelf && cr.username && (
                        <button
                          type="button"
                          className={`btn-follow-toggle ${isFollowed ? 'following' : ''}`}
                          onClick={() => handleToggleFollow(cr.username)}
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
                <p>No contest creators registered yet.</p>
              </div>
            )}
          </div>

        </aside>
      </div>

      {/* Fix Defect 4: Leaderboard View / Modal */}
      <CompetitionLeaderboardModal
        isOpen={leaderboardModalOpen}
        onClose={() => {
          setLeaderboardModalOpen(false);
          setActiveChallengeForLeaderboard(null);
        }}
        challengeId={activeChallengeForLeaderboard?._id}
        challengeTitle={activeChallengeForLeaderboard?.title}
      />
    </div>
  );
}
