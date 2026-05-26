/**
 * ChatMessage — individual chat message bubble.
 * Own messages are right-aligned, others left-aligned.
 * Creator messages get a crown badge.
 */

import { useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';

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

const renderMessageText = (text = '', currentUsername = '') => {
  const parts = String(text).split(/(@[a-z0-9_.]{3,30})/gi);
  return parts.map((part, index) => {
    const isMention = /^@[a-z0-9_.]{3,30}$/i.test(part);
    if (!isMention) return <span key={`${part}-${index}`}>{part}</span>;

    const username = part.slice(1).toLowerCase();
    const isCurrentUser = username === currentUsername.toLowerCase();

    return (
      <Link
        key={`${part}-${index}`}
        to={`/@${username}`}
        className={`chat-msg-mention ${isCurrentUser ? 'chat-msg-mention--me' : ''}`}
      >
        {part}
      </Link>
    );
  });
};

const ChatMessage = memo(function ChatMessage({ message, isOwn, isCreator, currentUsername = '' }) {
  const timestamp = useMemo(() => timeAgo(message.createdAt), [message.createdAt]);
  const sender = message.senderId;
  const displayName = typeof sender === 'object' ? sender.name : 'User';
  const avatarUrl = typeof sender === 'object' && sender.avatar ? sender.avatar : null;
  
  const baseUrl = import.meta.env.VITE_API_URL?.replace(/\/api(\/v1)?$/, '') || '';
  const imgSrc = message.imageUrl ? (message.imageUrl.startsWith('http') ? message.imageUrl : `${baseUrl}${message.imageUrl}`) : null;
  const attachmentUrl = message.attachmentUrl && !message.imageUrl
    ? (message.attachmentUrl.startsWith('http') ? message.attachmentUrl : `${baseUrl}${message.attachmentUrl}`)
    : null;

  return (
    <>
      <div className={`chat-msg ${isOwn ? 'chat-msg--own' : ''}`}>
        {!isOwn && (
          <div className="chat-msg-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="chat-msg-avatar-img" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </div>
        )}
        <div className="chat-msg-body">
          {!isOwn && (
            <div className="chat-msg-header">
              <span className="chat-msg-name">{displayName}</span>
              {isCreator && (
                <span className="chat-msg-badge" title="Quiz Creator">
                  ★ Creator
                </span>
              )}
            </div>
          )}
          <div className={`chat-msg-bubble ${isOwn ? 'chat-msg-bubble--own' : ''}`}>
            {message.imageUrl && (
              <div className="chat-msg-image">
                <img 
                  src={imgSrc} 
                  alt="Attachment" 
                  onClick={() => window.open(imgSrc, '_blank')}
                />
              </div>
            )}
            {attachmentUrl && (
              <a className="chat-msg-file" href={attachmentUrl} target="_blank" rel="noreferrer">
                <FileText size={16} />
                <span>{message.attachmentName || 'Attachment'}</span>
              </a>
            )}
            {message.message && <div className="chat-msg-text">{renderMessageText(message.message, currentUsername)}</div>}
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
    overflow: hidden;
  }

  .chat-msg-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
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
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .chat-msg-image img {
    max-width: 100%;
    border-radius: 8px;
    max-height: 200px;
    object-fit: contain;
    cursor: pointer;
    background: rgba(0,0,0,0.05);
  }

  .chat-msg-text {
    white-space: pre-wrap;
  }

  .chat-msg-mention {
    color: var(--color-primary);
    font-weight: 800;
    text-decoration: none;
  }

  .chat-msg-mention--me {
    padding: 1px 5px;
    border-radius: 6px;
    background: #fef3c7;
    color: #92400e;
  }

  .chat-msg-bubble--own .chat-msg-mention {
    color: #fff;
    text-decoration: underline;
    text-decoration-thickness: 1px;
  }

  .chat-msg-bubble--own .chat-msg-mention--me {
    background: rgba(255,255,255,0.2);
    color: #fff;
    text-decoration: none;
  }

  .chat-msg-file {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(255,255,255,0.7);
    border: 1px solid var(--color-border-light);
    color: var(--color-text);
    text-decoration: none;
    font-size: 13px;
    font-weight: 650;
  }

  .chat-msg-file span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-msg-bubble--own .chat-msg-file {
    background: rgba(255,255,255,0.14);
    color: #fff;
    border-color: rgba(255,255,255,0.18);
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
