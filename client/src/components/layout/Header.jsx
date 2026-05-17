import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export default function Header() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="app-header glass" style={{
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '0 24px',
        height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#fff',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)',
          }}>Q</div>
          <span style={{
            fontSize: 20, fontWeight: 700, color: 'var(--color-primary)',
            letterSpacing: '-0.02em',
          }}>QuizFocus</span>
        </Link>

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Link to="/upload" style={navLinkStyle}>Upload</Link>
          {isAuthenticated && (
            <Link to="/dashboard" style={navLinkStyle}>Dashboard</Link>
          )}

          {/* Removed: Focus Mode and Density toggles */}

          {isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 12 }}>
              <Link to="/settings" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
                {user?.name}
              </Link>
              <button onClick={handleLogout} style={btnStyle}>Logout</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
              <Link to="/login" style={btnStyle}>Login</Link>
              <Link to="/register" style={{
                ...btnStyle,
                background: 'var(--color-primary)',
                color: '#fff', borderColor: 'transparent',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)',
              }}>Sign Up</Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}

const navLinkStyle = {
  color: 'var(--color-text-secondary)', textDecoration: 'none',
  padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500,
  transition: 'all 0.2s', letterSpacing: '0.01em',
};

const btnStyle = {
  padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 500,
  border: '1px solid var(--color-border)', background: 'transparent',
  color: 'var(--color-text)', cursor: 'pointer', textDecoration: 'none',
  display: 'inline-flex', alignItems: 'center',
};
