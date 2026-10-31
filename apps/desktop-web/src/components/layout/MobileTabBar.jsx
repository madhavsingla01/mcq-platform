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
  Settings,
  BookOpen,
  LogOut,
  ChevronRight,
  Shield,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import messageService from '../../services/message.service';

export default function MobileTabBar() {
  const { user, logout, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Close sheet on route change
  useEffect(() => {
    setIsSheetOpen(false);
  }, [location.pathname, location.search]);

  // Fetch unread messages
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadMessages(0);
      return undefined;
    }

    let isMounted = true;
    const fetchUnreadMsg = async () => {
      try {
        const unreadCount = await messageService.getUnreadCount();
        if (isMounted) setUnreadMessages(unreadCount);
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
    await logout();
    navigate('/login');
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
            {unreadMessages > 0 && <span className="tab-dot-badge" />}
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
                <div className="sheet-link-icon-box blue">
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

              {/* Settings */}
              <Link
                to="/settings"
                className="sheet-link-row"
                onClick={() => setIsSheetOpen(false)}
              >
                <div className="sheet-link-icon-box purple">
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
                <div className="sheet-link-icon-box green">
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

      <style>{mobileTabBarStyles}</style>
    </>
  );
}

const mobileTabBarStyles = `
  .mobile-tab-bar {
    display: none;
  }

  @media (max-width: 768px) {
    .mobile-tab-bar {
      display: flex;
      align-items: center;
      justify-content: space-around;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: calc(58px + env(safe-area-inset-bottom, 0px));
      padding-bottom: env(safe-area-inset-bottom, 0px);
      padding-left: 6px;
      padding-right: 6px;
      background: rgba(10, 10, 10, 0.88);
      backdrop-filter: blur(24px) saturate(190%);
      -webkit-backdrop-filter: blur(24px) saturate(190%);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      z-index: 95;
      box-sizing: border-box;
      touch-action: pan-x;
    }

    .mobile-tab-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      text-decoration: none;
      color: rgba(255, 255, 255, 0.55);
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 6px 0 4px;
      min-height: 48px;
      touch-action: manipulation;
      transition: color 150ms ease, transform var(--duration-tap, 120ms) var(--ease-out, ease-out);
      user-select: none;
      -webkit-user-select: none;
    }

    .mobile-tab-item:active {
      transform: scale(0.92);
      color: #FFFFFF;
    }

    .mobile-tab-item.active {
      color: var(--color-primary, #FF4500);
    }

    .tab-icon-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .tab-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: -0.01em;
      line-height: 1;
    }

    /* Raised Center Create Button */
    .mobile-tab-create-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      text-decoration: none;
      padding: 4px 0 4px;
      touch-action: manipulation;
      user-select: none;
      -webkit-user-select: none;
      transition: transform var(--duration-tap, 120ms) var(--ease-out, ease-out);
    }

    .mobile-tab-create-btn:active {
      transform: scale(0.92);
    }

    .create-squircle-icon {
      width: 38px;
      height: 38px;
      border-radius: var(--radius-control, 10px);
      corner-shape: squircle;
      background: linear-gradient(135deg, #FF5500 0%, #E03500 100%);
      box-shadow: 0 4px 14px rgba(255, 69, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: -12px;
      border: 2px solid #000000;
    }

    .create-label {
      color: var(--color-primary, #FF4500);
      font-weight: 700;
    }

    /* Avatar in tab */
    .user-tab-wrap {
      width: 24px;
      height: 24px;
    }

    .tab-avatar,
    .tab-avatar-placeholder {
      width: 22px;
      height: 22px;
      border-radius: 9999px;
      object-fit: cover;
    }

    .tab-avatar-placeholder {
      background: rgba(255, 255, 255, 0.15);
      color: #FFFFFF;
      font-size: 10.5px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .tab-dot-badge {
      position: absolute;
      top: -2px;
      right: -3px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #FF3B30;
      border: 1.5px solid #000000;
    }

    /* ── Apple-Style Action Sheet ── */
    .mobile-sheet-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 110;
      display: flex;
      align-items: flex-end;
      animation: sheetBackdropFade 200ms ease-out;
    }

    @keyframes sheetBackdropFade {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .mobile-sheet-card {
      width: 100%;
      background: #0D0D0D;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      border-top-left-radius: 20px;
      border-top-right-radius: 20px;
      padding: 12px 16px calc(24px + env(safe-area-inset-bottom, 0px));
      box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.85);
      box-sizing: border-box;
      animation: sheetSlideUp 280ms cubic-bezier(0.32, 0.72, 0, 1);
    }

    @keyframes sheetSlideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    .mobile-sheet-handle-row {
      display: flex;
      justify-content: center;
      padding-bottom: 12px;
      touch-action: pan-y;
    }

    .mobile-sheet-handle {
      width: 36px;
      height: 4px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.25);
    }

    .mobile-sheet-profile-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 0 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      margin-bottom: 12px;
    }

    .sheet-avatar,
    .sheet-avatar-placeholder {
      width: 44px;
      height: 44px;
      border-radius: 9999px;
      object-fit: cover;
    }

    .sheet-avatar-placeholder {
      background: var(--color-primary, #FF4500);
      color: #FFFFFF;
      font-size: 16px;
      font-weight: 750;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .sheet-user-meta {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .sheet-user-name {
      font-size: 15px;
      font-weight: 700;
      color: #FFFFFF;
    }

    .sheet-user-handle {
      font-size: 12.5px;
      color: #9CA3AF;
    }

    .sheet-close-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      border: none;
      color: #9CA3AF;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      touch-action: manipulation;
    }

    .sheet-close-btn:active {
      transform: scale(0.92);
      color: #FFFFFF;
    }

    /* Sheet Links List */
    .mobile-sheet-links-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 16px;
    }

    .sheet-link-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: var(--radius-control, 10px);
      corner-shape: squircle;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      text-decoration: none;
      touch-action: manipulation;
      transition: background-color 150ms ease, transform var(--duration-tap, 120ms) var(--ease-out, ease-out);
    }

    .sheet-link-row:active {
      transform: scale(0.98);
      background: rgba(255, 255, 255, 0.07);
    }

    .sheet-link-icon-box {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-control, 8px);
      corner-shape: squircle;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .sheet-link-icon-box.orange {
      background: rgba(255, 69, 0, 0.15);
      color: #FF5500;
    }
    .sheet-link-icon-box.blue {
      background: rgba(59, 130, 246, 0.15);
      color: #60A5FA;
    }
    .sheet-link-icon-box.purple {
      background: rgba(168, 85, 247, 0.15);
      color: #C084FC;
    }
    .sheet-link-icon-box.green {
      background: rgba(34, 197, 94, 0.15);
      color: #4ADE80;
    }

    .sheet-link-text {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .sheet-link-title {
      font-size: 13.5px;
      font-weight: 650;
      color: #FFFFFF;
    }

    .sheet-link-sub {
      font-size: 11px;
      color: #8E8E93;
    }

    .sheet-link-chevron {
      color: #6B7280;
    }

    .sheet-count-badge {
      font-size: 11px;
      font-weight: 750;
      color: #FFFFFF;
      background: #FF3B30;
      padding: 1px 7px;
      border-radius: 9999px;
    }

    /* Sheet Footer */
    .mobile-sheet-footer {
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 12px;
    }

    .mobile-sheet-logout-btn {
      width: 100%;
      height: 42px;
      border-radius: var(--radius-control, 10px);
      corner-shape: squircle;
      background: rgba(255, 59, 48, 0.08);
      border: 1px solid rgba(255, 59, 48, 0.25);
      color: #FF453A;
      font-size: 13.5px;
      font-weight: 650;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      touch-action: manipulation;
      transition: background-color 150ms ease, transform var(--duration-tap, 120ms) var(--ease-out, ease-out);
    }

    .mobile-sheet-logout-btn:active {
      transform: scale(0.97);
      background: rgba(255, 59, 48, 0.16);
    }
  }
`;
