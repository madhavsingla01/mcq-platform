import { useState, useRef, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Heart,
  Bookmark,
  Share2,
  Camera,
  Trash2,
  Eye,
  Check,
  Copy,
  Lock,
  Globe,
  FileText,
  Sparkles,
  Edit3,
  RefreshCw,
  Users,
  ArrowRight,
  Layers,
  Code,
  Brain,
  Zap,
} from 'lucide-react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import QuizService from '../../services/quiz.service';
import ShareModal from '../social/ShareModal';
import ConfirmDeleteModal from '../ui/ConfirmDeleteModal';
import QuizDetailsModal from '../QuizModal/QuizDetailsModal';
import QuizCardOverflowMenu from './QuizCardOverflowMenu';
import { showCustomDialog } from '../ui';
import { compressImage } from '../../utils/imageCompressor';
import './QuizCard.css';

const toId = (val) => (val?._id ? String(val._id) : String(val || ''));

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

function formatCount(num) {
  const n = Number(num) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function getChallengeIcon(category = '', contentKind = '') {
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
}

function StandardQuizCard({
  quiz,
  onUpdate,
  onDelete,
  onSelectQuiz,
}) {
  if (!quiz) return null;

  const navigate = useNavigate();
  const { user: currentUser, isAuthenticated } = useAuthStore();
  const fileInputRef = useRef(null);

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = (e) => {
    e.stopPropagation();
    if (!quiz.quizCode) return;
    navigator.clipboard.writeText(quiz.quizCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const [thumbnail, setThumbnail] = useState(quiz.thumbnail || '');
  const [isPublic, setIsPublic] = useState(
    quiz.visibility === 'public' || quiz.isPublic === true
  );
  const [imgError, setImgError] = useState(false);

  const hasValidThumbnail = Boolean(
    thumbnail &&
    typeof thumbnail === 'string' &&
    thumbnail.trim() !== '' &&
    thumbnail !== '[object Object]' &&
    !imgError
  );

  useEffect(() => {
    setThumbnail(quiz.thumbnail || '');
    setImgError(false);
    setIsPublic(quiz.visibility === 'public' || quiz.isPublic === true);
  }, [quiz.thumbnail, quiz.visibility, quiz.isPublic]);

  const quizId = quiz._id;

  // Real-time synchronization across opened modals and cards
  useEffect(() => {
    const handleSync = (e) => {
      if (e.detail?.quizId === quizId) {
        setThumbnail(e.detail.thumbnail || '');
        setImgError(false);
      }
    };
    window.addEventListener('quiz-cover-updated', handleSync);
    return () => window.removeEventListener('quiz-cover-updated', handleSync);
  }, [quizId]);

  const title = quiz.title || 'Untitled Quiz';
  const displayTitle = title.length > 70 ? `${title.slice(0, 70).trim()}…` : title;
  const description = quiz.description || '';
  const category = quiz.category || 'General';
  const difficulty = quiz.difficulty || 'All Levels';
  const questionCount = quiz.questionCount || quiz.questions?.length || 0;
  const timeLimit = quiz.settings?.timeLimit || 0;
  const totalAttempts = quiz.totalAttempts || 0;
  const avgScore = quiz.avgScore ? Math.round(quiz.avgScore) : 0;
  const uploader = quiz.uploader || {};
  const tags = Array.isArray(quiz.tags) && quiz.tags.length > 0 ? quiz.tags : [];

  // Social stats state
  const initialLiked = quiz.social?.likedByMe ?? quiz.isLiked ?? false;
  const initialLikeCount = quiz.social?.likeCount ?? quiz.likeCount ?? 0;
  const initialBookmarked = quiz.social?.bookmarkedByMe ?? quiz.isBookmarked ?? false;
  const initialBookmarkCount = quiz.social?.bookmarkCount ?? quiz.bookmarkCount ?? 0;
  const initialShareCount = quiz.social?.shareCount ?? quiz.shareCount ?? 0;

  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [bookmarkCount, setBookmarkCount] = useState(initialBookmarkCount);
  const [shareCount, setShareCount] = useState(initialShareCount);
  const [isLiking, setIsLiking] = useState(false);
  const [isBookmarking, setIsBookmarking] = useState(false);

  // Creator info
  const uploaderId = toId(uploader);
  const currentUserId = toId(currentUser?._id);
  const isOwner = Boolean(currentUserId && uploaderId && currentUserId === uploaderId);

  // Open info modal handler
  const handleOpenInfo = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (onSelectQuiz) {
      onSelectQuiz(quizId);
    } else {
      setDetailsModalOpen(true);
    }
  };

  // Reusable cover upload processor
  const processUpload = async (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showCustomDialog({
        title: 'Invalid File',
        message: 'Please select a valid image file (PNG, JPG, WEBP, etc.)',
        type: 'warning',
      });
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      showCustomDialog({
        title: 'File Too Large',
        message: 'Image size exceeds the 8MB limit. Please choose a smaller file.',
        type: 'warning',
      });
      return;
    }

    try {
      setIsUploadingCover(true);
      setUploadError('');

      // Compress in browser (max 1280x720, WebP, quality 0.82)
      let fileToUpload = file;
      try {
        const compressed = await compressImage(file, { maxWidth: 1280, maxHeight: 720, quality: 0.82 });
        if (compressed?.file) {
          fileToUpload = compressed.file;
        }
      } catch (cErr) {
        console.warn('Browser compression fallback to original:', cErr);
      }

      const data = await QuizService.uploadCoverImage(quizId, fileToUpload);
      const newCover = data?.thumbnail || '';
      if (newCover) {
        setThumbnail(newCover);
        setImgError(false);
        onUpdate?.({ ...quiz, thumbnail: newCover });
        window.dispatchEvent(
          new CustomEvent('quiz-cover-updated', {
            detail: { quizId, thumbnail: newCover },
          })
        );
      }
    } catch (err) {
      console.error('Failed to upload cover image:', err);
      showCustomDialog({
        title: 'Upload Failed',
        message: err.response?.data?.message || 'Failed to upload cover image. Please try again.',
        type: 'error',
      });
    } finally {
      setIsUploadingCover(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCoverUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) processUpload(file);
  };

  const handleRemoveCover = async (e) => {
    e?.stopPropagation();
    if (!thumbnail) return;
    try {
      setIsUploadingCover(true);
      await QuizService.removeCoverImage(quizId);
      setThumbnail('');
      onUpdate?.({ ...quiz, thumbnail: '' });
      window.dispatchEvent(
        new CustomEvent('quiz-cover-updated', {
          detail: { quizId, thumbnail: '' },
        })
      );
    } catch (err) {
      console.error('Failed to remove cover image:', err);
      showCustomDialog({
        title: 'Removal Failed',
        message: err.response?.data?.message || 'Failed to remove cover image.',
        type: 'error',
      });
    } finally {
      setIsUploadingCover(false);
    }
  };

  // Drag and drop handlers on diagonal cover zone
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      processUpload(file);
    }
  };

  // Toggle public/private
  const handleToggleVisibility = async (e) => {
    e?.stopPropagation();
    if (isTogglingVisibility) return;

    try {
      setIsTogglingVisibility(true);
      const nextPublic = !isPublic;
      const { data } = await api.put(`/quiz/${quizId}`, {
        visibility: nextPublic ? 'public' : 'private',
        isPublic: nextPublic,
      });
      setIsPublic(nextPublic);
      onUpdate?.(data?.data?.quiz || { ...quiz, visibility: nextPublic ? 'public' : 'private' });
    } catch (err) {
      console.error('Failed to toggle visibility:', err);
      showCustomDialog({
        title: 'Visibility Error',
        message: err.response?.data?.message || 'Failed to update quiz visibility.',
        type: 'error',
      });
    } finally {
      setIsTogglingVisibility(false);
    }
  };

  // Delete quiz
  const handleConfirmDelete = async () => {
    try {
      setIsDeleting(true);
      await api.delete(`/quiz/${quizId}`);
      setDeleteModalOpen(false);
      if (onDelete) {
        onDelete(quizId);
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to delete quiz:', err);
      showCustomDialog({
        title: 'Delete Error',
        message: err.response?.data?.message || 'Failed to delete quiz.',
        type: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Like handler
  const handleLike = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    if (isLiking) return;

    const nextLiked = !liked;
    const nextCount = nextLiked ? likeCount + 1 : Math.max(likeCount - 1, 0);
    setLiked(nextLiked);
    setLikeCount(nextCount);
    setIsLiking(true);

    try {
      const method = nextLiked ? 'post' : 'delete';
      const { data } = await api[method](`/social/quizzes/${quizId}/like`);
      if (data?.data?.quiz?.social) {
        setLikeCount(data.data.quiz.social.likeCount);
        setLiked(data.data.quiz.social.likedByMe);
      }
      onUpdate?.(data?.data?.quiz);
    } catch {
      setLiked(!nextLiked);
      setLikeCount(likeCount);
    } finally {
      setIsLiking(false);
    }
  };

  // Bookmark handler
  const handleBookmark = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    if (isBookmarking) return;

    const nextBookmarked = !bookmarked;
    const nextCount = nextBookmarked ? bookmarkCount + 1 : Math.max(bookmarkCount - 1, 0);
    setBookmarked(nextBookmarked);
    setBookmarkCount(nextCount);
    setIsBookmarking(true);

    try {
      const method = nextBookmarked ? 'post' : 'delete';
      const { data } = await api[method](`/social/quizzes/${quizId}/bookmark`);
      if (data?.data?.quiz?.social) {
        setBookmarkCount(data.data.quiz.social.bookmarkCount);
        setBookmarked(data.data.quiz.social.bookmarkedByMe);
      }
      onUpdate?.(data?.data?.quiz);
    } catch {
      setBookmarked(!nextBookmarked);
      setBookmarkCount(bookmarkCount);
    } finally {
      setIsBookmarking(false);
    }
  };

  const details = [
    { label: 'Category', value: category },
    { label: 'Difficulty', value: difficulty },
    { label: 'Questions', value: questionCount },
    { label: 'Time limit', value: timeLimit ? `${timeLimit} minutes` : 'Untimed' },
    { label: 'Attempts', value: totalAttempts },
    { label: 'Average score', value: `${avgScore}%` },
    { label: 'Likes', value: likeCount },
    { label: 'Bookmarks', value: bookmarkCount },
    { label: 'Shares', value: shareCount },
    { label: 'Visibility', value: isPublic ? 'Public' : 'Private' },
    {
      label: 'Quiz ID', value: quiz.quizCode ? (
        <button type="button" className="clean-quiz-code-badge" onClick={handleCopyCode} title="Copy quiz ID">
          <span className="code-symbol">!</span>
          <span className="code-value">{quiz.quizCode.replace(/^!/, '')}</span>
          {copiedCode
            ? <Check size={11} className="code-copy-icon success" />
            : <Copy size={11} className="code-copy-icon" />}
        </button>
      ) : null
    },
    { label: 'Tags', value: tags.length > 0 ? tags.join(', ') : null },
    { label: 'Creator', value: uploader.name || uploader.username || null },
    {
      label: 'Updated',
      value: quiz.updatedAt || quiz.createdAt
        ? new Date(quiz.updatedAt || quiz.createdAt).toLocaleDateString()
        : null,
    },
  ];

  const actions = [
    { label: 'View quiz details', icon: <Eye size={14} />, onClick: handleOpenInfo },
    {
      label: 'Practice quiz',
      icon: <Play size={14} />,
      primary: true,
      onClick: () => navigate(`/quiz/${quizId}`),
    },
    {
      label: liked ? 'Unlike quiz' : 'Like quiz',
      icon: <Heart size={14} />,
      onClick: handleLike,
    },
    {
      label: bookmarked ? 'Remove bookmark' : 'Save bookmark',
      icon: <Bookmark size={14} />,
      onClick: handleBookmark,
    },
    { label: 'Share quiz', icon: <Share2 size={14} />, onClick: () => setShareModalOpen(true) },
    ...(isOwner ? [
      {
        label: isPublic ? 'Make private' : 'Make public',
        icon: isPublic ? <Lock size={14} /> : <Globe size={14} />,
        disabled: isTogglingVisibility,
        onClick: handleToggleVisibility,
      },
      {
        label: 'Change cover image',
        icon: <Camera size={14} />,
        onClick: () => fileInputRef.current?.click(),
      },
      ...(thumbnail ? [{
        label: 'Remove cover image',
        icon: <Camera size={14} />,
        onClick: handleRemoveCover,
      }] : []),
      {
        label: 'Delete quiz',
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => setDeleteModalOpen(true),
      },
    ] : []),
  ];

  return (
    <div className="mcq-card-wrapper">
      {/* Hidden file input for cover upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleCoverUpload}
      />

      {/* Clean Modern Rounded Quiz Card (matching sketch 1: quiz name + no of people given) */}
      <article
        className="clean-quiz-card"
        onClick={(e) => {
          if (
            e.target.closest('button') ||
            e.target.closest('a') ||
            e.target.closest('.quiz-card-overflow-panel')
          ) {
            return;
          }
          handleOpenInfo(e);
        }}
        title="Click to view quiz details"
      >
        {/* Balanced cover image with smooth gradient fade effect */}
        {hasValidThumbnail && (
          <div className="clean-quiz-cover-wrap">
            <img
              src={thumbnail}
              alt={title}
              className="clean-quiz-cover-img"
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
            />
            <div className="clean-quiz-cover-fade" />
          </div>
        )}

        {/* Keep the title visible; secondary information and controls live in the overflow menu. */}
        <div className="clean-quiz-top">
          <div className="clean-quiz-title-wrap">
            <div className="clean-quiz-title-row">
              <FileText size={16} className="clean-quiz-doc-icon" />
              <h3 className="clean-quiz-title" title={title}>
                {displayTitle}
              </h3>
            </div>
          </div>
          <QuizCardOverflowMenu label="Quiz details and actions" title={title} details={details} actions={actions} />
        </div>
      </article>

      {/* Share Modal */}
      {shareModalOpen && (
        <ShareModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          quiz={{ ...quiz, thumbnail, isPublic }}
        />
      )}

      {/* Details Info Modal (when user clicks card) */}
      {detailsModalOpen && (
        <QuizDetailsModal
          quizId={quizId}
          onClose={() => setDetailsModalOpen(false)}
        />
      )}

      {/* Consistent Warning Before Deleting */}
      {deleteModalOpen && (
        <ConfirmDeleteModal
          isOpen={deleteModalOpen}
          onClose={() => !isDeleting && setDeleteModalOpen(false)}
          onConfirm={handleConfirmDelete}
          title={`Delete "${title}"?`}
          message="Are you sure you want to permanently delete this quiz?"
          details="All questions, user attempts, comments, bookmarks, and analytics will be permanently removed from the database."
          confirmText="Delete Permanently"
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   DraftCard Subcomponent (variant="draft")
   ========================================================================== */
export function DraftCard({
  draft,
  data,
  quiz,
  onPublish,
  onDuplicate,
  onDiscard,
  onDelete,
  onResume,
  publishing = false,
  duplicating = false,
  className = '',
  style = {},
}) {
  const navigate = useNavigate();
  const item = draft || data || quiz;
  if (!item) return null;

  const draftId = item._id;
  const title = item.title || 'Untitled Draft';
  const isChallenge = Boolean(item.isChallenge);
  const category = item.category || 'General';
  const readinessText = item.isReadyToPublish
    ? 'Ready to publish'
    : `${item.readiness ?? 25}% complete`;
  const timeText = timeAgo(item.updatedAt || item.createdAt);
  const questionCount = item.questionCount || item.questions?.length || 0;
  const timerText = item.settings?.timerMode === 'strict'
    ? `${item.settings?.timeLimit || 0} minutes`
    : 'Untimed';

  const handleResume = () => {
    if (onResume) {
      onResume(draftId);
    } else {
      navigate(`/create/${isChallenge ? 'challenge' : 'manual'}?draftId=${draftId}`);
    }
  };

  const details = [
    { label: 'Status', value: isChallenge ? 'Challenge draft' : 'Quiz draft' },
    { label: 'Category', value: category },
    { label: 'Edited', value: timeText },
    { label: 'Description', value: item.description || null },
    { label: 'Readiness', value: readinessText },
    {
      label: 'Questions',
      value: `${questionCount} ${questionCount === 1 ? 'question' : 'questions'}`,
    },
    { label: 'Time limit', value: timerText },
  ];

  const actions = [
    {
      label: isChallenge ? 'Resume challenge' : 'Resume editing',
      icon: <Edit3 size={14} />,
      primary: true,
      onClick: handleResume,
    },
    {
      label: isChallenge ? 'Publish challenge' : 'Publish quiz',
      icon: publishing ? (
        <RefreshCw size={14} className="spin" />
      ) : (
        <Sparkles size={14} />
      ),
      disabled: publishing,
      title: questionCount < 1 ? 'Add at least 1 question before publishing' : 'Publish this draft',
      onClick: () => onPublish?.(item),
    },
    {
      label: duplicating ? 'Duplicating…' : 'Duplicate draft',
      icon: <Copy size={14} />,
      disabled: duplicating,
      onClick: () => onDuplicate?.(draftId),
    },
    {
      label: 'Discard draft',
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: () => (onDiscard ? onDiscard(item) : onDelete ? onDelete(item) : null),
    },
  ];

  return (
    <div className={`mcq-card-wrapper ${className}`} style={style}>
      <article className="clean-quiz-card variant-draft">
        <div className="draft-card-header">
          <h3
            className="draft-title"
            onClick={handleResume}
            title="Click to resume editing draft"
          >
            {title}
          </h3>
          <QuizCardOverflowMenu
            label="Draft details and actions"
            title={title}
            details={details}
            actions={actions}
          />
        </div>

        <div className="draft-pill-row">
          <span className="draft-category-pill">{category}</span>
          <span className="draft-readiness-pill">{readinessText}</span>
          <span className="draft-edited-time">Edited {timeText}</span>
        </div>
      </article>
    </div>
  );
}

/* ==========================================================================
   AttemptCard Subcomponent (variant="attempt")
   ========================================================================== */
export function AttemptCard({
  attempt,
  data,
  quiz,
  onResume,
  onSelect,
  className = '',
  style = {},
}) {
  const navigate = useNavigate();
  const item = attempt || data || quiz;
  if (!item) return null;

  const quizObj = typeof item.quizId === 'object' && item.quizId !== null ? item.quizId : {};
  const targetId = quizObj._id || item.quizId || item._id;
  const title = item.title || quizObj.title || 'Untitled Quiz';
  const totalQ = item.questionsCount || quizObj.questionCount || quizObj.questions?.length || 1;
  const answered = typeof item.answeredCount === 'number'
    ? item.answeredCount
    : (Array.isArray(item.answers) ? item.answers.length : 0);
  const pct = typeof item.progressPercent === 'number'
    ? item.progressPercent
    : Math.min(100, Math.round((answered / totalQ) * 100));
  const timeText = item.timeAgoText || (item.createdAt ? `Started ${timeAgo(item.createdAt)}` : '');

  const handleResume = () => {
    if (onResume) {
      onResume(targetId);
    } else if (onSelect) {
      onSelect(targetId);
    } else {
      navigate(`/quiz/${targetId}`);
    }
  };

  return (
    <div className={`mcq-card-wrapper ${className}`} style={style}>
      <article className="clean-quiz-card variant-attempt">
        <div className="progress-card-top">
          <span className="progress-badge">
            <span className="pulse-dot" />
            <span>In Progress</span>
          </span>
          {timeText && <span className="progress-time">{timeText}</span>}
        </div>

        <h3 className="progress-title" onClick={handleResume} title={title}>
          {title}
        </h3>

        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{ width: `${Math.max(5, pct)}%` }}
          />
        </div>

        <div className="progress-card-bottom">
          <span className="progress-stat">
            {answered > 0
              ? `${answered} of ${totalQ} questions answered (${pct}%)`
              : `${totalQ} Questions`}
          </span>
          <button
            type="button"
            className="progress-resume-btn"
            onClick={handleResume}
          >
            <Play size={12} fill="currentColor" />
            <span>Resume</span>
          </button>
        </div>
      </article>
    </div>
  );
}

/* ==========================================================================
   ChallengeCard Subcomponent (variant="challenge")
   ========================================================================== */
export function ChallengeCard({
  challenge,
  data,
  quiz,
  isBookmarked = false,
  onBookmark,
  onSelect,
  className = '',
  style = {},
}) {
  const navigate = useNavigate();
  const item = challenge || data || quiz;
  if (!item) return null;

  const id = item._id || item.id;
  const title = item.title || 'Untitled Challenge';
  const difficulty = item.difficulty || 'All Levels';
  const duration = item.duration || 'Untimed';
  const joinedCount = item.joinedCount || 0;

  const handlePlay = () => {
    if (onSelect) {
      onSelect(id);
    } else {
      navigate(`/challenges/${id}`);
    }
  };

  return (
    <div className={`mcq-card-wrapper ${className}`} style={style}>
      <article className="clean-quiz-card variant-challenge">
        <div className="challenge-card-top">
          <div className="challenge-icon-box">
            {getChallengeIcon(item.category, item.contentKind)}
          </div>
        </div>

        <h4 className="challenge-card-title" title={title} onClick={handlePlay}>
          {title}
        </h4>

        <div className="challenge-pill-row">
          <span className={`difficulty-tag ${(difficulty || 'intermediate').toLowerCase()}`}>
            {difficulty}
          </span>
          <span className="duration-tag">⏱ {duration}</span>
        </div>

        <div className="challenge-card-footer">
          <div className="challenge-participants">
            <Users size={13} />
            <span>{formatCount(joinedCount)}</span>
          </div>

          <div className="challenge-actions">
            <button
              type="button"
              className={`btn-icon-bookmark ${isBookmarked ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onBookmark?.(id);
              }}
              title={isBookmarked ? 'Bookmarked' : 'Bookmark'}
            >
              <Bookmark
                size={14}
                fill={isBookmarked ? '#FF4500' : 'none'}
                color={isBookmarked ? '#FF4500' : 'currentColor'}
              />
            </button>
            <button
              type="button"
              className="btn-circle-play"
              onClick={handlePlay}
              title="Start challenge"
            >
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}

/* ==========================================================================
   Root Unified QuizCard Component (Polymorphic Dispatcher)
   ========================================================================== */
function QuizCard({
  variant = 'quiz',
  data,
  quiz,
  draft,
  attempt,
  challenge,
  ...rest
}) {
  if (variant === 'draft') {
    return <DraftCard draft={data || draft || quiz} {...rest} />;
  }
  if (variant === 'attempt') {
    return <AttemptCard attempt={data || attempt || quiz} {...rest} />;
  }
  if (variant === 'challenge') {
    return <ChallengeCard challenge={data || challenge || quiz} {...rest} />;
  }

  // Default: variant === 'quiz'
  return <StandardQuizCard quiz={data || quiz} {...rest} />;
}

export { QuizCard, StandardQuizCard };
export default memo(QuizCard);

