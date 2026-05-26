import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useProfileStore } from '../../store/profileStore';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/axios';
import { Globe, AtSign, Share2, UserPlus, UserMinus, Edit3, BookOpen, Users, Trophy, Calendar, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';

/* ─── helpers ─── */
const gradient = 'linear-gradient(135deg, #6366f1, #a855f7)';

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function difficultyColor(d) {
  const map = {
    easy: '#22c55e',
    beginner: '#22c55e',
    medium: '#f59e0b',
    intermediate: '#f59e0b',
    hard: '#ef4444',
    advanced: '#ef4444',
  };
  return map[(d || '').toLowerCase()] || 'var(--color-text-muted)';
}

function normalizeExternalUrl(url) {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/* ─── Loading Skeleton ─── */
function ProfileSkeleton() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 128, height: 128, borderRadius: '50%', background: 'var(--color-border)', animation: 'pulse 1.8s ease-in-out infinite' }} />
        <div style={{ width: 180, height: 24, borderRadius: 8, background: 'var(--color-border)', animation: 'pulse 1.8s ease-in-out infinite' }} />
        <div style={{ width: 120, height: 16, borderRadius: 6, background: 'var(--color-border)', animation: 'pulse 1.8s ease-in-out infinite' }} />
        <div style={{ display: 'flex', gap: 32, marginTop: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ width: 60, height: 16, borderRadius: 6, background: 'var(--color-border)', animation: 'pulse 1.8s ease-in-out infinite' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Error State ─── */
function ErrorState({ message }) {
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: '80px 16px', textAlign: 'center' }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 24px',
      }}>
        <Users size={36} style={{ color: '#ef4444' }} />
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', marginBottom: 8 }}>Profile Not Found</h2>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 24 }}>{message}</p>
      <button
        onClick={() => navigate('/')}
        style={{
          padding: '10px 24px', borderRadius: 10, border: 'none', fontWeight: 600,
          background: gradient, color: '#fff', cursor: 'pointer', fontSize: 14,
        }}
      >
        Go Home
      </button>
    </div>
  );
}

/* ─── Empty Quizzes ─── */
function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '48px 16px' }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
      }}>
        <BookOpen size={32} style={{ color: '#6366f1' }} />
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>No public quizzes yet</h3>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>This user hasn't published any quizzes.</p>
    </div>
  );
}

/* ─── Quiz Card ─── */
function QuizCard({ quiz }) {
  const navigate = useNavigate();

  return (
    <div
      className="pp-quiz-card"
      onClick={() => navigate(`/quiz/${quiz._id}`)}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 16,
        padding: 20,
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(.4,0,.2,1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Accent top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: gradient }} />

      <h3 style={{
        fontSize: 16, fontWeight: 700, color: 'var(--color-text)',
        marginBottom: 10, lineHeight: 1.4,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {quiz.title}
      </h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {quiz.category && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
            background: 'rgba(99,102,241,0.15)', color: '#818cf8',
          }}>
            {quiz.category}
          </span>
        )}
        {quiz.difficulty && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
            background: `${difficultyColor(quiz.difficulty)}18`, color: difficultyColor(quiz.difficulty),
          }}>
            {quiz.difficulty}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: 'var(--color-text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <BookOpen size={13} /> {quiz.questionCount ?? quiz.questions?.length ?? 0} Qs
        </span>
        {quiz.totalAttempts != null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Users size={13} /> {quiz.totalAttempts} attempts
          </span>
        )}
        {(quiz.averageScore != null || quiz.avgScore != null) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Trophy size={13} /> {Math.round(quiz.averageScore ?? quiz.avgScore)}% avg
          </span>
        )}
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Calendar size={12} /> {formatFullDate(quiz.createdAt)}
      </div>
    </div>
  );
}

