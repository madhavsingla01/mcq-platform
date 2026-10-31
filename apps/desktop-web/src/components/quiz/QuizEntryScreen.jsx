import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Settings,
  Heart,
  Bookmark,
  Share2,
  Check,
  Trophy,
  Camera,
  Upload,
} from 'lucide-react';
import { Badge, Button, Card, Spinner, showCustomDialog } from '../ui';
import CommentsSection from './CommentsSection';
import ShareModal from '../social/ShareModal';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import QuizService from '../../services/quiz.service';
import { compressImage } from '../../utils/imageCompressor';

export default function QuizEntryScreen({
  quiz,
  questions = [],
  isStarted,
  isSubmitted,
  recoveryNotice = '',
  actionsExtra = null,
  onStart,
  onResume,
  onStartNew,
}) {
  const location = useLocation();
  const { user, isAuthenticated } = useAuthStore();
  const fileInputRef = useRef(null);

  const isOwner = Boolean(
    user && quiz && (String(quiz.uploader?._id || quiz.uploader) === String(user._id) || user.role === 'admin')
  );
  const searchParams = new URLSearchParams(location.search);
  const isChallenge = searchParams.get('challenge') === 'true' || searchParams.get('ref') === 'challenge';

  const questionCount = questions.length || quiz?.questionCount || 0;
  const timeLimit = quiz?.settings?.timeLimit;
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Cover image states
  const [thumbnail, setThumbnail] = useState(quiz?.thumbnail || '');
  const [imgError, setImgError] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    setThumbnail(quiz?.thumbnail || '');
    setImgError(false);
  }, [quiz?.thumbnail]);

  // Real-time synchronization if cover changed elsewhere
  useEffect(() => {
    const handleSync = (e) => {
      if (e.detail?.quizId === quiz?._id) {
        setThumbnail(e.detail.thumbnail || '');
        setImgError(false);
      }
    };
    window.addEventListener('quiz-cover-updated', handleSync);
    return () => window.removeEventListener('quiz-cover-updated', handleSync);
  }, [quiz?._id]);

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

    try {
      setIsUploadingCover(true);
      const compressed = await compressImage(file, {
        maxWidth: 1280,
        maxHeight: 720,
        quality: 0.82,
        mimeType: 'image/webp',
      });
      const data = await QuizService.uploadCoverImage(quiz._id, compressed?.file || compressed);
      const newCover = data?.thumbnail || '';
      if (newCover) {
        setThumbnail(newCover);
        setImgError(false);
        window.dispatchEvent(
          new CustomEvent('quiz-cover-updated', {
            detail: { quizId: quiz._id, thumbnail: newCover },
          })
        );
      }
    } catch (err) {
      console.error('Failed to upload cover:', err);
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

  // Social states
  const initialLiked = quiz?.social?.likedByMe ?? quiz?.isLiked ?? false;
  const initialLikeCount = quiz?.social?.likeCount ?? quiz?.likeCount ?? 0;
  const initialBookmarked = quiz?.social?.bookmarkedByMe ?? quiz?.isBookmarked ?? false;

  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [copiedShare, setCopiedShare] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isBookmarking, setIsBookmarking] = useState(false);

  const handleLike = async () => {
    if (!isAuthenticated) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    if (isLiking || !quiz?._id) return;

    const nextLiked = !liked;
    const nextCount = nextLiked ? likeCount + 1 : Math.max(likeCount - 1, 0);
    setLiked(nextLiked);
    setLikeCount(nextCount);
    setIsLiking(true);

    try {
      const method = nextLiked ? 'post' : 'delete';
      const { data } = await api[method](`/social/quizzes/${quiz._id}/like`);
      if (data?.data?.quiz?.social) {
        setLikeCount(data.data.quiz.social.likeCount);
        setLiked(data.data.quiz.social.likedByMe);
      }
    } catch {
      setLiked(!nextLiked);
      setLikeCount(likeCount);
    } finally {
      setIsLiking(false);
    }
  };

  const handleBookmark = async () => {
    if (!isAuthenticated) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    if (isBookmarking || !quiz?._id) return;

    const nextBookmarked = !bookmarked;
    setBookmarked(nextBookmarked);
    setIsBookmarking(true);

    try {
      const method = nextBookmarked ? 'post' : 'delete';
      const { data } = await api[method](`/social/quizzes/${quiz._id}/bookmark`);
      if (data?.data?.quiz?.social) {
        setBookmarked(data.data.quiz.social.bookmarkedByMe);
      }
    } catch {
      setBookmarked(!nextBookmarked);
    } finally {
      setIsBookmarking(false);
    }
  };

  const handleShare = () => {
    setShareModalOpen(true);
  };

  return (
    <>
      {/* Hidden file input for cover upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processUpload(file);
        }}
      />

      <div className="quiz-entry-shell">
        <Card className="quiz-entry-card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Challenge Mode Alert */}
          {isChallenge && (
            <div className="challenge-banner">
              <Trophy size={20} className="text-warning" />
              <div>
                <strong>Public Quiz Challenge</strong>
                <p>You have been invited to challenge this quiz! Start below to test your knowledge.</p>
              </div>
            </div>
          )}

          {/* ========================================================
              HERO BANNER: LEFT CONTENT & RIGHT 50% GRADIENT FADE COVER
              ======================================================== */}
          <div className="quiz-entry-hero-banner">
            {/* Left Content Area */}
            <div className="quiz-entry-hero-content">
              <div className="quiz-entry-hero-top">
                <div className="quiz-entry-badges">
                  <Badge>{questionCount} Questions</Badge>
                  <Badge variant="warning">
                    {timeLimit ? `${timeLimit} min limit` : 'No time limit'}
                  </Badge>
                  {quiz?.category && <Badge variant="secondary">{quiz.category}</Badge>}
                </div>

                {/* Social interaction quick buttons */}
                <div className="entry-social-actions">
                  <button
                    type="button"
                    className={`btn-entry-action like ${liked ? 'active' : ''}`}
                    onClick={handleLike}
                    title={liked ? 'Unlike quiz' : 'Like quiz'}
                  >
                    <Heart size={15} fill={liked ? '#FF4500' : 'none'} color={liked ? '#FF4500' : 'currentColor'} />
                    <span>{likeCount}</span>
                  </button>

                  <button
                    type="button"
                    className={`btn-entry-action bookmark ${bookmarked ? 'active' : ''}`}
                    onClick={handleBookmark}
                    title={bookmarked ? 'Remove bookmark' : 'Bookmark quiz'}
                  >
                    <Bookmark size={15} fill={bookmarked ? '#7193FF' : 'none'} color={bookmarked ? '#7193FF' : 'currentColor'} />
                  </button>

                  <button
                    type="button"
                    className="btn-entry-action share"
                    onClick={handleShare}
                    title="Share challenge link"
                  >
                    {copiedShare ? <Check size={15} color="#10b981" /> : <Share2 size={15} />}
                    <span>{copiedShare ? 'Copied Link!' : 'Share'}</span>
                  </button>
                </div>
              </div>

              <h1 className="quiz-entry-title">{quiz?.title}</h1>
              {quiz?.description && (
                <p className="quiz-entry-description">{quiz.description}</p>
              )}
            </div>

            {/* Right Side: Cover Visual Zone covering 50% with smooth gradient fade */}
            <div
              className={`quiz-entry-hero-cover-zone ${isDragOver ? 'drag-over' : ''}`}
              onDragOver={isOwner ? (e) => { e.preventDefault(); setIsDragOver(true); } : undefined}
              onDragLeave={isOwner ? (e) => { e.preventDefault(); setIsDragOver(false); } : undefined}
              onDrop={isOwner ? (e) => {
                e.preventDefault();
                setIsDragOver(false);
                const file = e.dataTransfer?.files?.[0];
                if (file) processUpload(file);
              } : undefined}
            >
              {thumbnail && !imgError ? (
                <img
                  src={thumbnail}
                  alt={quiz?.title || 'Quiz Cover'}
                  className="quiz-entry-cover-img"
                  loading="lazy"
                  decoding="async"
                  width="600"
                  height="360"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="quiz-entry-clean-backdrop" />
              )}

              {/* Rich gradient blend overlay */}
              <div className="quiz-entry-gradient-overlay" />

              {/* Drag/Drop Feedback */}
              {isDragOver && isOwner && (
                <div className="entry-drag-overlay">
                  <Upload size={22} className="drag-bounce" />
                  <span>Drop Image to Set Cover</span>
                </div>
              )}

              {/* Uploading Spinner */}
              {isUploadingCover && (
                <div className="entry-uploading-overlay">
                  <Spinner size={22} />
                  <span>Uploading Cover...</span>
                </div>
              )}

              {/* Upload Button (Owner only) */}
              {isOwner && (
                <button
                  type="button"
                  className="entry-cover-upload-trigger"
                  onClick={() => fileInputRef.current?.click()}
                  title={thumbnail ? 'Change Cover Image' : 'Upload Cover Image'}
                  aria-label="Upload Cover Image"
                >
                  <Camera size={13} />
                  <span>{thumbnail ? 'Change Cover' : 'Upload Cover'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="quiz-entry-body">
            <div className="quiz-entry-body-grid">
              <div className="entry-left">
                {/* Rules Section Header */}
                <div className="quiz-entry-grid-header">
                  <h3>Quiz Configuration & Rules</h3>
                  {isOwner && (
                    <Link to={`/quiz/${quiz?._id}/settings`} className="btn-entry-settings">
                      <Settings size={13} />
                      <span>Configure Rules</span>
                    </Link>
                  )}
                </div>

                {/* Rules Stat Grid - Clean, Calm, No settings icons, No hover glowup */}
                <div className="quiz-entry-grid">
                  <div className="quiz-entry-stat">
                    <span>Timer Mode</span>
                    <strong>
                      {quiz?.settings?.timerMode === 'strict'
                        ? 'Strict'
                        : quiz?.settings?.timerMode === 'soft'
                        ? 'Soft'
                        : 'None'}
                    </strong>
                  </div>

                  <div className="quiz-entry-stat">
                    <span>Instant Feedback</span>
                    <strong>{quiz?.settings?.instantFeedback ? 'Enabled' : 'Disabled'}</strong>
                  </div>

                  <div className="quiz-entry-stat">
                    <span>Question Review</span>
                    <strong>{quiz?.settings?.allowReview === false ? 'Restricted' : 'Allowed'}</strong>
                  </div>

                  <div className="quiz-entry-stat">
                    <span>Explanation Reveal</span>
                    <strong>{quiz?.settings?.showExplanation === false ? 'Hidden' : 'Available'}</strong>
                  </div>

                  <div className="quiz-entry-stat">
                    <span>Recovery</span>
                    <strong>Auto Resume</strong>
                  </div>
                </div>

                {recoveryNotice ? (
                  <div className="quiz-status-banner info">{recoveryNotice}</div>
                ) : null}
              </div>

              <aside className="entry-actions">
                <div className="entry-actions-card">
                  <div className="quiz-entry-badges compact">
                    <Badge>{questionCount} Questions</Badge>
                    <Badge variant="warning">
                      {timeLimit ? `${timeLimit} min limit` : 'No time limit'}
                    </Badge>
                  </div>
                  <div className="entry-actions-title">{quiz?.title}</div>
                  <div className="entry-actions-desc">
                    {quiz?.description || 'Start when ready. Progress is recovered automatically if the session is interrupted.'}
                  </div>
                </div>

                <div className="entry-actions-buttons">
                  {isStarted && !isSubmitted ? (
                    <>
                      <Button
                        size="lg"
                        onClick={() => {
                          if (!isAuthenticated) {
                            window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
                            return;
                          }
                          onResume();
                        }}
                        style={{ width: '100%', fontSize: 17, padding: '15px 20px' }}
                      >
                        Resume Attempt
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        onClick={() => {
                          if (!isAuthenticated) {
                            window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
                            return;
                          }
                          onStartNew();
                        }}
                        style={{ width: '100%', fontSize: 17, padding: '15px 20px', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                      >
                        Start New Attempt
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="lg"
                      onClick={() => {
                        if (!isAuthenticated) {
                          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
                          return;
                        }
                        onStart();
                      }}
                      style={{ width: '100%', fontSize: 17, padding: '15px 20px' }}
                    >
                      Start Quiz
                    </Button>
                  )}
                </div>

                {actionsExtra}

                <div className="entry-tip">
                  Tip: Your progress is auto-saved and recoverable across sessions.
                </div>
              </aside>
            </div>

            {/* Community Discussion & Comments Section */}
            <CommentsSection quizId={quiz?._id} quiz={quiz} initialCount={quiz?.commentCount || 0} />
          </div>
        </Card>
      </div>

      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        quiz={quiz}
      />

      <style>{quizEntryScreenStyles}</style>
    </>
  );
}

const quizEntryScreenStyles = `
  .quiz-entry-shell {
    max-width: 960px;
    margin: 32px auto;
    padding: 0 16px;
  }

  .quiz-entry-card {
    background: var(--color-surface, #14161a);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.09));
    border-radius: 20px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  }

  .challenge-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 24px;
    background: rgba(245, 158, 11, 0.1);
    border-bottom: 1px solid rgba(245, 158, 11, 0.25);
    color: var(--color-text, #ffffff);
  }

  .challenge-banner strong {
    display: block;
    font-size: 14px;
    font-weight: 700;
  }

  .challenge-banner p {
    font-size: 13px;
    color: var(--color-text-secondary, #94a3b8);
    margin: 0;
  }

  /* ========================================================
     Hero Banner with 50% Smooth Gradient Fade Cover
     ======================================================== */
  .quiz-entry-hero-banner {
    position: relative;
    display: flex;
    min-height: 230px;
    background: var(--color-surface, #14161a);
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    overflow: hidden;
  }

  .quiz-entry-hero-content {
    position: relative;
    z-index: 2;
    flex: 1;
    min-width: 0;
    padding: 28px 32px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 14px;
    max-width: 54%;
  }

  .quiz-entry-hero-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }

  .quiz-entry-badges {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .quiz-entry-badges.compact {
    margin-bottom: 8px;
  }

  .entry-social-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-entry-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 9px;
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    background: var(--color-surface-alt, rgba(255, 255, 255, 0.04));
    color: var(--color-text-secondary, #94a3b8);
    font-size: 12.5px;
    font-weight: 650;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-entry-action:hover {
    background: var(--color-surface-hover, rgba(255, 255, 255, 0.08));
    border-color: rgba(255, 255, 255, 0.2);
    color: var(--color-text, #ffffff);
  }

  .btn-entry-action.like.active {
    color: #FF4500;
    background: rgba(255, 69, 0, 0.1);
    border-color: rgba(255, 69, 0, 0.3);
  }

  .btn-entry-action.bookmark.active {
    color: #7193FF;
    background: rgba(113, 147, 255, 0.1);
    border-color: rgba(113, 147, 255, 0.3);
  }

  .btn-entry-action.share {
    color: var(--color-text, #ffffff);
  }

  .quiz-entry-title {
    font-size: 28px;
    font-weight: 850;
    line-height: 1.25;
    letter-spacing: -0.02em;
    color: var(--color-text, #ffffff);
    margin: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
    min-width: 0;
  }

  .quiz-entry-description {
    font-size: 14.5px;
    color: var(--color-text-secondary, #94a3b8);
    line-height: 1.55;
    margin: 0;
  }

  .entry-creator-bar {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--color-text-muted, #71717a);
  }

  .entry-creator-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--color-primary, #FF4500);
    text-decoration: none;
  }

  .entry-creator-link small {
    color: var(--color-text-muted, #71717a);
  }

  /* ── Right Side Cover Zone (50% with smooth gradient fade) ── */
  .quiz-entry-hero-cover-zone {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 50%;
    min-width: 200px;
    overflow: hidden;
    background: var(--color-surface, #14161a);
    z-index: 1;
    -webkit-mask-image: linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.1) 8%, rgba(0, 0, 0, 0.7) 35%, #000000 65%);
    mask-image: linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.1) 8%, rgba(0, 0, 0, 0.7) 35%, #000000 65%);
    transition: filter 0.25s ease;
  }

  .quiz-entry-hero-cover-zone.drag-over {
    filter: brightness(1.2);
  }

  .quiz-entry-cover-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
    transform: scale(1.02);
    transition: transform 0.4s ease;
  }

  .quiz-entry-hero-banner:hover .quiz-entry-cover-img {
    transform: scale(1.05);
  }

  .quiz-entry-clean-backdrop {
    position: absolute;
    inset: 0;
    background: var(--bg-elevated, #272729);
  }

  .quiz-entry-gradient-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(20, 22, 26, 0.4) 0%, transparent 60%);
    pointer-events: none;
    z-index: 2;
  }

  .entry-drag-overlay {
    position: absolute;
    inset: 0;
    z-index: 6;
    background: rgba(255, 69, 0, 0.88);
    backdrop-filter: blur(4px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #ffffff;
    font-size: 13px;
    font-weight: 750;
  }

  .entry-uploading-overlay {
    position: absolute;
    inset: 0;
    z-index: 6;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #ffffff;
    font-size: 13px;
    font-weight: 700;
  }

  .entry-cover-upload-trigger {
    position: absolute;
    bottom: 14px;
    right: 14px;
    z-index: 5;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #ffffff;
    font-size: 11.5px;
    font-weight: 650;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .entry-cover-upload-trigger:hover {
    background: rgba(255, 69, 0, 0.9);
    border-color: #FF4500;
    transform: translateY(-1px);
  }

  /* ========================================================
     Body & Configuration Grid (Calm, Clean, No Glowup)
     ======================================================== */
  .quiz-entry-body {
    padding: 28px 32px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .quiz-entry-body-grid {
    display: grid;
    grid-template-columns: 1fr 310px;
    gap: 28px;
    align-items: start;
  }

  .entry-left {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .quiz-entry-grid-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 2px;
  }

  .quiz-entry-grid-header h3 {
    font-size: 14.5px;
    font-weight: 750;
    color: var(--color-text, #ffffff);
    margin: 0;
    letter-spacing: -0.01em;
  }

  .btn-entry-settings {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    background: var(--color-surface, rgba(255, 255, 255, 0.04));
    color: var(--color-primary, #FF4500);
    font-size: 12px;
    font-weight: 650;
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .btn-entry-settings:hover {
    background: var(--color-primary-light, rgba(255, 69, 0, 0.12));
    border-color: var(--color-primary, #FF4500);
  }

  .quiz-entry-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
  }

  /* Calm, Clean Stat Cards - No glowup, No hover border-color, No hover translate */
  .quiz-entry-stat {
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--color-surface-alt, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: none;
  }

  .quiz-entry-stat span {
    font-size: 11.5px;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted, #71717a);
  }

  .quiz-entry-stat strong {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text, #ffffff);
    min-height: 0;
  }

  .entry-actions {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .entry-actions-card {
    padding: 18px 20px;
    border-radius: 14px;
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    background: var(--color-surface-alt, rgba(255, 255, 255, 0.03));
  }

  .entry-actions-title {
    font-size: 17px;
    font-weight: 800;
    margin-top: 6px;
    color: var(--color-text, #ffffff);
  }

  .entry-actions-desc {
    font-size: 13px;
    color: var(--color-text-secondary, #94a3b8);
    line-height: 1.45;
    margin-top: 4px;
  }

  .entry-actions-buttons {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .entry-tip {
    font-size: 12px;
    color: var(--color-text-muted, #71717a);
    text-align: center;
  }

  .quiz-status-banner.info {
    padding: 10px 14px;
    background: rgba(113, 147, 255, 0.08);
    border: 1px solid rgba(113, 147, 255, 0.25);
    border-radius: 8px;
    font-size: 13px;
    color: var(--color-text, #ffffff);
  }

  @media (max-width: 820px) {
    .quiz-entry-hero-content {
      max-width: 100%;
      padding: 24px;
    }

    .quiz-entry-hero-cover-zone {
      width: 40%;
      opacity: 0.7;
    }

    .quiz-entry-body-grid {
      grid-template-columns: 1fr;
    }

    .quiz-entry-body {
      padding: 24px;
    }
  }
`;
