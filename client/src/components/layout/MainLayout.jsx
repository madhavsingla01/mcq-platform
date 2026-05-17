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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main
        className="app-main"
        style={{ flex: 1, maxWidth: 1200, margin: '0 auto', padding: '32px 24px', width: '100%' }}
      >
        <Outlet />
      </main>
      {/* Footer removed per request */}
    </div>
  );
}

