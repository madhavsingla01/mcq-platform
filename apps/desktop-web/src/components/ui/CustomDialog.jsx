import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

let showDialogHandler = null;

/**
 * Global function to trigger the custom dialog from anywhere without React context boilerplate.
 * Usage:
 *   showCustomDialog({
 *     title: 'Invalid File',
 *     message: 'Please select a valid image file (PNG, JPG, WEBP, etc.)',
 *     type: 'warning', // 'error' | 'warning' | 'success' | 'info'
 *     confirmText: 'Understood'
 *   });
 */
export function showCustomDialog(options) {
  if (showDialogHandler) {
    return showDialogHandler(options);
  } else {
    // Fallback if component is not mounted yet
    window.alert(`${options.title || 'Notice'}\n\n${options.message}`);
    return Promise.resolve(true);
  }
}

export default function CustomDialogContainer() {
  const [dialogState, setDialogState] = useState(null);

  useEffect(() => {
    showDialogHandler = (options) => {
      return new Promise((resolve) => {
        setDialogState({
          ...options,
          resolve,
        });
      });
    };

    return () => {
      showDialogHandler = null;
    };
  }, []);

  const handleClose = (confirmed = false) => {
    if (dialogState?.resolve) {
      dialogState.resolve(confirmed);
    }
    setDialogState(null);
  };

  useEffect(() => {
    if (!dialogState) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose(false);
      } else if (e.key === 'Enter') {
        handleClose(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [dialogState]);

  if (!dialogState) return null;

  const {
    title = 'Notice',
    message = '',
    type = 'info',
    confirmText = 'OK',
    cancelText = null,
  } = dialogState;

  const icons = {
    error: <AlertCircle size={24} className="custom-dialog-icon error" />,
    warning: <AlertTriangle size={24} className="custom-dialog-icon warning" />,
    success: <CheckCircle2 size={24} className="custom-dialog-icon success" />,
    info: <Info size={24} className="custom-dialog-icon info" />,
  };

  return createPortal(
    <div className="custom-dialog-backdrop" onClick={() => handleClose(false)}>
      <div
        className={`custom-dialog-card ${type}`}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <button
          type="button"
          className="custom-dialog-close-btn"
          onClick={() => handleClose(false)}
          aria-label="Close dialog"
        >
          <X size={16} />
        </button>

        <div className="custom-dialog-header">
          <div className={`custom-dialog-icon-wrapper ${type}`}>
            {icons[type] || icons.info}
          </div>
          <div className="custom-dialog-titles">
            <h3 className="custom-dialog-title">{title}</h3>
            {message && <p className="custom-dialog-message">{message}</p>}
          </div>
        </div>

        <div className="custom-dialog-actions">
          {cancelText && (
            <button
              type="button"
              className="custom-dialog-btn secondary"
              onClick={() => handleClose(false)}
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            className={`custom-dialog-btn primary ${type}`}
            onClick={() => handleClose(true)}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>

      <style>{customDialogStyles}</style>
    </div>,
    document.body
  );
}

const customDialogStyles = `
  .custom-dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    animation: dialogFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .custom-dialog-card {
    position: relative;
    width: 100%;
    max-width: 440px;
    background: var(--color-surface, #14161a);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-xl, 20px);
    corner-shape: squircle;
    padding: 24px;
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.6), 0 0 1px rgba(255, 255, 255, 0.15);
    color: var(--color-text, #ffffff);
    animation: dialogScaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .custom-dialog-card.error {
    border-color: rgba(239, 68, 68, 0.35);
  }

  .custom-dialog-card.warning {
    border-color: rgba(245, 158, 11, 0.35);
  }

  .custom-dialog-card.success {
    border-color: rgba(16, 185, 129, 0.35);
  }

  .custom-dialog-close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: var(--color-text-secondary, #94a3b8);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .custom-dialog-close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text, #ffffff);
  }

  .custom-dialog-header {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }

  .custom-dialog-icon-wrapper {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .custom-dialog-icon-wrapper.error {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.25);
  }

  .custom-dialog-icon-wrapper.warning {
    background: rgba(245, 158, 11, 0.12);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.25);
  }

  .custom-dialog-icon-wrapper.success {
    background: rgba(16, 185, 129, 0.12);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  .custom-dialog-icon-wrapper.info {
    background: rgba(113, 147, 255, 0.12);
    color: #7193FF;
    border: 1px solid rgba(113, 147, 255, 0.25);
  }

  .custom-dialog-titles {
    flex: 1;
    min-width: 0;
    padding-top: 2px;
  }

  .custom-dialog-title {
    font-size: 17px;
    font-weight: 750;
    line-height: 1.35;
    margin: 0 0 6px 0;
    color: var(--color-text, #ffffff);
    letter-spacing: -0.01em;
  }

  .custom-dialog-message {
    font-size: 14px;
    line-height: 1.5;
    color: var(--color-text-secondary, #94a3b8);
    margin: 0;
  }

  .custom-dialog-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 22px;
  }

  .custom-dialog-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 18px;
    border-radius: var(--radius-control, 8px);
    corner-shape: squircle;
    font-size: 13.5px;
    font-weight: 650;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
    border: 1px solid transparent;
  }

  .custom-dialog-btn.secondary {
    background: var(--color-surface-alt, rgba(255, 255, 255, 0.05));
    border-color: var(--color-border, rgba(255, 255, 255, 0.1));
    color: var(--color-text, #ffffff);
  }

  .custom-dialog-btn.secondary:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .custom-dialog-btn.primary {
    background: var(--color-primary, #FF4500);
    color: #ffffff;
    box-shadow: 0 2px 10px rgba(255, 69, 0, 0.25);
  }

  .custom-dialog-btn.primary:hover {
    background: var(--color-primary-hover, #E03D00);
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(255, 69, 0, 0.35);
  }

  .custom-dialog-btn.primary.error {
    background: #ef4444;
    box-shadow: 0 2px 10px rgba(239, 68, 68, 0.25);
  }

  .custom-dialog-btn.primary.error:hover {
    background: #dc2626;
  }

  @keyframes dialogFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes dialogScaleIn {
    from { opacity: 0; transform: scale(0.95) translateY(6px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
`;
