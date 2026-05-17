/**
 * ChatPanel — WhatsApp/Discord-lite realtime chat panel.
 * Features: message list, auto-scroll, infinite scroll up, input bar.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { useAuthStore } from '../../store/authStore';
import ChatMessage, { chatMessageStyles } from './ChatMessage';

export default function ChatPanel({ creatorId }) {
  const {
    session,
    messages,
    onlineCount,
    isLoadingMessages,
    hasMoreMessages,
    isChatOpen,
    toggleChat,
    sendMessage,
    loadMessages,
    error,
  } = useSessionStore();

  const user = useAuthStore((s) => s.user);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const prevMessageCount = useRef(0);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldAutoScroll && messages.length > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, shouldAutoScroll]);

  // Track scroll position to determine if user has scrolled up
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 80;
    setShouldAutoScroll(isNearBottom);

    // Load older messages when scrolled to top
    if (scrollTop < 40 && hasMoreMessages && !isLoadingMessages && messages.length > 0) {
      const oldestMessage = messages[0];
      if (oldestMessage?._id) {
        const prevScrollHeight = scrollHeight;
        loadMessages(session._id, oldestMessage._id).then(() => {
          // Maintain scroll position after prepending messages
          requestAnimationFrame(() => {
            if (messagesContainerRef.current) {
              const newScrollHeight = messagesContainerRef.current.scrollHeight;
              messagesContainerRef.current.scrollTop = newScrollHeight - prevScrollHeight;
            }
          });
        });
      }
    }
  }, [hasMoreMessages, isLoadingMessages, messages, session, loadMessages]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
    setShouldAutoScroll(true);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isChatOpen) return null;

  return (
    <>
      <div className="chat-panel">
        {/* Header */}
        <div className="chat-panel-header">
          <div className="chat-panel-header-left">
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-primary)' }}>
              chat_bubble
            </span>
            <span className="chat-panel-title">Live Chat</span>
            <span className="chat-panel-count">
              <span className="chat-online-indicator" />
              {onlineCount}
            </span>
          </div>
          <button className="chat-panel-close" onClick={toggleChat} title="Close chat">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {/* Messages */}
        <div
          className="chat-panel-messages custom-scrollbar"
          ref={messagesContainerRef}
          onScroll={handleScroll}
        >
          {isLoadingMessages && messages.length === 0 && (
            <div className="chat-panel-loading">
              <div className="chat-skeleton" />
              <div className="chat-skeleton chat-skeleton--short" />
              <div className="chat-skeleton" />
            </div>
          )}

          {!isLoadingMessages && messages.length === 0 && (
            <div className="chat-panel-empty">
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                forum
              </span>
              <p>No messages yet</p>
              <p className="chat-panel-empty-sub">Start the conversation! 🎉</p>
            </div>
          )}

          {isLoadingMessages && messages.length > 0 && (
            <div className="chat-loading-more">
              <div className="chat-loading-spinner" />
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage
              key={msg._id}
              message={msg}
              isOwn={
                (typeof msg.senderId === 'object' ? msg.senderId._id : msg.senderId) === user?._id
              }
              isCreator={
                (typeof msg.senderId === 'object' ? msg.senderId._id : msg.senderId) === creatorId
              }
            />
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Error banner */}
        {error && (
          <div className="chat-panel-error">{error}</div>
        )}

        {/* Input */}
        <div className="chat-panel-input-bar">
          <input
            type="text"
            className="chat-panel-input"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={1000}
            autoComplete="off"
          />
          <button
            className="chat-panel-send"
            onClick={handleSend}
            disabled={!input.trim()}
            title="Send message"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>send</span>
          </button>
        </div>
      </div>

      <style>{chatPanelStyles}</style>
    </>
  );
}

const chatPanelStyles = `
  .chat-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-surface);
    border-left: 1px solid var(--color-border);
  }

  /* ── Header ── */
  .chat-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--color-border-light);
    flex-shrink: 0;
  }

  .chat-panel-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .chat-panel-title {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--color-text);
  }

  .chat-panel-count {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-muted);
    background: var(--color-surface-alt);
    padding: 2px 8px;
    border-radius: 12px;
  }

  .chat-online-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
  }

  .chat-panel-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }

  .chat-panel-close:hover {
    background: var(--color-surface-alt);
    color: var(--color-text);
  }

  /* ── Messages ── */
  .chat-panel-messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .chat-panel-loading {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 0;
  }

  .chat-skeleton {
    height: 40px;
    border-radius: 12px;
    background: linear-gradient(90deg, var(--color-surface-alt) 0%, var(--color-border-light) 50%, var(--color-surface-alt) 100%);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    width: 70%;
  }

  .chat-skeleton--short {
    width: 45%;
    margin-left: auto;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .chat-panel-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    text-align: center;
    padding: 32px 16px;
  }

  .chat-panel-empty p {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .chat-panel-empty-sub {
    font-size: 13px !important;
    font-weight: 400 !important;
    color: var(--color-text-muted) !important;
    margin-top: 4px !important;
  }

  .chat-loading-more {
    display: flex;
    justify-content: center;
    padding: 8px 0;
  }

  .chat-loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Error ── */
  .chat-panel-error {
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 600;
    color: #b45309;
    background: #fef3c7;
    border-top: 1px solid #fde68a;
    text-align: center;
    flex-shrink: 0;
  }

  /* ── Input ── */
  .chat-panel-input-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid var(--color-border-light);
    background: var(--color-surface);
    flex-shrink: 0;
  }

  .chat-panel-input {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid var(--color-border);
    border-radius: 20px;
    background: var(--color-surface-alt);
    color: var(--color-text);
    font-size: 14px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }

  .chat-panel-input:focus {
    border-color: var(--color-primary);
    background: var(--color-surface);
  }

  .chat-panel-input::placeholder {
    color: var(--color-text-muted);
  }

  .chat-panel-send {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border: none;
    border-radius: 50%;
    background: var(--color-primary);
    color: #fff;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .chat-panel-send:hover:not(:disabled) {
    background: var(--color-primary-hover);
    transform: scale(1.05);
  }

  .chat-panel-send:disabled {
    opacity: 0.4;
    cursor: default;
  }

  ${chatMessageStyles}
`;
