import { useEffect, useRef, useId } from 'react';
import { CheckCircle2, AlertTriangle, Check } from 'lucide-react';
import { Button } from '../ui';
import './SubmitConfirmationModal.css';

export default function SubmitConfirmationModal({ isOpen, answeredCount, totalQuestions, onConfirm, onCancel }) {
  const backdropRef = useRef(null);
  const cardRef = useRef(null);
  const dialogRef=useRef(null),dialogId=useId();
  const unansweredCount = totalQuestions - answeredCount;

  useEffect(() => {
    if (!isOpen) return;
    const dialog=dialogRef.current;
    if(dialog && !dialog.open)dialog.showModal();
    return ()=>dialog?.close();
  }, [isOpen]);

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
    <dialog ref={dialogRef} className="scm-native-dialog" aria-labelledby={`${dialogId}-title`} aria-describedby={`${dialogId}-description`} onCancel={event=>{event.preventDefault();onCancel();}}>
      <div className="scm-backdrop" ref={backdropRef} onClick={onCancel}>
        <div className="scm-card" ref={cardRef} onClick={(e) => e.stopPropagation()}>
          {/* Icon */}
          <div className="scm-icon-wrap">
            <CheckCircle2 size={28} />
          </div>

          <h2 className="scm-title" id={`${dialogId}-title`}>Submit Quiz?</h2>
          <p className="scm-subtitle" id={`${dialogId}-description`}>
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
    </dialog>
  );
}
