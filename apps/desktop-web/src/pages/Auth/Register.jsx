import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';

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

      <style>{standaloneAuthStyles}</style>
    </div>
  );
}

const standaloneAuthStyles = `
  .auth-standalone-wrapper {
    min-height: 100vh;
    width: 100%;
    background: var(--color-bg);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 32px 16px;
    position: relative;
    box-sizing: border-box;
  }

  .auth-corner-controls {
    position: absolute;
    top: 24px;
    right: 24px;
  }

  .auth-theme-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-control, 8px);
    corner-shape: squircle;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .auth-theme-btn:hover {
    color: var(--color-text);
    border-color: var(--color-primary);
  }

  .auth-card-container {
    width: 100%;
    max-width: 430px;
  }

  .auth-standalone-card {
    background: rgba(20, 20, 22, 0.78);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 24px;
    corner-shape: squircle;
    padding: 40px 36px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    box-sizing: border-box;
  }

  .auth-card-title {
    font-size: 28px;
    font-weight: 650;
    text-align: center;
    margin: 0 0 28px;
    color: var(--color-text);
    letter-spacing: -0.03em;
  }

  .auth-standalone-card .auth-input {
    border-radius: 12px !important;
    corner-shape: squircle;
    background: rgba(255, 255, 255, 0.04) !important;
    box-shadow: none !important;
  }

  .auth-standalone-card .auth-input:focus {
    border-color: rgba(255, 255, 255, 0.28) !important;
    box-shadow: none !important;
  }

  .auth-card-error {
    background: var(--color-danger-light, rgba(239, 68, 68, 0.12));
    border: 1px solid var(--color-danger, #ef4444);
    color: var(--color-danger, #ef4444);
    padding: 10px 14px;
    border-radius: var(--radius-control, 8px);
    corner-shape: squircle;
    font-size: 13.5px;
    font-weight: 550;
    margin-bottom: 18px;
    text-align: center;
  }

  .auth-card-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .auth-card-footer {
    margin-top: 20px;
    text-align: center;
    font-size: 14px;
    color: var(--color-text-secondary);
  }

  .auth-action-link {
    color: var(--color-text);
    text-decoration: none;
    font-weight: 600;
  }

  .auth-action-link:hover {
    color: var(--color-text-secondary);
  }

  @media (max-width: 480px) {
    .auth-standalone-card {
      padding: 32px 22px;
    }
  }
`;
