import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Camera, Play, Trash2, Upload } from 'lucide-react';
import api from '../../api/axios';
import { Badge, Button, ProgressBar, Spinner, showCustomDialog } from '../ui';
import AttemptDetailView from './AttemptDetailView';
import QuizService from '../../services/quiz.service';
import './QuizDetailsModal.css';
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
        const [quizResult, analyticsResult, attemptsResult] = await Promise.allSettled([
          api.get(`/quiz/${quizId}`),
          api.get(`/quiz/${quizId}/analytics`),
          api.get(`/quiz/${quizId}/attempts`, { params: { limit: DEFAULT_PAGINATION.limit } }),
        ]);

        if (cancelled) return;

        if (quizResult.status === 'rejected') {
          throw quizResult.reason;
        }

        setQuiz(quizResult.value.data?.data?.quiz || quizResult.value.data?.quiz);

        if (analyticsResult.status === 'fulfilled') {
          setAnalytics(analyticsResult.value.data?.data?.analytics || analyticsResult.value.data?.analytics);
        }

        if (attemptsResult.status === 'fulfilled') {
          const attemptsData = attemptsResult.value.data?.data || attemptsResult.value.data;
          setAttempts(attemptsData?.attempts || []);
          setPagination(attemptsData?.pagination || DEFAULT_PAGINATION);
        }
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
    </div>
  );
}
