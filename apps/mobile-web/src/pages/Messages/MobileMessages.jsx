import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Send,
  Search,
  SquarePen,
  Check,
  CheckCheck,
  X,
  MessageSquare,
  Reply,
  Pencil,
  Trash2,
  Copy,
  Play,
  HelpCircle,
  MoreVertical,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { messageService } from '../../services/message.service';
import {
  getSocket,
  joinConversation,
  leaveConversation,
  sendTypingStart,
  sendTypingStop,
  emitMarkRead,
  fetchUserPresence,
} from '../../services/socket.service';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const chatListTimeFormat = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay === 1) return 'Yday';
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const messageTimeFormat = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
};

export default function MobileMessages() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();

  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'unread'

  // Micro-interaction states
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [activeMessageMenu, setActiveMessageMenu] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Presence & Typing states
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [isPeerOnline, setIsPeerOnline] = useState(false);
  const [peerLastSeen, setPeerLastSeen] = useState(null);
  const typingDebounceTimerRef = useRef(null);

  // New Chat Modal state
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [suggestedUsers, setSuggestedUsers] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const threadStreamRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = useCallback((smooth = true) => {
    const stream = threadStreamRef.current;
    if (!stream) return;
    stream.scrollTo({
      top: stream.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  // 1. Load Conversations
  const loadConversations = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingConversations(true);
    try {
      const data = await messageService.getConversations();
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      if (!quiet) setLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // 2. Fetch Active Conversation Messages
  useEffect(() => {
    if (!conversationId) {
      setActiveConversation(null);
      setMessages([]);
      setReplyingTo(null);
      setEditingMessage(null);
      setIsPeerTyping(false);
      return;
    }

    let isCancelled = false;
    setLoadingMessages(true);
    setReplyingTo(null);
    setEditingMessage(null);

    messageService
      .getMessages(conversationId)
      .then((data) => {
        if (!isCancelled) {
          setActiveConversation(data.conversation);
          setMessages(data.messages || []);
          setTimeout(() => scrollToBottom(false), 60);

          setConversations((prev) =>
            prev.map((c) => (c._id === conversationId ? { ...c, unreadCount: 0 } : c))
          );
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error('Failed to load messages:', err);
          navigate('/messages', { replace: true });
        }
      })
      .finally(() => {
        if (!isCancelled) setLoadingMessages(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [conversationId, navigate, scrollToBottom]);

  // 3. Real-Time Socket Events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    if (conversationId) {
      joinConversation(conversationId);
      emitMarkRead(conversationId);
    }

    const otherId = activeConversation?.otherParticipant?._id;
    if (otherId) {
      fetchUserPresence([otherId]).then((res) => {
        if (res && res[otherId]) {
          setIsPeerOnline(res[otherId].isOnline);
          setPeerLastSeen(res[otherId].lastSeen);
        }
      });
    }

    const handleNewMessage = (payload) => {
      if (payload.conversationId === conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === payload.message._id)) return prev;
          return [...prev, payload.message];
        });
        setTimeout(() => scrollToBottom(true), 60);
        emitMarkRead(conversationId, [payload.message._id]);
      }
    };

    const handleConversationUpdated = (data) => {
      setConversations((prev) => {
        const exists = prev.some((c) => c._id === data.conversationId);
        if (exists) {
          return prev
            .map((c) =>
              c._id === data.conversationId
                ? {
                    ...c,
                    lastMessage: data.lastMessage,
                    lastMessageText: data.lastMessageText,
                    lastMessageAt: data.lastMessageAt,
                    unreadCount:
                      c._id === conversationId
                        ? 0
                        : (Array.isArray(data.unreadCounts)
                            ? data.unreadCounts.find((u) => u.user === currentUser?._id)?.count ?? c.unreadCount
                            : c.unreadCount),
                  }
                : c
            )
            .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
        } else {
          loadConversations(true);
          return prev;
        }
      });
    };

    const handleTyping = (data) => {
      if (data.conversationId === conversationId && data.user?._id !== currentUser?._id) {
        setIsPeerTyping(data.isTyping);
      }
    };

    const handlePresence = (data) => {
      const currentOtherId = activeConversation?.otherParticipant?._id;
      if (currentOtherId && (data.userId === currentOtherId || String(data.userId) === String(currentOtherId))) {
        setIsPeerOnline(data.isOnline);
        setPeerLastSeen(data.lastSeen);
      }
    };

    const handleReactionUpdate = (data) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((m) => (m._id === data.messageId ? { ...m, reactions: data.reactions } : m))
        );
      }
    };

    const handleEdited = (data) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === data.messageId
              ? { ...m, text: data.text, isEdited: true, editedAt: data.editedAt }
              : m
          )
        );
      }
    };

    const handleDeleted = (data) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === data.messageId
              ? { ...m, isDeleted: true, text: 'This message was deleted' }
              : m
          )
        );
      }
    };

    const handleReadStatus = (data) => {
      if (data.conversationId === conversationId && data.readerId !== currentUser?._id) {
        setMessages((prev) =>
          prev.map((m) => {
            if (String(m.sender?._id || m.sender) === String(currentUser?._id)) {
              const currentReadBy = m.readBy || [];
              if (!currentReadBy.includes(data.readerId)) {
                return { ...m, readBy: [...currentReadBy, data.readerId] };
              }
            }
            return m;
          })
        );
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('conversation:updated', handleConversationUpdated);
    socket.on('typing:update', handleTyping);
    socket.on('presence:update', handlePresence);
    socket.on('message:reaction_update', handleReactionUpdate);
    socket.on('message:edited', handleEdited);
    socket.on('message:deleted', handleDeleted);
    socket.on('message:read_status', handleReadStatus);

    return () => {
      if (conversationId) {
        leaveConversation(conversationId);
      }
      socket.off('message:new', handleNewMessage);
      socket.off('conversation:updated', handleConversationUpdated);
      socket.off('typing:update', handleTyping);
      socket.off('presence:update', handlePresence);
      socket.off('message:reaction_update', handleReactionUpdate);
      socket.off('message:edited', handleEdited);
      socket.off('message:deleted', handleDeleted);
      socket.off('message:read_status', handleReadStatus);
    };
  }, [conversationId, activeConversation?.otherParticipant?._id, currentUser?._id, loadConversations, scrollToBottom]);

  // Typing Emitter
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputText(val);

    if (!conversationId) return;
    sendTypingStart(conversationId);

    if (typingDebounceTimerRef.current) {
      clearTimeout(typingDebounceTimerRef.current);
    }
    typingDebounceTimerRef.current = setTimeout(() => {
      sendTypingStop(conversationId);
    }, 2500);
  };

  // Send Message
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (typingDebounceTimerRef.current) clearTimeout(typingDebounceTimerRef.current);
    if (conversationId) sendTypingStop(conversationId);

    const text = inputText.trim();
    if (!text || sending || !conversationId) return;

    if (editingMessage) {
      const targetId = editingMessage._id;
      setSending(true);
      try {
        const data = await messageService.editMessage(targetId, text);
        setMessages((prev) => prev.map((m) => (m._id === targetId ? data.message : m)));
        setEditingMessage(null);
        setInputText('');
      } catch (err) {
        console.error('Failed to edit message:', err);
      } finally {
        setSending(false);
      }
      return;
    }

    setInputText('');
    setSending(true);

    const payloadReplyTo = replyingTo
      ? {
          messageId: replyingTo._id,
          senderName: replyingTo.sender?.name || replyingTo.sender?.username || 'User',
          text: replyingTo.text,
        }
      : null;

    setReplyingTo(null);

    const tempId = 'temp-' + Date.now();
    const optimisticMsg = {
      _id: tempId,
      sender: {
        _id: currentUser?._id,
        name: currentUser?.name,
        username: currentUser?.username,
        avatar: currentUser?.avatar,
      },
      text,
      type: 'text',
      replyTo: payloadReplyTo,
      createdAt: new Date().toISOString(),
      isOptimistic: true,
      reactions: [],
      deliveryStatus: 'sent',
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true), 30);

    try {
      const data = await messageService.sendMessage(conversationId, {
        text,
        replyTo: payloadReplyTo,
      });
      setMessages((prev) => prev.map((m) => (m._id === tempId ? data.message : m)));
      setConversations((prev) =>
        prev.map((c) =>
          c._id === conversationId
            ? { ...c, lastMessageText: text, lastMessageAt: new Date().toISOString() }
            : c
        )
      );
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  // Toggle Reaction
  const handleToggleReaction = async (msgId, emoji) => {
    setActiveMessageMenu(null);
    try {
      await messageService.toggleReaction(msgId, emoji);
    } catch (err) {
      console.error('Failed to react:', err);
    }
  };

  // Delete message
  const handleDeleteConfirm = async (mode) => {
    if (!deleteTarget) return;
    const targetId = deleteTarget._id;
    setDeleteTarget(null);
    try {
      await messageService.deleteMessage(targetId, mode);
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  // New Chat Search
  const handleSearchUsers = async (query) => {
    setUserSearchQuery(query);
    setSearchingUsers(true);
    try {
      const users = await messageService.searchUsers(query);
      setSuggestedUsers(users);
    } catch (err) {
      console.error('User search failed:', err);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleStartChatWith = async (targetUser) => {
    setNewChatModalOpen(false);
    try {
      const result = await messageService.startConversation({
        recipientId: targetUser._id,
      });
      if (result.conversation?._id) {
        navigate(`/messages/${result.conversation._id}`);
      }
    } catch (err) {
      console.error('Could not start conversation:', err);
    }
  };

  const otherUser = activeConversation?.otherParticipant;
  const otherInitial = (otherUser?.name?.[0] || otherUser?.username?.[0] || 'U').toUpperCase();

  const filteredConversations = conversations.filter((c) => {
    if (filterTab === 'unread' && (!c.unreadCount || c.unreadCount === 0)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase().trim();
    const other = c.otherParticipant || {};
    return (
      other.name?.toLowerCase().includes(q) ||
      other.username?.toLowerCase().includes(q) ||
      c.lastMessageText?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mobile-messages-root">
      {/* =========================================================================
          VIEW 1: ACTIVE CHAT SCREEN (When conversationId is in URL)
      ========================================================================= */}
      {conversationId ? (
        <div className="mobile-chat-view">
          {/* Top Bar Header */}
          <header className="mobile-chat-header">
            <button
              type="button"
              className="btn-mobile-chat-back"
              onClick={() => navigate('/messages')}
              aria-label="Back to messages"
            >
              <ArrowLeft size={20} />
            </button>

            <div className="mobile-chat-peer-info">
              <div className="peer-avatar-wrap">
                {otherUser?.avatar ? (
                  <img
                    src={otherUser.avatar}
                    alt={otherUser.name || otherUser.username}
                    className="peer-avatar"
                  />
                ) : (
                  <div className="peer-avatar-fallback">{otherInitial}</div>
                )}
                {isPeerOnline && <span className="online-badge-dot" />}
              </div>

              <div className="peer-meta">
                <span className="peer-name">{otherUser?.name || otherUser?.username || 'Chat'}</span>
                {isPeerTyping ? (
                  <span className="peer-status typing">typing...</span>
                ) : isPeerOnline ? (
                  <span className="peer-status online">Active now</span>
                ) : peerLastSeen ? (
                  <span className="peer-status">Last seen {chatListTimeFormat(peerLastSeen)}</span>
                ) : (
                  <span className="peer-status">@{otherUser?.username}</span>
                )}
              </div>
            </div>
          </header>

          {/* Messages Stream */}
          <div ref={threadStreamRef} className="mobile-messages-stream">
            {loadingMessages ? (
              <div className="stream-loading">
                <div className="loading-spinner" />
                <span>Loading messages...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="mobile-stream-empty">
                <div className="empty-avatar">{otherInitial}</div>
                <h3>{otherUser?.name || otherUser?.username}</h3>
                <p>Send a message or share a quiz challenge to begin chatting!</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = String(msg.sender?._id || msg.sender) === String(currentUser?._id);
                const isDeleted = msg.isDeleted;
                const isActionMenuOpen = activeMessageMenu === msg._id;

                const reactionsList = Array.isArray(msg.reactions) ? msg.reactions : [];
                const emojiCounts = {};
                reactionsList.forEach((r) => {
                  if (!r.emoji) return;
                  if (!emojiCounts[r.emoji]) {
                    emojiCounts[r.emoji] = { emoji: r.emoji, count: 0, hasMine: false };
                  }
                  emojiCounts[r.emoji].count += 1;
                  if (String(r.user?._id || r.user) === String(currentUser?._id)) {
                    emojiCounts[r.emoji].hasMine = true;
                  }
                });
                const reactionsAggregated = Object.values(emojiCounts);

                return (
                  <div key={msg._id} className={`msg-bubble-row ${isMine ? 'mine' : 'theirs'}`}>
                    <div
                      className={`msg-bubble ${isMine ? 'bubble-mine' : 'bubble-theirs'} ${
                        isDeleted ? 'deleted' : ''
                      }`}
                      onClick={() => setActiveMessageMenu(isActionMenuOpen ? null : msg._id)}
                    >
                      {/* Quoted Snippet */}
                      {msg.replyTo && (msg.replyTo.senderName || msg.replyTo.text) && (
                        <div className="quoted-box">
                          <span className="quoted-sender">{msg.replyTo.senderName}</span>
                          <span className="quoted-content">{msg.replyTo.text}</span>
                        </div>
                      )}

                      {/* Quiz Card Embed */}
                      {msg.type === 'quiz_share' && msg.quiz && (
                        <div className="quiz-embed-card">
                          <span className="quiz-embed-tag">Shared Quiz</span>
                          <strong className="quiz-embed-title">{msg.quiz.title}</strong>
                          <div className="quiz-embed-action">
                            <span>{msg.quiz.questionCount || 0} Questions</span>
                            <Link to={`/quiz/${msg.quiz._id}`} className="btn-take-quiz">
                              <Play size={12} fill="currentColor" /> Play
                            </Link>
                          </div>
                        </div>
                      )}

                      {/* Message Content */}
                      <p className="bubble-text">
                        {isDeleted ? '🚫 This message was deleted' : msg.text}
                      </p>

                      {/* Time & Delivery Ticks */}
                      <div className="bubble-footer">
                        {msg.isEdited && <span className="edited-badge">edited</span>}
                        <span className="bubble-time">{messageTimeFormat(msg.createdAt)}</span>
                        {isMine && !isDeleted && (
                          <span className="delivery-ticks">
                            {msg.deliveryStatus === 'read' || (msg.readBy && msg.readBy.length > 1) ? (
                              <CheckCheck size={13} color="#0ea5e9" />
                            ) : msg.deliveryStatus === 'delivered' ? (
                              <CheckCheck size={13} color="#94a3b8" />
                            ) : (
                              <Check size={13} color="#94a3b8" />
                            )}
                          </span>
                        )}
                      </div>

                      {/* Reactions dock */}
                      {reactionsAggregated.length > 0 && (
                        <div className="reactions-pill-bar">
                          {reactionsAggregated.map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              className={`reaction-tag ${r.hasMine ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleReaction(msg._id, r.emoji);
                              }}
                            >
                              <span>{r.emoji}</span>
                              {r.count > 1 && <span className="count">{r.count}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Touch Action Menu Drawer */}
                    {isActionMenuOpen && !isDeleted && (
                      <div className="mobile-bubble-actions-sheet">
                        <div className="quick-emoji-row">
                          {QUICK_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              className="btn-quick-emoji"
                              onClick={() => handleToggleReaction(msg._id, emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        <div className="action-btns-row">
                          <button
                            type="button"
                            className="btn-bubble-action"
                            onClick={() => {
                              setReplyingTo(msg);
                              setEditingMessage(null);
                              setActiveMessageMenu(null);
                              inputRef.current?.focus();
                            }}
                          >
                            <Reply size={15} /> Reply
                          </button>
                          <button
                            type="button"
                            className="btn-bubble-action"
                            onClick={() => {
                              navigator.clipboard?.writeText(msg.text);
                              setActiveMessageMenu(null);
                            }}
                          >
                            <Copy size={15} /> Copy
                          </button>
                          {isMine && (
                            <>
                              <button
                                type="button"
                                className="btn-bubble-action"
                                onClick={() => {
                                  setEditingMessage(msg);
                                  setReplyingTo(null);
                                  setInputText(msg.text);
                                  setActiveMessageMenu(null);
                                  inputRef.current?.focus();
                                }}
                              >
                                <Pencil size={15} /> Edit
                              </button>
                              <button
                                type="button"
                                className="btn-bubble-action danger"
                                onClick={() => {
                                  setDeleteTarget(msg);
                                  setActiveMessageMenu(null);
                                }}
                              >
                                <Trash2 size={15} /> Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Real-Time Typing Bubble */}
            {isPeerTyping && (
              <div className="mobile-typing-bubble-row">
                <div className="typing-dots">
                  <span className="dot dot-1" />
                  <span className="dot dot-2" />
                  <span className="dot dot-3" />
                </div>
                <span className="typing-text">typing...</span>
              </div>
            )}
          </div>

          {/* Bottom Chat Composer Bar */}
          <div className="mobile-chat-composer-bar">
            {replyingTo && (
              <div className="composer-banner reply">
                <div className="banner-info">
                  <span className="banner-title">
                    Replying to {replyingTo.sender?.name || 'User'}
                  </span>
                  <span className="banner-preview">{replyingTo.text}</span>
                </div>
                <button
                  type="button"
                  className="btn-banner-dismiss"
                  onClick={() => setReplyingTo(null)}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {editingMessage && (
              <div className="composer-banner edit">
                <div className="banner-info">
                  <span className="banner-title">Editing message</span>
                  <span className="banner-preview">{editingMessage.text}</span>
                </div>
                <button
                  type="button"
                  className="btn-banner-dismiss"
                  onClick={() => {
                    setEditingMessage(null);
                    setInputText('');
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="mobile-composer-form">
              <input
                ref={inputRef}
                type="text"
                className="mobile-input-field"
                placeholder={
                  editingMessage ? 'Edit message...' : replyingTo ? 'Type reply...' : 'Message...'
                }
                value={inputText}
                onChange={handleInputChange}
                maxLength={2000}
              />
              <button
                type="submit"
                className="btn-mobile-send"
                disabled={!inputText.trim() || sending}
                aria-label="Send"
              >
                {editingMessage ? <Check size={18} /> : <Send size={16} />}
              </button>
            </form>
          </div>

          {/* Delete Dialog Sheet */}
          {deleteTarget && (
            <div className="mobile-dialog-backdrop" onClick={() => setDeleteTarget(null)}>
              <div className="mobile-dialog-sheet" onClick={(e) => e.stopPropagation()}>
                <h4>Delete Message?</h4>
                <p>Choose whether to delete this message for everyone or just for yourself.</p>
                <div className="dialog-options">
                  <button
                    type="button"
                    className="btn-dialog-opt danger"
                    onClick={() => handleDeleteConfirm('everyone')}
                  >
                    Delete for everyone
                  </button>
                  <button
                    type="button"
                    className="btn-dialog-opt"
                    onClick={() => handleDeleteConfirm('me')}
                  >
                    Delete for me
                  </button>
                  <button
                    type="button"
                    className="btn-dialog-opt cancel"
                    onClick={() => setDeleteTarget(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* =========================================================================
            VIEW 2: CONVERSATION LIST (INBOX)
        ========================================================================= */
        <div className="mobile-inbox-view">
          {/* Header */}
          <header className="mobile-inbox-header">
            <div className="header-left">
              <h1 className="inbox-heading">Messages</h1>
            </div>
            <button
              type="button"
              className="btn-compose-chat"
              onClick={() => {
                setNewChatModalOpen(true);
                handleSearchUsers('');
              }}
              aria-label="New chat"
            >
              <SquarePen size={20} />
            </button>
          </header>

          {/* Search Box */}
          <div className="mobile-inbox-search">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button type="button" className="btn-clear-search" onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Tabs Filter */}
          <div className="mobile-filter-pills">
            <button
              type="button"
              className={`pill ${filterTab === 'all' ? 'active' : ''}`}
              onClick={() => setFilterTab('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`pill ${filterTab === 'unread' ? 'active' : ''}`}
              onClick={() => setFilterTab('unread')}
            >
              Unread
            </button>
          </div>

          {/* Conversation List */}
          <div className="conversations-scroll-container">
            {loadingConversations ? (
              <div className="inbox-loading-state">
                <div className="loading-spinner" />
                <span>Loading conversations...</span>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="inbox-empty-state">
                <div className="empty-icon-wrap">
                  <MessageSquare size={32} />
                </div>
                <h3>{searchQuery ? 'No matching chats' : 'No messages yet'}</h3>
                <p>
                  {searchQuery
                    ? 'Try searching with another username or name.'
                    : 'Start a conversation with fellow students and study groups.'}
                </p>
                <button
                  type="button"
                  className="btn-start-first-chat"
                  onClick={() => {
                    setNewChatModalOpen(true);
                    handleSearchUsers('');
                  }}
                >
                  <SquarePen size={16} /> Start Chatting
                </button>
              </div>
            ) : (
              filteredConversations.map((c) => {
                const other = c.otherParticipant || {};
                const hasUnread = c.unreadCount > 0;
                const initial = (other.name?.[0] || other.username?.[0] || 'U').toUpperCase();

                return (
                  <div
                    key={c._id}
                    className={`mobile-conv-card ${hasUnread ? 'unread' : ''}`}
                    onClick={() => navigate(`/messages/${c._id}`)}
                  >
                    <div className="card-avatar-wrap">
                      {other.avatar ? (
                        <img
                          src={other.avatar}
                          alt={other.name || other.username}
                          className="card-avatar"
                        />
                      ) : (
                        <div className="card-avatar-fallback">{initial}</div>
                      )}
                    </div>

                    <div className="card-body">
                      <div className="card-top">
                        <span className="card-name">{other.name || other.username}</span>
                        <span className="card-time">{chatListTimeFormat(c.lastMessageAt)}</span>
                      </div>
                      <div className="card-bottom">
                        <span className={`card-preview ${hasUnread ? 'bold' : ''}`}>
                          {c.lastMessageText || 'Started a conversation'}
                        </span>
                        {hasUnread && (
                          <span className="unread-counter">
                            {c.unreadCount > 9 ? '9+' : c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* New Chat User Search Sheet */}
          {newChatModalOpen && (
            <div className="mobile-dialog-backdrop" onClick={() => setNewChatModalOpen(false)}>
              <div
                className="new-chat-bottom-sheet"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sheet-header">
                  <h3>New Conversation</h3>
                  <button
                    type="button"
                    className="btn-close-sheet"
                    onClick={() => setNewChatModalOpen(false)}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="sheet-search">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Search people by username..."
                    value={userSearchQuery}
                    onChange={(e) => handleSearchUsers(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="suggested-users-list">
                  {searchingUsers ? (
                    <div className="searching-spinner-wrap">
                      <div className="loading-spinner" />
                    </div>
                  ) : suggestedUsers.length === 0 ? (
                    <div className="no-users-found">No members found.</div>
                  ) : (
                    suggestedUsers.map((u) => {
                      const uInitial = (u.name?.[0] || u.username?.[0] || 'U').toUpperCase();
                      return (
                        <div
                          key={u._id}
                          className="user-select-row"
                          onClick={() => handleStartChatWith(u)}
                        >
                          <div className="user-avatar-wrap">
                            {u.avatar ? (
                              <img src={u.avatar} alt={u.username} className="user-avatar" />
                            ) : (
                              <div className="user-avatar-fallback">{uInitial}</div>
                            )}
                          </div>
                          <div className="user-meta">
                            <strong>{u.name || u.username}</strong>
                            <span>@{u.username}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile Messages CSS */}
      <style>{`
        .mobile-messages-root {
          width: 100%;
          min-height: 100dvh;
          background: #000000;
          color: #ffffff;
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          -webkit-tap-highlight-color: transparent;
        }

        /* INBOX STYLES */
        .mobile-inbox-view {
          display: flex;
          flex-direction: column;
          flex: 1;
          padding: 16px;
        }

        .mobile-inbox-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: var(--safe-top, 8px);
          margin-bottom: 16px;
        }

        .inbox-heading {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.5px;
          margin: 0;
        }

        .btn-compose-chat {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: rgba(255, 69, 0, 0.15);
          color: #ff4500;
          border: 1px solid rgba(255, 69, 0, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .btn-compose-chat:active {
          transform: scale(0.95);
        }

        .mobile-inbox-search {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #16181a;
          border: 1px solid #272a2e;
          border-radius: 12px;
          padding: 10px 14px;
          margin-bottom: 14px;
        }

        .mobile-inbox-search input {
          background: transparent;
          border: none;
          color: #ffffff;
          font-size: 15px;
          outline: none;
          width: 100%;
        }

        .btn-clear-search {
          background: none;
          border: none;
          color: #8b949e;
          padding: 2px;
        }

        .mobile-filter-pills {
          display: flex;
          gap: 8px;
          margin-bottom: 14px;
        }

        .mobile-filter-pills .pill {
          background: #16181a;
          border: 1px solid #272a2e;
          color: #94a3b8;
          font-size: 13px;
          font-weight: 600;
          padding: 6px 14px;
          border-radius: 20px;
          cursor: pointer;
          touch-action: manipulation;
        }

        .mobile-filter-pills .pill.active {
          background: #ff4500;
          border-color: #ff4500;
          color: #ffffff;
        }

        .conversations-scroll-container {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }

        .mobile-conv-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 14px;
          background: #0f1113;
          border: 1px solid #1e2227;
          cursor: pointer;
        }

        .mobile-conv-card:active {
          background: #161a1f;
          transform: scale(0.98);
        }

        .card-avatar-wrap {
          position: relative;
          width: 44px;
          height: 44px;
          flex-shrink: 0;
        }

        .card-avatar, .card-avatar-fallback {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
        }

        .card-avatar-fallback {
          background: #272a2e;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 16px;
          color: #e2e8f0;
        }

        .card-body {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
          gap: 4px;
        }

        .card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .card-name {
          font-size: 15px;
          font-weight: 700;
          color: #ffffff;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .card-time {
          font-size: 12px;
          color: #64748b;
          flex-shrink: 0;
        }

        .card-bottom {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .card-preview {
          font-size: 13px;
          color: #8b949e;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .card-preview.bold {
          color: #ffffff;
          font-weight: 600;
        }

        .unread-counter {
          background: #ff4500;
          color: #ffffff;
          font-size: 11px;
          font-weight: 800;
          padding: 2px 7px;
          border-radius: 12px;
          flex-shrink: 0;
        }

        /* CHAT VIEW STYLES */
        .mobile-chat-view {
          display: flex;
          flex-direction: column;
          height: 100dvh;
          overflow: hidden;
        }

        .mobile-chat-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: rgba(15, 17, 19, 0.95);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid #1e2227;
          flex-shrink: 0;
          padding-top: max(var(--safe-top, 8px), 12px);
        }

        .btn-mobile-chat-back {
          background: none;
          border: none;
          color: #ffffff;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mobile-chat-peer-info {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .peer-avatar-wrap {
          position: relative;
          width: 36px;
          height: 36px;
          flex-shrink: 0;
        }

        .peer-avatar, .peer-avatar-fallback {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
        }

        .peer-avatar-fallback {
          background: #272a2e;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 700;
        }

        .online-badge-dot {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #22c55e;
          border: 2px solid #000;
        }

        .peer-meta {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .peer-name {
          font-size: 15px;
          font-weight: 700;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .peer-status {
          font-size: 11px;
          color: #64748b;
        }

        .peer-status.online {
          color: #22c55e;
        }

        .peer-status.typing {
          color: #0ea5e9;
          font-style: italic;
        }

        /* STREAM */
        .mobile-messages-stream {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          -webkit-overflow-scrolling: touch;
        }

        .msg-bubble-row {
          display: flex;
          flex-direction: column;
          width: 100%;
        }

        .msg-bubble-row.mine {
          align-items: flex-end;
        }

        .msg-bubble-row.theirs {
          align-items: flex-start;
        }

        .msg-bubble {
          max-width: 82%;
          padding: 10px 14px;
          border-radius: 18px;
          position: relative;
          cursor: pointer;
          touch-action: manipulation;
        }

        .msg-bubble.bubble-mine {
          background: #ff4500;
          color: #ffffff;
          border-bottom-right-radius: 4px;
        }

        .msg-bubble.bubble-theirs {
          background: #1c1f24;
          color: #f1f5f9;
          border-bottom-left-radius: 4px;
          border: 1px solid #272c33;
        }

        .msg-bubble.deleted {
          opacity: 0.6;
          font-style: italic;
        }

        .bubble-text {
          margin: 0;
          font-size: 15px;
          line-height: 1.4;
          word-break: break-word;
        }

        .bubble-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 4px;
          margin-top: 4px;
        }

        .bubble-time {
          font-size: 10.5px;
          opacity: 0.75;
        }

        .edited-badge {
          font-size: 10px;
          opacity: 0.65;
        }

        .quoted-box {
          border-left: 3px solid rgba(255, 255, 255, 0.4);
          background: rgba(0, 0, 0, 0.2);
          padding: 4px 8px;
          border-radius: 4px;
          margin-bottom: 6px;
          display: flex;
          flex-direction: column;
        }

        .quoted-sender {
          font-size: 11px;
          font-weight: 700;
          color: #ffffff;
        }

        .quoted-content {
          font-size: 12px;
          opacity: 0.85;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .quiz-embed-card {
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 10px;
          margin-bottom: 8px;
        }

        .quiz-embed-tag {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          color: #38bdf8;
          display: block;
          margin-bottom: 4px;
        }

        .quiz-embed-title {
          font-size: 13.5px;
          display: block;
          margin-bottom: 6px;
        }

        .quiz-embed-action {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          opacity: 0.85;
        }

        .btn-take-quiz {
          background: #ffffff;
          color: #000000;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          text-decoration: none;
        }

        .reactions-pill-bar {
          display: flex;
          gap: 4px;
          position: absolute;
          bottom: -10px;
          right: 6px;
        }

        .reaction-tag {
          background: #1e2227;
          border: 1px solid #2e353f;
          border-radius: 12px;
          font-size: 12px;
          padding: 2px 6px;
          display: flex;
          align-items: center;
          gap: 2px;
          color: #ffffff;
        }

        .reaction-tag.active {
          border-color: #ff4500;
          background: rgba(255, 69, 0, 0.2);
        }

        .mobile-typing-bubble-row {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
        }

        .typing-dots {
          display: flex;
          gap: 3px;
        }

        .typing-dots .dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #0ea5e9;
          animation: typingPulse 1.2s infinite ease-in-out;
        }

        .typing-dots .dot-2 { animation-delay: 0.2s; }
        .typing-dots .dot-3 { animation-delay: 0.4s; }

        .typing-text {
          font-size: 12px;
          color: #64748b;
          font-style: italic;
        }

        @keyframes typingPulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1.1); opacity: 1; }
        }

        /* ACTIONS SHEET */
        .mobile-bubble-actions-sheet {
          background: #16181b;
          border: 1px solid #272b31;
          border-radius: 14px;
          padding: 10px;
          margin-top: 6px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-width: 85%;
        }

        .quick-emoji-row {
          display: flex;
          justify-content: space-around;
        }

        .btn-quick-emoji {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          padding: 4px;
        }

        .btn-quick-emoji:active {
          transform: scale(1.3);
        }

        .action-btns-row {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .btn-bubble-action {
          background: #20242a;
          border: none;
          color: #e2e8f0;
          border-radius: 8px;
          font-size: 12px;
          padding: 6px 10px;
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
        }

        .btn-bubble-action.danger {
          color: #ef4444;
        }

        /* COMPOSER */
        .mobile-chat-composer-bar {
          background: #0f1113;
          border-top: 1px solid #1e2227;
          padding: 10px 14px calc(10px + var(--safe-bottom, 8px)) 14px;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
        }

        .composer-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #191c20;
          border-left: 3px solid #ff4500;
          border-radius: 6px;
          padding: 6px 10px;
          margin-bottom: 8px;
        }

        .composer-banner.edit {
          border-left-color: #38bdf8;
        }

        .banner-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .banner-title {
          font-size: 11px;
          font-weight: 700;
          color: #ff4500;
        }

        .composer-banner.edit .banner-title {
          color: #38bdf8;
        }

        .banner-preview {
          font-size: 12px;
          color: #94a3b8;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .btn-banner-dismiss {
          background: none;
          border: none;
          color: #64748b;
          padding: 4px;
        }

        .mobile-composer-form {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .mobile-input-field {
          flex: 1;
          background: #191c20;
          border: 1px solid #272a2e;
          border-radius: 20px;
          padding: 10px 16px;
          color: #ffffff;
          font-size: 16px; /* 16px prevents iOS auto-zoom! */
          outline: none;
        }

        .btn-mobile-send {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #ff4500;
          color: #ffffff;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          cursor: pointer;
        }

        .btn-mobile-send:disabled {
          opacity: 0.35;
        }

        .btn-mobile-send:active:not(:disabled) {
          transform: scale(0.95);
        }

        /* MODALS & BOTTOM SHEETS */
        .mobile-dialog-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          z-index: 100;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
        }

        .mobile-dialog-sheet {
          background: #16181b;
          border-top: 1px solid #272a2e;
          border-top-left-radius: 20px;
          border-top-right-radius: 20px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .mobile-dialog-sheet h4 {
          margin: 0;
          font-size: 17px;
        }

        .mobile-dialog-sheet p {
          margin: 0;
          font-size: 13.5px;
          color: #94a3b8;
        }

        .dialog-options {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }

        .btn-dialog-opt {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          background: #202429;
          border: 1px solid #2d333b;
          color: #ffffff;
          font-size: 15px;
          font-weight: 600;
        }

        .btn-dialog-opt.danger {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.3);
          color: #ef4444;
        }

        .btn-dialog-opt.cancel {
          background: transparent;
          border-color: transparent;
          color: #94a3b8;
        }

        /* NEW CHAT SHEET */
        .new-chat-bottom-sheet {
          background: #14171a;
          border-top: 1px solid #272b30;
          border-top-left-radius: 20px;
          border-top-right-radius: 20px;
          padding: 20px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .sheet-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .sheet-header h3 {
          margin: 0;
          font-size: 18px;
        }

        .btn-close-sheet {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
        }

        .sheet-search {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #1d2126;
          border: 1px solid #2a3038;
          border-radius: 12px;
          padding: 10px 14px;
        }

        .sheet-search input {
          background: transparent;
          border: none;
          color: #ffffff;
          font-size: 16px;
          width: 100%;
          outline: none;
        }

        .suggested-users-list {
          overflow-y: auto;
          max-height: 50vh;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .user-select-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px;
          border-radius: 12px;
          background: #1b1e23;
          cursor: pointer;
        }

        .user-avatar-wrap {
          width: 38px;
          height: 38px;
          flex-shrink: 0;
        }

        .user-avatar, .user-avatar-fallback {
          width: 100%;
          height: 100%;
          border-radius: 50%;
        }

        .user-avatar-fallback {
          background: #2d333b;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 700;
        }

        .user-meta {
          display: flex;
          flex-direction: column;
        }

        .user-meta strong {
          font-size: 14px;
          color: #ffffff;
        }

        .user-meta span {
          font-size: 12px;
          color: #64748b;
        }

        .loading-spinner {
          width: 24px;
          height: 24px;
          border: 2px solid #334155;
          border-top-color: #ff4500;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .stream-loading, .inbox-loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: #64748b;
          padding: 40px 20px;
        }

        .inbox-empty-state, .mobile-stream-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 40px 20px;
          color: #94a3b8;
          gap: 8px;
        }

        .btn-start-first-chat {
          margin-top: 10px;
          background: #ff4500;
          color: #ffffff;
          border: none;
          border-radius: 20px;
          padding: 8px 18px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 6px;
        }
      `}</style>
    </div>
  );
}
