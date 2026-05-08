import { Outlet } from 'react-router-dom';
import Header from './Header';

export default function MainLayout() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{ flex: 1, maxWidth: 1280, margin: '0 auto', padding: '32px 24px', width: '100%' }}>
        <Outlet />
      </main>
      <footer style={{
        borderTop: '1px solid var(--color-border)',
        padding: '24px', textAlign: 'center',
        color: 'var(--color-text-muted)', fontSize: 13,
      }}>
        © 2026 MCQ Quiz Platform. Built with ♥
      </footer>
    </div>
  );
}
