import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Search,
  X,
  Clock,
  Hash,
  User,
  FileText,
  Users,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Copy,
  Check,
  Zap,
} from 'lucide-react';
import api from '../../api/axios';
import { SearchService } from '../../services/search.service';
import { useUIStore } from '../../store/uiStore';
import { Spinner, EmptyState } from '../ui';
import './GlobalSearchModal.css';

const RECENT_SEARCHES_STORAGE_KEY = 'quizfocus_recent_searches_v1';
const MAX_RECENT_SEARCHES = 10;

export default function GlobalSearchModal() {
  const navigate = useNavigate();
  const isSearchOpen = useUIStore(state => state.isSearchOpen);
  const searchInitialQuery = useUIStore(state => state.searchInitialQuery);
  const searchInitialTab = useUIStore(state => state.searchInitialTab);
  const closeSearch = useUIStore(state => state.closeSearch);

  const inputRef = useRef(null);
  const modalRef = useRef(null);
  const [anchor, setAnchor] = useState(null);

  const [query, setQuery] = useState(searchInitialQuery || '');
  const [activeTab, setActiveTab] = useState(searchInitialTab || 'top'); // 'top' | 'quizzes' | 'accounts' | 'tags'
  const [loading, setLoading] = useState(false);
  const [trendingTags, setTrendingTags] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [copiedCode, setCopiedCode] = useState('');
  const [results, setResults] = useState({
    quizzes: [],
    creators: [],
    tags: [],
    directMatch: null,
  });

  // Load recent searches on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
      if (stored) {
        setRecentSearches(JSON.parse(stored));
      }
    } catch {
      setRecentSearches([]);
    }
  }, []);

  useLayoutEffect(() => {
    if (!isSearchOpen) return;
    const trigger = document.getElementById('app-page-search');
    const previousFocus = document.activeElement;
    const align = () => {
      if (!trigger) { setAnchor(null); return; }
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(600, document.documentElement.clientWidth - 24);
      const left = Math.max(12, Math.min(rect.right - width, document.documentElement.clientWidth - width - 12));
      setAnchor({ top: Math.max(8, rect.top), left, width });
    };
    align();
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
    window.addEventListener('resize', align);
    return () => {
      window.removeEventListener('resize', align);
      requestAnimationFrame(() => {
        if (useUIStore.getState().isSearchOpen) return;
        if (previousFocus instanceof HTMLElement && previousFocus !== document.body && previousFocus.isConnected) {
          previousFocus.focus({ preventScroll: true });
        } else if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      });
    };
  }, [isSearchOpen]);

  useLayoutEffect(() => {
    if (!isSearchOpen) return;
    setQuery(searchInitialQuery || '');
    setActiveTab(searchInitialTab || 'top');
    inputRef.current?.select();
  }, [isSearchOpen, searchInitialQuery, searchInitialTab]);

  // Fetch trending hashtags dynamically from DB (zero hardcoding)
  useEffect(() => {
    if (!isSearchOpen) return;
    SearchService.getTrendingTags(10)
      .then((tags) => {
        setTrendingTags(tags || []);
      })
      .catch(() => {
        setTrendingTags([]);
      });
  }, [isSearchOpen]);


  useEffect(() => {
    if (!isSearchOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeSearch();
      }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(modalRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]') || [])
        .filter(element => element.tabIndex >= 0 && element.getClientRects().length);
      const target = e.shiftKey ? focusable.at(-1) : focusable[0];
      const boundary = e.shiftKey ? focusable[0] : focusable.at(-1);
      if (target && (document.activeElement === boundary || !modalRef.current.contains(document.activeElement))) {
        e.preventDefault();
        target.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, closeSearch]);

  // Debounced search query
  useEffect(() => {
    const trimmed = query.trim();
    if (!isSearchOpen || !trimmed) {
      setResults({ quizzes: [], creators: [], tags: [] });
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const handler = setTimeout(() => {
      api
        .get('/search/universal', {
          params: {
            q: trimmed,
            type: activeTab === 'top' ? 'all' : activeTab,
            limit: 15,
          },
          signal: controller.signal,
        })
        .then(({ data }) => {
          if (controller.signal.aborted) return;
          setResults({
            quizzes: data.data?.quizzes || [],
            creators: data.data?.creators || [],
            tags: data.data?.tags || [],
            directMatch: data.data?.directMatch || null,
          });
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setResults({ quizzes: [], creators: [], tags: [], directMatch: null });
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 240);

    return () => {
      clearTimeout(handler);
      controller.abort();
    };
  }, [isSearchOpen, query, activeTab]);

  const saveRecentSearch = useCallback((term) => {
    if (!term || !term.trim()) return;
    const clean = term.trim();
    setRecentSearches((prev) => {
      const filtered = prev.filter((item) => item.toLowerCase() !== clean.toLowerCase());
      const updated = [clean, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      try {
        localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const handleCopyCode = (e, code) => {
    e.stopPropagation();
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const applyPrefix = (prefix) => {
    setQuery((prev) => {
      const clean = prev.replace(/^[@!#]+/, '');
      return `${prefix}${clean}`;
    });
    inputRef.current?.focus();
  };

  const removeRecentSearch = (term, e) => {
    e?.stopPropagation();
    setRecentSearches((prev) => {
      const updated = prev.filter((item) => item !== term);
      try {
        localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const clearAllRecent = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    } catch {}
  };

  const handleSelectRecent = (term) => {
    const raw = String(term || '').trim();
    if (!raw) return;
    saveRecentSearch(raw);
    closeSearch();
    if (raw.startsWith('!') || /^QZ-[A-Z0-9]/i.test(raw)) {
      navigate(`/quiz/${encodeURIComponent(raw)}`);
    } else if (raw.startsWith('#')) {
      const cleanTag = raw.replace(/^#+/, '').trim();
      navigate(`/explore?tag=${encodeURIComponent(cleanTag)}`);
    } else if (raw.startsWith('@')) {
      navigate(`/@${raw.slice(1).trim()}`);
    } else {
      navigate(`/explore?search=${encodeURIComponent(raw)}`);
    }
  };

  const handleSelectTag = (tag) => {
    const cleanTag = String(tag || '').replace(/^#+/, '').trim();
    if (!cleanTag) return;
    saveRecentSearch(`#${cleanTag}`);
    closeSearch();
    navigate(`/explore?tag=${encodeURIComponent(cleanTag)}`);
  };

  const handleSelectCreator = (creator) => {
    saveRecentSearch(`@${creator.username}`);
    closeSearch();
    navigate(`/@${creator.username}`);
  };

  const handleSelectQuiz = (quiz) => {
    saveRecentSearch(quiz.quizCode || quiz.title);
    closeSearch();
    navigate(`/quiz/${quiz._id}`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    saveRecentSearch(trimmed);
    closeSearch();
    if (results.directMatch?.type === 'quiz') {
      navigate(`/quiz/${results.directMatch.quiz._id}`);
      return;
    }
    if (results.directMatch?.type === 'creator') {
      navigate(`/@${results.directMatch.creator.username}`);
      return;
    }
    if (trimmed.startsWith('!') || /^QZ-[A-Z0-9]/i.test(trimmed)) {
      navigate(`/quiz/${encodeURIComponent(trimmed)}`);
    } else if (trimmed.startsWith('#')) {
      const cleanTag = trimmed.replace(/^#+/, '').trim();
      navigate(`/explore?tag=${encodeURIComponent(cleanTag)}`);
    } else if (trimmed.startsWith('@')) {
      navigate(`/@${trimmed.slice(1).trim()}`);
    } else {
      navigate(`/explore?search=${encodeURIComponent(trimmed)}`);
    }
  };

  if (!isSearchOpen) return null;

  const hasQuery = query.trim().length > 0;
  const isTopTab = activeTab === 'top';
  const isQuizzesTab = activeTab === 'quizzes';
  const isAccountsTab = activeTab === 'accounts';
  const isTagsTab = activeTab === 'tags';

  const totalResults =
    results.quizzes.length + results.creators.length + results.tags.length;

  return (
    <div
      className="global-search-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeSearch();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Universal Search Window"
    >
      <div className={`global-search-container ${anchor ? 'global-search-anchored' : ''}`} style={anchor || undefined} ref={modalRef}>
        {/* ── Top Bar: Search Input ── */}
        <form onSubmit={handleSubmit} className="global-search-input-row" role="search">
          <Search size={18} className="global-search-input-icon" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Universal search"
            className="global-search-input consistent-search-input"
            autoComplete="off"
            spellCheck="false"
          />
          {hasQuery && (
            <button
              type="button"
              className="global-search-icon-btn"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              title="Clear search"
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
          <button type="button" className="global-search-icon-btn" onClick={closeSearch} aria-label="Close universal search">
            <X size={16} />
          </button>
        </form>

        {/* ── Fast Search Prefix Filter Chips ── */}
        <div className="global-search-syntax-row">
          <span className="syntax-hint-label">Fast Search:</span>
          <button
            type="button"
            className={`syntax-chip ${query.startsWith('!') ? 'active' : ''}`}
            onClick={() => applyPrefix('!')}
            title="Fast search by unique !QZ- code"
          >
            <span className="syntax-symbol">!</span> Quizzes
          </button>
          <button
            type="button"
            className={`syntax-chip ${query.startsWith('@') ? 'active' : ''}`}
            onClick={() => applyPrefix('@')}
            title="Fast search creators by @username"
          >
            <span className="syntax-symbol">@</span> Creators
          </button>
          <button
            type="button"
            className={`syntax-chip ${query.startsWith('#') ? 'active' : ''}`}
            onClick={() => applyPrefix('#')}
            title="Fast search topics by #hashtag"
          >
            <span className="syntax-symbol">#</span> Topics
          </button>
        </div>

        {/* ── Instagram-Style Category Tabs ── */}
        <div className="global-search-tabs">
          {[
            { id: 'top', label: 'Top' },
            { id: 'quizzes', label: 'Quizzes' },
            { id: 'accounts', label: 'Accounts' },
            { id: 'tags', label: 'Tags' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`global-search-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
              {activeTab === tab.id && <div className="tab-active-indicator" />}
            </button>
          ))}
        </div>

        {/* ── Main Content Area ── */}
        <div className="global-search-body">
          {/* Direct Match Jump Banner */}
          {results.directMatch?.type === 'quiz' && (
            <div
              className="search-direct-jump-card"
              onClick={() => {
                saveRecentSearch(results.directMatch.quiz.quizCode || results.directMatch.quiz.title);
                closeSearch();
                navigate(`/quiz/${results.directMatch.quiz._id}`);
              }}
            >
              <div className="direct-jump-badge-wrap">
                <Zap size={14} className="direct-jump-zap-icon" />
                <span className="direct-jump-label">Direct Code Match</span>
                <span className="direct-jump-code">{results.directMatch.quiz.quizCode}</span>
              </div>
              <div className="direct-jump-content">
                <h4 className="direct-jump-title">{results.directMatch.quiz.title}</h4>
                <span className="direct-jump-cta">Press Enter to Jump ⚡</span>
              </div>
            </div>
          )}
          {loading ? (
            <div className="global-search-loading-state">
              <Spinner size={32} />
              <span>Searching QuizFocus...</span>
            </div>
          ) : !hasQuery ? (
            /* ── Empty Query: Recent Searches & Trending Hashtags ── */
            <div className="global-search-empty-feed">
              {/* Recent Searches Section */}
              <div className="search-section">
                <div className="search-section-header">
                  <span className="search-section-title">Recent</span>
                  {recentSearches.length > 0 && (
                    <button
                      type="button"
                      className="search-clear-all-btn"
                      onClick={clearAllRecent}
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {recentSearches.length > 0 ? (
                  <div className="search-recent-list">
                    {recentSearches.map((term, index) => {
                      const isTag = term.startsWith('#');
                      const isAccount = term.startsWith('@');
                      return (
                        <div
                          key={`${term}-${index}`}
                          className="search-recent-item"
                          onClick={() => handleSelectRecent(term)}
                        >
                          <div className="search-recent-icon">
                            {isTag ? (
                              <Hash size={15} />
                            ) : isAccount ? (
                              <User size={15} />
                            ) : (
                              <Clock size={15} />
                            )}
                          </div>
                          <span className="search-recent-text">{term}</span>
                          <button
                            type="button"
                            className="search-recent-remove-btn"
                            onClick={(e) => removeRecentSearch(term, e)}
                            title="Remove"
                            aria-label={`Remove ${term}`}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="search-no-recent-text">No recent searches.</p>
                )}
              </div>

              {/* Trending Hashtags Section */}
              <div className="search-section trending-section">
                <div className="search-section-header">
                  <div className="trending-title-wrap">
                    <TrendingUp size={15} className="trending-icon" />
                    <span className="search-section-title">Trending Hashtags</span>
                  </div>
                </div>

                <div className="search-trending-chips">
                  {trendingTags.length > 0 ? (
                    trendingTags.map((t) => (
                      <button
                        key={t.tag}
                        type="button"
                        className="trending-tag-chip"
                        onClick={() => handleSelectTag(t.tag)}
                      >
                        <Hash size={13} className="chip-hash-icon" />
                        <span className="chip-tag-name">{t.tag}</span>
                        {t.count > 0 && (
                          <span className="chip-count">{t.count}</span>
                        )}
                      </button>
                    ))
                  ) : (
                    <span className="search-no-recent-text">No trending hashtags yet.</span>
                  )}
                </div>
              </div>
            </div>
          ) : totalResults === 0 ? (
            /* ── Zero Results State ── */
            <div className="global-search-empty-results">
              <EmptyState
                title="No results found"
                description={`We couldn't find any matches for "${query}". Try searching for quizzes, creators, or specific hashtags.`}
              />
            </div>
          ) : (
            /* ── Results by Active Tab ── */
            <div className="global-search-results-list">
              {/* TOP TAB: Blended Best Matches */}
              {isTopTab && (
                <>
                  {/* Creators match in Top */}
                  {results.creators.length > 0 && (
                    <div className="search-results-group">
                      <div className="group-header">
                        <span className="group-title">Accounts</span>
                      </div>
                      <div className="creators-compact-list">
                        {results.creators.slice(0, 3).map((creator) => (
                          <div
                            key={creator._id}
                            className="search-result-row account-row"
                            onClick={() => handleSelectCreator(creator)}
                          >
                            <div className="result-avatar">
                              {creator.avatar ? (
                                <img src={creator.avatar} alt={creator.username} />
                              ) : (
                                <div className="result-avatar-placeholder">
                                  {(creator.name?.[0] || creator.username?.[0] || 'U').toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="result-info">
                              <span className="result-primary-text">{creator.name}</span>
                              <span className="result-secondary-text">@{creator.username}</span>
                            </div>
                            <div className="result-badge">
                              {creator.followersCount || 0} followers
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hashtags match in Top */}
                  {results.tags.length > 0 && (
                    <div className="search-results-group">
                      <div className="group-header">
                        <span className="group-title">Hashtags</span>
                      </div>
                      <div className="tags-compact-list">
                        {results.tags.slice(0, 3).map((t) => (
                          <div
                            key={t.tag}
                            className="search-result-row tag-row"
                            onClick={() => handleSelectTag(t.tag)}
                          >
                            <div className="tag-icon-circle">
                              <Hash size={16} />
                            </div>
                            <div className="result-info">
                              <span className="result-primary-text">#{t.tag}</span>
                              <span className="result-secondary-text">
                                {t.count} {t.count === 1 ? 'quiz' : 'quizzes'}
                              </span>
                            </div>
                            <ArrowRight size={14} className="result-arrow-icon" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quizzes match in Top */}
                  {results.quizzes.length > 0 && (
                    <div className="search-results-group">
                      <div className="group-header">
                        <span className="group-title">Quizzes</span>
                      </div>
                      <div className="quizzes-compact-list">
                        {results.quizzes.map((quiz) => (
                          <div
                            key={quiz._id}
                            className="search-result-row quiz-row"
                            onClick={() => handleSelectQuiz(quiz)}
                          >
                            <div className="quiz-doc-circle">
                              <FileText size={16} />
                            </div>
                            <div className="result-info">
                              <div className="result-title-code-row">
                                <span className="result-primary-text">{quiz.title}</span>
                                {quiz.quizCode && (
                                  <span
                                    className="quiz-row-code-badge"
                                    onClick={(e) => handleCopyCode(e, quiz.quizCode)}
                                    title="Click to copy quiz ID"
                                  >
                                    <span className="code-symbol">!</span>
                                    <span>{quiz.quizCode.replace(/^!/, '')}</span>
                                    {copiedCode === quiz.quizCode ? (
                                      <Check size={11} className="copy-icon success" />
                                    ) : (
                                      <Copy size={11} className="copy-icon" />
                                    )}
                                  </span>
                                )}
                              </div>
                              <div className="quiz-meta-subline">
                                <span className="quiz-meta-item">
                                  {quiz.questionCount || 0} questions
                                </span>
                                <span className="quiz-meta-dot">•</span>
                                <span className="quiz-meta-item">
                                  {quiz.totalAttempts || 0} attempts
                                </span>
                                {quiz.tags && quiz.tags.length > 0 && (
                                  <>
                                    <span className="quiz-meta-dot">•</span>
                                    <span className="quiz-meta-tag">#{quiz.tags[0]}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="quiz-diff-badge">{quiz.difficulty || 'All Levels'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* QUIZZES TAB */}
              {isQuizzesTab && (
                <div className="quizzes-full-list">
                  {results.quizzes.length > 0 ? (
                    results.quizzes.map((quiz) => (
                      <div
                        key={quiz._id}
                        className="search-result-row quiz-row"
                        onClick={() => handleSelectQuiz(quiz)}
                      >
                        <div className="quiz-doc-circle">
                          <FileText size={16} />
                        </div>
                        <div className="result-info">
                          <div className="result-title-code-row">
                            <span className="result-primary-text">{quiz.title}</span>
                            {quiz.quizCode && (
                              <span
                                className="quiz-row-code-badge"
                                onClick={(e) => handleCopyCode(e, quiz.quizCode)}
                                title="Click to copy quiz ID"
                              >
                                <span className="code-symbol">!</span>
                                <span>{quiz.quizCode.replace(/^!/, '')}</span>
                                {copiedCode === quiz.quizCode ? (
                                  <Check size={11} className="copy-icon success" />
                                ) : (
                                  <Copy size={11} className="copy-icon" />
                                )}
                              </span>
                            )}
                          </div>
                          <div className="quiz-meta-subline">
                            <span className="quiz-meta-item">
                              {quiz.questionCount || 0} questions
                            </span>
                            <span className="quiz-meta-dot">•</span>
                            <span className="quiz-meta-item">
                              {quiz.totalAttempts || 0} attempts
                            </span>
                            {quiz.uploader?.username && (
                              <>
                                <span className="quiz-meta-dot">•</span>
                                <span className="quiz-meta-item">by @{quiz.uploader.username}</span>
                              </>
                            )}
                          </div>
                          {quiz.tags && quiz.tags.length > 0 && (
                            <div className="quiz-row-tags">
                              {quiz.tags.slice(0, 3).map((t) => (
                                <span key={t} className="quiz-row-tag-pill">
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="quiz-diff-badge">{quiz.difficulty || 'All Levels'}</div>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      title="No quizzes found"
                      description={`No quizzes match "${query}". Try searching a different keyword or hashtag.`}
                    />
                  )}
                </div>
              )}

              {/* ACCOUNTS TAB */}
              {isAccountsTab && (
                <div className="creators-full-list">
                  {results.creators.length > 0 ? (
                    results.creators.map((creator) => (
                      <div
                        key={creator._id}
                        className="search-result-row account-row"
                        onClick={() => handleSelectCreator(creator)}
                      >
                        <div className="result-avatar">
                          {creator.avatar ? (
                            <img src={creator.avatar} alt={creator.username} />
                          ) : (
                            <div className="result-avatar-placeholder">
                              {(creator.name?.[0] || creator.username?.[0] || 'U').toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="result-info">
                          <span className="result-primary-text">{creator.name}</span>
                          <span className="result-secondary-text">@{creator.username}</span>
                          {creator.bio && (
                            <span className="result-bio-preview">{creator.bio}</span>
                          )}
                        </div>
                        <div className="result-badge">
                          {creator.followersCount || 0} followers
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      title="No accounts found"
                      description={`No users found matching "${query}".`}
                    />
                  )}
                </div>
              )}

              {/* TAGS TAB */}
              {isTagsTab && (
                <div className="tags-full-list">
                  {results.tags.length > 0 ? (
                    results.tags.map((t) => (
                      <div
                        key={t.tag}
                        className="search-result-row tag-row"
                        onClick={() => handleSelectTag(t.tag)}
                      >
                        <div className="tag-icon-circle">
                          <Hash size={18} />
                        </div>
                        <div className="result-info">
                          <span className="result-primary-text">#{t.tag}</span>
                          <span className="result-secondary-text">
                            {t.count} {t.count === 1 ? 'quiz' : 'quizzes'}
                          </span>
                        </div>
                        <ArrowRight size={15} className="result-arrow-icon" />
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      title="No hashtags found"
                      description={`No quizzes are tagged with "${query}".`}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
