import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Search,
  SlidersHorizontal,
  Sparkles,
  Flame,
  Award,
  Clock,
  X,
} from 'lucide-react';
import { SocialService } from '../../services/social.service';
import { useUIStore } from '../../store/uiStore';
import { Spinner, EmptyState } from '../../components/ui';
import QuizCard from '../../components/quiz/QuizCard';

export default function Explore() {
  const openSearch = useUIStore((s) => s.openSearch);
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL query parameters
  const urlTag = searchParams.get('tag') || searchParams.get('hashtag') || '';
  const urlSearch = searchParams.get('search') || searchParams.get('q') || '';
  const cleanUrlTag = urlTag ? urlTag.replace(/^#+/, '').trim() : '';
  const cleanUrlSearch = urlSearch ? urlSearch.trim() : '';

  const [page, setPage] = useState(1);
  const [feedMode, setFeedMode] = useState('foryou'); // 'foryou' | 'trending' | 'top' | 'newest'
  const [difficulty, setDifficulty] = useState('all'); // 'all' | 'Beginner' | 'Intermediate' | 'Advanced'
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTag, setSelectedTag] = useState(cleanUrlTag);
  const [searchQuery, setSearchQuery] = useState(cleanUrlSearch);
  // Quizzes state
  const [quizzes, setQuizzes] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [meta, setMeta] = useState(null);
  const [quizzesLoading, setQuizzesLoading] = useState(true);
  const [quizzesError, setQuizzesError] = useState('');

  // Synchronize state when URL parameters change (e.g. from Universal Search modal or browser navigation)
  useEffect(() => {
    setSelectedTag(cleanUrlTag);
    setSearchQuery(cleanUrlSearch);
    setPage(1);
  }, [cleanUrlTag, cleanUrlSearch]);

  // Fetch the explore feed with tag and search filters.
  useEffect(() => {
    const controller = new AbortController();
    setQuizzesLoading(true);
    setQuizzesError('');

    const params = {
      page,
      limit: 9,
      mode: feedMode,
    };

    if (selectedTag) {
      params.tag = selectedTag;
    }
    if (searchQuery) {
      params.search = searchQuery;
    }
    if (difficulty && difficulty !== 'all') {
      params.difficulty = difficulty;
    }

    SocialService.getExplore(params)
      .then((data) => {
        setQuizzes(data?.quizzes || []);
        setPagination(data?.pagination || null);
        setMeta(data?.meta || null);
      })
      .catch((err) => {
        if (err.code !== 'ERR_CANCELED') {
          setQuizzesError(err.response?.data?.message || 'Could not load quizzes.');
          setQuizzes([]);
        }
      })
      .finally(() => {
        setQuizzesLoading(false);
      });

    return () => controller.abort();
  }, [page, feedMode, selectedTag, searchQuery, difficulty]);

  const handlePageChange = (newPage) => {
    if (newPage < 1 || (pagination && newPage > pagination.pages) || newPage === page) return;
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleModeChange = (newMode) => {
    setFeedMode(newMode);
    setPage(1);
  };

  const handleDifficultyChange = (newDiff) => {
    setDifficulty(newDiff);
    setPage(1);
  };

  const handleClearTag = () => {
    setSelectedTag('');
    setPage(1);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('tag');
    newParams.delete('hashtag');
    setSearchParams(newParams, { replace: true });
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setPage(1);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('search');
    newParams.delete('q');
    setSearchParams(newParams, { replace: true });
  };

  const getPageNumbers = () => {
    if (!pagination || !pagination.pages) return [];
    const totalPages = pagination.pages;
    const current = pagination.page || page;
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (current <= 3) {
      return [1, 2, 3, 4, '...', totalPages];
    }
    if (current >= totalPages - 2) {
      return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', current - 1, current, current + 1, '...', totalPages];
  };

  return (
    <div className="explore-page-wrapper">
      {/* ── Top Header Row with Minimalist Underline Search ── */}
      <header className="explore-top-bar consistent-page-header">
        <div className="explore-title-wrap">
          <h1 className="explore-page-title consistent-page-title">Explore</h1>
        </div>

        <div className="explore-header-search consistent-page-search">
          <div
            className="explore-line-search consistent-search-field"
            onClick={() => openSearch(selectedTag ? `#${selectedTag}` : searchQuery || '')}
            role="button"
            tabIndex={0}
            title="Search quizzes, creators, #hashtags (Ctrl+K)"
          >
            <Search size={16} className="line-search-icon" />
            <input
              type="text"
              readOnly
              value={selectedTag ? `#${selectedTag}` : searchQuery ? searchQuery : ''}
              placeholder="Search"
              className="line-search-input consistent-search-input"
            />
            {Boolean(selectedTag || searchQuery) ? (
              <button
                type="button"
                className="explore-search-clear-inline-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (selectedTag) handleClearTag();
                  if (searchQuery) handleClearSearch();
                }}
                title="Clear filter"
                aria-label="Clear filter"
              >
                <X size={13} />
              </button>
            ) : (
              <span className="explore-search-shortcut-badge">Ctrl K</span>
            )}
          </div>
        </div>
      </header>

      {/* Active Filter Pill indicator if tag is selected */}
      {selectedTag && (
        <div className="explore-active-filter-banner">
          <span>
            Filtering by hashtag: <strong>#{selectedTag}</strong>
            {pagination?.total !== undefined ? ` • ${pagination.total} ${pagination.total === 1 ? 'quiz' : 'quizzes'} available` : ''}
          </span>
          <button
            type="button"
            className="explore-clear-tag-btn"
            onClick={handleClearTag}
            title="Clear hashtag filter"
          >
            <X size={13} />
            <span>Clear filter</span>
          </button>
        </div>
      )}

      {/* Active Search Pill indicator if search query is active */}
      {searchQuery && (
        <div className="explore-active-filter-banner">
          <span>
            Search results for: <strong>"{searchQuery}"</strong>
            {pagination?.total !== undefined ? ` • ${pagination.total} ${pagination.total === 1 ? 'quiz' : 'quizzes'} found` : ''}
          </span>
          <button
            type="button"
            className="explore-clear-tag-btn"
            onClick={handleClearSearch}
            title="Clear search"
          >
            <X size={13} />
            <span>Clear search</span>
          </button>
        </div>
      )}

      {/* ── Discovery Feed Mode Bar (Instagram Algorithm Switcher) ── */}
      <div className="explore-filter-bar">
        <div className="explore-filter-pills-row">
          <button
            type="button"
            className={`explore-pill icon-name-segment ${feedMode === 'foryou' ? 'active' : ''}`}
            aria-label="For You"
            title="For You"
            onClick={() => handleModeChange('foryou')}
          >
            <Sparkles size={14} className="explore-pill-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`explore-pill icon-name-segment ${feedMode === 'trending' ? 'active' : ''}`}
            aria-label="Trending"
            title="Trending"
            onClick={() => handleModeChange('trending')}
          >
            <Flame size={14} className="explore-pill-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`explore-pill icon-name-segment ${feedMode === 'top' ? 'active' : ''}`}
            aria-label="Top Rated"
            title="Top Rated"
            onClick={() => handleModeChange('top')}
          >
            <Award size={14} className="explore-pill-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`explore-pill icon-name-segment ${feedMode === 'newest' ? 'active' : ''}`}
            aria-label="Newest"
            title="Newest"
            onClick={() => handleModeChange('newest')}
          >
            <Clock size={14} className="explore-pill-icon" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          className={`explore-filter-toggle-btn ${showFilters || difficulty !== 'all' ? 'active' : ''}`}
          onClick={() => setShowFilters((prev) => !prev)}
          aria-label="Toggle difficulty filters"
        >
          <SlidersHorizontal size={14} />
          <span>Filters</span>
          {difficulty !== 'all' && <span className="explore-filter-active-dot" />}
        </button>
      </div>

      {/* ── Collapsible Difficulty Controls ── */}
      {showFilters && (
        <div className="explore-expanded-filters">
          <div className="explore-filter-control-row">
            <span className="explore-filter-label">Difficulty Level:</span>
            <div className="explore-subpills-wrap">
              {[
                { id: 'all', label: 'All Levels' },
                { id: 'Beginner', label: 'Beginner' },
                { id: 'Intermediate', label: 'Intermediate' },
                { id: 'Advanced', label: 'Advanced' },
              ].map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`explore-subpill ${difficulty === d.id ? 'active' : ''}`}
                  onClick={() => handleDifficultyChange(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content Flow: Pure Quiz Discovery Grid ── */}
      <div className="explore-content-flow">
        {quizzesLoading && quizzes.length === 0 ? (
          <div className="explore-loading-state">
            <Spinner size={36} />
            <span>Curating quizzes for your feed...</span>
          </div>
        ) : quizzesError ? (
          <EmptyState
            title="Unable to load feed"
            description={quizzesError}
            action={{
              label: 'Retry',
              onClick: () => setPage(1),
            }}
          />
        ) : quizzes.length === 0 ? (
          <EmptyState
            icon={<Search size={24} />}
            title="No quizzes match your feed"
            description={
              selectedTag || searchQuery || difficulty !== 'all'
                ? 'No public quizzes match your active topic, search, or difficulty filter.'
                : 'No public quizzes available in this mode yet.'
            }
            action={
              selectedTag || searchQuery || difficulty !== 'all'
                ? {
                    label: 'Reset Filters',
                    onClick: () => {
                      handleClearTag();
                      handleClearSearch();
                      setDifficulty('all');
                      setFeedMode('foryou');
                    },
                  }
                : {
                    label: 'Build a Quiz',
                    to: '/create/quiz',
                  }
            }
          />
        ) : (
          <>
            {/* Header Counter & Context Info */}
            <div className="explore-section-header">
              <div className="explore-section-title-wrap">
                <span className="explore-feed-label">
                  {feedMode === 'foryou'
                    ? 'Recommended Quizzes'
                    : feedMode === 'trending'
                    ? 'Trending Viral Quizzes'
                    : feedMode === 'top'
                    ? 'Top Ranked Quizzes'
                    : 'Recently Published Quizzes'}
                </span>
                {pagination?.total > 0 && (
                  <span className="explore-section-count-badge">
                    {pagination.total} {pagination.total === 1 ? 'quiz' : 'quizzes'}
                  </span>
                )}
              </div>

            </div>

            {/* Pure Responsive Quizzes Grid */}
            <div className={`explore-quizzes-grid ${quizzesLoading ? 'loading-fade' : ''}`}>
              {quizzes.map((quiz) => (
                <QuizCard key={quiz._id} quiz={quiz} />
              ))}
            </div>

            {/* Pagination Controls */}
            {pagination && pagination.pages > 1 && (
              <nav className="explore-pagination-bar" aria-label="Quizzes pagination">
                <button
                  type="button"
                  className="explore-page-nav-btn"
                  disabled={page <= 1 || quizzesLoading}
                  onClick={() => handlePageChange(page - 1)}
                  aria-label="Previous page"
                >
                  <ArrowLeft size={15} />
                  <span>Previous</span>
                </button>

                <div className="explore-page-numbers-wrap">
                  {getPageNumbers().map((num, idx) =>
                    num === '...' ? (
                      <span key={`ellipsis-${idx}`} className="explore-page-ellipsis">
                        …
                      </span>
                    ) : (
                      <button
                        key={`page-${num}`}
                        type="button"
                        className={`explore-page-num-btn ${num === page ? 'active' : ''}`}
                        disabled={quizzesLoading}
                        onClick={() => handlePageChange(num)}
                        aria-current={num === page ? 'page' : undefined}
                      >
                        {num}
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  className="explore-page-nav-btn"
                  disabled={page >= pagination.pages || quizzesLoading}
                  onClick={() => handlePageChange(page + 1)}
                  aria-label="Next page"
                >
                  <span>Next</span>
                  <ArrowRight size={15} />
                </button>
              </nav>
            )}
          </>
        )}
      </div>

      <style>{exploreStyles}</style>
    </div>
  );
}

const exploreStyles = `
  .explore-page-wrapper {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding-bottom: 40px;
  }

  .explore-page-wrapper > .explore-top-bar {
    margin-bottom: 28px;
  }

  .explore-line-search {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 40px;
    padding: 0 12px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: var(--radius-control, 8px);
    corner-shape: squircle;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    touch-action: manipulation;
    transition: transform var(--duration-tap) var(--ease-out), border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease;
  }

  .explore-line-search:active {
    transform: scale(0.99);
  }

  .explore-line-search:hover,
  .explore-line-search:focus-within {
    border-color: rgba(255, 255, 255, 0.24);
    background: rgba(255, 255, 255, 0.07);
    box-shadow: 0 0 0 1px rgba(255, 69, 0, 0.3), inset 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .line-search-icon {
    color: #6B7280;
    flex-shrink: 0;
    transition: color 0.15s ease;
  }

  .explore-line-search:hover .line-search-icon {
    color: #FF4500;
  }

  .line-search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #F9FAFB;
    font-size: 13.5px;
    font-weight: 500;
    cursor: pointer;
    padding: 0;
  }

  .line-search-input::placeholder {
    color: #6B7280;
  }

  .explore-search-shortcut-badge {
    font-size: 10.5px;
    font-weight: 700;
    color: #9CA3AF;
    background: #181818;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid #282828;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  .explore-search-clear-inline-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: none;
    color: #9CA3AF;
    cursor: pointer;
    touch-action: manipulation;
    flex-shrink: 0;
    transition: background-color 150ms ease, color 150ms ease, transform var(--duration-tap) var(--ease-out);
  }

  .explore-search-clear-inline-btn:active {
    transform: scale(0.92);
  }

  @media (hover: hover) and (pointer: fine) {
    .explore-search-clear-inline-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #FFFFFF;
    }
  }

  /* ── Active Filter Banner ── */
  .explore-active-filter-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(255, 69, 0, 0.08);
    border: 1px solid rgba(255, 69, 0, 0.25);
    padding: 7px 14px;
    border-radius: 8px;
    margin-bottom: 16px;
    font-size: 12.5px;
    color: #D1D5DB;
  }

  .explore-clear-tag-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    color: #FF6B00;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .explore-clear-tag-btn:hover {
    text-decoration: underline;
  }

  /* ── Filter Bar: Algorithm Mode Pills ── */
  .explore-filter-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
    padding-bottom: 0;
  }

  .explore-filter-pills-row {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .explore-filter-pills-row::-webkit-scrollbar {
    display: none;
  }

  .explore-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 11px;
    corner-shape: squircle;
    padding: 7px 14px;
    font-size: 13px;
    font-weight: 600;
    color: #9CA3AF;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .explore-pill-icon {
    flex-shrink: 0;
  }

  .explore-pill:hover {
    border-color: #383838;
    color: #FFFFFF;
  }

  .explore-pill.active {
    background: #1a1a1a;
    border-color: #FF4500;
    color: #FF6B00;
  }

  .explore-filter-toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #0d0d0d;
    border: 1px solid #222222;
    border-radius: 8px;
    padding: 7px 12px;
    font-size: 12.5px;
    font-weight: 600;
    color: #9CA3AF;
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;
    flex-shrink: 0;
  }

  .explore-filter-toggle-btn:hover,
  .explore-filter-toggle-btn.active {
    border-color: #FF4500;
    color: #FFFFFF;
  }

  .explore-filter-active-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #FF4500;
  }

  /* ── Expanded Difficulty Filters ── */
  .explore-expanded-filters {
    background: #0a0a0a;
    border: 1px solid #222222;
    border-radius: 10px;
    padding: 12px 16px;
    margin-bottom: 20px;
  }

  .explore-filter-control-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .explore-filter-label {
    font-size: 12px;
    font-weight: 700;
    color: #9CA3AF;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    min-width: 100px;
  }

  .explore-subpills-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .explore-subpill {
    background: #141414;
    border: 1px solid #282828;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 500;
    color: #D1D5DB;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .explore-subpill:hover {
    border-color: #FF4500;
    color: #FFFFFF;
  }

  .explore-subpill.active {
    background: rgba(255, 69, 0, 0.15);
    border-color: #FF4500;
    color: #FF6B00;
    font-weight: 700;
  }

  /* ── Section Header & Context Tag ── */
  .explore-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .explore-section-title-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .explore-feed-label {
    font-size: 17px;
    font-weight: 700;
    color: #FFFFFF;
    letter-spacing: -0.01em;
  }

  .explore-section-count-badge {
    font-size: 11.5px;
    font-weight: 700;
    color: #9CA3AF;
    background: #141414;
    padding: 2px 8px;
    border-radius: 9999px;
    border: 1px solid #222222;
  }


  /* ── Pure Quizzes Grid ── */
  .explore-quizzes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 20px;
    width: 100%;
    margin-bottom: 28px;
    transition: opacity 0.2s ease;
  }

  .explore-quizzes-grid.loading-fade {
    opacity: 0.65;
  }

  /* ── Loading State ── */
  .explore-loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 20px;
    gap: 14px;
    color: #9CA3AF;
    font-size: 14px;
    font-weight: 500;
  }

  /* ── Pagination Bar ── */
  .explore-pagination-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    margin-top: 10px;
    padding: 16px 0;
  }

  .explore-page-nav-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #0d0d0d;
    border: 1px solid #242424;
    border-radius: 8px;
    padding: 8px 14px;
    color: #E5E7EB;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .explore-page-nav-btn:hover:not(:disabled) {
    border-color: #FF4500;
    color: #FFFFFF;
    background: #141414;
  }

  .explore-page-nav-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .explore-page-numbers-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .explore-page-num-btn {
    min-width: 34px;
    height: 34px;
    border-radius: 6px;
    background: #0d0d0d;
    border: 1px solid #222222;
    color: #9CA3AF;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .explore-page-num-btn:hover:not(:disabled) {
    border-color: #FF4500;
    color: #FFFFFF;
  }

  .explore-page-num-btn.active {
    background: #FF4500;
    border-color: #FF4500;
    color: #FFFFFF;
    font-weight: 700;
  }

  .explore-page-ellipsis {
    color: #6B7280;
    padding: 0 4px;
    font-weight: 700;
  }

  @media (max-width: 768px) {
    .explore-subtitle {
      font-size: 12px;
    }

    .explore-hashtags-row {
      touch-action: pan-y;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      margin-bottom: 14px;
      padding-bottom: 4px;
    }

    .explore-filter-pills-row {
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      touch-action: pan-y;
    }

    .explore-filter-pills-row::-webkit-scrollbar {
      display: none;
    }

    .explore-quizzes-grid {
      grid-template-columns: 1fr;
      gap: 16px;
    }
  }
`;
