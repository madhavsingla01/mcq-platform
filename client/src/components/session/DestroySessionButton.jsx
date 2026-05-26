import { useState } from 'react';
import api from '../../api/axios';
import { Button } from '../ui';

export default function DestroySessionButton({ sessionId, onDestroyed }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [destroyed, setDestroyed] = useState(false);

  const handleDestroy = async () => {
    setLoading(true);
    try {
      await api.post(`/sessions/${sessionId}/destroy`);
      setDestroyed(true);
      onDestroyed?.();
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  };

  if (destroyed) {
    return (
      <div className="dsb-done">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
        Link Destroyed
      </div>
    );
  }

  if (confirming) {
    return (
      <>
        <div className="dsb-confirm-card">
          <p className="dsb-confirm-text">
            <strong>Destroy share link?</strong> No one will be able to join anymore. Existing data is preserved.
          </p>
          <div className="dsb-confirm-actions">
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={loading}>Cancel</Button>
            <button className="dsb-danger-btn" onClick={handleDestroy} disabled={loading}>
              {loading ? 'Destroying...' : 'Destroy Link'}
            </button>
          </div>
        </div>
        <style>{destroyStyles}</style>
      </>
    );
  }

  return (
    <>
      <button className="dsb-trigger" onClick={() => setConfirming(true)}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>link_off</span>
        Destroy Share Link
      </button>
      <style>{destroyStyles}</style>
    </>
  );
}

const destroyStyles = `
  .dsb-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: 1px solid var(--color-danger);
    border-radius: 10px;
    background: transparent;
    color: var(--color-danger);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .dsb-trigger:hover {
    background: var(--color-danger-light);
  }

  .dsb-confirm-card {
    padding: 16px;
    border-radius: 14px;
    border: 1px solid var(--color-danger);
    background: var(--color-danger-light);
  }

  .dsb-confirm-text {
    font-size: 13px;
    color: var(--color-text);
    line-height: 1.5;
    margin: 0 0 12px 0;
  }

  .dsb-confirm-actions {
    display: flex;
    gap: 8px;
  }

  .dsb-danger-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    background: var(--color-danger);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .dsb-danger-btn:hover { opacity: 0.9; }
  .dsb-danger-btn:disabled { opacity: 0.5; cursor: default; }

  .dsb-done {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 10px;
    background: var(--color-surface-alt);
    color: var(--color-text-muted);
    font-size: 13px;
    font-weight: 600;
  }
`;
