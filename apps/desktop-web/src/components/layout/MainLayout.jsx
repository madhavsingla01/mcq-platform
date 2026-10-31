import { useEffect } from 'react';
import { Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileTopBar from './MobileTopBar';
import MobileTabBar from './MobileTabBar';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { Spinner } from '../ui';

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
  const isSettings = location.pathname.startsWith('/settings');

  return (
    <div className="layout-shell">
      {/* Mobile Top Header */}
      <MobileTopBar />

      {/* Desktop Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <div className={`layout-main-area ${isSettings ? 'settings-main-area' : ''}`}>
        {/* Routed Page Content */}
        <main
          className={`layout-page-content ${isMessages ? 'messages-content-fill' : ''} ${
            isSettings ? 'settings-content-fill' : ''
          }`}
        >
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <MobileTabBar />

      <style>{layoutStyles}</style>
    </div>
  );
}

const layoutStyles = `
  .layout-shell {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    background: var(--bg-primary, #000000);
  }

  .layout-main-area {
    flex: 1;
    margin-left: 68px; /* Desktop: persistent icon rail when closed */
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 100vh;
    min-height: 100dvh;
    box-sizing: border-box;
    position: relative;
    transition: margin-left 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @media (min-width: 861px) {
    .layout-main-area.settings-main-area {
      height: 100dvh;
      min-height: 0;
      overflow: hidden;
    }
  }

  @media (max-width: 768px) {
    .layout-main-area {
      margin-left: 0 !important;
    }
  }

  /* Page Content */
  .layout-page-content {
    flex: 1;
    width: 100%;
    max-width: var(--content-max-width, 1200px);
    margin: 0 auto;
    padding: var(--space-6, 24px) var(--page-padding, 32px) var(--space-12, 48px);
    box-sizing: border-box;
  }

  /* Borderless edge-to-edge layout for Messages: no outer border, seamless screen */
  .layout-page-content.messages-content-fill {
    max-width: 100%;
    width: 100%;
    margin: 0;
    padding: 0;
    min-height: calc(100vh - 62px);
    min-height: calc(100dvh - 62px);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  /* Borderless edge-to-edge fill for Settings */
  .layout-page-content.settings-content-fill {
    max-width: 100%;
    width: 100%;
    padding: 0;
    margin: 0;
    box-sizing: border-box;
  }

  @media (min-width: 861px) {
    .layout-page-content.settings-content-fill {
      flex: 1 1 0%;
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
  }

  /* Responsive screen adjustment */
  @media (max-width: 1024px) {
    .layout-page-content {
      padding: var(--space-4, 16px) var(--page-padding, 24px) var(--space-8, 32px);
    }
  }

  @media (max-width: 768px) {
    .layout-page-content {
      padding-top: calc(58px + env(safe-area-inset-top, 0px));
      padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
      padding-left: 14px;
      padding-right: 14px;
    }

    .layout-page-content.messages-content-fill {
      padding-top: calc(54px + env(safe-area-inset-top, 0px));
      padding-bottom: calc(58px + env(safe-area-inset-bottom, 0px));
      padding-left: 0;
      padding-right: 0;
      min-height: 100dvh;
    }

    .layout-page-content.settings-content-fill {
      padding-top: calc(54px + env(safe-area-inset-top, 0px));
      padding-bottom: calc(74px + env(safe-area-inset-bottom, 0px));
      padding-left: 10px;
      padding-right: 10px;
    }
  }
`;
