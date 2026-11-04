import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileQuestion, Search, Bell } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import api from '../../api/axios';
import './MobileTopBar.css';

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
    </header>
  );
}
