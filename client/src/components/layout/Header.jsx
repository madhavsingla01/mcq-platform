import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Compass,
  Home,
  LogIn,
  LogOut,
  Moon,
  PlusSquare,
  Settings,
  Sun,
  User,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem('qf-theme') || 'dark';
};

export default function Header() {
  const { user, isAuthenticated, isLoading, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('qf-theme', theme);
  }, [theme]);

  const profilePath = user?.username ? `/@${user.username}` : '/login';
  const navItems = useMemo(() => ([
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/explore', label: 'Search', icon: Compass },
    { to: '/create', label: 'Create', icon: PlusSquare },
    { to: '/notifications', label: 'Notifications', icon: Bell, auth: true },
    { to: profilePath, label: 'Profile', icon: User, auth: true },
    { to: '/settings', label: 'Settings', icon: Settings, auth: true },
  ]), [profilePath]);

  const visibleNavItems = navItems.filter((item) => !item.auth || isAuthenticated);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const toggleTheme = () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'));

  const renderNavLink = (item, mode = 'desktop') => {
    const Icon = item.icon;
    return (
      <NavLink
        key={`${mode}-${item.to}-${item.label}`}
        to={item.to}
        end={item.end}
        className={({ isActive }) => `social-nav-link ${isActive ? 'active' : ''}`}
        aria-label={item.label}
      >
        <Icon size={mode === 'mobile' ? 21 : 23} />
        <span>{item.label}</span>
      </NavLink>
    );
  };

  return (
    <>
      <aside className="social-sidebar" aria-label="Primary navigation">
        <Link to="/" className="social-brand" aria-label="QuizFocus home">
          <span className="social-brand-mark">QF</span>
          <span>QuizFocus</span>
        </Link>

        <nav className="social-nav-list">
          {visibleNavItems.map((item) => renderNavLink(item))}
        </nav>

        <div className="social-sidebar-footer">
          <button type="button" className="social-nav-link social-nav-button" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={23} /> : <Moon size={23} />}
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>

          {isAuthenticated ? (
            <>
              <Link to={profilePath} className="social-account">
                <span className="social-avatar">
                  {user?.avatar ? <img src={user.avatar} alt="" /> : (user?.name?.[0] || user?.username?.[0] || 'U').toUpperCase()}
                </span>
                <span className="social-account-copy">
                  <strong>{user?.name || user?.username}</strong>
                  <small>@{user?.username}</small>
                </span>
              </Link>
              <button type="button" className="social-nav-link social-nav-button" onClick={handleLogout}>
                <LogOut size={23} />
                <span>Logout</span>
              </button>
            </>
          ) : isLoading ? (
            <div className="social-auth-placeholder" />
          ) : (
            <Link to={`/login?redirect=${encodeURIComponent(location.pathname)}`} className="social-nav-link">
              <LogIn size={23} />
              <span>Login</span>
            </Link>
          )}
        </div>
      </aside>

      <nav className="social-bottom-nav" aria-label="Mobile navigation">
        {visibleNavItems.map((item) => renderNavLink(item, 'mobile'))}
        {!isAuthenticated && !isLoading ? (
          <Link to="/login" className="social-nav-link" aria-label="Login">
            <LogIn size={21} />
            <span>Login</span>
          </Link>
        ) : null}
      </nav>

      <style>{styles}</style>
    </>
  );
}

const styles = `
  .social-sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: 244px;
    z-index: 70;
    display: flex;
    flex-direction: column;
    padding: 24px 14px 18px;
    border-right: 1px solid var(--color-border);
    background: var(--color-bg);
    transition: width 0.2s ease-in-out, padding 0.2s ease-in-out;
  }

  .social-brand {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    min-height: 44px;
    padding: 0 10px;
    color: var(--color-text);
    text-decoration: none;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 0;
    transition: all 0.2s;
  }

  .social-brand-mark {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-text);
    background: var(--color-text);
    color: var(--color-bg);
    font-size: 12px;
    font-weight: 900;
    transition: all 0.2s;
    border-radius: 4px;
  }

  .social-nav-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 32px;
  }

  .social-sidebar-footer {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: auto;
  }

  .social-nav-link {
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 0 12px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-text);
    text-decoration: none;
    font: inherit;
    font-size: 15px;
    font-weight: 650;
    cursor: pointer;
  }

  .social-nav-link:hover,
  .social-nav-link.active {
    border-color: var(--color-border);
    background: var(--color-surface-hover);
  }

  .social-nav-link.active {
    font-weight: 850;
  }

  .social-nav-button {
    width: 100%;
    text-align: left;
  }

  .social-account {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    border: 1px solid transparent;
    color: var(--color-text);
    text-decoration: none;
    margin: 8px 0 4px;
    border-radius: 8px;
    transition: all 0.2s;
  }
  
  .social-account:hover {
    background: var(--color-surface-hover);
  }

  .social-avatar {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    color: var(--color-text);
    font-weight: 800;
    border-radius: 50%;
  }

  .social-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .social-account-copy {
    min-width: 0;
  }

  .social-account-copy strong,
  .social-account-copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .social-account-copy strong {
    font-size: 13px;
  }

  .social-account-copy small {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .social-auth-placeholder {
    height: 44px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
  }

  .social-bottom-nav {
    display: none;
  }

  @media (min-width: 901px) and (max-width: 1200px) {
    .social-sidebar {
      width: 80px;
      padding: 24px 12px 18px;
    }
    
    .social-brand {
      justify-content: center;
      padding: 0;
    }
    
    .social-brand span:not(.social-brand-mark) {
      display: none;
    }
    
    .social-brand-mark {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      font-size: 16px;
    }
    
    .social-nav-link span {
      display: none;
    }
    
    .social-nav-link {
      justify-content: center;
      padding: 0;
      border-radius: 8px;
      width: 48px;
      height: 48px;
      margin: 0 auto;
    }
    
    .social-account {
      grid-template-columns: 1fr;
      justify-content: center;
      padding: 8px;
      margin: 8px auto 4px;
      width: 48px;
      height: 48px;
      display: flex;
    }
    
    .social-account-copy {
      display: none;
    }
    
    .social-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
    }
    
    .social-nav-button {
      text-align: center;
      width: 48px;
      margin: 0 auto;
    }
  }

  @media (max-width: 900px) {
    .social-sidebar {
      display: none;
    }

    .social-bottom-nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 80;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
      border-top: 1px solid var(--color-border);
      background: var(--color-bg);
    }

    .social-bottom-nav .social-nav-link {
      min-width: 0;
      min-height: 60px;
      justify-content: center;
      gap: 3px;
      padding: 6px 2px;
      border: none;
      border-left: 1px solid var(--color-border-light);
      font-size: 10px;
      flex-direction: column;
    }

    .social-bottom-nav .social-nav-link:first-child {
      border-left: none;
    }
  }
`;
