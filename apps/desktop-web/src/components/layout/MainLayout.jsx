import { useEffect } from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileTabBar from './MobileTabBar';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Spinner } from '../ui';
import './MainLayout.css';

export default function MainLayout() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const contentDensity = useUIStore((s) => s.contentDensity);
  const location = useLocation();
  const navigate = useNavigate();
  const shortcuts = useSettingsStore(state => state.keyboardShortcutsEnabled);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--space-unit',
      contentDensity === 'compact' ? '0.75rem' : '1rem'
    );
  }, [contentDensity]);

  useEffect(() => {
    if (!shortcuts || !isAuthenticated || isLoading) return;
    const handleKeyDown = (e) => {
      if (!useUIStore.getState().isSearchOpen && e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        if (window.history.length > 1 && location.pathname !== '/explore') navigate(-1);
        else navigate('/explore');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, isAuthenticated, isLoading, location.pathname, navigate]);

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh', background: 'var(--color-bg)' }}>
      <Spinner size={40} />
    </div>
  );
  if (!isAuthenticated) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  const isMessages = location.pathname.startsWith('/messages');
  const isChatOpen = /^\/messages\/[^/]+/.test(location.pathname);
  const isSettings = location.pathname.startsWith('/settings');

  return (
    <div className={`layout-shell ${isChatOpen ? 'chat-open-shell' : ''}`}>
      {/* Desktop Sidebar Navigation (Persistent on desktop) */}
      <Sidebar />

      {/* Main Content Area */}
      <div className={`layout-main-area ${isSettings ? 'settings-main-area' : ''} ${isMessages ? 'messages-main-area' : ''} ${isChatOpen ? 'chat-open-layout' : ''}`}>
        {/* Routed Page Content */}
        <main
          className={`layout-page-content ${isMessages ? 'messages-content-fill' : ''} ${isChatOpen ? 'chat-open-content' : ''} ${
            isSettings ? 'settings-content-fill' : ''
          }`}
        >
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      {!isChatOpen && <MobileTabBar />}
    </div>
  );
}
