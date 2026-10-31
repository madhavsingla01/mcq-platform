import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Clock,
  HelpCircle,
  Play,
  Users,
  Award,
  Heart,
  Bookmark,
  Share2,
  MoreVertical,
  Camera,
  Trash2,
  Settings,
  Eye,
  EyeOff,
  Sparkles,
  Check,
  Copy,
  TrendingUp,
  Lock,
  Globe,
  Upload,
  FileText,
} from 'lucide-react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import QuizService from '../../services/quiz.service';
import ShareModal from '../social/ShareModal';
import ConfirmDeleteModal from '../ui/ConfirmDeleteModal';
import QuizDetailsModal from '../QuizModal/QuizDetailsModal';
import { Spinner, showCustomDialog } from '../ui';
import { compressImage } from '../../utils/imageCompressor';

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
  const openSearch = useUIStore((s) => s.openSearch);
  const fileInputRef = useRef(null);

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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

  // Close dropdown on outside click or Escape key
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

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
      setMenuOpen(false);
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
      setMenuOpen(false);
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

  const difficultyColors = {
    Beginner: { bg: 'rgba(255, 69, 0, 0.08)', text: '#FF4500', border: 'rgba(255, 69, 0, 0.25)' },
    Intermediate: { bg: 'rgba(255, 69, 0, 0.12)', text: '#FF4500', border: 'rgba(255, 69, 0, 0.3)' },
    Advanced: { bg: 'rgba(255, 87, 26, 0.16)', text: '#FF571A', border: 'rgba(255, 87, 26, 0.35)' },
    'All Levels': { bg: 'rgba(255, 255, 255, 0.06)', text: '#D1D5DB', border: 'rgba(255, 255, 255, 0.14)' },
  };
  const diffStyle = difficultyColors[difficulty] || difficultyColors['All Levels'];

  return (
    <div className={`mcq-card-wrapper ${menuOpen ? 'menu-open' : ''}`}>
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
        className={`clean-quiz-card ${menuOpen ? 'menu-open' : ''}`}
        onClick={(e) => {
          if (
            e.target.closest('button') ||
            e.target.closest('a') ||
            e.target.closest('.mcq-dropdown-menu') ||
            e.target.closest('.mcq-top-actions-anchor')
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

        {/* Top Section: Title & Quiz ID Code */}
        <div className="clean-quiz-top">
          <div className="clean-quiz-title-wrap">
            <div className="clean-quiz-title-row">
              <FileText size={16} className="clean-quiz-doc-icon" />
              <h3 className="clean-quiz-title" title={title}>
                {displayTitle}
              </h3>
            </div>
            {quiz.quizCode && (
              <div
                className="clean-quiz-code-badge"
                onClick={handleCopyCode}
                title="Click to copy unique quiz ID code"
              >
                <span className="code-symbol">!</span>
                <span className="code-value">{quiz.quizCode.replace(/^!/, '')}</span>
                {copiedCode ? (
                  <Check size={11} className="code-copy-icon success" />
                ) : (
                  <Copy size={11} className="code-copy-icon" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: No of people given + Interactive controls */}
        <div className="clean-quiz-bottom">
          <div className="clean-quiz-given" title={`${totalAttempts} ${totalAttempts === 1 ? 'person took this quiz' : 'people took this quiz'}`}>
            <Users size={15} className="given-icon" />
            <span>
              {totalAttempts} {totalAttempts === 1 ? 'person given' : 'people given'}
            </span>
          </div>

          <div className="clean-quiz-actions">
            <button
              type="button"
              className={`clean-quiz-like-btn ${liked ? 'active' : ''}`}
              onClick={handleLike}
              title={liked ? 'Unlike' : 'Like'}
            >
              <Heart
                size={14}
                fill={liked ? '#FF4500' : 'none'}
                color={liked ? '#FF4500' : 'currentColor'}
              />
              {likeCount > 0 && <span>{likeCount}</span>}
            </button>

            <button
              type="button"
              className="clean-quiz-play-btn"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/quiz/${quizId}`);
              }}
              title="Practice this quiz"
            >
              <Play size={12} fill="currentColor" />
              <span>Play</span>
            </button>
          </div>
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

      <style>{mcqCardStyles}</style>
    </div>
  );
}

export default memo(QuizCard);

const mcqCardStyles = `
  .mcq-card-wrapper {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    height: 100%;
    box-sizing: border-box;
    position: relative;
  }

  .mcq-card-wrapper.menu-open {
    z-index: 1000 !important;
  }

  /* --- Clean Rounded Quiz Card (Apple Card Materials & G2 Squircle) --- */
  .clean-quiz-card {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 155px;
    height: 100%;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    background: var(--color-surface, #000000);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: var(--radius-container, 14px);
    corner-shape: squircle;
    padding: var(--card-padding, 24px);
    box-sizing: border-box;
    cursor: pointer;
    overflow: hidden;
    touch-action: manipulation;
    transition: transform var(--duration-tap) var(--ease-out), border-color 160ms ease, box-shadow 160ms ease;
    box-shadow: var(--material-card-shadow);
  }

  .clean-quiz-card:active {
    transform: scale(0.985);
  }

  @media (hover: hover) and (pointer: fine) {
    .clean-quiz-card:hover {
      border-color: rgba(255, 255, 255, 0.22);
      transform: translateY(-2px);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.12);
    }
  }

  .clean-quiz-card.menu-open {
    z-index: 1000 !important;
    border-color: var(--color-primary, #FF4500);
  }

  /* Balanced Cover Image with Smooth Gradient Fade */
  .clean-quiz-cover-wrap {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 62%;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
    border-top-right-radius: 7px;
    border-bottom-right-radius: 7px;
  }

  .clean-quiz-cover-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    opacity: 0.82;
    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
  }

  .clean-quiz-card:hover .clean-quiz-cover-img {
    transform: scale(1.04);
    opacity: 0.95;
  }

  /* Smooth gradient fade: deep solid black on left smoothly fading to reveal clear image on right */
  .clean-quiz-cover-fade {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(to right, #000000 0%, rgba(0, 0, 0, 0.85) 15%, rgba(0, 0, 0, 0.35) 55%, transparent 92%),
      linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.3) 30%, transparent 60%),
      linear-gradient(to bottom, rgba(0, 0, 0, 0.65) 0%, transparent 40%);
    pointer-events: none;
  }

  /* Top Section: Title & Actions */
  .clean-quiz-top {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .clean-quiz-title-wrap {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    max-width: 100%;
    flex: 1;
    overflow: hidden;
  }

  .clean-quiz-algo-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    align-self: flex-start;
    padding: 2.5px 8px;
    border-radius: 9999px;
    background: rgba(255, 69, 0, 0.12);
    border: 1px solid rgba(255, 69, 0, 0.35);
    color: #ff9d5c;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 2px;
  }

  .clean-quiz-algo-icon {
    color: #FF6B00;
    flex-shrink: 0;
  }

  .clean-quiz-algo-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }


  .clean-quiz-title-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
    max-width: 100%;
  }

  .clean-quiz-doc-icon {
    color: #FF4500;
    flex-shrink: 0;
    margin-top: 3px;
  }

  .clean-quiz-title {
    font-size: 16.5px;
    font-weight: 700;
    line-height: 1.35;
    color: #ffffff;
    margin: 0;
    letter-spacing: -0.015em;
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
    word-break: break-word;
    word-wrap: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 0.15s ease;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
  }

  .clean-quiz-card:hover .clean-quiz-title {
    color: #FF4500;
  }

  .clean-quiz-code-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: flex-start;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 600;
    color: #E5E7EB;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-sm, 6px);
    padding: 2px 7px;
    cursor: copy;
    touch-action: manipulation;
    transition: all 0.16s var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
  }

  .clean-quiz-code-badge:active {
    transform: scale(0.96);
  }

  @media (hover: hover) and (pointer: fine) {
    .clean-quiz-code-badge:hover {
      background: rgba(255, 69, 0, 0.15);
      border-color: rgba(255, 69, 0, 0.45);
      color: #FFFFFF;
    }
  }

  .clean-quiz-code-badge .code-symbol {
    color: var(--color-primary, #FF4500);
    font-weight: 700;
  }

  .clean-quiz-code-badge .code-copy-icon {
    color: rgba(255, 255, 255, 0.4);
    transition: color 0.14s ease;
  }

  .clean-quiz-code-badge:hover .code-copy-icon {
    color: #FFFFFF;
  }

  .clean-quiz-code-badge .code-copy-icon.success {
    color: #10B981;
  }

  .clean-quiz-tags-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
  }

  .clean-quiz-hashtag-pill,
  .clean-quiz-cat-pill {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(255, 69, 0, 0.08);
    border: 1px solid rgba(255, 69, 0, 0.35);
    color: #FF4500;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .clean-quiz-hashtag-pill:hover,
  .clean-quiz-cat-pill:hover {
    background: #FF4500;
    color: #000000;
    border-color: #FF4500;
    transform: translateY(-1px);
  }

  /* Bottom Section: No of people given */
  .clean-quiz-bottom {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 24px;
    padding-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    min-width: 0;
    max-width: 100%;
  }

  .clean-quiz-given {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13.5px;
    font-weight: 550;
    color: #a1a1aa;
    white-space: nowrap;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .clean-quiz-given .given-icon {
    color: #FF4500;
    opacity: 0.9;
  }

  .clean-quiz-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .clean-quiz-like-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #a1a1aa;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .clean-quiz-like-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
    border-color: rgba(255, 255, 255, 0.2);
  }

  .clean-quiz-like-btn.active {
    color: #FF4500;
    background: rgba(255, 69, 0, 0.12);
    border-color: rgba(255, 69, 0, 0.35);
  }

  .clean-quiz-play-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 12px;
    border-radius: 8px;
    background: #FF4500;
    border: 1px solid #FF4500;
    color: #ffffff;
    font-size: 12.5px;
    font-weight: 650;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .clean-quiz-play-btn:hover {
    background: #ff5714;
    border-color: #ff5714;
    box-shadow: 0 2px 10px rgba(255, 69, 0, 0.4);
  }

  /* 3-Dots Menu Button & Dropdown */
  .mcq-top-actions-anchor {
    position: relative;
    flex-shrink: 0;
  }

  .mcq-dots-trigger-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mcq-dots-trigger-btn:hover {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.24);
  }

  .mcq-dots-trigger-btn.active {
    background: #FF4500;
    border-color: #FF4500;
    color: #ffffff;
  }

  .mcq-dropdown-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 195px;
    background: rgba(14, 14, 18, 0.94);
    backdrop-filter: var(--material-blur);
    -webkit-backdrop-filter: var(--material-blur);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--radius-container, 12px);
    corner-shape: squircle;
    padding: 6px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.12);
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 1001;
    transform-origin: top right;
    animation: mcqDropIn 0.16s var(--ease-out);
  }

  .mcq-dropdown-item {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    border-radius: var(--radius-control, 6px);
    corner-shape: squircle;
    color: #ffffff;
    font-size: 13px;
    font-weight: 550;
    cursor: pointer;
    text-align: left;
    touch-action: manipulation;
    transition: background-color 120ms ease, color 120ms ease;
  }

  .mcq-dropdown-item:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
  }

  .mcq-dropdown-item.primary-action {
    color: #FF4500;
    font-weight: 650;
  }

  .mcq-dropdown-item.primary-action:hover {
    background: rgba(255, 69, 0, 0.12);
  }

  .mcq-dropdown-item.danger {
    color: #FF4F40;
  }

  .mcq-dropdown-item.danger:hover {
    background: rgba(255, 79, 64, 0.12);
  }

  .mcq-dropdown-divider {
    height: 1px;
    background: var(--color-border-subtle, rgba(255, 255, 255, 0.08));
    margin: 4px 0;
  }

  @keyframes mcqDropIn {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (max-width: 640px) {
    .clean-quiz-card {
      padding: var(--card-padding, 16px);
    }
  }
`;


