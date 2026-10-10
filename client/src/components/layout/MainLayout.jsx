import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import { useUIStore } from '../../store/uiStore';
// Focus mode styles removed

export default function MainLayout() {
  const contentDensity = useUIStore((s) => s.contentDensity);

  // Sync density custom property
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--space-unit',
      contentDensity === 'compact' ? '0.75rem' : '1rem'
    );
  }, [contentDensity]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
      <Header />
      <main
        className="app-main"
        style={{ flex: 1, maxWidth: 1180, margin: '0 auto', padding: '28px 24px', width: '100%' }}
      >
        <Outlet />
      </main>
      {/* Footer removed per request */}
      <style>{`
        .app-main {
          transition: margin-left 0.2s ease-in-out, max-width 0.2s ease-in-out;
        }
        @media (min-width: 901px) and (max-width: 1200px) {
          .app-main {
            margin-left: 80px !important;
            max-width: calc(100vw - 80px) !important;
          }
        }
        @media (min-width: 1201px) {
          .app-main {
            margin-left: 244px !important;
            max-width: calc(100vw - 244px) !important;
          }
        }
      `}</style>
    </div>
  );
}
