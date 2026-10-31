import { useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, Check } from 'lucide-react';
import { Button } from '../ui';

export default function SubmitConfirmationModal({ isOpen, answeredCount, totalQuestions, onConfirm, onCancel }) {
  const backdropRef = useRef(null);
  const cardRef = useRef(null);
  const unansweredCount = totalQuestions - answeredCount;

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onCancel]);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        backdropRef.current?.classList.add('scm-visible');
        cardRef.current?.classList.add('scm-card-visible');
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div className="scm-backdrop" ref={backdropRef} onClick={onCancel}>
        <div className="scm-card" ref={cardRef} onClick={(e) => e.stopPropagation()}>
          {/* Icon */}
          <div className="scm-icon-wrap">
            <CheckCircle2 size={28} />
          </div>

          <h2 className="scm-title">Submit Quiz?</h2>
          <p className="scm-subtitle">
            You're about to submit your answers. This action cannot be undone.
          </p>

          {/* Stats */}
          <div className="scm-stats">
            <div className="scm-stat">
              <span className="scm-stat-value scm-stat-answered">{answeredCount}</span>
              <span className="scm-stat-label">Answered</span>
            </div>
            <div className="scm-stat-divider" />
            <div className="scm-stat">
              <span className="scm-stat-value scm-stat-total">{totalQuestions}</span>
              <span className="scm-stat-label">Total</span>
            </div>
          </div>

          {/* Warning for unanswered */}
          {unansweredCount > 0 && (
            <div className="scm-warning">
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <span>
                You have <strong>{unansweredCount}</strong> unanswered question{unansweredCount !== 1 ? 's' : ''}. These will be marked as incorrect.
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="scm-actions">
            <Button variant="secondary" onClick={onCancel} style={{ flex: 1 }}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onConfirm} style={{ flex: 1 }}>
              <Check size={18} />
              Submit Quiz
            </Button>
          </div>
        </div>
      </div>

      <style>{submitConfirmationStyles}</style>
    </>
  );
}

const submitConfirmationStyles = `
  .scm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0);
    backdrop-filter: blur(0px);
    transition: background 0.25s ease, backdrop-filter 0.25s ease;
    padding: 16px;
  }

  .scm-backdrop.scm-visible {
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
  }

  .scm-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl, 16px);
    padding: 32px;
    max-width: 420px;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.06);
    transform: scale(0.92) translateY(12px);
    opacity: 0;
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
  }

  .scm-card.scm-card-visible {
    transform: scale(1) translateY(0);
    opacity: 1;
  }

  .scm-icon-wrap {
    width: 56px;
    height: 56px;
    border-radius: var(--radius-lg, 12px);
    background: var(--color-primary-light);
    color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .scm-title {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--color-text);
    margin: 0;
  }

  .scm-subtitle {
    font-size: 14px;
    color: var(--color-text-secondary);
    text-align: center;
    line-height: 1.5;
    margin: 0;
  }

  .scm-stats {
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 16px 32px;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md, 8px);
    width: 100%;
    justify-content: center;
  }

  .scm-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .scm-stat-value {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1;
  }

  .scm-stat-answered {
    color: var(--color-primary);
  }

  .scm-stat-total {
    color: var(--color-text);
  }

  .scm-stat-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
  }

  .scm-stat-divider {
    width: 1px;
    height: 36px;
    background: var(--color-border);
  }

  .scm-warning {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 12px;
    background: var(--color-danger-light, #fef2f2);
    border: 1px solid var(--color-danger, #ef4444);
    color: var(--color-danger, #ef4444);
    font-size: 13px;
    line-height: 1.5;
    width: 100%;
  }

  .scm-warning strong {
    font-weight: 700;
  }

  .scm-actions {
    display: flex;
    gap: 12px;
    width: 100%;
    padding-top: 4px;
  }

  @media (max-width: 480px) {
    .scm-card {
      padding: 24px 20px;
    }

    .scm-stats {
      padding: 14px 20px;
    }

    .scm-stat-value {
      font-size: 24px;
    }
  }
`;
