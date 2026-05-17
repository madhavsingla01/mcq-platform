/**
 * ChatMessage — individual chat message bubble.
 * Own messages are right-aligned, others left-aligned.
 * Creator messages get a crown badge.
 */

import { useMemo, memo } from 'react';

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

const ChatMessage = memo(function ChatMessage({ message, isOwn, isCreator }) {
  const timestamp = useMemo(() => timeAgo(message.createdAt), [message.createdAt]);
  const sender = message.senderId;
  const displayName = typeof sender === 'object' ? sender.name : 'User';

  return (
    <>
      <div className={`chat-msg ${isOwn ? 'chat-msg--own' : ''}`}>
        {!isOwn && (
          <div className="chat-msg-avatar">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="chat-msg-body">
          {!isOwn && (
            <div className="chat-msg-header">
              <span className="chat-msg-name">{displayName}</span>
              {isCreator && (
                <span className="chat-msg-badge" title="Quiz Creator">
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>star</span>
                  Creator
                </span>
              )}
            </div>
          )}
          <div className={`chat-msg-bubble ${isOwn ? 'chat-msg-bubble--own' : ''}`}>
            {message.message}
          </div>
          <div className={`chat-msg-time ${isOwn ? 'chat-msg-time--own' : ''}`}>
            {timestamp}
          </div>
        </div>
      </div>
    </>
  );
});

export default ChatMessage;

export const chatMessageStyles = `
  .chat-msg {
    display: flex;
    gap: 8px;
    padding: 2px 0;
    align-items: flex-end;
  }

  .chat-msg--own {
    flex-direction: row-reverse;
  }

  .chat-msg-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
    color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
    margin-bottom: 18px;
  }

  .chat-msg-body {
    max-width: 75%;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .chat-msg-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 4px;
  }

  .chat-msg-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-secondary);
    letter-spacing: -0.01em;
  }

  .chat-msg-badge {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 10px;
    font-weight: 700;
    color: #b45309;
    background: #fef3c7;
    padding: 1px 6px;
    border-radius: 10px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .chat-msg-bubble {
    padding: 10px 14px;
    border-radius: 16px 16px 16px 4px;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border-light);
    font-size: 14px;
    line-height: 1.5;
    color: var(--color-text);
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .chat-msg-bubble--own {
    background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
    color: #fff;
    border-radius: 16px 16px 4px 16px;
    border-color: transparent;
  }

  .chat-msg-time {
    font-size: 11px;
    color: var(--color-text-muted);
    padding-left: 4px;
  }

  .chat-msg-time--own {
    text-align: right;
    padding-right: 4px;
    padding-left: 0;
  }
`;
