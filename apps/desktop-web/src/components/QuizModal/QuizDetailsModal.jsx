import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Camera, Play, Trash2, Upload } from 'lucide-react';
import api from '../../api/axios';
import { Badge, Button, ProgressBar, Spinner, showCustomDialog } from '../ui';
import AttemptDetailView from './AttemptDetailView';
import QuizService from '../../services/quiz.service';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { compressImage } from '../../utils/imageCompressor';

const DEFAULT_PAGINATION = {
  total: 0,
  page: 1,
  limit: 10,
  pages: 1,
};

const formatDateTime = (value) => {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString();
};

const formatPercent = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0%';

  return `${Math.round(number)}%`;
};

const formatDuration = (attempt) => {
  const seconds = Number(attempt?.totalTime || 0);
  const milliseconds = Number(attempt?.totalTimeMs || 0);
  const totalSeconds = milliseconds > 0 ? Math.round(milliseconds / 1000) : seconds;

  if (!totalSeconds) return '0s';

  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;

  if (!minutes) return `${remainder}s`;
  if (!remainder) return `${minutes}m`;

  return `${minutes}m ${remainder}s`;
};

export default function QuizDetailsModal({ quizId, onClose }) {
  const openSearch = useUIStore((s) => s.openSearch);
  const [quiz, setQuiz] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [sortBy, setSortBy] = useState('latest');
  const [selectedAttemptId, setSelectedAttemptId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    const fetchDetails = async () => {
      setLoading(true);
      setError('');
      setSelectedAttemptId(null);

      try {
        const [quizResponse, analyticsResponse, attemptsResponse] = await Promise.all([
          api.get(`/quiz/${quizId}`),
          api.get(`/quiz/${quizId}/analytics`),
          api.get(`/quiz/${quizId}/attempts`, { params: { limit: DEFAULT_PAGINATION.limit } }),
        ]);

        if (cancelled) return;

        setQuiz(quizResponse.data.data.quiz);
        setAnalytics(analyticsResponse.data.data.analytics);
        setAttempts(attemptsResponse.data.data.attempts || []);
        setPagination(attemptsResponse.data.data.pagination || DEFAULT_PAGINATION);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.response?.data?.message || 'Failed to load quiz details');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchDetails();

    return () => {
      cancelled = true;
    };
  }, [quizId]);

  const initialSortRef = useRef(true);

  useEffect(() => {
    if (loading) return undefined;

    // Skip the first render — the main useEffect already fetched attempts
    if (initialSortRef.current) {
      initialSortRef.current = false;
      return undefined;
    }

    let cancelled = false;

    const fetchAttempts = async () => {
      setAttemptsLoading(true);

      try {
        const response = await api.get(`/quiz/${quizId}/attempts`, {
          params: {
            sortBy,
            page: 1,
            limit: pagination.limit || DEFAULT_PAGINATION.limit,
          },
        });

        if (cancelled) return;

        setAttempts(response.data.data.attempts || []);
        setPagination(response.data.data.pagination || DEFAULT_PAGINATION);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.response?.data?.message || 'Failed to load attempts');
        }
      } finally {
        if (!cancelled) {
          setAttemptsLoading(false);
        }
      }
    };

    fetchAttempts();

    return () => {
      cancelled = true;
    };
  }, [quizId, sortBy]);

  const stats = useMemo(() => {
    const totalAttempts = Number(quiz?.totalAttempts || pagination.total || attempts.length || 0);
    const averageScore = Number(quiz?.avgScore ?? analytics?.averageScore ?? 0);
    const highestScore = attempts.reduce((max, attempt) => Math.max(max, Number(attempt.percentage || 0)), 0);
    const completedAttempts = attempts.filter((attempt) => attempt.status === 'completed').length;

    return [
      { label: 'Questions', value: quiz?.questionCount || 0 },
      { label: 'Attempts', value: totalAttempts },
      { label: 'Average Score', value: formatPercent(averageScore) },
      { label: 'Best Recent', value: formatPercent(highestScore) },
      { label: 'Completed', value: completedAttempts },
    ];
  }, [analytics, attempts, pagination.total, quiz]);

  const handleOverlayMouseDown = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const loadPage = async (page) => {
    if (page < 1 || page > pagination.pages || attemptsLoading) return;

    setAttemptsLoading(true);
    setError('');

    try {
      const response = await api.get(`/quiz/${quizId}/attempts`, {
        params: {
          sortBy,
          page,
          limit: pagination.limit || DEFAULT_PAGINATION.limit,
        },
      });

      setAttempts(response.data.data.attempts || []);
      setPagination(response.data.data.pagination || DEFAULT_PAGINATION);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to load attempts');
    } finally {
      setAttemptsLoading(false);
    }
  };

  const coverInputRef = useRef(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isDragOverHero, setIsDragOverHero] = useState(false);
  const [coverThumbnail, setCoverThumbnail] = useState('');
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (quiz?.thumbnail) {
      setCoverThumbnail(quiz.thumbnail);
      setImgError(false);
    }
  }, [quiz?.thumbnail]);

  // Real-time synchronization if cover changed elsewhere
  useEffect(() => {
    const handleSync = (e) => {
      if (e.detail?.quizId === quizId) {
        setCoverThumbnail(e.detail.thumbnail || '');
        setImgError(false);
      }
    };
    window.addEventListener('quiz-cover-updated', handleSync);
    return () => window.removeEventListener('quiz-cover-updated', handleSync);
  }, [quizId]);

  const processCoverFile = async (file) => {
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
      const data = await QuizService.uploadCoverImage(quizId, compressed?.file || compressed);
      if (data?.thumbnail) {
        setCoverThumbnail(data.thumbnail);
        setImgError(false);
        setQuiz((prev) => (prev ? { ...prev, thumbnail: data.thumbnail } : prev));
        window.dispatchEvent(
          new CustomEvent('quiz-cover-updated', {
            detail: { quizId, thumbnail: data.thumbnail },
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
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  const handleCoverUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) processCoverFile(file);
  };

  const handleRemoveCover = async () => {
    try {
      setIsUploadingCover(true);
      await QuizService.removeCoverImage(quizId);
      setCoverThumbnail('');
      setImgError(false);
      setQuiz((prev) => (prev ? { ...prev, thumbnail: '' } : prev));
      window.dispatchEvent(
        new CustomEvent('quiz-cover-updated', {
          detail: { quizId, thumbnail: '' },
        })
      );
    } catch (err) {
      console.error('Failed to remove cover:', err);
      showCustomDialog({
        title: 'Removal Failed',
        message: err.response?.data?.message || 'Failed to remove cover image.',
        type: 'error',
      });
    } finally {
      setIsUploadingCover(false);
    }
  };

  const user = useAuthStore((s) => s.user);
  const isOwner = Boolean(
    user &&
    quiz &&
    (String(quiz.uploader?._id || quiz.uploader) === String(user._id) || user.role === 'admin')
  );

  return (
    <div className="quiz-modal-overlay" onMouseDown={handleOverlayMouseDown} role="presentation">
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleCoverUpload}
      />

      <section
        className="quiz-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-details-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {selectedAttemptId ? (
          <AttemptDetailView
            quizId={quizId}
            attemptId={selectedAttemptId}
            onBack={() => setSelectedAttemptId(null)}
          />
        ) : (
          <>
            {/* ========================================================
                HERO COVER BANNER WITH GRADIENT EFFECT & IMAGE UPLOAD
                ======================================================== */}
            <div
              className={`quiz-modal-hero-banner ${isDragOverHero ? 'drag-over' : ''}`}
              onDragOver={isOwner ? (e) => {
                e.preventDefault();
                setIsDragOverHero(true);
              } : undefined}
              onDragLeave={isOwner ? (e) => {
                e.preventDefault();
                setIsDragOverHero(false);
              } : undefined}
              onDrop={isOwner ? (e) => {
                e.preventDefault();
                setIsDragOverHero(false);
                const file = e.dataTransfer?.files?.[0];
                if (file) processCoverFile(file);
              } : undefined}
              title={isOwner ? 'Drag and drop an image here to set as cover' : undefined}
            >
              {coverThumbnail && !imgError ? (
                <img
                  src={coverThumbnail}
                  alt={quiz?.title || 'Quiz Cover'}
                  className="quiz-modal-hero-img"
                  loading="lazy"
                  decoding="async"
                  width="800"
                  height="220"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="quiz-modal-hero-clean-backdrop" />
              )}

              {/* Gradient Overlay Effect */}
              <div className="quiz-modal-hero-gradient-overlay" />

              {/* Drag & Drop Feedback */}
              {isDragOverHero && isOwner && (
                <div className="quiz-modal-hero-drag-overlay">
                  <Upload size={28} className="drag-bounce" />
                  <span>Drop Image to Set Cover</span>
                </div>
              )}

              {/* Close Button on Hero */}
              <button
                type="button"
                className="quiz-modal-close-hero"
                onClick={onClose}
                aria-label="Close quiz details"
              >
                ×
              </button>

              {/* Top Hero Actions Row (Owner only) */}
              {isOwner && (
                <div className="quiz-modal-hero-actions-row">
                  <button
                    type="button"
                    className="quiz-modal-hero-upload-btn"
                    onClick={() => coverInputRef.current?.click()}
                    disabled={isUploadingCover}
                    title="Upload or Change Cover Image"
                  >
                    <Camera size={14} />
                    <span>{isUploadingCover ? 'Uploading...' : coverThumbnail ? 'Change Cover' : 'Upload Cover Image'}</span>
                  </button>

                  {coverThumbnail && (
                    <button
                      type="button"
                      className="quiz-modal-hero-remove-btn"
                      onClick={handleRemoveCover}
                      disabled={isUploadingCover}
                      title="Remove Cover Image"
                    >
                      <Trash2 size={13} />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              )}

              {/* Title & Eyebrow on Hero */}
              <div className="quiz-modal-hero-content">
                <span className="quiz-modal-hero-eyebrow">Quiz Overview</span>
                <h2 id="quiz-details-title" className="quiz-modal-hero-title">
                  {quiz?.title || 'Quiz Details'}
                </h2>
              </div>
            </div>

            {loading ? (
              <div className="quiz-modal-state">
                <Spinner size={40} />
              </div>
            ) : error && !quiz ? (
              <div className="quiz-modal-state error">{error}</div>
            ) : (
              <div className="quiz-modal-content">
                {error ? <div className="quiz-modal-alert">{error}</div> : null}

                <div className="quiz-modal-summary">
                  <div>
                    <div className="quiz-modal-badges">
                      <Badge>{quiz?.category || 'General'}</Badge>
                      <Badge variant="warning">{quiz?.difficulty || 'All Levels'}</Badge>
                      {quiz?.settings?.timeLimit ? (
                        <Badge>{quiz.settings.timeLimit} min</Badge>
                      ) : (
                        <Badge variant="success">No time limit</Badge>
                      )}
                      <Badge variant={quiz?.visibility === 'public' ? 'default' : 'secondary'}>
                        {quiz?.visibility === 'public' ? 'Public' : 'Private'}
                      </Badge>
                    </div>
                    {quiz?.tags && quiz.tags.length > 0 && (
                      <div className="quiz-modal-tags-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {quiz.tags.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              onClose?.();
                              openSearch('#' + t, 'tags');
                            }}
                            style={{
                              background: 'rgba(255, 69, 0, 0.08)',
                              border: '1px solid rgba(255, 69, 0, 0.35)',
                              color: '#FF4500',
                              fontSize: 11,
                              fontWeight: 600,
                              borderRadius: 4,
                              padding: '2px 8px',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                            title={`Search quizzes tagged #${t}`}
                          >
                            #{t}
                          </button>
                        ))}
                      </div>
                    )}
                    {quiz?.description && <p>{quiz.description}</p>}
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    {isOwner && (
                      <Link to={`/quiz/${quizId}/settings`} className="quiz-modal-start-link">
                        <Button variant="secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Settings size={15} />
                          Settings
                        </Button>
                      </Link>
                    )}
                    <Link to={`/quiz/${quizId}`} className="quiz-modal-start-link">
                      <Button style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Play size={14} fill="currentColor" />
                        Start Quiz
                      </Button>
                    </Link>
                  </div>
                </div>

                <section className="quiz-attempts-section">
                  <div className="quiz-attempts-header">
                    <div>
                      <h3>Recent Attempts</h3>
                      <p>{pagination.total || 0} completed attempt{pagination.total === 1 ? '' : 's'}</p>
                    </div>
                    <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} disabled={attemptsLoading}>
                      <option value="latest">Latest</option>
                      <option value="highest">Highest score</option>
                      <option value="lowest">Lowest score</option>
                    </select>
                  </div>

                  {attemptsLoading ? (
                    <div className="quiz-modal-state compact">
                      <Spinner />
                    </div>
                  ) : attempts.length === 0 ? (
                    <div className="quiz-empty-attempts">No completed attempts yet.</div>
                  ) : (
                    <div className="quiz-attempt-list">
                      {attempts.map((attempt) => (
                        <button
                          type="button"
                          className="quiz-attempt-row"
                          key={attempt._id}
                          onClick={() => setSelectedAttemptId(attempt._id)}
                        >
                          <div>
                            <strong>{formatPercent(attempt.percentage)}</strong>
                            <span>{attempt.score || 0} / {attempt.totalQuestions || quiz?.questionCount || 0}</span>
                          </div>
                          <div className="quiz-attempt-progress">
                            <ProgressBar value={Number(attempt.percentage || 0)} />
                          </div>
                          <div className="quiz-attempt-meta">
                            <span>{formatDuration(attempt)}</span>
                            <small>{formatDateTime(attempt.completedAt || attempt.createdAt)}</small>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {pagination.pages > 1 ? (
                    <div className="quiz-pagination">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={pagination.page <= 1 || attemptsLoading}
                        onClick={() => loadPage(pagination.page - 1)}
                      >
                        Previous
                      </Button>
                      <span>
                        Page {pagination.page} of {pagination.pages}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={pagination.page >= pagination.pages || attemptsLoading}
                        onClick={() => loadPage(pagination.page + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  ) : null}
                </section>
              </div>
            )}
          </>
        )}
      </section>

      <style>{quizDetailsModalStyles}</style>
    </div>
  );
}

const quizDetailsModalStyles = `
  .quiz-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
  }

  .quiz-details-modal {
    width: min(1080px, 100%);
    max-height: min(860px, calc(100vh - 48px));
    overflow: hidden;
    border: 1px solid var(--border-default, #343536);
    border-radius: var(--radius-lg, 12px);
    background: var(--bg-surface, #1A1A1B);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
  }

  /* Hero Cover Banner */
  .quiz-modal-hero-banner {
    position: relative;
    width: 100%;
    height: 220px;
    overflow: hidden;
    background: var(--bg-elevated, #272729);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 24px 28px;
  }

  .quiz-modal-hero-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }

  .quiz-modal-hero-clean-backdrop {
    position: absolute;
    inset: 0;
    background: var(--bg-elevated, #272729);
  }

  .quiz-modal-hero-gradient-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(0, 0, 0, 0.1) 0%,
      rgba(26, 26, 27, 0.7) 60%,
      var(--bg-surface, #1A1A1B) 100%
    );
    z-index: 1;
  }

  .quiz-modal-close-hero {
    position: absolute;
    top: 18px;
    right: 18px;
    z-index: 10;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #ffffff;
    font-size: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .quiz-modal-close-hero:hover {
    background: #FF4500;
    border-color: #FF4500;
  }

  .quiz-modal-hero-actions-row {
    position: absolute;
    top: 18px;
    right: 64px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .quiz-modal-hero-upload-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 20px;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .quiz-modal-hero-upload-btn:hover:not(:disabled) {
    background: rgba(255, 69, 0, 0.9);
    border-color: #ff4500;
  }

  .quiz-modal-hero-remove-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 7px 12px;
    border-radius: 20px;
    background: rgba(239, 68, 68, 0.2);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #fca5a5;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .quiz-modal-hero-remove-btn:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.85);
    color: #ffffff;
    border-color: #ef4444;
  }

  .quiz-modal-hero-banner.drag-over {
    filter: brightness(1.2);
  }

  .quiz-modal-hero-drag-overlay {
    position: absolute;
    inset: 0;
    z-index: 20;
    background: rgba(255, 69, 0, 0.85);
    backdrop-filter: blur(6px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #ffffff;
    font-size: 16px;
    font-weight: 800;
    pointer-events: none;
  }

  .quiz-modal-hero-drag-overlay .drag-bounce {
    animation: heroBounce 0.6s infinite alternate ease-in-out;
  }

  @keyframes heroBounce {
    from { transform: translateY(0); }
    to { transform: translateY(-8px); }
  }

  .quiz-modal-hero-content {
    position: relative;
    z-index: 2;
    max-width: 800px;
  }

  .quiz-modal-hero-eyebrow {
    display: block;
    margin-bottom: 6px;
    color: #FF4500;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .quiz-modal-hero-title {
    margin: 0;
    font-size: 26px;
    font-weight: 800;
    line-height: 1.25;
    color: #ffffff;
    letter-spacing: -0.02em;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.7);
    overflow-wrap: anywhere;
    word-break: break-word;
    min-width: 0;
  }

  /* Creator Pill Bar Inside Modal */
  .modal-creator-pill-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 18px;
    border-radius: 9999px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
  }

  .modal-creator-profile {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .modal-creator-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    border: 1.5px solid #FF4500;
  }

  .modal-creator-avatar-initial {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, #FF4500, #ff8c00);
    color: #ffffff;
    font-size: 13px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-creator-names {
    display: flex;
    flex-direction: column;
  }

  .modal-creator-name,
  .modal-creator-name-link {
    font-size: 14px;
    font-weight: 700;
    color: var(--color-text);
    text-decoration: none;
  }

  .modal-creator-name-link:hover {
    color: #FF4500;
  }

  .modal-creator-handle {
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .modal-creator-stats {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--color-text-secondary);
  }

  .modal-creator-stats strong {
    color: var(--color-text);
  }

  .stat-sep {
    color: var(--color-border);
  }
    letter-spacing: -0.02em;
  }

  .quiz-modal-close {
    width: 40px;
    height: 40px;
    border: 1px solid var(--color-border);
    border-radius: 50%;
    background: var(--color-surface-alt);
    color: var(--color-text);
    cursor: pointer;
    font-size: 26px;
    line-height: 1;
    transition: background 0.2s;
  }

  .quiz-modal-close:hover {
    background: var(--color-surface-hover);
  }

  .quiz-modal-content {
    flex: 1;
    overflow: auto;
    padding: 24px 28px 28px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .quiz-modal-state {
    min-height: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
  }

  .quiz-modal-state.compact {
    min-height: 120px;
  }

  .quiz-modal-state.error,
  .quiz-modal-alert {
    color: var(--color-danger);
  }

  .quiz-modal-alert {
    padding: 12px 14px;
    border: 1px solid rgba(220, 38, 38, 0.15);
    border-radius: 12px;
    background: var(--color-danger-light);
    font-size: 14px;
  }

  .quiz-modal-summary {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }

  .quiz-modal-summary p {
    max-width: 720px;
    margin: 12px 0 0;
    color: var(--color-text-secondary);
    line-height: 1.6;
  }

  .quiz-modal-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .quiz-modal-start-link {
    flex-shrink: 0;
    text-decoration: none;
  }

  .quiz-stat-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 14px;
  }

  .quiz-stat-card,
  .quiz-meta-grid > div {
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--color-border);
    border-radius: 14px;
    background: var(--color-surface);
  }

  .quiz-stat-card span,
  .quiz-meta-grid span {
    display: block;
    margin-bottom: 8px;
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .quiz-stat-card strong {
    font-size: 24px;
  }

  .quiz-meta-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }

  .quiz-meta-grid strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
  }

  .quiz-attempts-section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .quiz-attempts-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .quiz-attempts-header h3 {
    margin: 0 0 4px;
    font-weight: 600;
  }

  .quiz-attempts-header p {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 13px;
  }

  .quiz-attempts-header select {
    min-width: 150px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: 14px;
  }

  .quiz-empty-attempts {
    padding: 32px;
    border: 1px dashed var(--color-border);
    border-radius: 16px;
    color: var(--color-text-secondary);
    text-align: center;
  }

  .quiz-attempt-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .quiz-attempt-row {
    width: 100%;
    display: grid;
    grid-template-columns: 120px minmax(160px, 1fr) 180px;
    align-items: center;
    gap: 18px;
    padding: 14px 16px;
    border: 1px solid var(--color-border);
    border-radius: 14px;
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
    text-align: left;
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
  }

  .quiz-attempt-row:hover {
    transform: translateY(-1px);
    border-color: var(--color-primary);
    background: var(--color-surface-alt);
    box-shadow: 0 2px 8px rgba(79, 70, 229, 0.04);
  }

  .quiz-attempt-row strong,
  .quiz-attempt-row span,
  .quiz-attempt-row small {
    display: block;
  }

  .quiz-attempt-row strong {
    font-size: 20px;
  }

  .quiz-attempt-row span,
  .quiz-attempt-row small {
    color: var(--color-text-secondary);
    font-size: 13px;
  }

  .quiz-attempt-meta {
    text-align: right;
  }

  .quiz-pagination {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    color: var(--color-text-secondary);
    font-size: 13px;
  }

  @media (max-width: 860px) {
    .quiz-modal-overlay {
      padding: 12px;
      align-items: stretch;
    }

    .quiz-details-modal {
      max-height: calc(100vh - 24px);
      border-radius: 18px;
    }

    .quiz-modal-header,
    .quiz-modal-content {
      padding-left: 18px;
      padding-right: 18px;
    }

    .quiz-modal-summary,
    .quiz-attempts-header {
      flex-direction: column;
      align-items: stretch;
    }

    .quiz-modal-start-link,
    .quiz-modal-start-link button {
      width: 100%;
    }

    .quiz-stat-grid,
    .quiz-meta-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .quiz-attempt-row {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .quiz-attempt-meta {
      text-align: left;
    }
  }

  @media (max-width: 520px) {
    .quiz-stat-grid,
    .quiz-meta-grid {
      grid-template-columns: 1fr;
    }

    .quiz-pagination {
      justify-content: stretch;
      flex-wrap: wrap;
    }

    .quiz-pagination button {
      flex: 1;
    }
  }
`;
