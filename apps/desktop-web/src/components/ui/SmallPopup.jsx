import { useEffect, useId, useRef } from 'react';
import './SmallPopup.css';

export default function SmallPopup({ isOpen, title, description, children, actions, onClose, busy = false, destructive = false, className = '' }) {
  const dialog = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!isOpen) return;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, [isOpen]);
  if (!isOpen) return null;
  return <dialog ref={dialog} role={destructive ? 'alertdialog' : undefined} aria-modal="true"
    aria-labelledby={id + '-title'} aria-describedby={description ? id + '-description' : undefined}
    className={`qf-small-popup ${className}`} aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header>
      <h2 id={id + '-title'}>{title}</h2>
      {description && <p id={id + '-description'}>{description}</p>}
    </header>
    {children}
    <footer>{actions}</footer>
  </dialog>;
}
