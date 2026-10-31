import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, Bookmark, Award, Flame, Settings, ChevronRight, Shield, Moon, Clock, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { socialApi, attemptApi } from '../../api/client';

export default function Profile() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [bookmarks, setBookmarks] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadProfileData() {
      try {
        const hasToken = Boolean(localStorage.getItem('token'));
        const [bookmarksRes, historyRes] = await Promise.all([
          hasToken ? socialApi.getBookmarks().catch(() => ({ data: { data: { quizzes: [] } } })) : Promise.resolve({ data: { data: { quizzes: [] } } }),
          hasToken ? attemptApi.getHistory({ limit: 10 }).catch(() => ({ data: { data: { attempts: [] } } })) : Promise.resolve({ data: { data: { attempts: [] } } }),
        ]);

        if (!mounted) return;

        const bList = bookmarksRes.data?.data?.quizzes || bookmarksRes.data?.data?.bookmarks || bookmarksRes.data?.data || [];
        setBookmarks(Array.isArray(bList) ? bList : []);

        const hList = historyRes.data?.data?.attempts || historyRes.data?.data || [];
        setHistory(Array.isArray(hList) ? hList : []);
      } catch (err) {
        console.error('Failed to load profile data from backend:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProfileData();
    return () => { mounted = false; };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const displayName = user?.name || user?.username || (isAuthenticated ? 'Quiz Master' : 'Guest Learner');
  const handle = user?.username ? `@${user.username}` : (isAuthenticated ? '@candidate_user' : '@guest_session');
  const streak = user?.streak ?? 0;
  const attemptsCount = history.length;

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Profile Header Card */}
      <div style={{
        background: 'linear-gradient(145deg, #18181B 0%, #101012 100%)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        padding: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}>
        {/* Avatar */}
        <div style={{
          width: '60px',
          height: '60px',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--bg-elevated)',
          border: '2px solid rgba(255, 69, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-accent)',
          fontWeight: 800,
          fontSize: '22px',
        }}>
          {displayName.charAt(0).toUpperCase()}
        </div>

        {/* User Info */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-text)' }}>
            {displayName}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
            {handle}
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(255, 69, 0, 0.15)',
            color: 'var(--color-accent)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-pill)',
            fontSize: '11px',
            fontWeight: 700,
          }}>
            <Shield size={12} />
            <span>{user?.role === 'admin' ? 'Platform Admin' : 'Active Learner'}</span>
          </div>
        </div>
      </div>

      {/* Guest Session Sign In Banner */}
      {!isAuthenticated && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(255, 69, 0, 0.1) 0%, var(--bg-card) 100%)',
          border: '1px solid rgba(255, 69, 0, 0.4)',
          borderRadius: 'var(--radius-card)',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text)' }}>
              Sign in to sync your profile
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              Keep your streaks, achievements, and bookmarks safe.
            </div>
          </div>
          <button
            onClick={() => navigate('/login')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--color-accent)',
              color: '#000000',
              fontWeight: 800,
              fontSize: '13px',
              whiteSpace: 'nowrap',
              boxShadow: 'none',
            }}
            className="interactive-tap"
          >
            Sign In
          </button>
        </div>
      )}

      {/* Stats Summary Row (Live Backend Values) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-control)',
          padding: '14px 10px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 800 }}>{streak}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Day Streak</div>
        </div>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-control)',
          padding: '14px 10px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 800 }}>{attemptsCount}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Attempts</div>
        </div>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-control)',
          padding: '14px 10px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 800 }}>{bookmarks.length}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Bookmarks</div>
        </div>
      </div>

      {/* Real Bookmarked Quizzes from Social Service */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700 }}>
          <Bookmark size={18} color="var(--color-accent)" />
          <span>Saved & Bookmarked Quizzes ({bookmarks.length})</span>
        </div>

        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px' }}>
            Loading saved bookmarks...
          </div>
        ) : bookmarks.length === 0 ? (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            padding: '24px 16px',
            textAlign: 'center',
          }}>
            <Sparkles size={22} color="var(--color-text-muted)" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: '14px', fontWeight: 600 }}>No Bookmarks Yet</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              Bookmark quizzes on the Explore tab to practice them anytime.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {bookmarks.map((b) => (
              <div 
                key={b._id || b.id}
                onClick={() => navigate(`/quiz/${b._id || b.id}`)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-card)',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
                className="interactive-tap"
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{b.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    {b.difficulty || 'All Levels'} • {b.category || 'General'}
                  </div>
                </div>
                <ChevronRight size={16} color="var(--color-text-muted)" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Account Settings & Auth */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
          Account & Device
        </span>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Moon size={18} color="var(--color-text-secondary)" />
              <span style={{ fontSize: '14px' }}>Theme Appearance</span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Pure Dark (OLED)</span>
          </div>

          {isAuthenticated ? (
            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: 'var(--color-danger)',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              style={{
                width: '100%',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: 'var(--color-accent)',
                fontWeight: 700,
                fontSize: '14px',
              }}
            >
              <User size={18} />
              <span>Sign In / Switch Account</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