/* ─── Quiz Grid + Pagination ─── */
function QuizGrid({ quizzes, totalQuizzes, currentPage, totalPages, onPageChange, loading }) {
  if (loading && quizzes.length === 0) {
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16,
      }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            height: 180, borderRadius: 16, background: 'var(--color-surface)',
            border: '1px solid var(--color-border)', animation: 'pulse 1.8s ease-in-out infinite',
          }} />
        ))}
      </div>
    );
  }

  if (!quizzes || quizzes.length === 0) return <EmptyState />;

  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16,
        opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s',
      }}>
        {quizzes.map(q => <QuizCard key={q._id} quiz={q} />)}
      </div>

      {totalPages > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 32,
        }}>
          <button
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px', borderRadius: 10,
              border: '1px solid var(--color-border)', background: 'var(--color-surface)',
              color: currentPage <= 1 ? 'var(--color-text-muted)' : 'var(--color-text)',
              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13,
              transition: 'all 0.2s',
            }}
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px', borderRadius: 10,
              border: '1px solid var(--color-border)', background: 'var(--color-surface)',
              color: currentPage >= totalPages ? 'var(--color-text-muted)' : 'var(--color-text)',
              cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13,
              transition: 'all 0.2s',
            }}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </>
  );
}

/* ─── Profile Header ─── */
function ProfileHeader({ profile, isOwnProfile, onFollow, onUnfollow, onFollowersClick, onFollowingClick, followLoading }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/@${profile.username}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback */
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 40 }}>
      {/* Avatar with gradient ring */}
      <div className="pp-avatar-ring" style={{
        width: 132, height: 132, borderRadius: '50%', padding: 4,
        background: gradient, display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <div style={{
          width: 124, height: 124, borderRadius: '50%', overflow: 'hidden',
          background: 'var(--color-background)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {profile.avatar ? (
            <img src={profile.avatar} alt={profile.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 44, fontWeight: 700, color: 'var(--color-text)', userSelect: 'none' }}>
              {(profile.name || profile.username || 'U')[0].toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Name & username */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text)', margin: 0, lineHeight: 1.3 }}>
          {profile.name || profile.username}
        </h1>
        <p style={{ fontSize: 15, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>@{profile.username}</p>
      </div>

      {/* Bio */}
      {profile.bio && (
        <p style={{
          fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center',
          maxWidth: 500, lineHeight: 1.6, margin: 0,
        }}>
          {profile.bio}
        </p>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 28, fontSize: 14, color: 'var(--color-text-secondary)' }}>
        <span><strong style={{ color: 'var(--color-text)', fontWeight: 700 }}>{profile.quizCount ?? profile.quizzesCount ?? 0}</strong> quizzes</span>
        <button
          type="button"
          onClick={onFollowersClick}
          style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: 'inherit', padding: 0, font: 'inherit' }}
        >
          <strong style={{ color: 'var(--color-text)', fontWeight: 700 }}>{profile.followersCount ?? 0}</strong> followers
        </button>
        <button
          type="button"
          onClick={onFollowingClick}
          style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: 'inherit', padding: 0, font: 'inherit' }}
        >
          <strong style={{ color: 'var(--color-text)', fontWeight: 700 }}>{profile.followingCount ?? 0}</strong> following
        </button>
      </div>

      {/* Social links */}
      {(profile.socialLinks?.website || profile.socialLinks?.personalId) && (
        <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
          {profile.socialLinks?.website && (
            <a
              href={normalizeExternalUrl(profile.socialLinks.website)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 5, color: '#818cf8',
                textDecoration: 'none', transition: 'color 0.2s',
              }}
            >
              <Globe size={14} /> {profile.socialLinks.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          )}
          {profile.socialLinks?.personalId && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--color-text-muted)' }}>
              <AtSign size={14} /> {profile.socialLinks.personalId}
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        {isOwnProfile ? (
          <Link
            to="/settings/profile"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 22px', borderRadius: 10,
              border: '1px solid var(--color-border)', background: 'var(--color-surface)',
              color: 'var(--color-text)', fontWeight: 600, fontSize: 14, textDecoration: 'none',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <Edit3 size={15} /> Edit Profile
          </Link>
        ) : (
          <button
            className="pp-follow-btn"
            onClick={() => profile.isFollowing ? onUnfollow() : onFollow()}
            disabled={followLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 24px', borderRadius: 10,
              border: profile.isFollowing ? '1px solid var(--color-border)' : 'none',
              background: profile.isFollowing ? 'var(--color-surface)' : gradient,
              color: profile.isFollowing ? 'var(--color-text)' : '#fff',
              fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'all 0.3s cubic-bezier(.4,0,.2,1)',
              minWidth: 120, justifyContent: 'center',
              opacity: followLoading ? 0.7 : 1,
            }}
          >
            {profile.isFollowing ? <><UserMinus size={15} /> Unfollow</> : <><UserPlus size={15} /> Follow</>}
          </button>
        )}

        <button
          onClick={handleShare}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10,
            border: '1px solid var(--color-border)', background: 'var(--color-surface)',
            color: 'var(--color-text)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {copied ? <><Check size={15} style={{ color: '#22c55e' }} /> Copied!</> : <><Share2 size={15} /> Share</>}
        </button>
      </div>

      {/* Member since */}
      {profile.createdAt && (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 5, margin: 0 }}>
          <Calendar size={13} /> Joined {formatDate(profile.createdAt)}
        </p>
      )}
    </div>
  );
}

