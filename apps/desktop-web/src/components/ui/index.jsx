import { forwardRef, useId } from 'react';
import { Link } from 'react-router-dom';

/* ===== 1. BUTTON COMPONENT ===== */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled,
  onClick,
  style,
  type = 'button',
  icon,
  iconRight,
  ...props
}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2, 8px)',
    fontWeight: 650,
    letterSpacing: '-0.01em',
    cursor: disabled ? 'not-allowed' : 'pointer',
    borderRadius: 'var(--radius-control, 8px)',
    cornerShape: 'squircle',
    touchAction: 'manipulation',
    transition: 'transform var(--duration-tap, 120ms) var(--ease-out), background-color 140ms ease, border-color 140ms ease, opacity 140ms ease, filter 120ms ease',
    opacity: disabled ? 0.45 : 1,
    fontFamily: 'inherit',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    boxSizing: 'border-box',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
  };

  const sizes = {
    sm: { padding: '0 12px', fontSize: 13, height: 32, minHeight: 32 },
    md: { padding: '0 16px', fontSize: 14, height: 'var(--button-height, 40px)', minHeight: 'var(--button-height, 40px)' },
    lg: { padding: '0 20px', fontSize: 15, height: 'var(--button-height-primary, 44px)', minHeight: 'var(--button-height-primary, 44px)' },
  };

  const variants = {
    primary: {
      background: 'var(--color-primary, #FF4500)',
      color: '#000000',
      border: '1px solid transparent',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 2px 6px rgba(255, 69, 0, 0.28)',
    },
    secondary: {
      background: 'rgba(255, 255, 255, 0.05)',
      color: 'var(--color-text, #FFFFFF)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
    },
    outline: {
      background: 'transparent',
      color: 'var(--color-primary, #FF4500)',
      border: '1px solid var(--color-primary, #FF4500)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-text-secondary)',
      border: '1px solid transparent',
    },
    danger: {
      background: 'var(--color-danger, #EF4444)',
      color: '#ffffff',
      border: '1px solid transparent',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.25)',
    },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      type={type}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
      {...props}
    >
      {icon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>}
      {children}
      {iconRight && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{iconRight}</span>}
    </button>
  );
}

/* ===== 2. CARD COMPONENT ===== */
export const Card = forwardRef(function Card({ children, style, className = '', onClick, ...props }, ref) {
  const isInteractive = Boolean(onClick);
  return (
    <div
      ref={ref}
      onClick={onClick}
      style={{
        background: 'var(--color-surface, #000000)',
        border: '1px solid rgba(255, 255, 255, 0.09)',
        borderRadius: 'var(--radius-container, 14px)',
        cornerShape: 'squircle',
        boxShadow: 'var(--material-card-shadow)',
        padding: 'var(--card-padding, 24px)',
        boxSizing: 'border-box',
        cursor: isInteractive ? 'pointer' : undefined,
        touchAction: isInteractive ? 'manipulation' : undefined,
        WebkitTapHighlightColor: isInteractive ? 'transparent' : undefined,
        transition: 'transform var(--duration-tap, 120ms) var(--ease-out), border-color 160ms ease, box-shadow 160ms ease',
        ...style,
      }}
      className={[className, isInteractive ? 'interactive-tap' : ''].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  );
});

/* ===== 3. SPINNER COMPONENT ===== */
export function Spinner({ size = 20, color = 'var(--color-primary, #FF4500)' }) {
  return (
    <div
      className="animate-spin"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        cornerShape: 'round',
        border: '2px solid rgba(255, 255, 255, 0.12)',
        borderTopColor: color,
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    />
  );
}

/* ===== 4. BADGE COMPONENT ===== */
export function Badge({ children, variant = 'default', style, icon }) {
  const variants = {
    default: {
      background: 'var(--color-primary-light, rgba(255, 69, 0, 0.12))',
      color: 'var(--color-primary, #FF4500)',
      border: '1px solid rgba(255, 69, 0, 0.35)',
    },
    success: {
      background: 'var(--color-success-light, rgba(16, 185, 129, 0.12))',
      color: 'var(--color-success, #10B981)',
      border: '1px solid rgba(16, 185, 129, 0.35)',
    },
    warning: {
      background: 'rgba(245, 158, 11, 0.12)',
      color: 'var(--color-warning, #F59E0B)',
      border: '1px solid rgba(245, 158, 11, 0.35)',
    },
    danger: {
      background: 'var(--color-danger-light, rgba(239, 68, 68, 0.12))',
      color: 'var(--color-danger, #EF4444)',
      border: '1px solid rgba(239, 68, 68, 0.35)',
    },
    secondary: {
      background: 'rgba(255, 255, 255, 0.05)',
      color: 'var(--color-text-secondary)',
      border: '1px solid var(--color-border)',
    },
  };

  return (
    <span
      style={{
        padding: '3px 8px',
        borderRadius: 'var(--radius-sm, 6px)',
        cornerShape: 'squircle',
        fontSize: 11.5,
        fontWeight: 650,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        letterSpacing: '0.015em',
        userSelect: 'none',
        ...variants[variant],
        ...style,
      }}
    >
      {icon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>}
      {children}
    </span>
  );
}

/* ===== 5. PROGRESS BAR COMPONENT ===== */
export function ProgressBar({ value, max = 100, height = 6, color }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      style={{
        width: '100%',
        height,
        background: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 'var(--radius-full, 9999px)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: '100%',
          transformOrigin: 'left',
          transform: `scaleX(${Math.max(0, Math.min(100, pct)) / 100})`,
          borderRadius: 'var(--radius-full, 9999px)',
          background: color || 'var(--color-primary, #FF4500)',
          transition: 'transform 200ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1))',
        }}
      />
    </div>
  );
}

