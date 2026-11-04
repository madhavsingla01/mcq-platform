import { useEffect } from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileTopBar from './MobileTopBar';
import MobileTabBar from './MobileTabBar';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { Spinner } from '../ui';
import './MainLayout.css';

export default function MainLayout() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const contentDensity = useUIStore((s) => s.contentDensity);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--space-unit',
      contentDensity === 'compact' ? '0.75rem' : '1rem'
    );
  }, [contentDensity]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100dvh', background: 'var(--color-bg)' }}>
        <Spinner size={40} />
      </div>
    );
  }

  // If not logged in, redirect to login
  if (!isAuthenticated) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [location.pathname]);

  const handleBack = () => {
    if (window.history.length > 1 && location.pathname !== '/explore') {
      navigate(-1);
    } else {
      navigate('/explore');
    }
  };

  const isMessages = location.pathname.startsWith('/messages');
  const isChatOpen = /^\/messages\/[^/]+/.test(location.pathname);
  const isSettings = location.pathname.startsWith('/settings');

  return (
    <div className={`layout-shell ${isChatOpen ? 'chat-open-shell' : ''}`}>
      {/* Mobile Top Header */}
      {!isChatOpen && <MobileTopBar />}

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
