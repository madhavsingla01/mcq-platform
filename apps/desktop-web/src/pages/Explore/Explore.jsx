import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Sparkles,
  Flame,
  Award,
  Clock,
  X,
} from 'lucide-react';
import { SocialService } from '../../services/social.service';
import { useAuthStore } from '../../store/authStore';
import { Spinner, EmptyState } from '../../components/ui';
import QuizCard from '../../components/quiz/QuizCard';
import './Explore.css';

export default function Explore() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL query parameters
  const urlTag = searchParams.get('tag') || searchParams.get('hashtag') || '';
  const urlSearch = searchParams.get('search') || searchParams.get('q') || '';
  const cleanUrlTag = urlTag ? urlTag.replace(/^#+/, '').trim() : '';
  const cleanUrlSearch = urlSearch ? urlSearch.trim() : '';
  const closestSearch = searchParams.has('q') && !searchParams.has('search');

  const user = useAuthStore((s) => s.user);
  const [page, setPage] = useState(1);
  const [feedMode, setFeedMode] = useState('foryou'); // 'foryou' | 'trending' | 'top' | 'newest'
  const preferenceDifficulty = user?.preferences?.defaultDifficulty || user?.preferences?.feed?.defaultDifficulty;
  const difficulty = preferenceDifficulty && preferenceDifficulty !== 'All Levels' ? preferenceDifficulty : 'all';
  const category = user?.preferences?.primaryCategory || user?.preferences?.feed?.preferredCategory || '';
  const [selectedTag, setSelectedTag] = useState(cleanUrlTag);
  const [searchQuery, setSearchQuery] = useState(cleanUrlSearch);
  // Quizzes state
  const [quizzes, setQuizzes] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [meta, setMeta] = useState(null);
  const [quizzesLoading, setQuizzesLoading] = useState(true);
  const [quizzesError, setQuizzesError] = useState('');
  const [retry, setRetry] = useState(0);

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
      if (closestSearch) params.match = 'closest';
    }
    if (difficulty && difficulty !== 'all') {
      params.difficulty = difficulty;
    }
    if (category && category !== 'All Categories') {
      params.category = category;
    }
    if (user?.preferences?.hideCompletedQuizzes ?? user?.preferences?.feed?.hideCompletedQuizzes) {
      params.hideCompleted = 'true';
    }
    if (user?.preferences?.filterUnverified ?? user?.preferences?.feed?.filterUnverified ?? user?.preferences?.showVerifiedOnly) {
      params.showVerifiedOnly = 'true';
    }

    SocialService.getExplore(params, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
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
        if (!controller.signal.aborted) setQuizzesLoading(false);
      });

    return () => controller.abort();
  }, [page, feedMode, selectedTag, searchQuery, closestSearch, difficulty, category, user, retry]);

  const handlePageChange = (newPage) => {
    if (newPage < 1 || (pagination && newPage > pagination.pages) || newPage === page) return;
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleModeChange = (newMode) => {
    setFeedMode(newMode);
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
      {/* Active Filter Pill indicator if tag is selected */}
      {selectedTag && (
        <div className="explore-active-filter-banner">
          <span>
            Filtering by hashtag: <strong>#{selectedTag}</strong>
            {pagination?.total !== undefined ? ` â€¢ ${pagination.total} ${pagination.total === 1 ? 'quiz' : 'quizzes'} available` : ''}
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
            {pagination?.total !== undefined ? ` â€¢ ${pagination.total} ${pagination.total === 1 ? 'quiz' : 'quizzes'} found` : ''}
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

      {/* â”€â”€ Discovery Feed Mode Bar (Instagram Algorithm Switcher) â”€â”€ */}
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

      </div>

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
              onClick: () => setRetry((value) => value + 1),
            }}
          />
        ) : quizzes.length === 0 ? (
          <EmptyState
            icon={<Search size={24} />}
            title="No quizzes match your feed"
            description={
              selectedTag || searchQuery
                ? 'No public quizzes match your topic or search.'
                : 'No public quizzes available in this mode yet.'
            }
            action={
              selectedTag || searchQuery
                ? {
                    label: 'Reset Filters',
                    onClick: () => {
                      const next = new URLSearchParams(searchParams);
                      ['tag', 'hashtag', 'search', 'q'].forEach((key) => next.delete(key));
                      setSearchParams(next, { replace: true });
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
            {/* Feed heading */}
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
                        â€¦
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
    </div>
  );
}