/* ===== 6. INPUT COMPONENT ===== */
export function Input({
  label,
  error,
  icon,
  style,
  inputStyle,
  rightElement,
  value,
  id,
  type = 'text',
  ...props
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2, 8px)',
        width: '100%',
        ...style,
      }}
    >
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            letterSpacing: '0.01em',
          }}
        >
          {label}
        </label>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          width: '100%',
        }}
      >
        {icon && (
          <div
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            {icon}
          </div>
        )}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          type={type}
          value={value ?? ''}
          style={{
            width: '100%',
            height: 'var(--input-height, 44px)',
            padding: icon ? '0 14px 0 38px' : '0 14px',
            borderRadius: 'var(--radius-control, 8px)',
            cornerShape: 'squircle',
            fontSize: 16,
            background: 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${error ? 'var(--color-danger, #EF4444)' : 'rgba(255, 255, 255, 0.12)'}`,
            boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.35)',
            color: 'var(--color-text, #FFFFFF)',
            outline: 'none',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            boxSizing: 'border-box',
            ...inputStyle,
          }}
          {...props}
        />
        {rightElement && (
          <div
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'inline-flex',
              alignItems: 'center',
              zIndex: 1,
            }}
          >
            {rightElement}
          </div>
        )}
      </div>
      {error && (
        <span
          id={`${inputId}-error`}
          style={{
            fontSize: 12,
            color: 'var(--color-danger, #EF4444)',
            marginTop: 2,
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

/* ===== 7. LABEL COMPONENT ===== */
export function Label({ children, style, ...props }) {
  return (
    <label
      style={{
        display: 'block',
        fontSize: 13.5,
        fontWeight: 600,
        color: 'var(--color-text)',
        marginBottom: 'var(--space-2, 8px)',
        ...style,
      }}
      {...props}
    >
      {children}
    </label>
  );
}

/* ===== 8. PURPOSEFUL EMPTY STATE COMPONENT ===== */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  style,
  className,
}) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 'var(--space-12, 48px) var(--space-6, 24px)',
        background: 'rgba(255, 255, 255, 0.015)',
        border: '1px dashed var(--color-border)',
        borderRadius: 'var(--radius-container, 14px)',
        cornerShape: 'squircle',
        boxSizing: 'border-box',
        width: '100%',
        ...style,
      }}
    >
      {icon && (
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-container, 14px)',
            cornerShape: 'squircle',
            background: 'rgba(255, 69, 0, 0.08)',
            border: '1px solid rgba(255, 69, 0, 0.28)',
            color: 'var(--color-primary, #FF4500)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 'var(--space-4, 16px)',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      )}

      {title && (
        <h3
          style={{
            fontSize: 18,
            fontWeight: 650,
            color: 'var(--color-text, #FFFFFF)',
            margin: '0 0 var(--space-2, 8px) 0',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h3>
      )}

      {description && (
        <p
          style={{
            fontSize: 14,
            color: 'var(--color-text-secondary)',
            maxWidth: 420,
            lineHeight: 1.5,
            margin: '0 0 var(--space-6, 24px) 0',
          }}
        >
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-3, 12px)',
            flexWrap: 'wrap',
          }}
        >
          {action && (
            action.to ? (
              <Link to={action.to} style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="md" icon={action.icon}>
                  {action.label}
                </Button>
              </Link>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={action.onClick}
                icon={action.icon}
              >
                {action.label}
              </Button>
            )
          )}

          {secondaryAction && (
            secondaryAction.to ? (
              <Link to={secondaryAction.to} style={{ textDecoration: 'none' }}>
                <Button variant="secondary" size="md" icon={secondaryAction.icon}>
                  {secondaryAction.label}
                </Button>
              </Link>
            ) : (
              <Button
                variant="secondary"
                size="md"
                onClick={secondaryAction.onClick}
                icon={secondaryAction.icon}
              >
                {secondaryAction.label}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/* ===== 9. PAGE HEADER COMPONENT ===== */
export function PageHeader({
  title,
  subtitle,
  badge,
  action,
  actions,
  children,
  style,
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 'var(--space-4, 16px)',
        marginBottom: 'var(--space-6, 24px)',
        paddingTop: 'var(--space-1, 4px)',
        flexWrap: 'wrap',
        ...style,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2, 8px)', flexWrap: 'wrap' }}>
          <h1
            style={{
              fontSize: 'clamp(24px, 4vw, 30px)',
              fontWeight: 700,
              color: 'var(--color-text, #FFFFFF)',
              margin: 0,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p
            style={{
              fontSize: 14,
              color: 'var(--color-text-secondary)',
              margin: 0,
              lineHeight: 1.45,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3, 12px)' }}>
        {actions}
        {action}
        {children}
      </div>
    </div>
  );
}

/* ===== 10. MODAL, DIALOG, SELECT & SETTINGS EXPORTS ===== */
export { default as ConfirmDeleteModal } from './ConfirmDeleteModal';
export { default as CustomDialogContainer, showCustomDialog } from './CustomDialog';
export { default as HashtagInput } from './HashtagInput';
export { default as CustomSelect } from './CustomSelect';
export {
  SettingsSection,
  SettingsRow,
  SettingsToggle,
  SettingsSelect,
  SettingsRadioGroup,
} from '../../pages/Settings/components/SettingsSection';
export { default as SettingsMenu } from './SettingsMenu/SettingsMenu';
export { default as QuizCard } from '../quiz/QuizCard';
export { toast } from 'sonner';



