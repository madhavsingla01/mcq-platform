import { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  FileQuestion,
  Compass,
  PlusCircle,
  LayoutDashboard,
  Settings,
  LogOut,
  Bell,
  MessageSquare,
  Trophy,
  X,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';

export default function Sidebar() {
  const { user, logout, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const collapseUntilMouseLeaveRef = useRef(false);
  const isPointerOverSidebarRef = useRef(false);

  const handleMouseEnter = () => {
    isPointerOverSidebarRef.current = true;
    if (collapseUntilMouseLeaveRef.current) return;
    setIsExpanded(true);
  };

  const handleMouseLeave = () => {
    isPointerOverSidebarRef.current = false;
    collapseUntilMouseLeaveRef.current = false;
    setIsExpanded(false);
  };

  const handleNavClick = () => {
    collapseUntilMouseLeaveRef.current = true;
    setIsExpanded(false);
  };

  useEffect(() => {
    setIsExpanded(false);
  }, [location.pathname, location.search]);

  // Auto-collapse on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        collapseUntilMouseLeaveRef.current = true;
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = async () => {
    handleNavClick();
    await logout();
    navigate('/login');
  };

  const userInitial = (user?.name?.[0] || user?.username?.[0] || 'U').toUpperCase();

  return (
    <>
      {/* Mobile backdrop for drawer overlay */}
      {isExpanded && <div className="sidebar-backdrop" onClick={handleNavClick} />}

      <aside
        className={`app-sidebar ${isExpanded ? 'open' : 'collapsed'}`}
        aria-label="Sidebar navigation"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Top: Brand Header (No collapse or menu button needed) */}
        <div className="sidebar-brand-row">
          <Link
            to="/explore"
            className="sidebar-brand"
            onClick={handleNavClick}
            title="QuizFocus"
          >
            <div className="sidebar-brand-mark">
              <FileQuestion size={20} strokeWidth={2.4} color="#ffffff" />
            </div>
            <span className="sidebar-brand-title">QuizFocus</span>
          </Link>
        </div>

        {/* Main Navigation Items (Always visible as icon rail when closed) */}
        <nav className="sidebar-nav">
          {/* 1. Dashboard */}
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            onClick={handleNavClick}
          >
            <div className="nav-item-icon-wrap">
              <LayoutDashboard size={20} strokeWidth={2} />
            </div>
            <span className="sidebar-nav-label">Dashboard</span>
            <span className="sidebar-tooltip">Dashboard</span>
          </NavLink>

          {/* 2. Explore */}
          <NavLink
            to="/explore"
            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            onClick={handleNavClick}
          >
            <div className="nav-item-icon-wrap">
              <Compass size={20} strokeWidth={2} />
            </div>
            <span className="sidebar-nav-label">Explore</span>
            <span className="sidebar-tooltip">Explore</span>
          </NavLink>

          {/* 3. Challenges */}
          <NavLink
            to="/challenges"
            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            onClick={handleNavClick}
          >
            <div className="nav-item-icon-wrap">
              <Trophy size={20} strokeWidth={2} />
            </div>
            <span className="sidebar-nav-label">Challenges</span>
            <span className="sidebar-tooltip">Challenges</span>
          </NavLink>

          {/* 4. Create Quiz */}
          <NavLink
            to="/create"
            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            onClick={handleNavClick}
          >
            <div className="nav-item-icon-wrap">
              <PlusCircle size={20} strokeWidth={2} />
            </div>
            <span className="sidebar-nav-label">Create</span>
            <span className="sidebar-tooltip">Create</span>
          </NavLink>

          {/* 4. Messages */}
          <NavLink
            to="/messages"
            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            onClick={handleNavClick}
          >
            <div className="nav-item-icon-wrap">
              <MessageSquare size={20} strokeWidth={2} />
              {unreadMessages > 0 && (
                <span className="sidebar-rail-badge">
                  {unreadMessages > 9 ? '9+' : unreadMessages}
                </span>
              )}
            </div>
            <span className="sidebar-nav-label">Messages</span>
            {unreadMessages > 0 && <span className="sidebar-badge">{unreadMessages}</span>}
            <span className="sidebar-tooltip">
              Messages {unreadMessages > 0 ? `(${unreadMessages})` : ''}
            </span>
          </NavLink>

          {/* 5. Notifications */}
          <NavLink
            to="/notifications"
            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            onClick={handleNavClick}
          >
            <div className="nav-item-icon-wrap">
              <Bell size={20} strokeWidth={2} />
              {unreadCount > 0 && (
                <span className="sidebar-rail-badge">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span className="sidebar-nav-label">Notifications</span>
            {unreadCount > 0 && <span className="sidebar-badge">{unreadCount}</span>}
            <span className="sidebar-tooltip">
              Notifications {unreadCount > 0 ? `(${unreadCount})` : ''}
            </span>
          </NavLink>

          {/* 6. Settings */}
          <NavLink
            to="/settings"
            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            onClick={handleNavClick}
          >
            <div className="nav-item-icon-wrap">
              <Settings size={20} strokeWidth={2} />
            </div>
            <span className="sidebar-nav-label">Settings</span>
            <span className="sidebar-tooltip">Settings</span>
          </NavLink>
        </nav>

        {/* Bottom: User Card & Logout (Always visible in collapsed rail) */}
        <div className="sidebar-footer">
          <div className="sidebar-user-card">
            {user?.username ? (
              <Link
                to={`/@${user.username}`}
                className="sidebar-user-info"
                onClick={handleNavClick}
              >
                <div className="sidebar-avatar-wrap">
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name || user.username}
                      className="sidebar-avatar"
                      loading="lazy"
                      decoding="async"
                      width="34"
                      height="34"
                    />
                  ) : (
                    <div className="sidebar-avatar-placeholder">{userInitial}</div>
                  )}
                </div>
                <div className="sidebar-user-text">
                  <strong>{user?.name || user?.username}</strong>
                  <small>@{user?.username || 'member'}</small>
                </div>
                <span className="sidebar-tooltip">Profile (@{user?.username})</span>
              </Link>
            ) : (
              <div className="sidebar-user-info">
                <div className="sidebar-avatar-placeholder">{userInitial}</div>
                <div className="sidebar-user-text">
                  <strong>{user?.name || 'User'}</strong>
                </div>
              </div>
            )}

            <button
              type="button"
              className="sidebar-logout-btn"
              onClick={handleLogout}
              title="Log out"
              aria-label="Log out"
            >
              <LogOut size={17} />
              <span className="sidebar-tooltip">Log out</span>
            </button>
          </div>
        </div>
      </aside>

      <style>{sidebarStyles}</style>
    </>
  );
}

