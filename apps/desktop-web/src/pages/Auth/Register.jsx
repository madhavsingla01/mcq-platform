import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import './Register.css';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register } = useAuthStore();
  const { theme, setTheme } = useUIStore();

  const redirectTo = searchParams.get('redirect') || '/dashboard';

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !password) return setError('Please fill all fields');
    if (password.length < 6) return setError('Password must be at least 6 characters');
    setError('');
    setLoading(true);
    try {
      await register(name, email, password);
      navigate(redirectTo);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
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
          <h1 className="auth-card-title">Create account</h1>

          {error && <div className="auth-card-error">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-card-form">
            <Input
              label="Full Name"
              type="text"
              className="auth-input"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Johnson"
              required
            />

            <Input
              label="Email Address"
              type="email"
              className="auth-input"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@example.com"
              required
            />

            <Input
              label="Password"
              type="password"
              className="auth-input"
              autoComplete="new-password"
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
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          <div className="auth-card-footer">
            <Link to="/login" className="auth-action-link">
              Log in
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}
