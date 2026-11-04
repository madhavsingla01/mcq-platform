import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Spinner } from './index';
import './ConfirmDeleteModal.css';

export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Delete Quiz?',
  message = 'Are you sure you want to permanently delete this item?',
  details = 'This action cannot be undone. All associated data, attempts, comments, and interactions will be permanently deleted.',
  confirmText = 'Delete Forever',
  cancelText = 'Cancel',
  isDeleting = false,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isDeleting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="cd-modal-overlay" onClick={isDeleting ? undefined : onClose}>
      <div
        className="cd-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cd-modal-title"
      >
        <button
          type="button"
          className="cd-modal-close"
          onClick={onClose}
          disabled={isDeleting}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="cd-modal-icon-wrap">
          <div className="cd-modal-icon-glow" />
          <AlertTriangle size={28} className="cd-warning-icon" />
        </div>

        <div className="cd-modal-body">
          <h2 id="cd-modal-title" className="cd-modal-title">
            {title}
          </h2>
          <p className="cd-modal-message">{message}</p>
          {details && (
            <div className="cd-modal-warning-box">
              <span className="cd-warning-badge">Warning</span>
              <p className="cd-warning-text">{details}</p>
            </div>
          )}
        </div>

        <div className="cd-modal-actions">
          <button
            type="button"
            className="cd-btn-cancel"
            onClick={onClose}
            disabled={isDeleting}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className="cd-btn-danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Spinner size={16} />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 size={16} />
                <span>{confirmText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
