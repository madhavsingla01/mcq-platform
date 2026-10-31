import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileQuestion, Search, Bell } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import api from '../../api/axios';

export default function MobileTopBar() {
  const { user, isAuthenticated } = useAuthStore();
  const openSearch = useUIStore((s) => s.openSearch);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return undefined;
    }

    let isMounted = true;
    const fetchUnread = async () => {
      try {
        const { data } = await api.get('/social/notifications/unread-count');
        if (isMounted && data?.data?.unreadCount !== undefined) {
          setUnreadCount(data.data.unreadCount);
        }
      } catch {
        // graceful silence
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  const userInitial = (user?.name?.[0] || user?.username?.[0] || 'U').toUpperCase();

  return (
    <header className="mobile-top-bar" aria-label="Mobile Navigation Header">
      {/* Brand Logo & Name */}
      <Link to="/explore" className="mobile-brand" title="QuizFocus Home">
        <div className="mobile-brand-mark">
          <FileQuestion size={18} strokeWidth={2.4} color="#FFFFFF" />
        </div>
        <span className="mobile-brand-title">QuizFocus</span>
      </Link>

      {/* Action Controls */}
      <div className="mobile-top-actions">
        {/* Quick Search Trigger */}
        <button
          type="button"
          className="mobile-top-btn search-trigger"
          onClick={() => openSearch()}
          aria-label="Search quizzes, creators, #hashtags"
          title="Search"
        >
          <Search size={18} strokeWidth={2} />
        </button>

        {/* Notifications with Live Badge */}
        <Link
          to="/notifications"
          className="mobile-top-btn notif-trigger"
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell size={18} strokeWidth={2} />
          {unreadCount > 0 && (
            <span className="mobile-notif-badge">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* User Mini Profile Avatar */}
        <Link to="/settings" className="mobile-top-avatar-link" title="Profile Settings">
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name || 'Profile'} className="mobile-top-avatar" />
          ) : (
            <div className="mobile-top-avatar-placeholder">{userInitial}</div>
          )}
        </Link>
      </div>

      <style>{mobileTopBarStyles}</style>
    </header>
  );
}

const mobileTopBarStyles = `
  .mobile-top-bar {
    display: none;
  }

  @media (max-width: 768px) {
    .mobile-top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: calc(54px + env(safe-area-inset-top, 0px));
      padding-top: env(safe-area-inset-top, 0px);
      padding-left: 14px;
      padding-right: 14px;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(24px) saturate(190%);
      -webkit-backdrop-filter: blur(24px) saturate(190%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.09);
      z-index: 95;
      box-sizing: border-box;
      touch-action: pan-y;
    }

    .mobile-brand {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      text-decoration: none;
      color: #FFFFFF;
      user-select: none;
      -webkit-user-select: none;
    }

    .mobile-brand:active {
      transform: scale(0.97);
    }

    .mobile-brand-mark {
      width: 32px;
      height: 32px;
      background: var(--color-primary, #FF4500);
      border-radius: var(--radius-control, 8px);
      corner-shape: squircle;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 10px rgba(255, 69, 0, 0.45);
      flex-shrink: 0;
    }

    .mobile-brand-title {
      font-size: 17px;
      font-weight: 750;
      letter-spacing: -0.025em;
      color: #FFFFFF;
    }

    .mobile-top-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .mobile-top-btn {
      width: 38px;
      height: 38px;
      border-radius: var(--radius-control, 8px);
      corner-shape: squircle;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.09);
      color: rgba(255, 255, 255, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      position: relative;
      touch-action: manipulation;
      transition: transform var(--duration-tap, 120ms) var(--ease-out, ease-out), background-color 150ms ease;
      text-decoration: none;
    }

    .mobile-top-btn:active {
      transform: scale(0.92);
      background: rgba(255, 255, 255, 0.12);
    }

    .mobile-notif-badge {
      position: absolute;
      top: 3px;
      right: 3px;
      min-width: 15px;
      height: 15px;
      padding: 0 4px;
      border-radius: 9999px;
      background: #FF3B30;
      color: #FFFFFF;
      font-size: 9.5px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 0 2px #000000;
    }

    .mobile-top-avatar-link {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: 4px;
      text-decoration: none;
      touch-action: manipulation;
    }

    .mobile-top-avatar-link:active {
      transform: scale(0.92);
    }

    .mobile-top-avatar,
    .mobile-top-avatar-placeholder {
      width: 32px;
      height: 32px;
      border-radius: 9999px;
      object-fit: cover;
      border: 1.5px solid rgba(255, 255, 255, 0.15);
    }

    .mobile-top-avatar-placeholder {
      background: var(--color-primary, #FF4500);
      color: #FFFFFF;
      font-size: 13px;
      font-weight: 750;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }
`;
