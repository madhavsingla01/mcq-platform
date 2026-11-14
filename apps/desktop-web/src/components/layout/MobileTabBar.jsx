import { useState, useEffect } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Compass,
  LayoutDashboard,
  Plus,
  Trophy,
  Menu,
  X,
  Activity,
  MessageSquare,
  Bell,
  Settings,
  BookOpen,
  LogOut,
  ChevronRight,
  Shield,
  Sparkles,
  Store,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/axios';
import messageService from '../../services/message.service';
import './MobileTabBar.css';

export default function MobileTabBar() {
  const { user, logout, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [messageCount, setUnreadMessages] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const unreadMessages = user?.preferences?.notifications?.directMessages === false ? 0 : messageCount;

  // Close sheet on route change
  useEffect(() => {
    setIsSheetOpen(false);
  }, [location.pathname, location.search]);

  // Fetch unread messages
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadMessages(0);
      setNotificationCount(0);
      return undefined;
    }

    let isMounted = true;
    const fetchUnreadMsg = async () => {
      try {
        const [messages, notifications] = await Promise.allSettled([
          messageService.getUnreadCount(), api.get('/social/notifications/unread-count'),
        ]);
        if (!isMounted) return;
        if (messages.status === 'fulfilled') setUnreadMessages(messages.value);
        if (notifications.status === 'fulfilled') setNotificationCount(notifications.value.data?.data?.unreadCount || 0);
      } catch {
        // silent fallback
      }
    };
    fetchUnreadMsg();
    const interval = setInterval(fetchUnreadMsg, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  const handleLogout = async () => {
    setIsSheetOpen(false);
    if (await logout()) navigate('/login');
  };

  const userInitial = (user?.name?.[0] || user?.username?.[0] || 'U').toUpperCase();

  return (
    <>
      {/* ── Fixed Bottom Tab Bar ── */}
      <nav className="mobile-tab-bar" aria-label="Mobile Bottom Navigation">
        {/* 1. Explore */}
        <NavLink
          to="/explore"
          className={({ isActive }) => `mobile-tab-item ${isActive ? 'active' : ''}`}
        >
          <div className="tab-icon-wrap">
            <Compass size={21} strokeWidth={2.1} />
          </div>
          <span className="tab-label">Explore</span>
        </NavLink>

        {/* 2. Dashboard / Feed */}
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `mobile-tab-item ${isActive ? 'active' : ''}`}
        >
          <div className="tab-icon-wrap">
            <LayoutDashboard size={20} strokeWidth={2.1} />
          </div>
          <span className="tab-label">Feed</span>
        </NavLink>

        {/* 3. Center Create Action (Raised Squircle) */}
        <Link to="/create" className="mobile-tab-create-btn" title="Create Quiz" aria-label="Create new quiz">
          <div className="create-squircle-icon">
            <Plus size={22} strokeWidth={2.6} color="#FFFFFF" />
          </div>
          <span className="tab-label create-label">Create</span>
        </Link>

        {/* 4. Challenges / Arena */}
        <NavLink
          to="/challenges"
          className={({ isActive }) => `mobile-tab-item ${isActive ? 'active' : ''}`}
        >
          <div className="tab-icon-wrap">
            <Trophy size={20} strokeWidth={2.1} />
          </div>
          <span className="tab-label">Arena</span>
        </NavLink>

        {/* 5. More Sheet Trigger */}
        <button
          type="button"
          className={`mobile-tab-item ${isSheetOpen ? 'active' : ''}`}
          onClick={() => setIsSheetOpen((prev) => !prev)}
          aria-label="Open navigation menu"
        >
          <div className="tab-icon-wrap user-tab-wrap">
            {user?.avatar ? (
              <img src={user.avatar} alt="Avatar" className="tab-avatar" />
            ) : (
              <div className="tab-avatar-placeholder">{userInitial}</div>
            )}
            {(unreadMessages > 0 || notificationCount > 0) && <span className="tab-dot-badge" />}
          </div>
          <span className="tab-label">Menu</span>
        </button>
      </nav>

      {/* ── Apple-Style Mobile Bottom Action Sheet ── */}
      {isSheetOpen && (
        <div
          className="mobile-sheet-backdrop"
          onClick={() => setIsSheetOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Menu"
        >
          <div
            className="mobile-sheet-card"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="mobile-sheet-handle-row">
              <div className="mobile-sheet-handle" />
            </div>

            {/* Profile Header */}
            <div className="mobile-sheet-profile-header">
              <div className="sheet-avatar-wrap">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name || 'User'} className="sheet-avatar" />
                ) : (
                  <div className="sheet-avatar-placeholder">{userInitial}</div>
                )}
              </div>
              <div className="sheet-user-meta">
                <span className="sheet-user-name">{user?.name || 'Quiz Creator'}</span>
                <span className="sheet-user-handle">@{user?.username || 'user'}</span>
              </div>
              <button
                type="button"
                className="sheet-close-btn"
                onClick={() => setIsSheetOpen(false)}
                aria-label="Close menu"
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick Action Rows */}
            <div className="mobile-sheet-links-list">
              {/* Marketplace */}
              <Link
                to="/marketplace"
                className="sheet-link-row"
                onClick={() => setIsSheetOpen(false)}
              >
                <div className="sheet-link-icon-box orange">
                  <Store size={18} />
                </div>
                <div className="sheet-link-text">
                  <span className="sheet-link-title">Quiz Marketplace</span>
                  <span className="sheet-link-sub">Browse, share &amp; acquire quiz decks</span>
                </div>
                <ChevronRight size={16} className="sheet-link-chevron" />
              </Link>

              {/* Activity Hub */}
              <Link
                to="/settings?tab=activity"
                className="sheet-link-row"
                onClick={() => setIsSheetOpen(false)}
              >
                <div className="sheet-link-icon-box orange">
                  <Activity size={18} />
                </div>
                <div className="sheet-link-text">
                  <span className="sheet-link-title">Your Activity &amp; Data</span>
                  <span className="sheet-link-sub">Recent quizzes, bookmarks, likes</span>
                </div>
                <ChevronRight size={16} className="sheet-link-chevron" />
              </Link>

              {/* Messages */}
              <Link
                to="/messages"
                className="sheet-link-row"
                onClick={() => setIsSheetOpen(false)}
              >
                <div className="sheet-link-icon-box neutral">
                  <MessageSquare size={18} />
                </div>
                <div className="sheet-link-text">
                  <span className="sheet-link-title">Direct Messages</span>
                  <span className="sheet-link-sub">Connect with creators</span>
                </div>
                {unreadMessages > 0 ? (
                  <span className="sheet-count-badge">{unreadMessages}</span>
                ) : (
                  <ChevronRight size={16} className="sheet-link-chevron" />
                )}
              </Link>

              <Link to="/notifications" className="sheet-link-row" onClick={() => setIsSheetOpen(false)}>
                <div className="sheet-link-icon-box neutral"><Bell size={18} /></div>
                <div className="sheet-link-text"><span className="sheet-link-title">Notifications</span></div>
                {notificationCount > 0 ? <span className="sheet-count-badge">{notificationCount}</span>
                  : <ChevronRight size={16} className="sheet-link-chevron" />}
              </Link>
              <Link
                to="/settings"
                className="sheet-link-row"
                onClick={() => setIsSheetOpen(false)}
              >
                <div className="sheet-link-icon-box neutral">
                  <Settings size={18} />
                </div>
                <div className="sheet-link-text">
                  <span className="sheet-link-title">Settings &amp; Preferences</span>
                  <span className="sheet-link-sub">Account, themes, sound</span>
                </div>
                <ChevronRight size={16} className="sheet-link-chevron" />
              </Link>

              {/* Guide */}
              <Link
                to="/guide"
                className="sheet-link-row"
                onClick={() => setIsSheetOpen(false)}
              >
                <div className="sheet-link-icon-box neutral">
                  <BookOpen size={18} />
                </div>
                <div className="sheet-link-text">
                  <span className="sheet-link-title">Platform Guide</span>
                  <span className="sheet-link-sub">Learn formatting &amp; rules</span>
                </div>
                <ChevronRight size={16} className="sheet-link-chevron" />
              </Link>
            </div>

            {/* Logout Action */}
            <div className="mobile-sheet-footer">
              <button
                type="button"
                className="mobile-sheet-logout-btn"
                onClick={handleLogout}
              >
                <LogOut size={16} />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
