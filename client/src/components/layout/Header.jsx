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
    <header className="glass" style={{
      position: 'sticky', top: 0, zIndex: 50,
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{
        maxWidth: 1280, margin: '0 auto', padding: '0 24px',
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#fff',
          }}>Q</div>
          <span style={{
            fontSize: 20, fontWeight: 700,
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>MCQ Platform</span>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link to="/upload" style={navLinkStyle}>Upload</Link>
          {isAuthenticated && (
            <Link to="/dashboard" style={navLinkStyle}>Dashboard</Link>
          )}
          {isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 8 }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
                {user?.name}
              </span>
              <button onClick={handleLogout} style={btnStyle}>Logout</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
              <Link to="/login" style={btnStyle}>Login</Link>
              <Link to="/register" style={{
                ...btnStyle,
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
                color: '#fff', borderColor: 'transparent',
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
  transition: 'all 0.2s',
};

const btnStyle = {
  padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 500,
  border: '1px solid var(--color-border)', background: 'transparent',
  color: 'var(--color-text)', cursor: 'pointer', textDecoration: 'none',
  display: 'inline-flex', alignItems: 'center',
};
