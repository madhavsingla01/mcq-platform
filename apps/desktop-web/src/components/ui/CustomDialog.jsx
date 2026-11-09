import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { toast } from 'sonner';
import './CustomDialog.css';

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
    toast(options.title || 'Notice', { description: options.message });
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
    </div>,
    document.body
  );
}
