import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import './QuizCardOverflowMenu.css';

export default function QuizCardOverflowMenu({ label = 'Quiz options', details = [], actions = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Viewport-safe horizontal boundary alignment
  useLayoutEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const panel = panelRef.current;
    panel.style.transform = '';
    const rect = panel.getBoundingClientRect();
    const padding = 16;
    if (rect.left < padding) {
      const shiftRight = padding - rect.left;
      panel.style.transform = `translateX(${shiftRight}px)`;
    } else if (rect.right > window.innerWidth - padding) {
      const shiftLeft = rect.right - (window.innerWidth - padding);
      panel.style.transform = `translateX(-${shiftLeft}px)`;
    }
  }, [isOpen]);

  return (
    <div
      className={`quiz-card-overflow-anchor ${isOpen ? 'is-open' : ''}`}
      ref={menuRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`quiz-card-overflow-trigger ${isOpen ? 'active' : ''}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={menuId}
        title={label}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((open) => !open);
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {isOpen && (
        <div
          id={menuId}
          ref={panelRef}
          className="quiz-card-overflow-panel"
          role="dialog"
          aria-label={label}
          onClick={(event) => event.stopPropagation()}
        >
          {details.length > 0 && (
            <section className="quiz-card-overflow-section quiz-card-overflow-details">
              <h4>Details</h4>
              <dl>
                {details.filter((detail) => detail.value !== undefined && detail.value !== null && detail.value !== '').map((detail) => (
                  <div className="quiz-card-overflow-detail" key={detail.label}>
                    <dt>{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {actions.length > 0 && (
            <section className="quiz-card-overflow-section quiz-card-overflow-actions">
              <h4>Actions</h4>
              <div className="quiz-card-overflow-actions-list">
                {actions.map((action) => (
                  <button
                    type="button"
                    className={`quiz-card-overflow-action ${action.primary ? 'primary' : ''} ${action.danger ? 'danger' : ''}`}
                    key={action.label}
                    disabled={action.disabled}
                    title={action.title}
                    onClick={(event) => {
                      setIsOpen(false);
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
      )}
    </div>
  );
}
