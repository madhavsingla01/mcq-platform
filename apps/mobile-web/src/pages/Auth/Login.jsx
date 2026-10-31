import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Mail, ChevronRight, Zap } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export default function Login() {
  const navigate = useNavigate();
  const { login, isLoading, error } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localErr, setLocalErr] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalErr('');
    if (!email || !password) {
      setLocalErr('Please enter both email and password.');
      return;
    }
    const res = await login({ email, password });
    if (res.success) {
      navigate('/dashboard');
    } else {
      setLocalErr(res.error || 'Failed to authenticate');
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 16px calc(24px + var(--safe-bottom)) 16px',
      background: 'var(--bg-base)',
    }}>
      {/* Back button */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--color-text-secondary)',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={18} />
          <span>Back to App</span>
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '24px' }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-control)',
            background: 'var(--color-accent)',
            color: '#000000',
            fontWeight: 800,
            fontSize: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            Q
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.5px' }}>
            Sign In to QuizFocus
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Sync your streaks, bookmarks, and quiz scores
          </p>
        </div>

        {/* Error Alert */}
        {(localErr || error) && (
          <div style={{
            background: 'rgba(255, 69, 58, 0.12)',
            border: '1px solid rgba(255, 69, 58, 0.3)',
            borderRadius: 'var(--radius-control)',
            padding: '12px',
            color: 'var(--color-danger)',
            fontSize: '13px',
            textAlign: 'center',
          }}>
            {localErr || error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} color="var(--color-text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                style={{
                  width: '100%',
                  height: '48px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-control)',
                  paddingLeft: '42px',
                  paddingRight: '16px',
                  color: 'var(--color-text)',
                  fontSize: '16px', /* Prevents iOS auto-zoom */
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} color="var(--color-text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%',
                  height: '48px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-control)',
                  paddingLeft: '42px',
                  paddingRight: '16px',
                  color: 'var(--color-text)',
                  fontSize: '16px', /* Prevents iOS auto-zoom */
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              height: '48px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--color-accent)',
              color: '#000000',
              fontWeight: 800,
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '8px',
              boxShadow: 'none',
            }}
            className="interactive-tap"
          >
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        {/* Guest Continue */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>— OR —</div>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              height: '44px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              fontWeight: 600,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
            className="interactive-tap"
          >
            <Zap size={16} color="var(--color-accent)" />
            <span>Continue as Guest Session</span>
          </button>
        </div>
      </div>
    </div>
  );
}
