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
import './QuizEntryScreen.css';

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

  const isHost = Boolean(user && quiz && String(quiz.uploader?._id || quiz.uploader) === String(user._id));
  const isOwner = Boolean(quiz && (isHost || user?.role === 'admin'));
  const isHostPractice = quiz?.isChallenge === true && isHost;
  const searchParams = new URLSearchParams(location.search);
  const isChallenge = searchParams.get('challenge') === 'true' || searchParams.get('ref') === 'challenge';

  const questionCount = questions.length || quiz?.questionCount || 0;
  const hasMedia = questions.some(question => question.accessibilityMedia?.length || question.options?.some(option => option.accessibilityMedia?.length));
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
          {(isHostPractice || isChallenge) && (
            <div className="challenge-banner">
              <Trophy size={20} className="text-warning" />
              <div>
                <strong>{isHostPractice ? 'Host practice' : 'Public Quiz Challenge'}</strong>
                <p>{isHostPractice ? 'Your submission is saved for review and excluded from the official standings.'
                  : 'You have been invited to challenge this quiz! Start below to test your knowledge.'}</p>
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
                    <Bookmark size={15} fill={bookmarked ? '#FF4500' : 'none'} color={bookmarked ? '#FF4500' : 'currentColor'} />
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

              <h2 className="quiz-entry-title">{quiz?.title}</h2>
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
                  {hasMedia && <details className="entry-media-instructions">
                    <summary>Taking a quiz with audio or video</summary>
                    <p>Tab to playback controls or open the transcript beside each clip. Playing media leaves your choice unchanged. Use the arrow keys inside the answer group to change your choice, then use the question navigation buttons to continue.</p>
                  </details>}
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
                      {isHostPractice ? 'Start Practice' : 'Start Quiz'}
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
    </>
  );
}