const sidebarStyles = `
  /* ===== SIDEBAR CONTAINER (Desktop Icon Rail by default) ===== */
  .app-sidebar {
    width: 68px;
    height: 100vh;
    height: 100dvh;
    position: fixed;
    top: 0;
    left: 0;
    background: rgba(8, 8, 10, 0.85);
    backdrop-filter: var(--material-blur);
    -webkit-backdrop-filter: var(--material-blur);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.02);
    display: flex;
    flex-direction: column;
    z-index: 90;
    box-sizing: border-box;
    transition: width 0.25s var(--ease-out), transform 0.25s var(--ease-out), box-shadow 0.25s ease;
    overflow: visible;
  }

  .app-sidebar.open {
    width: 240px;
    background: rgba(12, 12, 15, 0.94);
    box-shadow: 12px 0 36px rgba(0, 0, 0, 0.85), inset -1px 0 0 rgba(255, 255, 255, 0.06);
    z-index: 100;
  }

  /* Backdrop for mobile drawer overlay */
  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    z-index: 95;
    display: none;
  }

  /* ===== BRAND HEADER ===== */
  .sidebar-brand-row {
    height: 64px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    border-bottom: none;
    flex-shrink: 0;
    gap: 10px;
  }

  .app-sidebar:not(.open) .sidebar-brand-row {
    justify-content: center;
    padding: 0;
  }

  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: var(--text-primary, #FFFFFF);
    min-width: 0;
  }

  .sidebar-brand-mark {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md, 8px);
    corner-shape: squircle;
    background: var(--accent-primary, #FF4500);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 2px 8px rgba(255, 69, 0, 0.4);
  }

  .sidebar-brand-title {
    font-size: 17px;
    font-weight: 800;
    letter-spacing: -0.025em;
    color: var(--text-primary, #FFFFFF);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .app-sidebar:not(.open) .sidebar-brand-title {
    display: none;
  }

  /* ===== NAVIGATION (Icon Rail when Collapsed) ===== */
  .sidebar-nav {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 14px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    scrollbar-width: none;
  }

  .sidebar-nav::-webkit-scrollbar {
    display: none;
  }

  .app-sidebar.open .sidebar-nav {
    padding: 14px 12px;
    gap: 8px;
  }

  .sidebar-section-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.45);
    padding: 6px 8px 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-section-label.section-divider {
    margin-top: 12px;
  }

  .app-sidebar:not(.open) .sidebar-section-label {
    display: none;
  }

  /* Navigation Item */
  .sidebar-nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 12px;
    border-radius: var(--radius-control, 8px);
    corner-shape: squircle;
    color: rgba(255, 255, 255, 0.65);
    text-decoration: none !important;
    font-size: 13.5px;
    font-weight: 550;
    letter-spacing: -0.01em;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    transition: transform var(--duration-tap) var(--ease-out), background-color 140ms ease, color 140ms ease;
    position: relative;
    box-sizing: border-box;
  }

  .sidebar-nav-item:active {
    transform: scale(0.96);
  }

  /* Centered Icon button in rail mode */
  .app-sidebar:not(.open) .sidebar-nav-item {
    width: 44px;
    height: 44px;
    padding: 0;
    justify-content: center;
    margin: 0 auto;
    border-radius: var(--radius-control, 8px);
    corner-shape: squircle;
  }

  .nav-item-icon-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .sidebar-nav-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-decoration: none !important;
  }

  .app-sidebar:not(.open) .sidebar-nav-label {
    display: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .sidebar-nav-item:hover {
      color: #FFFFFF;
      background: rgba(255, 255, 255, 0.08);
    }
  }

  .sidebar-nav-item.active {
    color: #FFFFFF;
    background: rgba(255, 69, 0, 0.16);
    border: 1px solid rgba(255, 69, 0, 0.32);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
    font-weight: 650;
  }

  /* Badges */
  .sidebar-badge {
    margin-left: auto;
    background: var(--accent-primary, #FF4500);
    color: #ffffff;
    font-size: 10.5px;
    font-weight: 750;
    padding: 2px 6px;
    border-radius: var(--radius-full, 9999px);
    flex-shrink: 0;
  }

  .app-sidebar:not(.open) .sidebar-badge {
    display: none;
  }

  .sidebar-rail-badge {
    position: absolute;
    top: -5px;
    right: -7px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    font-size: 9.5px;
    font-weight: 800;
    background: var(--accent-primary, #FF4500);
    color: #ffffff;
    border-radius: var(--radius-full, 9999px);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid #000000;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
    box-sizing: border-box;
  }

  .app-sidebar.open .sidebar-rail-badge {
    display: none;
  }

  /* Tooltips for Collapsed Icon Rail */
  .sidebar-tooltip {
    display: none;
    position: absolute;
    left: calc(100% + 12px);
    top: 50%;
    transform: translateY(-50%);
    background: #000000;
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: var(--text-primary, #FFFFFF);
    padding: 5px 11px;
    border-radius: var(--radius-sm, 6px);
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
    pointer-events: none;
    z-index: 150;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.8);
    animation: sidebarTooltipIn 0.12s ease-out;
  }

  @keyframes sidebarTooltipIn {
    from {
      opacity: 0;
      transform: translateY(-50%) translateX(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(-50%) translateX(0);
    }
  }

  /* Show tooltips only in collapsed state on hover */
  .app-sidebar:not(.open) .sidebar-nav-item:hover .sidebar-tooltip,
  .app-sidebar:not(.open) .sidebar-user-info:hover .sidebar-tooltip,
  .app-sidebar:not(.open) .sidebar-logout-btn:hover .sidebar-tooltip {
    display: block;
  }

  /* ===== FOOTER ===== */
  .sidebar-footer {
    padding: 12px 10px 16px;
    border-top: none;
    background: #000000;
    flex-shrink: 0;
  }

  .app-sidebar.open .sidebar-footer {
    padding: 12px 14px 16px;
  }

  .sidebar-user-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border-radius: var(--radius-md, 8px);
    background: #000000;
    border: none;
    gap: 8px;
  }

  .app-sidebar:not(.open) .sidebar-user-card {
    flex-direction: column;
    background: transparent;
    border: none;
    padding: 0;
    gap: 8px;
    align-items: center;
  }

  .sidebar-user-info {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: var(--text-primary, #FFFFFF);
    min-width: 0;
    flex: 1;
    position: relative;
  }

  .app-sidebar:not(.open) .sidebar-user-info {
    justify-content: center;
    width: 44px;
    height: 44px;
    flex: none;
  }

  .sidebar-avatar-wrap {
    position: relative;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sidebar-avatar,
  .sidebar-avatar-placeholder {
    width: 34px;
    height: 34px;
    border-radius: var(--radius-full, 9999px);
    flex-shrink: 0;
  }

  .sidebar-avatar {
    object-fit: cover;
  }

  .sidebar-avatar-placeholder {
    background: var(--accent-primary, #FF4500);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 750;
  }

  .sidebar-user-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .app-sidebar:not(.open) .sidebar-user-text {
    display: none;
  }

  .sidebar-user-text strong {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-user-text small {
    font-size: 11px;
    color: var(--text-secondary, #818181);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-logout-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary, #818181);
    cursor: pointer;
    padding: 6px;
    border-radius: var(--radius-sm, 6px);
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    flex-shrink: 0;
  }

  .app-sidebar:not(.open) .sidebar-logout-btn {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-control, 8px);
    corner-shape: squircle;
  }

  .sidebar-logout-btn:hover {
    color: var(--error, #FF4F40);
    background: rgba(255, 79, 64, 0.12);
  }

  /* ===== RESPONSIVE MOBILE OVERRIDES ===== */
  @media (max-width: 768px) {
    .app-sidebar {
      width: 260px;
      transform: translateX(-100%);
      box-shadow: 6px 0 28px rgba(0, 0, 0, 0.65);
      z-index: 100;
    }

    .app-sidebar.open {
      transform: translateX(0);
      width: 260px;
    }

    .app-sidebar:not(.open) .sidebar-brand-row {
      display: none;
    }

    .sidebar-backdrop {
      display: block;
    }
  }

  @media (min-width: 769px) {
    .sidebar-backdrop {
      display: none !important;
    }
  }
`;
