/**
 * SessionHeader — top navbar variant for session mode.
 * Shows quiz title, online count, share link, chat toggle, and exit.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../store/sessionStore';

export default function SessionHeader({ quizTitle, shareCode }) {
  const navigate = useNavigate();
  const { onlineCount, isChatOpen, toggleChat, disconnectFromSession } = useSessionStore();
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/session/${shareCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExit = () => {
    disconnectFromSession();
    navigate('/');
  };

  return (
    <>
      <header className="session-header">
        <div className="session-header-left">
          <h1 className="session-header-title" title={quizTitle}>
            {quizTitle || 'Shared Session'}
          </h1>
        </div>

        <div className="session-header-center">
          <div className="session-header-online">
            <span className="session-online-dot" />
            <span>{onlineCount} online</span>
          </div>
        </div>

        <div className="session-header-right">
          <button
            className="session-header-btn"
            onClick={handleCopyLink}
            title="Copy share link"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {copied ? 'check' : 'link'}
            </span>
            <span>{copied ? 'Copied!' : 'Share'}</span>
          </button>

          <button
            className={`session-header-btn ${isChatOpen ? 'session-header-btn--active' : ''}`}
            onClick={toggleChat}
            title="Toggle chat"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chat</span>
            <span className="session-header-btn-label">Chat</span>
          </button>

          <button
            className="session-header-btn session-header-btn--exit"
            onClick={handleExit}
            title="Exit session"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
          </button>
        </div>
      </header>

      <style>{sessionHeaderStyles}</style>
    </>
  );
}

const sessionHeaderStyles = `
  .session-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 52px;
    padding: 0 16px;
    background: rgba(255, 255, 255, 0.88);
    backdrop-filter: blur(16px) saturate(1.4);
    -webkit-backdrop-filter: blur(16px) saturate(1.4);
    border-bottom: 1px solid var(--color-border);
    z-index: 50;
    flex-shrink: 0;
  }

  .session-header-left {
    flex: 1;
    min-width: 0;
  }

  .session-header-title {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.02em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text);
  }

  .session-header-center {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .session-header-online {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
    padding: 4px 12px;
    background: var(--color-surface-alt);
    border-radius: 20px;
    border: 1px solid var(--color-border-light);
  }

  .session-online-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
    animation: pulse-dot 2s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.2); }
  }

  .session-header-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    justify-content: flex-end;
  }

  .session-header-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .session-header-btn:hover {
    background: var(--color-surface-alt);
    border-color: var(--color-text-muted);
    color: var(--color-text);
  }

  .session-header-btn--active {
    background: var(--color-primary-light);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .session-header-btn--exit {
    border-color: transparent;
    color: var(--color-text-muted);
  }

  .session-header-btn--exit:hover {
    color: var(--color-danger);
    background: var(--color-danger-light);
  }

  @media (max-width: 640px) {
    .session-header-btn-label {
      display: none;
    }

    .session-header-btn span:only-child {
      margin: 0;
    }

    .session-header-title {
      font-size: 14px;
    }
  }
`;
