import { useId, useRef } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import './QuizCardOverflowMenu.css';

export default function QuizCardOverflowMenu({ label = 'Quiz options', title, details = [], actions = [] }) {
  const dialogId = useId();
  const dialogRef = useRef(null);
  const visibleDetails = details.filter(({ value }) => value !== undefined && value !== null && value !== '');
  const close = () => dialogRef.current?.close();

  return (
    <div className="quiz-card-overflow-anchor">
      <button
        type="button"
        className="quiz-card-overflow-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-controls={dialogId}
        title={label}
        onClick={(event) => {
          event.stopPropagation();
          const dialog = dialogRef.current;
          if (!dialog || dialog.open) return;
          dialog.classList.toggle('quiz-card-overflow-pointer', event.detail > 0);
          dialog.showModal();
        }}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      <dialog
        id={dialogId}
        ref={dialogRef}
        className="quiz-card-overflow-panel"
        aria-labelledby={`${dialogId}-title`}
        onClick={(event) => {
          event.stopPropagation();
          if (event.target === event.currentTarget) close();
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="quiz-card-overflow-content">
          <header className="quiz-card-overflow-heading">
            <h2 id={`${dialogId}-title`}>{title || label}</h2>
            <button type="button" className="quiz-card-overflow-close" aria-label="Close quiz details" onClick={close}>
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          {visibleDetails.length > 0 && (
            <section className="quiz-card-overflow-section">
              <h3>Details</h3>
              <dl>
                {visibleDetails.map(({ label: detailLabel, value }) => (
                  <div className="quiz-card-overflow-detail" key={detailLabel}>
                    <dt>{detailLabel}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {actions.length > 0 && (
            <section className="quiz-card-overflow-section">
              <h3>Actions</h3>
              <div className="quiz-card-overflow-actions-list">
                {actions.map((action) => (
                  <button
                    type="button"
                    className={`quiz-card-overflow-action ${action.primary ? 'primary' : ''} ${action.danger ? 'danger' : ''}`}
                    key={action.label}
                    disabled={action.disabled}
                    title={action.title}
                    onClick={(event) => {
                      event.stopPropagation();
                      close();
                      action.onClick(event);
                    }}
                  >
                    {action.icon}
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </dialog>
    </div>
  );
}
