import { forwardRef } from 'react';

export function Button({ children, variant = 'primary', size = 'md', disabled, onClick, style, ...props }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none', borderRadius: 10, transition: 'all 0.2s ease',
    opacity: disabled ? 0.5 : 1, fontFamily: 'inherit',
  };
  const sizes = {
    sm: { padding: '8px 16px', fontSize: 13 },
    md: { padding: '12px 24px', fontSize: 14 },
    lg: { padding: '14px 32px', fontSize: 16 },
  };
  const variants = {
    primary: {
      background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
      color: '#fff', boxShadow: '0 2px 12px rgba(99,102,241,0.3)',
    },
    secondary: {
      background: 'var(--color-surface)', color: 'var(--color-text)',
      border: '1px solid var(--color-border)',
    },
    ghost: {
      background: 'transparent', color: 'var(--color-text-secondary)',
    },
    danger: {
      background: 'var(--color-danger)', color: '#fff',
    },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }} {...props}>
      {children}
    </button>
  );
}

export const Card = forwardRef(function Card({ children, style, className, ...props }, ref) {
  return (
    <div ref={ref} style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 16, padding: 24, transition: 'all 0.2s ease', ...style,
    }} className={className} {...props}>
      {children}
    </div>
  );
});

export function Spinner({ size = 24 }) {
  return (
    <div className="animate-spin" style={{
      width: size, height: size, borderRadius: '50%',
      border: `3px solid var(--color-border)`,
      borderTopColor: 'var(--color-primary)',
    }} />
  );
}

export function Badge({ children, variant = 'default', style }) {
  const variants = {
    default: { background: 'var(--color-primary-light)', color: 'var(--color-primary-hover)' },
    success: { background: 'var(--color-success-light)', color: 'var(--color-success)' },
    warning: { background: 'var(--color-warning-light)', color: 'var(--color-warning)' },
    danger: { background: 'var(--color-danger-light)', color: 'var(--color-danger)' },
  };
  return (
    <span style={{
      padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      ...variants[variant], ...style,
    }}>{children}</span>
  );
}

export function ProgressBar({ value, max = 100, height = 6, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{
      width: '100%', height, background: 'var(--color-border)', borderRadius: height,
      overflow: 'hidden',
    }}>
      <div style={{
        height: '100%', width: `${pct}%`, borderRadius: height,
        background: color || 'linear-gradient(90deg, var(--color-primary), var(--color-accent))',
        transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

export function Input({ label, error, icon, style, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }}>{label}</label>}
      <input style={{
        padding: '12px 16px', borderRadius: 10, fontSize: 14,
        background: 'var(--color-surface-alt)', border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-border)'}`,
        color: 'var(--color-text)', outline: 'none', fontFamily: 'inherit',
        transition: 'border-color 0.2s', ...style,
      }} {...props} />
      {error && <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</span>}
    </div>
  );
}
