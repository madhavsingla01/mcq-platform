import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, Button, Input } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return setError('Please fill all fields');
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="qf-auth-shell">
        <Card className="qf-auth-card">
          <div className="qf-auth-logo">
            <div className="qf-auth-logo-mark">Q</div>
            <span>QuizFocus</span>
          </div>
          <h1 className="qf-auth-title">Welcome Back</h1>
          <p className="qf-auth-subtitle">Sign in to access your quizzes and results</p>
          {error && <div className="qf-auth-error">{error}</div>}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Input label="Email Address" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            <Button type="submit" disabled={loading} style={{ marginTop: 8, width: '100%' }}>
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
          <div className="qf-auth-footer">
            Don't have an account? <Link to="/register">Sign up</Link>
          </div>
        </Card>
      </div>

      <style>{authStyles}</style>
    </>
  );
}

const authStyles = `
  .qf-auth-shell {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
  }

  .qf-auth-card {
    width: 100%;
    max-width: 420px;
    padding: 40px 36px !important;
  }

  .qf-auth-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: center;
    margin-bottom: 28px;
  }

  .qf-auth-logo-mark {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 800;
    color: #fff;
  }

  .qf-auth-logo span {
    font-size: 18px;
    font-weight: 700;
    color: var(--color-primary);
    letter-spacing: -0.02em;
  }

  .qf-auth-title {
    font-size: 24px;
    font-weight: 700;
    text-align: center;
    margin-bottom: 8px;
    letter-spacing: -0.02em;
  }

  .qf-auth-subtitle {
    text-align: center;
    color: var(--color-text-secondary);
    font-size: 14px;
    margin-bottom: 24px;
  }

  .qf-auth-error {
    color: var(--color-danger);
    font-size: 14px;
    margin-bottom: 16px;
    text-align: center;
    padding: 10px 14px;
    background: var(--color-danger-light);
    border-radius: 10px;
  }

  .qf-auth-footer {
    margin-top: 24px;
    text-align: center;
    font-size: 14px;
    color: var(--color-text-secondary);
  }

  .qf-auth-footer a {
    color: var(--color-primary);
    text-decoration: none;
    font-weight: 600;
  }

  .qf-auth-footer a:hover {
    text-decoration: underline;
  }
`;
