import { rankSearchResults } from '../../../components/search/rankSearchResults';
import { usePageSearch } from '../../../components/search/PageSearchContext';
import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  Download,
  Trash2,
  AlertTriangle,
  Bookmark,
  Database,
  Check,
  Award,
  Sparkles,
  Heart,
  MessageSquare,
  Share2,
  UserCheck,
  RefreshCw,
  ExternalLink,
  Copy,
  CheckCircle2,
  Trophy,
  Clock,
  Filter,
  Eye,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore';
import { clearCachedPreferences } from '../../../store/settingsStore';
import api from '../../../api/axios';
import { SettingsInfo, SettingsSection, SettingsRow } from './SettingsSection';
import { Button, showCustomDialog, CustomSelect } from '../../../components/ui';
import ConfirmDeleteModal from '../../../components/ui/ConfirmDeleteModal';
import SubmissionCalendar from './SubmissionCalendar';

export function ActivitySettings() {
  const { user, deleteAccount } = useAuthStore();
  const navigate = useNavigate();

  const [activities, setActivities] = useState([]);
  const [myQuizzes, setMyQuizzes] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const { query: searchQuery } = usePageSearch();
  const [copiedId, setCopiedId] = useState(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const fetchData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError('');

    try {
      const username = user?.username;
      const [activityRes, quizzesRes, bookmarksRes, attemptsRes] = await Promise.all([
        username
          ? api.get(`/social/users/${username}/activity`, { params: { limit: 100 } })
          : Promise.resolve({ data: { data: { activities: [] } } }),
        api.get('/quiz/my'),
        api.get('/social/bookmarks'),
        api.get('/attempts?limit=100'),
      ]);

      const acts = activityRes.data?.data?.activities || [];
      const fetchedQuizzes = quizzesRes.data?.data?.quizzes || [];
      const fetchedBookmarks = bookmarksRes.data?.data?.quizzes || [];
      const rawAttempts = attemptsRes.data?.data;
      const fetchedAttempts = Array.isArray(rawAttempts) ? rawAttempts : (rawAttempts?.attempts || attemptsRes.data?.attempts || []);

      // Merge user attempts if not already in activities
      const attemptedIds = new Set(
        acts.filter((a) => a.verb === 'quiz_attempted').map((a) => String(a.metadata?.attemptId || a.targetId || a._id))
      );
      const synthAttempts = fetchedAttempts
        .filter((att) => att.status === 'completed' && !attemptedIds.has(String(att._id)))
        .map((att) => ({
          _id: att._id,
          verb: 'quiz_attempted',
          quiz: typeof att.quizId === 'object' && att.quizId !== null ? att.quizId : { _id: att.quizId, title: att.quizTitle || 'Quiz' },
          metadata: {
            attemptId: att._id,
            score: att.score ?? att.percentage ?? 0,
            percentage: att.percentage ?? att.score ?? 0,
          },
          actionText: `Completed quiz attempt (${att.percentage ?? att.score ?? 0}%)`,
          badge: `${att.percentage ?? att.score ?? 0}% Score`,
          badgeType: 'attempt',
          timeAgo: 'Recently',
          createdAt: att.createdAt || new Date().toISOString(),
        }));

      // Merge created quizzes if not already in activities
      const publishedQuizIds = new Set(
        acts.filter((a) => a.verb === 'quiz_published' && a.quiz?._id).map((a) => String(a.quiz._id))
      );
      const synthPublished = fetchedQuizzes
        .filter((q) => !publishedQuizIds.has(String(q._id)))
        .map((q) => ({
          _id: `pub-${q._id}`,
          verb: 'quiz_published',
          quiz: q,
          metadata: { title: q.title, questionCount: q.questionCount },
          actionText: `Published a new quiz: "${q.title}"`,
          badge: `${q.questionCount || 0} Questions`,
          badgeType: 'published',
          timeAgo: 'Recently',
          createdAt: q.createdAt || new Date().toISOString(),
        }));

      // Merge bookmarks if not already in activities
      const bookmarkedQuizIds = new Set(
        acts.filter((a) => a.verb === 'quiz_bookmarked' && a.quiz?._id).map((a) => String(a.quiz._id))
      );
      const synthBookmarks = fetchedBookmarks
        .filter((q) => !bookmarkedQuizIds.has(String(q._id)))
        .map((q) => ({
          _id: `bm-${q._id}`,
          verb: 'quiz_bookmarked',
          quiz: q,
          actionText: `Bookmarked "${q.title}"`,
          badge: 'Saved',
          badgeType: 'social',
          timeAgo: 'Recently',
          createdAt: q.createdAt || new Date().toISOString(),
        }));

      const allMerged = [...acts, ...synthAttempts, ...synthPublished, ...synthBookmarks].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );

      setActivities(allMerged);
      setMyQuizzes(fetchedQuizzes);
      setBookmarks(fetchedBookmarks);

      if (isManualRefresh) {
        showToast('Activity log updated with latest events!');
      }
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Could not load your activity. Use Refresh to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user?.username]);

  // Derived statistics
  const stats = useMemo(() => {
    const attempts = activities.filter((a) => a.verb === 'quiz_attempted').length;
    const published = Math.max(myQuizzes.length, activities.filter((a) => a.verb === 'quiz_published').length);
    const likes = activities.filter((a) => a.verb === 'quiz_liked').length;
    const comments = activities.filter((a) => a.verb === 'commented').length;
    const shares = activities.filter((a) => a.verb === 'quiz_shared').length;
    const bmarks = Math.max(bookmarks.length, activities.filter((a) => a.verb === 'quiz_bookmarked').length);

    return { attempts, published, likes, comments, shares, bmarks };
  }, [activities, myQuizzes, bookmarks]);

  // CustomSelect filter options
  const filterOptions = useMemo(() => [
    { value: 'all', label: 'All Activities', icon: <History size={14} />, badge: String(activities.length) },
    { value: 'quiz_attempted', label: 'Quiz Attempts', icon: <Trophy size={14} />, badge: String(stats.attempts) },
    { value: 'quiz_published', label: 'Created Quizzes', icon: <Sparkles size={14} />, badge: String(stats.published) },
    { value: 'quiz_liked', label: 'Likes & Hearts', icon: <Heart size={14} />, badge: String(stats.likes) },
    { value: 'commented', label: 'Comments', icon: <MessageSquare size={14} />, badge: String(stats.comments) },
    { value: 'quiz_shared', label: 'Shares', icon: <Share2 size={14} />, badge: String(stats.shares) },
    { value: 'quiz_bookmarked', label: 'Bookmarks', icon: <Bookmark size={14} />, badge: String(stats.bmarks) },
  ], [activities.length, stats]);

  // Filtered and searched activity items
  const filteredActivities = useMemo(() => {
    let list = activities;
    if (filter !== 'all') {
      list = list.filter((a) => a.verb === filter);
    }
    return rankSearchResults(list, searchQuery, activity => [
      activity.quiz?.title || activity.metadata?.title, activity.actionText || activity.action, activity.quiz?.tags || [],
    ]);
  }, [activities, filter, searchQuery]);

  // Copy quiz link helper
  const handleCopyQuizLink = (quizId, actId, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!quizId) return;

    const url = `${window.location.origin}/quiz/${quizId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(actId);
      showToast('Quiz link copied to clipboard!');
      setTimeout(() => setCopiedId(null), 2500);
    });
  };

  // Export full JSON bundle
  const handleExportData = async () => {
    setExporting(true);
    try {
      const exportBundle = {
        exportedAt: new Date().toISOString(),
        user: {
          id: user?._id,
          name: user?.name,
          username: user?.username,
          email: user?.email,
          bio: user?.bio,
          phone: user?.phone,
          isPrivate: Boolean(user?.isPrivate),
          isProfilePublic: Boolean(user?.isProfilePublic ?? !user?.isPrivate),
          preferences: user?.preferences,
          createdAt: user?.createdAt,
        },
        statistics: stats,
        recentActivities: activities,
        createdQuizzes: myQuizzes,
        savedBookmarks: bookmarks,
        version: '1.3.0',
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportBundle, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `quizfocus_export_${user?.username || 'user'}_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showToast('Your activity snapshot was downloaded.');
    } catch (err) {
      console.error('Failed to export data:', err);
      showCustomDialog({
        title: 'Export Failed',
        message: 'Failed to generate your export bundle. Please check your connection and try again.',
        type: 'error',
      });
    } finally {
      setExporting(false);
    }
  };

  // Clear local app cache
  const handleClearCache = async () => {
    const confirmed = await showCustomDialog({
      title: 'Clear Local Cache?',
      message: 'This will reset cached preferences and reload fresh application data. Your current login session will remain active.',
      type: 'warning',
      confirmText: 'Clear Cache & Reload',
      cancelText: 'Cancel',
    });
    if (confirmed) {
      if (!await clearCachedPreferences()) {
        showToast('Sync your preferences before clearing the cache.');
        return;
      }
      window.location.reload();
    }
  };

  // Confirm delete account
  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteAccount();
      setDeleteModalOpen(false);
      navigate('/login?deleted=true');
    } catch (err) {
      console.error('Failed to delete account:', err);
      showCustomDialog({
        title: 'Account Deletion Failed',
        message: err.response?.data?.message || 'Failed to delete account. Please try again.',
        type: 'error',
      });
      setIsDeleting(false);
    }
  };

  // Helpers to resolve card theme & attributes
  const resolveCardProps = (act) => {
    switch (act.verb) {
      case 'quiz_attempted': {
        const pct = act.metadata?.percentage ?? act.metadata?.score;
        const isPerfect = pct >= 90;
        const isGood = pct >= 50;
        const scoreBadgeClass = isPerfect ? 'score-perfect' : isGood ? 'score-good' : 'score-fail';
        const attemptId = act.attemptId || act.metadata?.attemptId || act._id;
        return {
          iconClass: 'attempt',
          icon: isPerfect ? <Award size={20} /> : <CheckCircle2 size={20} />,
          title: act.quiz?.title ? `Completed Quiz: ${act.quiz.title}` : act.actionText || 'Completed Quiz Attempt',
          badgeText: pct !== undefined ? `${pct}% Score` : act.badge || 'Completed',
          badgeClass: scoreBadgeClass,
          primaryLink: `/result/${attemptId}`,
          primaryLabel: 'View Results',
          quizId: act.quiz?._id,
        };
      }
      case 'quiz_published': {
        const qCount = act.quiz?.questionCount || act.metadata?.questionCount;
        return {
          iconClass: 'publish',
          icon: <Sparkles size={20} />,
          title: act.quiz?.title ? `Published: ${act.quiz.title}` : act.actionText || 'Published New Quiz',
          badgeText: qCount ? `${qCount} Questions` : 'Published',
          badgeClass: 'general',
          primaryLink: act.quiz?._id ? `/quiz/${act.quiz._id}` : null,
          primaryLabel: 'Open Quiz',
          quizId: act.quiz?._id,
        };
      }
      case 'quiz_liked': {
        return {
          iconClass: 'like',
          icon: <Heart size={20} />,
          title: act.quiz?.title ? `Liked: ${act.quiz.title}` : act.actionText || 'Liked Quiz',
          badgeText: 'Liked',
          badgeClass: 'general',
          primaryLink: act.quiz?._id ? `/quiz/${act.quiz._id}` : null,
          primaryLabel: 'Open Quiz',
          quizId: act.quiz?._id,
        };
      }
      case 'commented': {
        return {
          iconClass: 'comment',
          icon: <MessageSquare size={20} />,
          title: act.quiz?.title ? `Commented on: ${act.quiz.title}` : act.actionText || 'Commented on Quiz',
          badgeText: 'Comment',
          badgeClass: 'general',
          primaryLink: act.quiz?._id ? `/quiz/${act.quiz._id}` : null,
          primaryLabel: 'Discussion',
          quizId: act.quiz?._id,
        };
      }
      case 'quiz_shared': {
        return {
          iconClass: 'share',
          icon: <Share2 size={20} />,
          title: act.quiz?.title ? `Shared: ${act.quiz.title}` : act.actionText || 'Shared Quiz',
          badgeText: 'Shared',
          badgeClass: 'general',
          primaryLink: act.quiz?._id ? `/quiz/${act.quiz._id}` : null,
          primaryLabel: 'View Quiz',
          quizId: act.quiz?._id,
        };
      }
      case 'quiz_bookmarked': {
        return {
          iconClass: 'bookmark',
          icon: <Bookmark size={20} />,
          title: act.quiz?.title ? `Saved Bookmark: ${act.quiz.title}` : act.actionText || 'Bookmarked Quiz',
          badgeText: 'Saved',
          badgeClass: 'general',
          primaryLink: act.quiz?._id ? `/quiz/${act.quiz._id}` : null,
          primaryLabel: 'Open Quiz',
          quizId: act.quiz?._id,
        };
      }
      case 'followed': {
        return {
          iconClass: 'follow',
          icon: <UserCheck size={20} />,
          title: act.actionText || `Followed @${act.targetUser?.username || 'user'}`,
          badgeText: 'Followed',
          badgeClass: 'general',
          primaryLink: act.targetUser?.username ? `/profile/${act.targetUser.username}` : null,
          primaryLabel: 'View Profile',
          quizId: null,
        };
      }
      default: {
        return {
          iconClass: 'general',
          icon: <History size={20} />,
          title: act.actionText || 'Platform Activity',
          badgeText: act.badge || 'Activity',
          badgeClass: 'general',
          primaryLink: act.quiz?._id ? `/quiz/${act.quiz._id}` : null,
          primaryLabel: 'View Details',
          quizId: act.quiz?._id,
        };
      }
    }
  };

  return (
    <div className="settings-tab-panel">
      {/* Category Hero */}
      <div className="settings-panel-hero">
        <div className="settings-panel-title-row">
          <h2 className="settings-panel-title">Your Activity &amp; Data</h2>
          <SettingsInfo text="Monitor your recent quiz attempts, creations, shares, comments, likes, bookmarks, and export your personal records." />
        </div>
      </div>

      {toast && (
        <div className="settings-alert-banner success">
          <Check size={16} />
          <span>{toast}</span>
        </div>
      )}

      {/* 1. Live Activity Hub & Metrics */}
      <div className="settings-activity-hub">
        {/* Metric Cards Row (Squircle continuous curvature) */}
        <div className="settings-activity-stats-row">
          <div className="settings-activity-stat-card">
            <div className="settings-activity-stat-top">
              <span className="settings-activity-stat-label">Attempts</span>
              <div className="settings-activity-stat-icon attempt">
                <Trophy size={14} color="#34d399" />
              </div>
            </div>
            <span className="settings-activity-stat-num">{stats.attempts}</span>
          </div>

          <div className="settings-activity-stat-card">
            <div className="settings-activity-stat-top">
              <span className="settings-activity-stat-label">Published</span>
              <div className="settings-activity-stat-icon publish">
                <Sparkles size={14} color="#FF4500" />
              </div>
            </div>
            <span className="settings-activity-stat-num">{stats.published}</span>
          </div>

          <div className="settings-activity-stat-card">
            <div className="settings-activity-stat-top">
              <span className="settings-activity-stat-label">Likes</span>
              <div className="settings-activity-stat-icon like">
                <Heart size={14} color="#f43f5e" />
              </div>
            </div>
            <span className="settings-activity-stat-num">{stats.likes}</span>
          </div>

          <div className="settings-activity-stat-card">
            <div className="settings-activity-stat-top">
              <span className="settings-activity-stat-label">Comments</span>
              <div className="settings-activity-stat-icon comment">
                <MessageSquare size={14} color="#FF4500" />
              </div>
            </div>
            <span className="settings-activity-stat-num">{stats.comments}</span>
          </div>

          <div className="settings-activity-stat-card">
            <div className="settings-activity-stat-top">
              <span className="settings-activity-stat-label">Shares</span>
              <div className="settings-activity-stat-icon share">
                <Share2 size={14} color="#fbbf24" />
              </div>
            </div>
            <span className="settings-activity-stat-num">{stats.shares}</span>
          </div>

          <div className="settings-activity-stat-card">
            <div className="settings-activity-stat-top">
              <span className="settings-activity-stat-label">Bookmarks</span>
              <div className="settings-activity-stat-icon bookmark">
                <Bookmark size={14} color="#FF4500" />
              </div>
            </div>
            <span className="settings-activity-stat-num">{stats.bmarks}</span>
          </div>
        </div>

        <SubmissionCalendar refreshSignal={refreshing} />

        {/* Filter Toolbar with G2 Squircle CustomSelect */}
        <div className="settings-activity-toolbar">
          <div className="settings-activity-toolbar-left">
            <div className="settings-activity-select-wrapper">
              <CustomSelect
                options={filterOptions}
                value={filter}
                onChange={setFilter}
                size="sm"
                placeholder="Filter by activity..."
              />
            </div>

          </div>

          <div className="settings-activity-toolbar-right">
            <span className="settings-activity-count-badge">
              {filteredActivities.length} {filteredActivities.length === 1 ? 'record' : 'records'}
            </span>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              title="Refresh recent activity"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Activity Stream Feed */}
        <div className="settings-activity-feed">
          {loadError ? (
            <p className="settings-supporting-note" role="alert">{loadError}</p>
          ) : loading ? (
            <div className="settings-activity-empty-state">
              <RefreshCw size={24} className="animate-spin text-gray-500" />
              <p className="settings-activity-empty-desc">Loading your activity history...</p>
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="settings-activity-empty-state">
              <div className="settings-activity-empty-icon">
                <History size={26} />
              </div>
              <h3 className="settings-activity-empty-title">No Activity Recorded</h3>
              <p className="settings-activity-empty-desc">
                {searchQuery || filter !== 'all'
                  ? 'No activity matches your active search query or filter criteria.'
                  : 'Start practicing quizzes, creating challenges, or liking community quizzes to see your records here.'}
              </p>
              <Link to="/explore" className="settings-activity-action-btn primary" style={{ marginTop: '8px' }}>
                <Sparkles size={14} />
                <span>Explore Quizzes</span>
              </Link>
            </div>
          ) : (
            filteredActivities.map((act) => {
              const card = resolveCardProps(act);
              const isCopied = copiedId === act._id;

              return (
                <div key={act._id || `${act.verb}-${act.createdAt}`} className="settings-activity-card">
                  <div className="settings-activity-main">
                    <div className={`settings-activity-icon-box ${card.iconClass}`}>
                      {card.icon}
                    </div>

                    <div className="settings-activity-details">
                      <div className="settings-activity-title-row">
                        <span className="settings-activity-title" title={card.title}>
                          {card.title}
                        </span>
                        <span className={`settings-activity-badge ${card.badgeClass}`}>
                          {card.badgeText}
                        </span>
                      </div>

                      <div className="settings-activity-meta-line">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {act.timeAgo || new Date(act.createdAt).toLocaleDateString()}
                        </span>

                        {act.quiz?.tags && act.quiz.tags.length > 0 && (
                          <>
                            <span className="settings-activity-dot-separator">•</span>
                            <span className="text-xs text-gray-400">
                              #{act.quiz.tags.slice(0, 2).join(' #')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="settings-activity-actions">
                    {card.quizId && (
                      <button
                        type="button"
                        className="settings-activity-action-btn"
                        onClick={(e) => handleCopyQuizLink(card.quizId, act._id, e)}
                        title="Copy shareable link"
                      >
                        {isCopied ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                        <span>{isCopied ? 'Copied' : 'Share'}</span>
                      </button>
                    )}

                    {card.primaryLink && (
                      <Link to={card.primaryLink} className="settings-activity-action-btn primary">
                        <Eye size={13} />
                        <span>{card.primaryLabel}</span>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Data Management & Export */}
      <SettingsSection
        title="Data Portability & Cache"
        description="Download your personal data in standard JSON format or reset local cache."
        icon={Database}
      >
        <SettingsRow
          title="Export current activity"
          description="Download your profile and the recent quiz, attempt, and interaction records available on this page."
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportData}
            disabled={exporting || loading || Boolean(loadError)}
          >
            <Download size={14} />
            <span>{exporting ? 'Generating...' : 'Export JSON Data'}</span>
          </Button>
        </SettingsRow>

        <SettingsRow
          title="Clear Local App Cache"
          description="Clear offline cached data, local UI states, and reload fresh assets."
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearCache}
          >
            <span>Clear Cache</span>
          </Button>
        </SettingsRow>
      </SettingsSection>

      {/* 3. Danger Zone */}
      <SettingsSection
        title="Danger Zone"
        description="Irreversible actions regarding your account and all associated platform data."
        icon={AlertTriangle}
        dangerZone
      >
        <SettingsRow
          title="Delete Account Permanently"
          description="Once deleted, all your created quizzes, comments, likes, followers, and attempt logs will be permanently removed from the database."
          destructive
        >
          <Button
            variant="danger"
            size="sm"
            onClick={() => setDeleteModalOpen(true)}
          >
            <Trash2 size={14} />
            <span>Delete Account</span>
          </Button>
        </SettingsRow>
      </SettingsSection>

      {/* Confirmation Modal */}
      {deleteModalOpen && (
        <ConfirmDeleteModal
          isOpen={deleteModalOpen}
          onClose={() => !isDeleting && setDeleteModalOpen(false)}
          onConfirm={handleConfirmDelete}
          title="Permanently Delete Your Account?"
          message={`Are you sure you want to delete @${user?.username || 'your account'}?`}
          details="This action is immediate and permanent. All your quizzes, questions, comments, attempts, and analytics will be permanently destroyed."
          confirmText="Yes, Delete My Account"
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}

export default ActivitySettings;
