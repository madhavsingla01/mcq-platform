import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuthStore();
  const { theme, setTheme } = useUIStore();

  const redirectTo = searchParams.get('redirect') || '/dashboard';

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return setError('Please enter both email and password');
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(redirectTo);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-standalone-wrapper">
      {/* Standalone Theme Toggle */}
      <div className="auth-corner-controls">
        <button
          type="button"
          className="auth-theme-btn"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <div className="auth-card-container">
        <div className="auth-standalone-card">
          <h1 className="auth-card-title">Log in</h1>

          {error && <div className="auth-card-error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-card-form">
            <Input
              label="Email Address or Username"
              type="text"
              className="auth-input"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />

            <Input
              label="Password"
              type="password"
              className="auth-input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />

            <Button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                marginTop: 6,
                padding: '13px 18px',
                fontSize: '15px',
                fontWeight: 650,
                borderRadius: '12px',
                cornerShape: 'squircle',
              }}
            >
              {loading ? 'Signing in...' : 'Log in'}
            </Button>
          </form>

          <div className="auth-card-footer">
            <Link to="/register" className="auth-action-link">
              Create account
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}
