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

function QuizCard({
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
    { label: 'Quiz ID', value: quiz.quizCode ? (
      <button type="button" className="clean-quiz-code-badge" onClick={handleCopyCode} title="Copy quiz ID">
        <span className="code-symbol">!</span>
        <span className="code-value">{quiz.quizCode.replace(/^!/, '')}</span>
        {copiedCode
          ? <Check size={11} className="code-copy-icon success" />
          : <Copy size={11} className="code-copy-icon" />}
      </button>
    ) : null },
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
          <QuizCardOverflowMenu label="Quiz details and actions" details={details} actions={actions} />
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

export default memo(QuizCard);
