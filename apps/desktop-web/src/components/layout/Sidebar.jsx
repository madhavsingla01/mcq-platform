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
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import './Sidebar.css';

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

          {/* 7. Admin Control Center (Admins only) */}
          {user?.role === 'admin' && (
            <NavLink
              to="/admin"
              className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={handleNavClick}
            >
              <div className="nav-item-icon-wrap">
                <ShieldCheck size={20} strokeWidth={2} color="#ff4500" />
              </div>
              <span className="sidebar-nav-label" style={{ fontWeight: 600, color: '#ff4500' }}>Admin Panel</span>
              <span className="sidebar-tooltip">Admin Panel</span>
            </NavLink>
          )}
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
    </>
  );
}