/* ─── Followers / Following Modal ─── */
function FollowListModal({ modal, onClose, onPageChange }) {
  const navigate = useNavigate();
  if (!modal.open) return null;

  const title = modal.type === 'followers' ? 'Followers' : 'Following';

  const openProfile = (user) => {
    if (!user?.username) return;
    onClose();
    navigate(`/@${user.username}`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.58)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(440px, 100%)',
          maxHeight: 'min(620px, 86vh)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--color-text)' }}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-background)',
              color: 'var(--color-text)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', minHeight: 160 }}>
          {modal.loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading...</div>
          ) : modal.error ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#ef4444' }}>{modal.error}</div>
          ) : modal.users.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No {title.toLowerCase()} yet.
            </div>
          ) : (
            modal.users.map((item) => (
              <button
                key={item._id}
                type="button"
                onClick={() => openProfile(item)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  border: 'none',
                  borderBottom: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  background: 'var(--color-background)',
                  overflow: 'hidden',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  border: '1px solid var(--color-border)',
                }}>
                  {item.avatar ? (
                    <img src={item.avatar} alt={item.name || item.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontWeight: 700 }}>{(item.name || item.username || 'U')[0].toUpperCase()}</span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name || item.username}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    @{item.username}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {modal.totalPages > 1 && (
          <div style={{
            padding: 12,
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
          }}>
            <button
              type="button"
              disabled={modal.page <= 1 || modal.loading}
              onClick={() => onPageChange(modal.page - 1)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-background)',
                color: 'var(--color-text)',
                opacity: modal.page <= 1 || modal.loading ? 0.45 : 1,
                cursor: modal.page <= 1 || modal.loading ? 'not-allowed' : 'pointer',
              }}
            >
              Prev
            </button>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              Page {modal.page} of {modal.totalPages}
            </span>
            <button
              type="button"
              disabled={modal.page >= modal.totalPages || modal.loading}
              onClick={() => onPageChange(modal.page + 1)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-background)',
                color: 'var(--color-text)',
                opacity: modal.page >= modal.totalPages || modal.loading ? 0.45 : 1,
                cursor: modal.page >= modal.totalPages || modal.loading ? 'not-allowed' : 'pointer',
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main Public Profile Page
   ═══════════════════════════════════════════════════════════════ */
export default function PublicProfile() {
  const { profileId, username: routeUsername } = useParams();
  const routeProfileId = routeUsername || profileId || '';
  const username = routeProfileId.replace(/^@/, '');
  const isAtProfilePath = routeProfileId.startsWith('@');
  const navigate = useNavigate();
  
  const { user } = useAuthStore();
  const { profile, quizzes, totalQuizzes, currentPage, totalPages, isLoading, quizzesLoading, error, fetchProfile, fetchQuizzes, followUser, unfollowUser, reset } = useProfileStore();
  const [followLoading, setFollowLoading] = useState(false);
  const [followModal, setFollowModal] = useState({
    open: false,
    type: 'followers',
    users: [],
    page: 1,
    totalPages: 1,
    loading: false,
    error: '',
  });

  useEffect(() => {
    if (username && isAtProfilePath) {
      fetchProfile(username);
      fetchQuizzes(username);
    }
    return () => reset();
  }, [username, isAtProfilePath]);

  const handleFollow = async () => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(`/@${username}`)}`);
      return;
    }

    setFollowLoading(true);
    try {
      await followUser(username);
    } catch (err) {
      if (err.response?.status === 401) {
        navigate(`/login?redirect=${encodeURIComponent(`/@${username}`)}`);
      }
    } finally {
      setFollowLoading(false);
    }
  };

  const handleUnfollow = async () => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(`/@${username}`)}`);
      return;
    }

    setFollowLoading(true);
    try {
      await unfollowUser(username);
    } catch (err) {
      if (err.response?.status === 401) {
        navigate(`/login?redirect=${encodeURIComponent(`/@${username}`)}`);
      }
    } finally {
      setFollowLoading(false);
    }
  };

  const handlePageChange = (page) => {
    fetchQuizzes(username, page);
    const quizSectionTop = document.getElementById('pp-quiz-section')?.offsetTop || 0;
    window.scrollTo({ top: Math.max(0, quizSectionTop - 32), behavior: 'smooth' });
  };

  const loadFollowList = async (type, page = 1) => {
    setFollowModal((current) => ({
      ...current,
      open: true,
      type,
      page,
      loading: true,
      error: '',
    }));

    try {
      const { data } = await api.get(`/users/${username}/${type}?page=${page}`);
      const payload = data.data || {};
      setFollowModal({
        open: true,
        type,
        users: payload.users || payload[type] || [],
        page: payload.page || page,
        totalPages: payload.totalPages || 1,
        loading: false,
        error: '',
      });
    } catch (err) {
      setFollowModal((current) => ({
        ...current,
        loading: false,
        users: [],
        error: err.response?.data?.message || `Could not load ${type}`,
      }));
    }
  };

  const isOwnProfile = user && profile && (user.username === profile.username || user._id === profile._id);

  if (!isAtProfilePath) {
    return <ErrorState message="Profile links start with @username." />;
  }

  if (isLoading) return <ProfileSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!profile) return null;

  return (
    <>
      {/* Injected keyframe animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes avatarGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(99,102,241,0.3); }
          50% { box-shadow: 0 0 32px rgba(168,85,247,0.45); }
        }
        .pp-avatar-ring {
          animation: avatarGlow 3s ease-in-out infinite;
        }
        .pp-quiz-card:hover {
          transform: translateY(-4px) scale(1.01);
          box-shadow: 0 12px 40px rgba(0,0,0,0.25), 0 0 0 1px rgba(99,102,241,0.2);
          border-color: rgba(99,102,241,0.35) !important;
        }
        .pp-follow-btn:hover {
          transform: scale(1.04);
        }
        .pp-follow-btn:active {
          transform: scale(0.97);
        }
      `}</style>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 16px 80px' }}>
        <ProfileHeader
          profile={profile}
          isOwnProfile={isOwnProfile}
          onFollow={handleFollow}
          onUnfollow={handleUnfollow}
          onFollowersClick={() => loadFollowList('followers')}
          onFollowingClick={() => loadFollowList('following')}
          followLoading={followLoading}
        />

        {/* Divider */}
        <div style={{
          height: 1, background: 'var(--color-border)', margin: '0 0 32px',
          backgroundImage: 'linear-gradient(90deg, transparent, var(--color-border), transparent)',
        }} />

        {/* Quiz Section */}
        <div id="pp-quiz-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <BookOpen size={20} style={{ color: '#a855f7' }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
              Public Quizzes
              <span style={{ fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 15, marginLeft: 8 }}>
                ({totalQuizzes})
              </span>
            </h2>
          </div>
          <QuizGrid
            quizzes={quizzes}
            totalQuizzes={totalQuizzes}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            loading={quizzesLoading}
          />
        </div>
      </div>
      <FollowListModal
        modal={followModal}
        onClose={() => setFollowModal((current) => ({ ...current, open: false }))}
        onPageChange={(page) => loadFollowList(followModal.type, page)}
      />
    </>
  );
}
