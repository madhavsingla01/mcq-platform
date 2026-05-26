/**
 * ChatPanel — WhatsApp/Discord-lite realtime chat panel.
 * Features: message list, auto-scroll, infinite scroll up, input bar.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { useAuthStore } from '../../store/authStore';
import { FileText, Image as ImageIcon, MessageCircle, Paperclip, Send, XCircle } from 'lucide-react';
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
    uploadChatAttachment,
    error,
  } = useSessionStore();

  const user = useAuthStore((s) => s.user);
  const [input, setInput] = useState('');
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const prevMessageCount = useRef(0);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldAutoScroll && messages.length > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, shouldAutoScroll]);

  useEffect(() => () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  }, [previewUrl]);

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

  const fileSharing = session?.settings?.chatFileSharing || 'images_only';
  const allowAttachments = fileSharing !== 'text_only';
  const attachmentAccept = fileSharing === 'images_files'
    ? 'image/jpeg,image/png,image/gif,image/webp,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx'
    : 'image/jpeg,image/png,image/gif,image/webp';

  const handleAttachmentSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const maxSize = fileSharing === 'images_files' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    
    if (fileSharing === 'images_only' && !isImage) {
      alert('Only images can be shared in this session.');
      e.target.value = '';
      return;
    }

    if (file.size > maxSize) {
      alert(fileSharing === 'images_files' ? 'Attachment must be smaller than 10MB' : 'Image must be smaller than 5MB');
      e.target.value = '';
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    
    setSelectedAttachment({ file, isImage });
    setPreviewUrl(isImage ? URL.createObjectURL(file) : null);
  };

  const removeAttachment = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedAttachment(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async () => {
    if (!input.trim() && !selectedAttachment) return;
    
    let attachment = null;
    
    if (selectedAttachment) {
      try {
        setIsUploading(true);
        attachment = await uploadChatAttachment(selectedAttachment.file, session?._id);
      } catch (err) {
        setIsUploading(false);
        return; // upload failed
      }
    }
    
    sendMessage(input, attachment);
    setInput('');
    removeAttachment();
    setIsUploading(false);
    setShouldAutoScroll(true);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  

  return (
    <>
      <div className="chat-panel">
        {/* Header */}
        <div className="chat-panel-header">
          <div className="chat-panel-header-left">
            <MessageCircle size={16} className="text-indigo-500" />
            <span className="chat-panel-title">Live Chat</span>
            <span className="chat-panel-count">
              <span className="chat-online-indicator" />
              {onlineCount}
            </span>
          </div>
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
              <MessageCircle size={36} className="text-zinc-300" style={{ marginBottom: 8 }} />
              <p>Start discussing this quiz.</p>
              <p className="chat-panel-empty-sub">Share ideas, notes, and doubts with your group.</p>
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
              currentUsername={user?.username || ''}
            />
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Error banner */}
        {error && (
          <div className="chat-panel-error">{error}</div>
        )}

        {/* Attachment Preview */}
        {selectedAttachment && (
          <div className="chat-image-preview">
            {previewUrl ? (
              <div className="chat-image-preview-inner">
                <img src={previewUrl} alt="Preview" />
                <button className="chat-image-remove" onClick={removeAttachment} aria-label="Remove attachment">
                  <XCircle size={20} />
                </button>
              </div>
            ) : (
              <div className="chat-file-preview">
                <FileText size={18} />
                <span>{selectedAttachment.file.name}</span>
                <button className="chat-image-remove inline" onClick={removeAttachment} aria-label="Remove attachment">
                  <XCircle size={18} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        {!user ? (
          <div className="chat-panel-input-bar" style={{ justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13, fontStyle: 'italic' }}>
            Log in to send chat messages.
          </div>
        ) : session?.settings?.chatSettings === 'disabled' ? (
          <div className="chat-panel-input-bar" style={{ justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13, fontStyle: 'italic' }}>
            Chat is disabled for this session.
          </div>
        ) : session?.settings?.chatSettings === 'read_only' && user?._id !== creatorId ? (
          <div className="chat-panel-input-bar" style={{ justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: 13, fontStyle: 'italic' }}>
            Chat is in read-only mode.
          </div>
        ) : (
          <div className="chat-panel-input-bar">
            {allowAttachments && (
              <>
                <input
                  type="file"
                  accept={attachmentAccept}
                  style={{ display: 'none' }}
                  ref={fileInputRef}
                  onChange={handleAttachmentSelect}
                />
                <button 
                  className="chat-panel-attach" 
                  onClick={() => fileInputRef.current?.click()}
                  title={fileSharing === 'images_files' ? 'Attach file' : 'Attach image'}
                >
                  {fileSharing === 'images_files' ? <Paperclip size={18} /> : <ImageIcon size={18} />}
                </button>
              </>
            )}
            
            <input
              type="text"
              className="chat-panel-input"
              placeholder="Type a message or @username..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={1000}
              autoComplete="off"
              disabled={isUploading}
            />
            
            <button
              className={`chat-panel-send ${isUploading ? 'chat-panel-send--uploading' : ''}`}
              onClick={handleSend}
              disabled={(!input.trim() && !selectedAttachment) || isUploading}
              title="Send message"
            >
              {isUploading ? <div className="chat-loading-spinner" style={{ width: 14, height: 14, borderColor: '#fff', borderTopColor: 'transparent' }} /> : <Send size={18} />}
            </button>
          </div>
        )}
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

  /* ── Image Preview ── */
  .chat-image-preview {
    padding: 10px 14px;
    border-top: 1px solid var(--color-border-light);
    background: var(--color-surface-alt);
    flex-shrink: 0;
  }

  .chat-image-preview-inner {
    position: relative;
    display: inline-block;
  }

  .chat-image-preview img {
    max-height: 80px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
  }

  .chat-image-remove {
    position: absolute;
    top: -8px;
    right: -8px;
    background: #fff;
    border-radius: 50%;
    color: #ef4444;
    cursor: pointer;
    border: none;
    padding: 0;
    display: flex;
    
  }

  .chat-image-remove.inline {
    position: static;
    margin-left: auto;
    background: transparent;
  }

  .chat-file-preview {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    max-width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-size: 13px;
    font-weight: 650;
  }

  .chat-file-preview span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .chat-panel-attach {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 50%;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .chat-panel-attach:hover {
    background: var(--color-surface-alt);
    color: var(--color-text);
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
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: var(--color-primary);
    color: white;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .chat-panel-send:hover:not(:disabled) {
    background: var(--color-primary-dark);
    transform: scale(1.05);
  }

  .chat-panel-send:disabled {
    background: var(--color-border);
    cursor: not-allowed;
    opacity: 0.7;
  }
  
  .chat-panel-send--uploading {
    background: var(--color-primary);
    opacity: 0.8;
    cursor: wait !important;
  }

  ${chatMessageStyles}
`;
