import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  FileText,
  HelpCircle,
  Plus,
  Search,
  Bookmark,
  Sparkles,
  Trophy,
  ArrowRight,
  Play,
  RotateCcw,
  CheckCircle2,
  Lock,
  Globe,
  SlidersHorizontal,
  Layers3,
  Edit3,
  Copy,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import api from '../../api/axios';
import QuizService from '../../services/quiz.service';
import QuizDetailsModal from '../../components/QuizModal/QuizDetailsModal';
import QuizCard from '../../components/quiz/QuizCard';
import ShareModal from '../../components/social/ShareModal';
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal';
import { Spinner, EmptyState } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const [quizzes, setQuizzes] = useState([]);
  const [activeAttempts, setActiveAttempts] = useState([]);
  const [bookmarkedQuizzes, setBookmarkedQuizzes] = useState([]);
  const [drafts, setDrafts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedQuizId, setSelectedQuizId] = useState(null);

  // Sharing & Delete states
  const [sharingQuiz, setSharingQuiz] = useState(null);
  const [quizToDelete, setQuizToDelete] = useState(null);
  const [isDeletingQuiz, setIsDeletingQuiz] = useState(false);

  // Draft Action states
  const [publishingDraftId, setPublishingDraftId] = useState(null);
  const [duplicatingDraftId, setDuplicatingDraftId] = useState(null);
  const [draftToDelete, setDraftToDelete] = useState(null);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);

  // Filters & Controls
  const [filterType, setFilterType] = useState('all'); // 'all' | 'public' | 'private'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'attempts' | 'questions' | 'title'
  const [activeTab, setActiveTab] = useState('quizzes'); // 'quizzes' | 'drafts' | 'bookmarks'

  // Pagination states
  const [quizPage, setQuizPage] = useState(1);
  const [draftPage, setDraftPage] = useState(1);
  const [bookmarkPage, setBookmarkPage] = useState(1);
  const QUIZ_PAGE_SIZE = 6;
  const DRAFT_PAGE_SIZE = 6;
  const BOOKMARK_PAGE_SIZE = 6;

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [myQuizzesRes, attemptsRes, bookmarksRes, draftsRes] = await Promise.all([
        api.get('/quiz/my'),
        api.get('/attempts/in-progress'),
        api.get('/social/bookmarks').catch(() => ({ data: { data: { quizzes: [] } } })),
        api.get('/quiz/drafts').catch(() => ({ data: { data: { drafts: [] } } })),
      ]);

      setQuizzes(myQuizzesRes.data?.data?.quizzes || []);
      setActiveAttempts(attemptsRes.data?.data?.attempts || []);
      setBookmarkedQuizzes(bookmarksRes.data?.data?.quizzes || []);
      setDrafts(draftsRes.data?.data?.drafts || []);
    } catch {
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleModalClose = useCallback(() => {
    setSelectedQuizId(null);
  }, []);

  const handleConfirmDeleteQuiz = async () => {
    if (!quizToDelete) return;
    try {
      setIsDeletingQuiz(true);
      await api.delete(`/quiz/${quizToDelete._id}`);
      setQuizToDelete(null);
      fetchDashboardData();
    } catch (err) {
      console.error('Failed to delete quiz:', err);
      alert(err.response?.data?.message || 'Failed to delete quiz');
    } finally {
      setIsDeletingQuiz(false);
    }
  };

  const handlePublishDraft = async (draft) => {
    if (!draft?._id) return;
    if ((draft.questionCount || 0) < 1) {
      alert('This draft has no questions yet. Please click Resume to add questions before publishing.');
      return;
    }
    try {
      setPublishingDraftId(draft._id);
      await QuizService.publishDraft(draft._id, { visibility: 'public' });
      setActionFeedback({
        type: 'success',
        message: `"${draft.title || 'Draft'}" ${draft.isChallenge ? 'challenge' : 'quiz'} has been published!`,
      });
      setTimeout(() => setActionFeedback(null), 4000);
      fetchDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to publish draft. Please verify all questions have valid options and answers.');
    } finally {
      setPublishingDraftId(null);
    }
  };

  const handleDuplicateDraft = async (draftId) => {
    try {
      setDuplicatingDraftId(draftId);
      await QuizService.duplicateDraft(draftId);
      setActionFeedback({ type: 'success', message: 'Draft duplicated successfully!' });
      setTimeout(() => setActionFeedback(null), 4000);
      fetchDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to duplicate draft.');
    } finally {
      setDuplicatingDraftId(null);
    }
  };

  const handleConfirmDeleteDraft = async () => {
    if (!draftToDelete) return;
    try {
      setIsDeletingDraft(true);
      await QuizService.deleteDraft(draftToDelete._id);
      setDraftToDelete(null);
      fetchDashboardData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete draft');
    } finally {
      setIsDeletingDraft(false);
    }
  };

  const isPublicQuiz = (quiz) => quiz?.visibility === 'public' || quiz?.isPublic === true;

  // KPI Calculations
  const totalQuizzes = quizzes.length;
  const publicQuizzesCount = useMemo(() => quizzes.filter(isPublicQuiz).length, [quizzes]);
  const privateQuizzesCount = totalQuizzes - publicQuizzesCount;
  const totalAttemptsCount = useMemo(
    () => quizzes.reduce((sum, q) => sum + (q.totalAttempts || 0), 0),
    [quizzes]
  );
  const totalQuestions = useMemo(
    () => quizzes.reduce((sum, q) => sum + (q.questionCount || q.questions?.length || 0), 0),
    [quizzes]
  );

  // Filtered and Sorted Quizzes
  const filteredQuizzes = useMemo(() => {
    return quizzes
      .filter((q) => {
        if (filterType === 'public') return isPublicQuiz(q);
        if (filterType === 'private') return !isPublicQuiz(q);
        return true;
      })
      .filter((q) => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
          q.title?.toLowerCase().includes(query) ||
          q.category?.toLowerCase().includes(query) ||
          q.tags?.some((t) => t.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'attempts') return (b.totalAttempts || 0) - (a.totalAttempts || 0);
        if (sortBy === 'questions') return (b.questionCount || 0) - (a.questionCount || 0);
        if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
  }, [quizzes, filterType, searchQuery, sortBy]);

  const filteredDrafts = useMemo(() => {
    return drafts
      .filter((d) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          d.title?.toLowerCase().includes(q) ||
          d.category?.toLowerCase().includes(q) ||
          d.tags?.some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  }, [drafts, searchQuery]);

  useEffect(() => {
    setQuizPage(1);
    setDraftPage(1);
    setBookmarkPage(1);
  }, [filterType, searchQuery, sortBy]);

  const totalQuizPages = Math.max(1, Math.ceil(filteredQuizzes.length / QUIZ_PAGE_SIZE));
  const pagedQuizzes = useMemo(() => {
    return filteredQuizzes.slice((quizPage - 1) * QUIZ_PAGE_SIZE, quizPage * QUIZ_PAGE_SIZE);
  }, [filteredQuizzes, quizPage]);

  const totalDraftPages = Math.max(1, Math.ceil(filteredDrafts.length / DRAFT_PAGE_SIZE));
  const pagedDrafts = useMemo(() => {
    return filteredDrafts.slice((draftPage - 1) * DRAFT_PAGE_SIZE, draftPage * DRAFT_PAGE_SIZE);
  }, [filteredDrafts, draftPage]);

  const filteredBookmarks = useMemo(() => {
    if (!searchQuery.trim()) return bookmarkedQuizzes;
    const query = searchQuery.toLowerCase();
    return bookmarkedQuizzes.filter((q) => (
      q.title?.toLowerCase().includes(query) ||
      q.category?.toLowerCase().includes(query) ||
      q.tags?.some((t) => t.toLowerCase().includes(query))
    ));
  }, [bookmarkedQuizzes, searchQuery]);

  const totalBookmarkPages = Math.max(1, Math.ceil(filteredBookmarks.length / BOOKMARK_PAGE_SIZE));
  const pagedBookmarks = useMemo(() => {
    return filteredBookmarks.slice((bookmarkPage - 1) * BOOKMARK_PAGE_SIZE, bookmarkPage * BOOKMARK_PAGE_SIZE);
  }, [filteredBookmarks, bookmarkPage]);

  if (loading) {
    return (
      <div className="mini-dash-loading">
        <Spinner size={32} />
        <span>Loading dashboard...</span>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="mini-dash-shell">
      {/* ── Top Header Bar ── */}
      <header className="mini-dash-header consistent-page-header">
        <div className="mini-dash-title-group">
          <h1 className="mini-dash-title consistent-page-title">Dashboard</h1>
        </div>

        <div className="mini-dash-actions consistent-page-search">
          {/* Minimalist Pill Search Bar */}
          <div className="mini-search-box consistent-search-field">
            <Search size={15} className="mini-search-icon" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mini-search-input consistent-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="mini-search-clear"
                onClick={() => setSearchQuery('')}
                title="Clear"
              >
                ✕
              </button>
            )}
          </div>

        </div>
      </header>

      {/* ── CONTINUE SOLVING (Only if in-progress attempts exist) ── */}
      {!error && activeAttempts.length > 0 && (
        <section className="mini-section">
          <div className="mini-section-header">
            <div className="section-title-wrap">
              <Clock size={16} className="section-title-icon text-orange" />
              <h2 className="section-title">Continue Solving</h2>
              <span className="section-count-badge">{activeAttempts.length}</span>
            </div>
          </div>


          <div className="mini-progress-grid">
            {activeAttempts.map((attempt) => {
              const quiz = attempt.quizId || {};
              const totalQ = quiz.questionCount || quiz.questions?.length || 1;
              const answered = Array.isArray(attempt.answers) ? attempt.answers.length : 0;
              const pct = Math.min(100, Math.round((answered / totalQ) * 100));

              return (
                <div key={attempt._id} className="mini-progress-card">
                  <div className="progress-card-top">
                    <span className="progress-badge">In Progress</span>
                    <span className="progress-time">Started {timeAgo(attempt.createdAt)}</span>
                  </div>

                  <h3 className="progress-title" onClick={() => navigate(`/quiz/${quiz._id}`)}>
                    {quiz.title || 'Untitled Quiz'}
                  </h3>

                  <div className="progress-bar-container">
                    <div className="progress-bar-fill" style={{ width: `${Math.max(5, pct)}%` }} />
                  </div>

                  <div className="progress-card-bottom">
                    <span className="progress-stat">
                      {answered} of {totalQ} questions answered ({pct}%)
                    </span>
                    <button
                      type="button"
                      className="progress-resume-btn"
                      onClick={() => navigate(`/quiz/${quiz._id}`)}
                    >
                      <Play size={12} fill="currentColor" />
                      <span>Resume</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── MAIN CONTENT TABS (My Quizzes & Saved Bookmarks) ── */}
      <section className="mini-section">
        {/* Navigation Tab Bar */}
        <div className="mini-tabs-bar">
          <div className="tabs-left">
            <button
              type="button"
              className={`main-tab-btn icon-name-segment ${activeTab === 'quizzes' ? 'active' : ''}`}
              aria-label="My Quizzes"
              title="My Quizzes"
              onClick={() => setActiveTab('quizzes')}
            >
              <FileText size={18} aria-hidden="true" />
            </button>

            <button
              type="button"
              className={`main-tab-btn icon-name-segment ${activeTab === 'drafts' ? 'active' : ''}`}
              aria-label="Drafts"
              title="Drafts"
              onClick={() => setActiveTab('drafts')}
            >
              <Edit3 size={18} className="tab-draft-icon" aria-hidden="true" />
            </button>

            <button
              type="button"
              className={`main-tab-btn icon-name-segment ${activeTab === 'bookmarks' ? 'active' : ''}`}
              aria-label="Saved Bookmarks"
              title="Saved Bookmarks"
              onClick={() => setActiveTab('bookmarks')}
            >
              <Bookmark size={18} className="tab-bookmark-icon" aria-hidden="true" />
            </button>
          </div>

          {/* Controls on the Right (Filters & Sorting for My Quizzes) */}
          {activeTab === 'quizzes' && (
            <div className="tabs-right-controls">
              <div className="filter-pill-group">
                <button
                  type="button"
                  className={`pill-btn icon-name-segment ${filterType === 'all' ? 'active' : ''}`}
                  aria-label="All quizzes"
                  title="All quizzes"
                  onClick={() => setFilterType('all')}
                >
                  <Layers3 size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`pill-btn icon-name-segment ${filterType === 'public' ? 'active' : ''}`}
                  aria-label="Public quizzes"
                  title="Public quizzes"
                  onClick={() => setFilterType('public')}
                >
                  <Globe size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`pill-btn icon-name-segment ${filterType === 'private' ? 'active' : ''}`}
                  aria-label="Private quizzes"
                  title="Private quizzes"
                  onClick={() => setFilterType('private')}
                >
                  <Lock size={15} aria-hidden="true" />
                </button>
              </div>

              <div className="mini-sort-wrap">
                <SlidersHorizontal size={13} className="sort-icon" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="mini-sort-select"
                  aria-label="Sort quizzes"
                >
                  <option value="newest">Newest</option>
                  <option value="attempts">Most Attempts</option>
                  <option value="questions">Questions</option>
                  <option value="title">Alphabetical (A-Z)</option>
                </select>
              </div>
            </div>
          )}

        </div>

        {/* ── TAB 1: MY QUIZZES ── */}
        {activeTab === 'quizzes' && (
          <div className="tab-pane-content">
            {!error && filteredQuizzes.length === 0 ? (
              <EmptyState
                icon={<HelpCircle size={24} />}
                title={searchQuery || filterType !== 'all' ? 'No quizzes match your filter' : 'No quizzes found'}
                description={
                  searchQuery || filterType !== 'all'
                    ? 'No quizzes match your active filter or search keywords.'
                    : "You haven't authored any quizzes yet. Create your first assessment or import a spreadsheet."
                }
                action={
                  searchQuery || filterType !== 'all'
                    ? {
                        label: 'Reset Filters',
                        onClick: () => {
                          setSearchQuery('');
                          setFilterType('all');
                        },
                      }
                    : {
                        label: 'Build a Quiz',
                        to: '/create/quiz',
                        icon: <Plus size={14} />,
                      }
                }
                secondaryAction={
                  searchQuery || filterType !== 'all'
                    ? null
                    : {
                        label: 'Import Spreadsheet',
                        to: '/create/upload',
                      }
                }
              />
            ) : (
              <>
                <div className="mini-cards-grid">
                  {pagedQuizzes.map((quiz) => (
                    <QuizCard
                      key={quiz._id}
                      quiz={quiz}
                      onSelectQuiz={(id) => setSelectedQuizId(id)}
                      onDelete={(id) => {
                        setQuizzes((prev) => prev.filter((q) => q._id !== id));
                      }}
                      onUpdate={(updated) => {
                        setQuizzes((prev) =>
                          prev.map((q) => (q._id === updated._id ? { ...q, ...updated } : q))
                        );
                      }}
                    />
                  ))}
                </div>

                {totalQuizPages > 1 && (
                  <div className="mini-pagination">
                    <button
                      type="button"
                      className="pagination-btn"
                      disabled={quizPage <= 1}
                      onClick={() => setQuizPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <span className="pagination-text">
                      Page {quizPage} of {totalQuizPages}
                    </span>
                    <button
                      type="button"
                      className="pagination-btn"
                      disabled={quizPage >= totalQuizPages}
                      onClick={() => setQuizPage((p) => Math.min(totalQuizPages, p + 1))}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── TAB 2: DRAFTS ── */}
        {activeTab === 'drafts' && (
          <div className="tab-pane-content">
            {!error && filteredDrafts.length === 0 ? (
              <EmptyState
                icon={<Edit3 size={24} />}
                title={searchQuery ? 'No drafts match your search' : 'No saved drafts'}
                description={
                  searchQuery
                    ? 'No draft titles or descriptions match your query keyword.'
                    : 'All your work-in-progress quizzes and question drafts will be safely stored here until you are ready to publish.'
                }
                action={{
                  label: 'Create a Draft',
                  to: '/create/manual',
                  icon: <Plus size={14} />,
                }}
                secondaryAction={{
                  label: 'Import Spreadsheet',
                  to: '/create/upload',
                }}
              />
            ) : (
              <>
                <div className="mini-cards-grid">
                  {pagedDrafts.map((draft) => (
                    <div key={draft._id} className="mini-draft-card">
                      <div className="draft-card-header">
                        <div className="draft-badge-group">
                          <span className="draft-status-pill">
                            <span className="draft-pulse-dot" /> DRAFT
                          </span>
                          <span className="draft-category-pill">{draft.category || 'General'}</span>
                        </div>
                        <span className="draft-updated-time">Edited {timeAgo(draft.updatedAt || draft.createdAt)}</span>
                      </div>

                      <div className="draft-card-body">
                        <h3
                          className="draft-title"
                          onClick={() => navigate(`/create/manual?draftId=${draft._id}`)}
                          title="Click to resume editing draft"
                        >
                          {draft.title || 'Untitled Draft'}
                        </h3>
                        {draft.description && (
                          <p className="draft-description">{draft.description}</p>
                        )}
                      </div>

                      {/* Readiness / Progress Meter */}
                      <div className="draft-readiness-box">
                        <div className="readiness-header">
                          <span className="readiness-label">Draft Readiness</span>
                          <span className={`readiness-status ${draft.isReadyToPublish ? 'ready' : 'incomplete'}`}>
                            {draft.isReadyToPublish ? (
                              <>
                                <CheckCircle2 size={12} />
                                <span>Ready to publish</span>
                              </>
                            ) : (
                              <span>{draft.readiness || 25}% complete</span>
                            )}
                          </span>
                        </div>
                        <div className="readiness-track">
                          <div
                            className="readiness-fill"
                            style={{
                              width: `${draft.readiness || 25}%`,
                              background: draft.isReadyToPublish
                                ? 'linear-gradient(90deg, #FF4500, #FF6B35)'
                                : 'linear-gradient(90deg, #FF4500, #FF8555)',
                            }}
                          />
                        </div>
                      </div>

                      {/* Metrics row */}
                      <div className="draft-metrics-row">
                        <span className="draft-metric-item">
                          <HelpCircle size={13} />
                          <strong>{draft.questionCount || 0}</strong> {draft.questionCount === 1 ? 'question' : 'questions'}
                        </span>
                        <span className="draft-metric-item">
                          <Clock size={13} />
                          {draft.settings?.timerMode === 'strict' ? `${draft.settings?.timeLimit || 0}m timed` : 'Untimed'}
                        </span>
                      </div>

                      {/* Actions Bar */}
                      <div className="draft-actions-bar">
                        <button
                          type="button"
                          className="draft-btn-edit"
                          onClick={() => navigate(`/create/manual?draftId=${draft._id}`)}
                          title={`Continue editing this ${draft.isChallenge ? 'challenge' : 'quiz'} draft in builder`}
                        >
                          <Edit3 size={13} />
                          <span>{draft.isChallenge ? 'Resume Challenge' : 'Resume'}</span>
                        </button>

                        <button
                          type="button"
                          className="draft-btn-publish"
                          disabled={publishingDraftId === draft._id}
                          onClick={() => handlePublishDraft(draft)}
                          title={draft.questionCount < 1
                            ? 'Add at least 1 question before publishing'
                            : `Publish as live ${draft.isChallenge ? 'challenge' : 'assessment'}`}
                        >
                          {publishingDraftId === draft._id ? (
                            <RefreshCw size={13} className="spin" />
                          ) : (
                            <Sparkles size={13} />
                          )}
                          <span>{draft.isChallenge ? 'Publish Challenge' : 'Publish'}</span>
                        </button>

                        <button
                          type="button"
                          className="draft-icon-btn"
                          disabled={duplicatingDraftId === draft._id}
                          onClick={() => handleDuplicateDraft(draft._id)}
                          title="Duplicate draft"
                        >
                          <Copy size={13} />
                        </button>

                        <button
                          type="button"
                          className="draft-icon-btn danger"
                          onClick={() => setDraftToDelete(draft)}
                          title="Discard draft"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {totalDraftPages > 1 && (
                  <div className="mini-pagination">
                    <button
                      type="button"
                      className="pagination-btn"
                      disabled={draftPage <= 1}
                      onClick={() => setDraftPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <span className="pagination-text">
                      Page {draftPage} of {totalDraftPages}
                    </span>
                    <button
                      type="button"
                      className="pagination-btn"
                      disabled={draftPage >= totalDraftPages}
                      onClick={() => setDraftPage((p) => Math.min(totalDraftPages, p + 1))}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── TAB 3: SAVED BOOKMARKS ── */}
        {activeTab === 'bookmarks' && (
          <div className="tab-pane-content">
            {!error && filteredBookmarks.length === 0 ? (
              <EmptyState
                icon={<Bookmark size={24} />}
                title={searchQuery ? 'No bookmarks match your search' : 'No saved bookmarks'}
                description={
                  searchQuery
                    ? 'No bookmarked quizzes match your search keyword.'
                    : 'You haven’t saved any quizzes to your bookmarks yet. Discover quizzes on Explore or Challenges and save them for study.'
                }
                action={{
                  label: 'Explore Quizzes',
                  to: '/explore',
                  icon: <ArrowRight size={14} />,
                }}
              />
            ) : (
              <>
                <div className="mini-cards-grid">
                  {pagedBookmarks.map((quiz) => (
                    <QuizCard key={quiz._id} quiz={quiz} />
                  ))}
                </div>

                {totalBookmarkPages > 1 && (
                  <div className="mini-pagination">
                    <button
                      type="button"
                      className="pagination-btn"
                      disabled={bookmarkPage <= 1}
                      onClick={() => setBookmarkPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <span className="pagination-text">
                      Page {bookmarkPage} of {totalBookmarkPages}
                    </span>
                    <button
                      type="button"
                      className="pagination-btn"
                      disabled={bookmarkPage >= totalBookmarkPages}
                      onClick={() => setBookmarkPage((p) => Math.min(totalBookmarkPages, p + 1))}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {/* Modals */}
      {selectedQuizId && (
        <QuizDetailsModal quizId={selectedQuizId} onClose={handleModalClose} />
      )}

      <ShareModal
        isOpen={Boolean(sharingQuiz)}
        onClose={() => setSharingQuiz(null)}
        quiz={sharingQuiz}
      />

      <ConfirmDeleteModal
        isOpen={Boolean(quizToDelete)}
        onClose={() => {
          if (!isDeletingQuiz) setQuizToDelete(null);
        }}
        onConfirm={handleConfirmDeleteQuiz}
        title={`Delete "${quizToDelete?.title || 'Quiz'}"?`}
        message="Are you sure you want to permanently delete this quiz?"
        details="This action cannot be undone. All questions, attempts, user comments, bookmarks, and activity history for this quiz will be permanently removed from the database."
        confirmText="Delete Permanently"
        isDeleting={isDeletingQuiz}
      />

      <ConfirmDeleteModal
        isOpen={Boolean(draftToDelete)}
        onClose={() => {
          if (!isDeletingDraft) setDraftToDelete(null);
        }}
        onConfirm={handleConfirmDeleteDraft}
        title={`Discard "${draftToDelete?.title || 'Draft'}"?`}
        message="Are you sure you want to permanently discard this draft?"
        details="This will delete all saved draft questions and progress. This action cannot be undone."
        confirmText="Discard Draft"
        isDeleting={isDeletingDraft}
      />

      {actionFeedback && (
        <div className="action-feedback-toast">
          <CheckCircle2 size={16} color="#10B981" />
          <span>{actionFeedback.message}</span>
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .mini-dash-shell {
    width: 100%;
    max-width: 1240px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 28px;
    padding: 8px 0 48px;
    box-sizing: border-box;
    background: #000000;
  }

  .mini-dash-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 80px 20px;
    color: #9CA3AF;
    font-size: 14px;
  }

  .mini-search-clear {
    background: transparent;
    border: none;
    color: #9CA3AF;
    cursor: pointer;
    font-size: 11px;
    padding: 0 2px;
  }

  .mini-search-clear:hover {
    color: #FFFFFF;
  }

  /* ── Buttons ── */
  .mini-btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
    height: var(--button-height, 40px);
    padding: 0 16px;
    border-radius: var(--radius-control, 8px);
    corner-shape: squircle;
    background: var(--color-primary, #FF4500);
    border: 1px solid transparent;
    color: #000000;
    font-size: 13.5px;
    font-weight: 700;
    letter-spacing: -0.01em;
    text-decoration: none;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    transition: transform var(--duration-tap) var(--ease-out), background-color 140ms ease, box-shadow 140ms ease;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 2px 8px rgba(255, 69, 0, 0.28);
  }

  .mini-btn-primary:active {
    transform: scale(0.97);
  }

  @media (hover: hover) and (pointer: fine) {
    .mini-btn-primary:hover {
      background: var(--color-primary-hover, #FF5714);
      transform: translateY(-1px);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 4px 14px rgba(255, 69, 0, 0.35);
    }
  }

  .mini-btn-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
    height: var(--button-height, 40px);
    padding: 0 16px;
    border-radius: var(--radius-control, 8px);
    corner-shape: squircle;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
    color: var(--color-text, #FFFFFF);
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: -0.01em;
    text-decoration: none;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    transition: transform var(--duration-tap) var(--ease-out), background-color 140ms ease, border-color 140ms ease;
  }

  .mini-btn-secondary:active {
    transform: scale(0.97);
  }

  @media (hover: hover) and (pointer: fine) {
    .mini-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.09);
      border-color: rgba(255, 255, 255, 0.22);
      color: #FFFFFF;
    }
  }

  /* ── Section Structure ── */
  .mini-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .mini-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-title {
    font-size: 17px;
    font-weight: 700;
    color: #FFFFFF;
    margin: 0;
  }

  .section-title-icon.text-orange {
    color: #FF4500;
  }

  .section-count-badge {
    background: rgba(255, 69, 0, 0.12);
    border: 1px solid rgba(255, 69, 0, 0.28);
    color: #FF4500;
    font-size: 11px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 9999px;
  }

  /* ── Continue Solving Progress Grid ── */
  .mini-progress-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: 14px;
    width: 100%;
    min-width: 0;
  }

  .mini-progress-card {
    background: var(--color-surface, #000000);
    border: 1px solid var(--color-border);
    border-left: 3px solid var(--color-primary, #FF4500);
    border-radius: var(--radius-container, 8px);
    padding: var(--space-4, 16px);
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
    transition: transform 0.15s ease, border-color 0.15s ease;
  }

  .mini-progress-card:hover {
    border-color: #FF4500;
    transform: translateY(-2px);
  }

  .progress-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .progress-badge {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: rgba(255, 69, 0, 0.12);
    color: #FF4500;
    padding: 2px 7px;
    border-radius: 4px;
  }

  .progress-time {
    font-size: 11.5px;
    color: #9CA3AF;
  }

  .progress-title {
    font-size: 15px;
    font-weight: 700;
    color: #FFFFFF;
    margin: 0;
    cursor: pointer;
    line-height: 1.35;
    transition: color 0.15s ease;
    overflow-wrap: anywhere;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .progress-title:hover {
    color: #FF4500;
  }

  .progress-bar-container {
    width: 100%;
    height: 4px;
    background: #262628;
    border-radius: 9999px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: #FF4500;
    border-radius: 9999px;
    transition: width 0.3s ease;
  }

  .progress-card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-top: 4px;
  }

  .progress-stat {
    font-size: 12px;
    color: #9CA3AF;
  }

  .progress-resume-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    border-radius: var(--radius-control, 6px);
    corner-shape: squircle;
    background: rgba(255, 69, 0, 0.12);
    border: 1px solid rgba(255, 69, 0, 0.3);
    color: #FF4500;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    transition: transform var(--duration-tap) var(--ease-out), background-color 140ms ease, color 140ms ease;
  }

  .progress-resume-btn:active {
    transform: scale(0.96);
  }

  @media (hover: hover) and (pointer: fine) {
    .progress-resume-btn:hover {
      background: #FF4500;
      color: #FFFFFF;
    }
  }

  /* ── Tabs Navigation Bar ── */
  .mini-tabs-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding-bottom: 0;
  }

  .tabs-left {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .main-tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    padding: 8px 14px;
    border-radius: 11px;
    corner-shape: squircle;
    background: transparent;
    border: 1px solid transparent;
    color: var(--color-text-secondary, rgba(255, 255, 255, 0.65));
    font-size: 14px;
    font-weight: 650;
    cursor: pointer;
    transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
  }

  .main-tab-btn:hover {
    color: var(--color-text, #FFFFFF);
    background: var(--color-surface-hover, rgba(255, 255, 255, 0.04));
  }

  .main-tab-btn.active {
    background: var(--color-primary-light, rgba(255, 69, 0, 0.12));
    border-color: var(--color-primary, #FF4500);
    color: var(--color-primary, #FF4500);
  }

  .tab-bookmark-icon {
    color: var(--color-primary, #FF4500);
  }

  .tab-pill-count {
    font-size: 11px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 9999px;
    background: #222225;
    color: #9CA3AF;
  }

  .main-tab-btn.active .tab-pill-count {
    background: var(--color-primary-light, rgba(255, 69, 0, 0.12));
    color: var(--color-primary, #FF4500);
  }

  .tabs-right-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  /* Segmented Filter Pills */
  .filter-pill-group {
    display: flex;
    align-items: center;
    background: var(--color-surface, #000000);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-control, 4px);
    padding: 2px;
    gap: 2px;
  }

  .pill-btn {
    background: transparent;
    border: none;
    padding: 6px 12px;
    border-radius: var(--radius-control, 4px);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .pill-btn:hover {
    color: #FFFFFF;
  }

  .pill-btn.active {
    background: var(--color-primary, #FF4500);
    color: #000000;
    font-weight: 700;
  }

  /* Minimal Sort Select */
  .mini-sort-wrap {
    position: relative;
    display: flex;
    align-items: center;
    background: var(--color-surface, #000000);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-control, 4px);
    padding: 0 10px;
    min-width: 178px;
    height: var(--button-height, 40px);
    transition: border-color 0.15s ease;
  }

  .mini-sort-wrap:focus-within {
    border-color: var(--color-primary, #FF4500);
  }

  .sort-icon {
    color: var(--color-text-muted);
    flex-shrink: 0;
    margin-right: 8px;
  }

  .mini-sort-select {
    appearance: none;
    color-scheme: dark;
    flex: 1;
    min-width: 0;
    height: 100%;
    border: none;
    outline: none;
    background: transparent;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right center;
    color: var(--color-text, #FFFFFF);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    line-height: 1.2;
    padding: 0 18px 0 0;
  }

  .mini-sort-select option {
    background-color: var(--color-surface-alt, #08080A);
    color: var(--color-text, #FFFFFF);
  }

  .mini-sort-select option:checked {
    background-color: var(--color-primary, #FF4500);
    color: #000000;
  }

  /* ── Cards Grid ── */
  .mini-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
    gap: var(--space-4, 16px);
    margin-top: 6px;
    width: 100%;
    min-width: 0;
  }

  /* ── Empty State ── */
  .mini-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 60px 24px;
    background: #111113;
    border: 1px dashed #262628;
    border-radius: 12px;
    margin-top: 6px;
  }

  .empty-icon {
    color: #9CA3AF;
    margin-bottom: 12px;
  }

  .empty-icon.text-orange {
    color: #FF4500;
  }

  .empty-title {
    font-size: 16px;
    font-weight: 700;
    color: #FFFFFF;
    margin: 0 0 6px;
  }

  .empty-desc {
    font-size: 13.5px;
    color: #9CA3AF;
    max-width: 440px;
    margin: 0 0 20px;
    line-height: 1.5;
  }

  .empty-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* ── Pagination ── */
  .mini-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-top: 24px;
    padding-top: 16px;
  }

  .pagination-btn {
    padding: 6px 14px;
    border-radius: 8px;
    background: #141416;
    border: 1px solid #262628;
    color: #FFFFFF;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .pagination-btn:hover:not(:disabled) {
    background: #1A1A1D;
    border-color: #FF4500;
    color: #FF4500;
  }

  .pagination-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .pagination-text {
    font-size: 12.5px;
    color: #9CA3AF;
  }

  @media (max-width: 860px) {
    .mini-tabs-bar {
      flex-direction: column;
      align-items: flex-start;
    }

    .tabs-right-controls {
      width: 100%;
      flex-wrap: wrap;
      justify-content: space-between;
    }
  }

  /* ── Draft Cards Grid & Card Styles ── */
  .draft-btn-glow {
    background: #F59E0B;
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.25);
  }

  .draft-btn-glow:hover {
    background: #FBBF24;
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35);
  }

  .text-amber {
    color: #F59E0B !important;
  }

  .draft-pill-count {
    background: var(--color-primary-light, rgba(255, 69, 0, 0.12)) !important;
    color: var(--color-primary, #FF4500) !important;
  }

  .main-tab-btn.active .draft-pill-count {
    background: var(--color-primary-light, rgba(255, 69, 0, 0.12)) !important;
    color: var(--color-primary, #FF4500) !important;
  }

  .tab-draft-icon {
    color: var(--color-primary, #FF4500);
  }

  .mini-draft-card {
    background: #090a0d;
    border: 1px solid #1f2229;
    border-radius: 14px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 14px;
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    position: relative;
    overflow: hidden;
  }

  .mini-draft-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 3.5px;
    height: 100%;
    background: #FF4500;
  }

  .mini-draft-card:hover {
    border-color: rgba(255, 69, 0, 0.55);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7), 0 0 12px rgba(255, 69, 0, 0.12);
  }

  .draft-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .draft-badge-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .draft-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10.5px;
    font-weight: 750;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: rgba(255, 69, 0, 0.12);
    border: 1px solid rgba(255, 69, 0, 0.35);
    color: #FF4500;
    padding: 2px 8px;
    border-radius: 5px;
  }

  .draft-pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #FF4500;
    box-shadow: 0 0 8px rgba(255, 69, 0, 0.85);
  }

  .draft-category-pill {
    font-size: 11px;
    color: #9CA3AF;
    background: #12151c;
    padding: 2px 8px;
    border-radius: 5px;
    border: 1px solid #1f2533;
  }

  .draft-updated-time {
    font-size: 11.5px;
    color: #71717A;
  }

  .draft-card-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .draft-title {
    font-size: 16px;
    font-weight: 700;
    color: #FFFFFF;
    margin: 0;
    cursor: pointer;
    line-height: 1.35;
    transition: color 0.15s ease;
    overflow-wrap: anywhere;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .draft-title:hover {
    color: #FF4500;
  }

  .draft-description {
    font-size: 12.5px;
    color: #9CA3AF;
    margin: 0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Readiness Bar */
  .draft-readiness-box {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    background: #0e1014;
    border-radius: 8px;
    border: 1px solid #1c2027;
  }

  .readiness-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11.5px;
  }

  .readiness-label {
    color: #A1A1AA;
    font-weight: 600;
  }

  .readiness-status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 700;
    font-size: 11px;
  }

  .readiness-status.ready {
    color: #FF4500;
  }

  .readiness-status.incomplete {
    color: #FF7733;
  }

  .readiness-track {
    width: 100%;
    height: 5px;
    background: #1c2027;
    border-radius: 9999px;
    overflow: hidden;
  }

  .readiness-fill {
    height: 100%;
    border-radius: 9999px;
    transition: width 0.3s ease;
  }

  .draft-metrics-row {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 12px;
    color: #A1A1AA;
  }

  .draft-metric-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  /* Actions Bar */
  .draft-actions-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid #1c2028;
  }

  .draft-btn-edit {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 34px;
    border-radius: 7px;
    background: #FF4500;
    border: 1px solid #FF4500;
    color: #ffffff;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .draft-btn-edit:hover {
    background: #ff5714;
    border-color: #ff5714;
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(255, 69, 0, 0.35);
  }

  .draft-btn-publish {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 34px;
    padding: 0 14px;
    border-radius: 7px;
    background: rgba(255, 69, 0, 0.10);
    border: 1px solid rgba(255, 69, 0, 0.38);
    color: #FF4500;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .draft-btn-publish:hover:not(:disabled) {
    background: #FF4500;
    border-color: #FF4500;
    color: #ffffff;
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(255, 69, 0, 0.35);
  }

  .draft-btn-publish:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .draft-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 7px;
    background: #111319;
    border: 1px solid #1f2533;
    color: #A1A1AA;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .draft-icon-btn:hover {
    background: #171c26;
    border-color: #313c4f;
    color: #ffffff;
  }

  .draft-icon-btn.danger:hover {
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.3);
    color: #EF4444;
  }

  .action-feedback-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #18181B;
    border: 1px solid #10B981;
    color: #FFFFFF;
    padding: 12px 18px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13.5px;
    font-weight: 600;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 9999;
    animation: fadeInToast 0.2s ease;
  }

  @keyframes fadeInToast {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 520px) {
    .mini-cards-grid {
      grid-template-columns: 1fr;
    }
  }
`;
