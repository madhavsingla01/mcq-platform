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
import QuizCardOverflowMenu from '../../components/quiz/QuizCardOverflowMenu';
import ShareModal from '../../components/social/ShareModal';
import ConfirmDeleteModal from '../../components/ui/ConfirmDeleteModal';
import { Spinner, EmptyState } from '../../components/ui';
import CustomSelect from '../../components/ui/CustomSelect';
import { useAuthStore } from '../../store/authStore';
import './Dashboard.css';

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
      </div>
    );
  }

  return (
    <div className="mini-dash-shell">
      {/* â”€â”€ Top Header Bar â”€â”€ */}
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
                âœ•
              </button>
            )}
          </div>

        </div>
      </header>

      {/* â”€â”€ CONTINUE SOLVING (Only if in-progress attempts exist) â”€â”€ */}
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

      {/* â”€â”€ MAIN CONTENT TABS (My Quizzes & Saved Bookmarks) â”€â”€ */}
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
                <CustomSelect
                  value={sortBy}
                  onChange={setSortBy}
                  className="mini-sort-custom-select"
                  dropdownClassName="mini-sort-dropdown"
                  ariaLabel="Sort quizzes"
                  size="sm"
                  portal
                  options={[
                    { value: 'newest', label: 'Newest' },
                    { value: 'attempts', label: 'Most Attempts' },
                    { value: 'questions', label: 'Questions' },
                    { value: 'title', label: 'Alphabetical (A-Z)' },
                  ]}
                />
              </div>
            </div>
          )}

        </div>

        {/* â”€â”€ TAB 1: MY QUIZZES â”€â”€ */}
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

        {/* â”€â”€ TAB 2: DRAFTS â”€â”€ */}
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
                        <h3
                          className="draft-title"
                          onClick={() => navigate(`/create/manual?draftId=${draft._id}`)}
                          title="Click to resume editing draft"
                        >
                          {draft.title || 'Untitled Draft'}
                        </h3>
                        <QuizCardOverflowMenu
                          label="Draft details and actions"
                          details={[
                            { label: 'Status', value: draft.isChallenge ? 'Challenge draft' : 'Quiz draft' },
                            { label: 'Category', value: draft.category || 'General' },
                            { label: 'Edited', value: timeAgo(draft.updatedAt || draft.createdAt) },
                            { label: 'Description', value: draft.description || null },
                            {
                              label: 'Readiness',
                              value: draft.isReadyToPublish
                                ? 'Ready to publish'
                                : `${draft.readiness ?? 25}% complete`,
                            },
                            {
                              label: 'Questions',
                              value: `${draft.questionCount || 0} ${draft.questionCount === 1 ? 'question' : 'questions'}`,
                            },
                            {
                              label: 'Time limit',
                              value: draft.settings?.timerMode === 'strict'
                                ? `${draft.settings?.timeLimit || 0} minutes`
                                : 'Untimed',
                            },
                          ]}
                          actions={[
                            {
                              label: draft.isChallenge ? 'Resume challenge' : 'Resume editing',
                              icon: <Edit3 size={14} />,
                              primary: true,
                              onClick: () => navigate(`/create/manual?draftId=${draft._id}`),
                            },
                            {
                              label: draft.isChallenge ? 'Publish challenge' : 'Publish quiz',
                              icon: publishingDraftId === draft._id
                                ? <RefreshCw size={14} className="spin" />
                                : <Sparkles size={14} />,
                              disabled: publishingDraftId === draft._id,
                              title: draft.questionCount < 1
                                ? 'Add at least 1 question before publishing'
                                : 'Publish this draft',
                              onClick: () => handlePublishDraft(draft),
                            },
                            {
                              label: duplicatingDraftId === draft._id ? 'Duplicatingâ€¦' : 'Duplicate draft',
                              icon: <Copy size={14} />,
                              disabled: duplicatingDraftId === draft._id,
                              onClick: () => handleDuplicateDraft(draft._id),
                            },
                            {
                              label: 'Discard draft',
                              icon: <Trash2 size={14} />,
                              danger: true,
                              onClick: () => setDraftToDelete(draft),
                            },
                          ]}
                        />
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

        {/* â”€â”€ TAB 3: SAVED BOOKMARKS â”€â”€ */}
        {activeTab === 'bookmarks' && (
          <div className="tab-pane-content">
            {!error && filteredBookmarks.length === 0 ? (
              <EmptyState
                icon={<Bookmark size={24} />}
                title={searchQuery ? 'No bookmarks match your search' : 'No saved bookmarks'}
                description={
                  searchQuery
                    ? 'No bookmarked quizzes match your search keyword.'
                    : 'You havenâ€™t saved any quizzes to your bookmarks yet. Discover quizzes on Explore or Challenges and save them for study.'
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
    </div>
  );
}
