import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { User, Globe, Lock, Sliders, ChevronDown } from 'lucide-react';

const navItems = [
  { to: '/settings/info', label: 'User Info', icon: User, matchAlso: '/settings' },
  { to: '/settings/public', label: 'Public Profile', icon: Globe },
  { to: '/settings/security', label: 'Security', icon: Lock },
  { to: '/settings/preferences', label: 'Preferences', icon: Sliders },
];

export default function Settings() {
  const { user } = useAuthStore();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close mobile nav on route change
  useEffect(() => setMobileNavOpen(false), [location.pathname]);

  const currentNav = navItems.find(n => location.pathname === n.to || (n.matchAlso && location.pathname === n.matchAlso)) || navItems[0];

  const navItemStyle = (isActive) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    borderRadius: 8,
    textDecoration: 'none',
    color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
    background: isActive ? 'var(--color-primary-light)' : 'transparent',
    fontWeight: isActive ? 600 : 500,
    fontSize: 14,
    transition: 'all 0.2s'
  });

  return (
    <>
      <div className="settings-layout">
        {/* Desktop Sidebar */}
        <aside className="settings-sidebar">
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, letterSpacing: '-0.02em' }}>Settings</h1>
          
          <div className="settings-user-card">
            <div style={{ width: 48, height: 48, borderRadius: 999, background: 'var(--color-border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {user?.avatar ? <img src={user.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--color-text-secondary)' }}>{user?.name?.[0] || 'U'}</div>}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user?.name}</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user?.email}</div>
            </div>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {navItems.map(item => (
              <NavLink key={item.to} to={item.to} style={({ isActive }) => navItemStyle(isActive || (item.matchAlso && location.pathname === item.matchAlso))}>
                <item.icon size={18} /> {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Mobile Nav Bar */}
        <div className="settings-mobile-header">
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Settings</h1>
          <button className="settings-mobile-tab" onClick={() => setMobileNavOpen(!mobileNavOpen)}>
            <currentNav.icon size={18} />
            {currentNav.label}
            <ChevronDown size={16} style={{ marginLeft: 'auto', transform: mobileNavOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>
          {mobileNavOpen && (
            <nav className="settings-mobile-nav">
              {navItems.map(item => (
                <NavLink key={item.to} to={item.to} className={`settings-mobile-nav-item ${location.pathname === item.to || (item.matchAlso && location.pathname === item.matchAlso) ? 'active' : ''}`}>
                  <item.icon size={18} /> {item.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>

        <section className="settings-content">
          <Outlet />
        </section>
      </div>

      <style>{settingsStyles}</style>
    </>
  );
}

const settingsStyles = `
  .settings-layout {
    max-width: 1100px;
    margin: 40px auto;
    display: flex;
    gap: 32px;
    padding: 0 24px;
  }

  .settings-sidebar {
    width: 280px;
    flex-shrink: 0;
  }

  .settings-user-card {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 32px;
    padding: 16px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
  }

  .settings-content {
    flex: 1;
    min-width: 0;
  }

  .settings-mobile-header {
    display: none;
  }

  .settings-mobile-tab {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 12px 16px;
    border-radius: 10px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
    cursor: pointer;
    font-family: inherit;
  }

  .settings-mobile-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 8px;
    padding: 8px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
  }

  .settings-mobile-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 8px;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-secondary);
    transition: background 0.15s;
  }

  .settings-mobile-nav-item:hover,
  .settings-mobile-nav-item.active {
    background: var(--color-primary-light);
    color: var(--color-primary);
    font-weight: 600;
  }

  /* ─── Responsive ─── */
  @media (max-width: 768px) {
    .settings-layout {
      flex-direction: column;
      gap: 0;
      margin: 0 auto;
      padding: 0;
    }

    .settings-sidebar {
      display: none;
    }

    .settings-mobile-header {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 20px 16px 16px;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
      position: sticky;
      top: 56px;
      z-index: 10;
    }

    .settings-content {
      padding: 16px;
    }
  }
`;
