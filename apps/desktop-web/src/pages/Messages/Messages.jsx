import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Send,
  Search,
  SquarePen,
  ArrowLeft,
  MessageSquare,
  HelpCircle,
  Play,
  Check,
  CheckCheck,
  X,
  Sparkles,
  ExternalLink,
  User,
  Quote,
  Smile,
  Pencil,
  Trash2,
  Copy,
  Reply,
  ChevronDown,
  MoreVertical,
  CornerDownLeft,
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
import { Spinner, Button } from '../../components/ui';

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

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const messageTimeFormat = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
};

const getMessageDateKey = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const getMessageDateLabel = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

export default function Messages() {
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

  // WhatsApp interaction states
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [activeActionMenuId, setActiveActionMenuId] = useState(null);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);

  // Real-Time Socket Presence & Typing
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

  // Keep message scrolling inside the thread so the composer stays in place.
  const scrollToBottom = useCallback((smooth = true) => {
    const stream = threadStreamRef.current;
    if (!stream) return;
    stream.scrollTo({
      top: stream.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  const handleThreadScroll = () => {
    const stream = threadStreamRef.current;
    if (!stream) return;
    setHoveredMessageId(null);
    const distanceFromBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight;
    setShowScrollBottom(distanceFromBottom > 240);
  };

  // Close active dropdown menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setActiveActionMenuId(null);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // 1. Fetch conversations list
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
    const interval = setInterval(() => loadConversations(true), 15000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  // 2. Fetch messages when conversationId changes
  useEffect(() => {
    if (!conversationId) {
      setActiveConversation(null);
      setMessages([]);
      setReplyingTo(null);
      setEditingMessage(null);
      return;
    }

    let isCancelled = false;
    setLoadingMessages(true);
    setReplyingTo(null);
    setEditingMessage(null);
    setShowScrollBottom(false);

    messageService
      .getMessages(conversationId)
      .then((data) => {
        if (!isCancelled) {
          setActiveConversation(data.conversation);
          setMessages(data.messages || []);
          setTimeout(() => scrollToBottom(false), 80);

          // Mark unread as 0 locally in conversations list
          setConversations((prev) =>
            prev.map((c) => (c._id === conversationId ? { ...c, unreadCount: 0 } : c))
          );
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error('Failed to load messages for conversation:', err);
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

  // Real-Time Socket.IO Subscriptions (Replaces Polling)
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    if (conversationId) {
      joinConversation(conversationId);
      emitMarkRead(conversationId);
    }

    // Check peer presence if we have active conversation
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

  // 3. Send / Edit message
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    inputRef.current?.focus();

    if (typingDebounceTimerRef.current) {
      clearTimeout(typingDebounceTimerRef.current);
    }
    if (conversationId) {
      sendTypingStop(conversationId);
    }

    const text = inputText.trim();
    if (!text || sending || !conversationId) return;

    // Handle Edit Mode
    if (editingMessage) {
      const targetId = editingMessage._id;
      setSending(true);
      try {
        const data = await messageService.editMessage(targetId, text);
        setMessages((prev) =>
          prev.map((m) => (m._id === targetId ? data.message : m))
        );
        setEditingMessage(null);
        setInputText('');
      } catch (err) {
        console.error('Failed to edit message:', err);
        alert('Could not edit message. Please try again.');
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
      return;
    }

    // Normal Send Mode (with optional Reply quote)
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

    // Optimistic message
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
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true), 30);

    try {
      const data = await messageService.sendMessage(conversationId, {
        text,
        replyTo: payloadReplyTo,
      });
      setMessages((prev) =>
        prev.map((m) => (m._id === tempId ? data.message : m))
      );
      // Update conversations list preview
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
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // 4. WhatsApp Message Actions
  const handleStartReply = (msg) => {
    setReplyingTo(msg);
    setEditingMessage(null);
    setActiveActionMenuId(null);
    inputRef.current?.focus();
  };

  const handleStartEdit = (msg) => {
    setEditingMessage(msg);
    setReplyingTo(null);
    setInputText(msg.text || '');
    setActiveActionMenuId(null);
    inputRef.current?.focus();
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setInputText('');
  };

  const handleCopyText = (msg) => {
    if (!msg.text) return;
    navigator.clipboard?.writeText(msg.text);
    setCopiedMessageId(msg._id);
    setActiveActionMenuId(null);
    setTimeout(() => {
      setCopiedMessageId((prev) => (prev === msg._id ? null : prev));
    }, 2000);
  };

  const handleDeleteConfirm = async (mode) => {
    if (!deleteTarget) return;
    const targetId = deleteTarget._id;
    try {
      await messageService.deleteMessage(targetId, mode);
      if (mode === 'everyone') {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === targetId
              ? { ...m, isDeleted: true, text: 'This message was deleted' }
              : m
          )
        );
      } else {
        setMessages((prev) => prev.filter((m) => m._id !== targetId));
      }
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete message:', err);
      alert('Could not delete message. Please try again.');
    }
  };

  const handleToggleReaction = async (messageId, emoji) => {
    setActiveActionMenuId(null);
    // Optimistic UI update
    setMessages((prev) =>
      prev.map((m) => {
        if (m._id !== messageId) return m;
        const reactions = Array.isArray(m.reactions) ? [...m.reactions] : [];
        const existingIdx = reactions.findIndex(
          (r) =>
            String(r.user?._id || r.user) === String(currentUser?._id) &&
            r.emoji === emoji
        );

        if (existingIdx > -1) {
          // Toggle off
          reactions.splice(existingIdx, 1);
        } else {
          // Replace previous or add new
          const otherReactionIdx = reactions.findIndex(
            (r) => String(r.user?._id || r.user) === String(currentUser?._id)
          );
          if (otherReactionIdx > -1) {
            reactions[otherReactionIdx] = { user: currentUser, emoji };
          } else {
            reactions.push({ user: currentUser, emoji });
          }
        }
        return { ...m, reactions };
      })
    );

    try {
      const data = await messageService.toggleReaction(messageId, emoji);
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? data.message : m))
      );
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
    }
  };

  const handleQuoteClick = (quotedMessageId) => {
    if (!quotedMessageId) return;
    const targetEl = document.getElementById(`msg-${quotedMessageId}`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(quotedMessageId);
      setTimeout(() => setHighlightedMessageId(null), 1800);
    }
  };

  // 5. Open new chat modal & search users
  const openNewChat = async () => {
    setNewChatModalOpen(true);
    setUserSearchQuery('');
    setSearchingUsers(true);
    try {
      const users = await messageService.searchUsers('');
      setSuggestedUsers(users);
    } catch {
      setSuggestedUsers([]);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleSearchUsers = async (q) => {
    setUserSearchQuery(q);
    setSearchingUsers(true);
    try {
      const users = await messageService.searchUsers(q);
      setSuggestedUsers(users);
    } catch {
      setSuggestedUsers([]);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleSelectUserToChat = async (user) => {
    setNewChatModalOpen(false);
    try {
      const data = await messageService.startConversation({ recipientId: user._id });
      const convId = data.conversation._id;
      loadConversations(true);
      navigate(`/messages/${convId}`);
    } catch (err) {
      console.error('Failed to start conversation:', err);
      alert('Could not start conversation.');
    }
  };

  // Filtered conversations list
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const other = c.otherParticipant || {};
    return (
      (other.name && other.name.toLowerCase().includes(q)) ||
      (other.username && other.username.toLowerCase().includes(q)) ||
      (c.lastMessageText && c.lastMessageText.toLowerCase().includes(q))
    );
  });

  const otherUser = activeConversation?.otherParticipant;
  const otherInitial = (otherUser?.name?.[0] || otherUser?.username?.[0] || 'U').toUpperCase();

  return (
    <div className="messages-layout-container">
      {      /* ===== LEFT PANE: INBOX LIST ===== */}
      <aside
        className={`messages-inbox-pane ${conversationId ? 'hidden-on-mobile' : ''}`}
        aria-label="Messages inbox"
      >
        <div className="inbox-header consistent-page-header">
          <div className="inbox-header-title-box">
            <h1 className="inbox-username consistent-page-title">Messages</h1>
            <span className="inbox-title-tag">Direct</span>
          </div>

          <button
            type="button"
            className="btn-new-chat"
            onClick={openNewChat}
            title="Start new message"
            aria-label="New message"
          >
            <SquarePen size={19} />
          </button>
        </div>

        {/* Search bar */}
        <div className="inbox-search-box consistent-search-field">
          <Search size={15} className="inbox-search-icon" />
          <input
            type="text"
            className="inbox-search-input consistent-search-input"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="btn-search-clear"
              onClick={() => setSearchQuery('')}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Conversation Items */}
        <div className="inbox-list">
          {loadingConversations ? (
            <div className="inbox-loading">
              <Spinner size={24} />
              <span>Loading chats...</span>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="inbox-empty">
              <MessageSquare size={36} className="inbox-empty-icon" />
              <h4>{searchQuery ? 'No matching chats' : 'No messages yet'}</h4>
              <p>
                {searchQuery
                  ? 'Try searching with another name or handle.'
                  : 'Send a message or share a quiz challenge to start chatting!'}
              </p>
              {!searchQuery && (
                <Button size="sm" variant="primary" onClick={openNewChat} style={{ marginTop: 12 }}>
                  <SquarePen size={14} />
                  <span>Start a Chat</span>
                </Button>
              )}
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const other = conv.otherParticipant || {};
              const isActive = conv._id === conversationId;
              const hasUnread = conv.unreadCount > 0;
              const initial = (other.name?.[0] || other.username?.[0] || 'U').toUpperCase();

              return (
                <button
                  key={conv._id}
                  type="button"
                  className={`inbox-item ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''}`}
                  onClick={() => navigate(`/messages/${conv._id}`)}
                >
                  <div className="inbox-avatar-wrap">
                    {other.avatar ? (
                      <img
                        src={other.avatar}
                        alt={other.name || other.username}
                        className="inbox-avatar"
                        loading="lazy"
                        decoding="async"
                        width="44"
                        height="44"
                      />
                    ) : (
                      <div className="inbox-avatar-placeholder">{initial}</div>
                    )}
                  </div>

                  <div className="inbox-item-content">
                    <div className="inbox-item-top">
                      <span className="inbox-item-name">{other.name || other.username}</span>
                      <span className="inbox-item-time">{chatListTimeFormat(conv.lastMessageAt)}</span>
                    </div>

                    <div className="inbox-item-preview-row">
                      <p className={`inbox-item-preview ${hasUnread ? 'bold' : ''}`}>
                        {conv.lastMessageText || 'Started a conversation'}
                      </p>
                      {hasUnread && (
                        <span className="inbox-unread-badge">
                          {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ===== RIGHT PANE: ACTIVE CHAT STREAM (Whole-screen scrolling) ===== */}
      <section
        className={`messages-thread-pane ${!conversationId ? 'hidden-on-mobile' : ''}`}
        aria-label="Active conversation"
      >
        {!conversationId ? (
          <div className="thread-placeholder">
            <div className="placeholder-icon-circle">
              <MessageSquare size={48} strokeWidth={1.8} />
            </div>
            <h2>Your Messages</h2>
            <p>Send direct messages and share quiz challenge links privately with friends.</p>
            <Button size="md" variant="primary" onClick={openNewChat}>
              <SquarePen size={16} />
              <span>Send Message</span>
            </Button>
          </div>
        ) : (
          <div className="active-thread-shell">
            {/* Thread Header */}
            <header className="thread-header">
              <button
                type="button"
                className="btn-thread-back"
                onClick={() => navigate('/messages')}
                title="Back to inbox"
                aria-label="Back to inbox"
              >
                <ArrowLeft size={18} />
              </button>

              <Link to={`/@${otherUser?.username}`} className="thread-user-link">
                <div className="thread-header-avatar-wrap">
                  {otherUser?.avatar ? (
                    <img
                      src={otherUser.avatar}
                      alt={otherUser.name || otherUser.username}
                      className="thread-header-avatar"
                      loading="lazy"
                      decoding="async"
                      width="38"
                      height="38"
                    />
                  ) : (
                    <div className="thread-header-avatar-placeholder">{otherInitial}</div>
                  )}
                </div>

                <div className="thread-user-details">
                  <div className="thread-user-name-row">
                    <strong>{otherUser?.name || otherUser?.username}</strong>
                  </div>
                  {isPeerTyping ? (
                    <span className="thread-user-status typing">typing...</span>
                  ) : isPeerOnline ? (
                    <span className="thread-user-status online">
                      <span className="online-indicator-dot" /> Active now
                    </span>
                  ) : peerLastSeen ? (
                    <span className="thread-user-status offline">
                      Last seen {chatListTimeFormat(peerLastSeen)}
                    </span>
                  ) : (
                    <span className="thread-user-handle">@{otherUser?.username || 'member'}</span>
                  )}
                </div>
              </Link>
            </header>

            {/* Message Stream */}
            <div
              ref={threadStreamRef}
              className="thread-stream"
              onScroll={handleThreadScroll}
            >
              {loadingMessages ? (
                <div className="thread-stream-loading">
                  <Spinner size={32} />
                  <span>Loading messages...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="thread-stream-empty">
                  <div className="thread-welcome-avatar">
                    {otherUser?.avatar ? (
                      <img
                        src={otherUser.avatar}
                        alt={otherUser.username}
                        loading="lazy"
                        decoding="async"
                        width="54"
                        height="54"
                      />
                    ) : (
                      <span>{otherInitial}</span>
                    )}
                  </div>
                  <h3>{otherUser?.name || otherUser?.username}</h3>
                  <p>@{otherUser?.username} · QuizFocus Member</p>
                  <Link to={`/@${otherUser?.username}`} className="btn-view-profile">
                    View Profile
                  </Link>
                  <div className="thread-icebreaker">
                    Wave hello or share a quiz challenge to kick off the conversation! 👋
                  </div>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isMine = String(msg.sender?._id || msg.sender) === String(currentUser?._id);
                  const isDeleted = msg.isDeleted;
                  const isHighlighted = highlightedMessageId === msg._id;
                  const isActionMenuOpen = activeActionMenuId === msg._id;

                  // Group by calendar date
                  const currentDateKey = getMessageDateKey(msg.createdAt);
                  const prevDateKey = index > 0 ? getMessageDateKey(messages[index - 1].createdAt) : null;
                  const showDateDivider = currentDateKey !== prevDateKey;

                  // Avatars for received messages
                  const showAvatar =
                    !isMine &&
                    (index === messages.length - 1 ||
                      String(messages[index + 1]?.sender?._id || messages[index + 1]?.sender) !== String(msg.sender?._id || msg.sender));

                  // Aggregated emoji reactions
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
                    <div key={msg._id} className="thread-msg-group">
                      {/* WhatsApp Date Separator */}
                      {showDateDivider && (
                        <div className="thread-date-divider">
                          <span className="thread-date-label">
                            {getMessageDateLabel(msg.createdAt)}
                          </span>
                        </div>
                      )}

                      <div
                        id={`msg-${msg._id}`}
                        className={`thread-msg-row ${isMine ? 'mine' : 'theirs'} ${
                          isHighlighted ? 'highlighted-msg' : ''
                        }`}
                      >
                        {!isMine && (
                          <div className="msg-avatar-gutter">
                            {showAvatar ? (
                              msg.sender?.avatar ? (
                                <img
                                  src={msg.sender.avatar}
                                  alt={msg.sender.username}
                                  className="msg-sender-avatar"
                                  loading="lazy"
                                  decoding="async"
                                  width="28"
                                  height="28"
                                />
                              ) : (
                                <div className="msg-sender-avatar-placeholder">{otherInitial}</div>
                              )
                            ) : (
                              <div className="msg-avatar-spacer" />
                            )}
                          </div>
                        )}

                        <div
                          className={`thread-bubble-container ${
                            hoveredMessageId === msg._id ? 'message-hovered' : ''
                          } ${isActionMenuOpen ? 'menu-open' : ''}`}
                          onMouseEnter={() => setHoveredMessageId(msg._id)}
                          onMouseLeave={() =>
                            setHoveredMessageId((currentId) =>
                              currentId === msg._id ? null : currentId
                            )
                          }
                        >
                          {/* Floating WhatsApp Action & Reaction Bar (Hover) */}
                          {!isDeleted && (
                            <div className="msg-hover-action-bar">
                              {/* Quick Emoji Reaction Pill */}
                              <div className="quick-reactions-strip">
                                {QUICK_REACTIONS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className="btn-quick-emoji"
                                    onClick={() => handleToggleReaction(msg._id, emoji)}
                                    title={`React with ${emoji}`}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>

                              {/* Action Menu Trigger */}
                              <div className="msg-action-menu-wrap">
                                <button
                                  type="button"
                                  className="btn-msg-menu-trigger"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveActionMenuId((prev) => (prev === msg._id ? null : msg._id));
                                  }}
                                  title="Message options"
                                >
                                  <ChevronDown size={14} />
                                </button>

                                {/* Dropdown Menu */}
                                {isActionMenuOpen && (
                                  <div
                                    className={`msg-dropdown-menu ${isMine ? 'menu-align-right' : 'menu-align-left'}`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className="dropdown-menu-item"
                                      onClick={() => handleStartReply(msg)}
                                    >
                                      <Reply size={14} />
                                      <span>Reply</span>
                                    </button>

                                    {msg.text && (
                                      <button
                                        type="button"
                                        className="dropdown-menu-item"
                                        onClick={() => handleCopyText(msg)}
                                      >
                                        <Copy size={14} />
                                        <span>{copiedMessageId === msg._id ? 'Copied!' : 'Copy'}</span>
                                      </button>
                                    )}

                                    {isMine && !isDeleted && (
                                      <button
                                        type="button"
                                        className="dropdown-menu-item"
                                        onClick={() => handleStartEdit(msg)}
                                      >
                                        <Pencil size={14} />
                                        <span>Edit</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      className="dropdown-menu-item danger"
                                      onClick={() => {
                                        setDeleteTarget(msg);
                                        setActiveActionMenuId(null);
                                      }}
                                    >
                                      <Trash2 size={14} />
                                      <span>Delete</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Quoted Message Box (WhatsApp Style) */}
                          {msg.replyTo &&
                            (msg.replyTo.senderName?.trim() || msg.replyTo.text?.trim()) && (
                              <div
                                className="msg-quoted-snippet"
                                onClick={() => handleQuoteClick(msg.replyTo.messageId)}
                                title="Click to view quoted message"
                              >
                                <div className="msg-quoted-author">{msg.replyTo.senderName}</div>
                                <div className="msg-quoted-text">{msg.replyTo.text}</div>
                              </div>
                            )}

                          {/* Shared Quiz Card Embed */}
                          {msg.type === 'quiz_share' && msg.quiz && (
                            <div className="msg-quiz-card">
                              <div className="msg-quiz-header">
                                <span className="msg-quiz-tag">Shared Quiz</span>
                                <span className="msg-quiz-diff">{msg.quiz.difficulty || 'All Levels'}</span>
                              </div>
                              <h4 className="msg-quiz-title">{msg.quiz.title}</h4>
                              {msg.quiz.description && (
                                <p className="msg-quiz-desc">{msg.quiz.description}</p>
                              )}
                              <div className="msg-quiz-footer">
                                <div className="msg-quiz-meta">
                                  <HelpCircle size={13} />
                                  <span>{msg.quiz.questionCount || 0} Questions</span>
                                </div>
                                <Link
                                  to={`/quiz/${msg.quiz._id}?challenge=true`}
                                  className="btn-play-shared-quiz"
                                >
                                  <Play size={12} fill="currentColor" />
                                  <span>Play Quiz</span>
                                </Link>
                              </div>
                            </div>
                          )}

                          {/* Shared Comment Card Embed */}
                          {msg.type === 'comment_share' && msg.comment && (
                            <div className="msg-comment-card">
                              <div className="msg-comment-quote-header">
                                <Quote size={12} />
                                <span>Comment</span>
                              </div>
                              <p className="msg-comment-quote-body">"{msg.comment.body}"</p>
                            </div>
                          )}

                          {/* Main Message Bubble */}
                          <div
                            className={`thread-msg-bubble ${
                              isMine ? 'bubble-mine' : 'bubble-theirs'
                            } ${isDeleted ? 'bubble-deleted' : ''}`}
                          >
                            {isDeleted ? (
                              <span className="deleted-message-text">
                                🚫 This message was deleted
                              </span>
                            ) : (
                              <span className="thread-msg-text">{msg.text}</span>
                            )}

                            {/* Timestamp, Edited badge & Receipt inside bubble */}
                            <div className="bubble-meta-row">
                              {msg.isEdited && <span className="edited-indicator">edited</span>}
                              <span className="bubble-time-text">{messageTimeFormat(msg.createdAt)}</span>
                              {isMine && !isDeleted && (
                                <span className="bubble-status-check">
                                  {msg.isOptimistic ? (
                                    <Check size={13} />
                                  ) : (
                                    <CheckCheck
                                      size={13}
                                      color={
                                        msg.readBy && msg.readBy.length > 1 ? '#53bdeb' : '#8696a0'
                                      }
                                    />
                                  )}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Reaction Badges Pill (Bottom edge of bubble) */}
                          {reactionsAggregated.length > 0 && (
                            <div className="msg-reactions-dock">
                              {reactionsAggregated.map((r) => (
                                <button
                                  key={r.emoji}
                                  type="button"
                                  className={`reaction-badge-pill ${r.hasMine ? 'active-mine' : ''}`}
                                  onClick={() => handleToggleReaction(msg._id, r.emoji)}
                                  title={r.hasMine ? 'Remove your reaction' : `React with ${r.emoji}`}
                                >
                                  <span className="reaction-emoji">{r.emoji}</span>
                                  {r.count > 1 && <span className="reaction-count">{r.count}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Real-time typing bubble */}
              {isPeerTyping && (
                <div className="thread-typing-bubble-row">
                  <div className="typing-bubble">
                    <span className="dot dot-1" />
                    <span className="dot dot-2" />
                    <span className="dot dot-3" />
                  </div>
                  <span className="typing-label">
                    {otherUser?.name || otherUser?.username || 'Member'} is typing...
                  </span>
                </div>
              )}
            </div>

            {/* Floating WhatsApp Scroll-To-Bottom Button */}
            {showScrollBottom && (
              <button
                type="button"
                className="btn-scroll-bottom-floating"
                onClick={() => scrollToBottom(true)}
                title="Scroll to latest messages"
                aria-label="Scroll to bottom"
              >
                <ChevronDown size={20} />
              </button>
            )}

            {/* Anchored Composer Wrap */}
            <div className="thread-composer-wrapper">
              {/* Replying Banner (WhatsApp Quote Preview) */}
              {replyingTo && (
                <div className="composer-context-banner replying-banner">
                  <div className="banner-left-accent" />
                  <div className="banner-body">
                    <div className="banner-header">
                      <Reply size={13} />
                      <span>
                        Replying to{' '}
                        <strong>
                          {replyingTo.sender?.name || replyingTo.sender?.username || 'User'}
                        </strong>
                      </span>
                    </div>
                    <div className="banner-snippet">{replyingTo.text}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-banner-close"
                    onClick={() => setReplyingTo(null)}
                    title="Cancel reply"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              {/* Editing Banner */}
              {editingMessage && (
                <div className="composer-context-banner editing-banner">
                  <div className="banner-left-accent" />
                  <div className="banner-body">
                    <div className="banner-header">
                      <Pencil size={13} />
                      <span>Editing message</span>
                    </div>
                    <div className="banner-snippet">{editingMessage.text}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-banner-close"
                    onClick={handleCancelEdit}
                    title="Cancel editing"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              {/* Input Form */}
              <form onSubmit={handleSendMessage} className="thread-composer">
                <input
                  ref={inputRef}
                  type="text"
                  className="thread-composer-input"
                  placeholder={
                    editingMessage
                      ? 'Edit your message...'
                      : replyingTo
                      ? `Reply to ${replyingTo.sender?.name || '...'}`
                      : `Message ${otherUser?.name || '...'}`
                  }
                  value={inputText}
                  onChange={handleInputChange}
                  maxLength={2000}
                  readOnly={sending}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      if (editingMessage) handleCancelEdit();
                      if (replyingTo) setReplyingTo(null);
                    }
                  }}
                />
                <button
                  type="submit"
                  className="btn-send-message"
                  disabled={!inputText.trim() || sending}
                  title={editingMessage ? 'Save changes' : 'Send message'}
                  aria-label={editingMessage ? 'Save' : 'Send'}
                >
                  {sending ? (
                    <Spinner size={16} />
                  ) : editingMessage ? (
                    <Check size={18} />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </section>

      {/* ===== WHATSAPP DELETE CONFIRMATION MODAL ===== */}
      {deleteTarget && (
        <div className="modal-backdrop-shell" onClick={() => setDeleteTarget(null)}>
          <div className="whatsapp-delete-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-header">
              <h3>Delete message?</h3>
              <p>You can delete this message for everyone or delete it just for yourself.</p>
            </div>

            <div className="delete-modal-actions">
              {String(deleteTarget.sender?._id || deleteTarget.sender) === String(currentUser?._id) && (
                <button
                  type="button"
                  className="btn-delete-option btn-delete-everyone"
                  onClick={() => handleDeleteConfirm('everyone')}
                >
                  Delete for everyone
                </button>
              )}

              <button
                type="button"
                className="btn-delete-option btn-delete-me"
                onClick={() => handleDeleteConfirm('me')}
              >
                Delete for me
              </button>

              <button
                type="button"
                className="btn-delete-option btn-delete-cancel"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== NEW CHAT MODAL ===== */}
      {newChatModalOpen && (
        <div className="new-chat-modal-overlay" onClick={() => setNewChatModalOpen(false)}>
          <div className="new-chat-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="new-chat-modal-header">
              <h3>New Message</h3>
              <button
                type="button"
                className="new-chat-modal-close"
                onClick={() => setNewChatModalOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="new-chat-search-row consistent-search-field">
              <span className="search-label">To:</span>
              <input
                type="text"
                className="new-chat-search-input consistent-search-input"
                placeholder="Search"
                value={userSearchQuery}
                onChange={(e) => handleSearchUsers(e.target.value)}
                autoFocus
              />
            </div>

            <div className="new-chat-results-list">
              <div className="new-chat-section-label">Suggested</div>
              {searchingUsers ? (
                <div className="new-chat-loading">
                  <Spinner size={20} />
                  <span>Searching...</span>
                </div>
              ) : suggestedUsers.length === 0 ? (
                <div className="new-chat-no-results">No users found.</div>
              ) : (
                suggestedUsers.map((u) => {
                  const initial = (u.name?.[0] || u.username?.[0] || 'U').toUpperCase();
                  return (
                    <button
                      key={u._id}
                      type="button"
                      className="new-chat-user-item"
                      onClick={() => handleSelectUserToChat(u)}
                    >
                      <div className="new-chat-avatar-wrap">
                        {u.avatar ? (
                          <img
                            src={u.avatar}
                            alt={u.username}
                            className="new-chat-avatar"
                            loading="lazy"
                            decoding="async"
                            width="36"
                            height="36"
                          />
                        ) : (
                          <div className="new-chat-avatar-placeholder">{initial}</div>
                        )}
                      </div>
                      <div className="new-chat-user-text">
                        <strong>{u.name || u.username}</strong>
                        <span>@{u.username}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      <style>{messagesStyles}</style>
    </div>
  );
}

const messagesStyles = `
  /* ===== ROOT CONTAINER (Borderless Edge-to-Edge) ===== */
  .messages-layout-container {
    display: grid;
    grid-template-columns: 360px 1fr;
    background: var(--bg-primary, #000000);
    border: none;
    border-radius: 0;
    height: 100vh;
    height: 100dvh;
    min-height: 0;
    position: relative;
    box-shadow: none;
    box-sizing: border-box;
    width: 100%;
    overflow: hidden;
  }

  /* ===== LEFT PANE: INBOX LIST (Single Vertical Divider Line) ===== */
  .messages-inbox-pane {
    position: relative;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary, #000000);
    border-right: 1px solid var(--color-border);
    border-radius: 0;
    overflow: hidden;
  }

  .inbox-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border);
    background: var(--bg-primary, #000000);
    flex-shrink: 0;
  }

  .messages-inbox-pane .inbox-header {
    padding: 16px 20px;
  }

  .messages-inbox-pane .inbox-header .consistent-page-title {
    font-size: 19px;
  }

  .inbox-header-title-box {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .inbox-username {
    font-size: 16px;
    font-weight: 750;
    color: var(--text-primary, #FFFFFF);
    margin: 0;
  }

  .inbox-title-tag {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 7px;
    border-radius: var(--radius-full, 9999px);
    background: rgba(255, 69, 0, 0.14);
    color: var(--accent-primary, #FF4500);
  }

  .btn-new-chat {
    background: transparent;
    border: 1px solid var(--border-default, #343536);
    border-radius: var(--radius-md, 8px);
    color: var(--text-primary, #FFFFFF);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    transition: all 0.15s ease;
  }

  .btn-new-chat:hover {
    background: var(--bg-elevated, #272729);
    border-color: var(--accent-primary, #FF4500);
    color: var(--accent-primary, #FF4500);
  }

  .inbox-search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 12px 16px 10px;
    padding: 0 12px;
    height: 36px;
    background: var(--bg-elevated, #272729);
    border: 1px solid var(--border-default, #343536);
    border-radius: var(--radius-full, 9999px);
    flex-shrink: 0;
  }

  .inbox-search-icon {
    color: var(--text-secondary, #818181);
    flex-shrink: 0;
  }

  .inbox-search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-primary, #FFFFFF);
    font-size: 13px;
    font-family: inherit;
  }

  .inbox-search-input::placeholder {
    color: var(--text-secondary, #818181);
  }

  .btn-search-clear {
    background: none;
    border: none;
    color: var(--text-secondary, #818181);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3px;
  }

  .inbox-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    scrollbar-width: thin;
    scrollbar-color: var(--border-default, #343536) transparent;
  }

  .inbox-loading,
  .inbox-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;
    color: var(--text-secondary, #818181);
    gap: 8px;
  }

  .inbox-empty-icon {
    opacity: 0.35;
    margin-bottom: 6px;
    color: var(--text-secondary, #818181);
  }

  .inbox-empty h4 {
    margin: 0;
    font-size: 14.5px;
    color: var(--text-primary, #FFFFFF);
    font-weight: 650;
  }

  .inbox-empty p {
    font-size: 12px;
    line-height: 1.45;
    margin: 0;
    max-width: 240px;
  }

  .inbox-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 18px;
    border: none;
    background: transparent;
    border-bottom: 1px solid var(--color-border);
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: background 0.12s ease;
  }

  .inbox-item:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .inbox-item.active {
    background: rgba(255, 69, 0, 0.08);
    border-left: 3px solid var(--accent-primary, #FF4500);
  }

  .inbox-avatar-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .inbox-avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    object-fit: cover;
  }

  .inbox-avatar-placeholder {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--bg-elevated, #272729);
    border: 1px solid var(--border-default, #343536);
    color: var(--text-primary, #FFFFFF);
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
  }

  .inbox-creator-dot {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--success, #46D160);
    border: 2px solid var(--bg-surface, #1A1A1B);
  }

  .inbox-item-content {
    flex: 1;
    min-width: 0;
  }

  .inbox-item-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 3px;
  }

  .inbox-item-name {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text-primary, #FFFFFF);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inbox-item-time {
    font-size: 11px;
    color: var(--text-secondary, #818181);
    flex-shrink: 0;
  }

  .inbox-item-preview-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .inbox-item-preview {
    font-size: 12.5px;
    color: var(--text-secondary, #818181);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inbox-item-preview.bold {
    color: var(--text-primary, #FFFFFF);
    font-weight: 650;
  }

  .inbox-unread-badge {
    background: var(--accent-primary, #FF4500);
    color: #ffffff;
    font-size: 10.5px;
    font-weight: 750;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: var(--radius-full, 9999px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* ===== RIGHT PANE: ACTIVE THREAD ===== */
  .messages-thread-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    min-width: 0;
    background: var(--bg-primary, #000000);
    position: relative;
    border-radius: 0;
    border: none;
    overflow: hidden;
  }

  .thread-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 32px;
    text-align: center;
  }

  .placeholder-icon-circle {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    border: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 18px;
    color: var(--accent-primary, #FF4500);
    background: rgba(255, 69, 0, 0.06);
  }

  .thread-placeholder h2 {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 8px;
    color: var(--text-primary, #FFFFFF);
  }

  .thread-placeholder p {
    font-size: 13.5px;
    color: var(--text-secondary, #818181);
    max-width: 320px;
    line-height: 1.5;
    margin-bottom: 20px;
  }

  /* Active Thread Shell */
  .active-thread-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    min-width: 0;
    position: relative;
    overflow: hidden;
  }

  /* Thread Header */
  .thread-header {
    position: relative;
    z-index: 25;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 24px;
    border-bottom: 1px solid var(--color-border);
    background: rgba(0, 0, 0, 0.88);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    flex-shrink: 0;
  }

  .btn-thread-back {
    display: none;
    background: none;
    border: none;
    color: var(--text-primary, #FFFFFF);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm, 6px);
  }

  .btn-thread-back:hover {
    background: var(--bg-elevated, #272729);
  }

  .thread-user-link {
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    color: inherit;
  }

  .thread-header-avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    object-fit: cover;
  }

  .thread-header-avatar-placeholder {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--bg-elevated, #272729);
    border: 1px solid var(--border-default, #343536);
    color: var(--text-primary, #FFFFFF);
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  }

  .thread-user-details {
    display: flex;
    flex-direction: column;
  }

  .thread-user-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .thread-user-name-row strong {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--text-primary, #FFFFFF);
  }

  .thread-creator-badge {
    font-size: 9.5px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: var(--radius-full, 9999px);
    background: rgba(70, 209, 96, 0.15);
    color: var(--success, #46D160);
  }

  .thread-user-handle {
    font-size: 11.5px;
    color: var(--text-secondary, #818181);
  }

  /* Thread Stream */
  .thread-stream {
    flex: 1;
    min-height: 0;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--border-default, #343536) transparent;
  }

  .thread-stream-loading,
  .thread-stream-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 50px 20px;
    text-align: center;
    color: var(--text-secondary, #818181);
    gap: 8px;
  }

  .thread-welcome-avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--bg-elevated, #272729);
    border: 1px solid var(--border-default, #343536);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-primary, #FFFFFF);
    font-size: 22px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .thread-welcome-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .btn-view-profile {
    display: inline-flex;
    align-items: center;
    padding: 6px 14px;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--border-default, #343536);
    background: var(--bg-elevated, #272729);
    color: var(--text-primary, #FFFFFF);
    font-size: 12px;
    font-weight: 650;
    text-decoration: none;
    margin: 8px 0 14px;
    transition: all 0.15s ease;
  }

  .btn-view-profile:hover {
    border-color: var(--accent-primary, #FF4500);
    color: var(--accent-primary, #FF4500);
  }

  .thread-icebreaker {
    font-size: 12.5px;
    color: var(--text-secondary, #818181);
    background: rgba(255, 255, 255, 0.02);
    padding: 9px 14px;
    border-radius: var(--radius-md, 8px);
    border: 1px dashed var(--border-default, #343536);
  }

  /* WhatsApp Date Divider */
  .thread-date-divider {
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 12px 0 8px;
    user-select: none;
  }

  .thread-date-label {
    background: var(--bg-elevated, #272729);
    border: 1px solid var(--border-default, #343536);
    color: var(--text-secondary, #818181);
    font-size: 11px;
    font-weight: 600;
    padding: 3px 12px;
    border-radius: var(--radius-full, 9999px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  /* Message Row */
  .thread-msg-group {
    display: flex;
    flex-direction: column;
    width: 100%;
    flex-shrink: 0;
  }

  .thread-msg-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    width: 100%;
    margin-bottom: 2px;
    position: relative;
    transition: background 0.3s ease;
  }

  .thread-msg-row.highlighted-msg {
    animation: flashHighlight 1.5s ease-out;
  }

  @keyframes flashHighlight {
    0% { background: rgba(255, 69, 0, 0.2); }
    100% { background: transparent; }
  }

  .thread-msg-row.mine {
    justify-content: flex-end;
  }

  .thread-msg-row.theirs {
    justify-content: flex-start;
  }

  .msg-avatar-gutter {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
  }

  .msg-sender-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
  }

  .msg-sender-avatar-placeholder {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--border-default, #343536);
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .thread-bubble-container {
    max-width: 68%;
    display: flex;
    flex-direction: column;
    gap: 3px;
    position: relative;
  }

  .thread-msg-row.mine .thread-bubble-container {
    align-items: flex-end;
  }

  .thread-msg-row.theirs .thread-bubble-container {
    align-items: flex-start;
  }

  /* Floating WhatsApp Action & Reaction Bar (Appears on Hover) */
  .msg-hover-action-bar {
    position: absolute;
    top: -26px;
    display: none;
    align-items: center;
    gap: 4px;
    background: var(--bg-surface, #1A1A1B);
    border: 1px solid var(--border-default, #343536);
    border-radius: var(--radius-full, 9999px);
    padding: 2px 6px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
    z-index: 10;
  }

  .thread-msg-row.mine .msg-hover-action-bar {
    right: 0;
  }

  .thread-msg-row.theirs .msg-hover-action-bar {
    left: 0;
  }

  .thread-bubble-container.message-hovered .msg-hover-action-bar,
  .thread-bubble-container:focus-within .msg-hover-action-bar,
  .thread-bubble-container.menu-open .msg-hover-action-bar {
    display: flex;
  }

  .quick-reactions-strip {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .btn-quick-emoji {
    background: transparent;
    border: none;
    font-size: 13px;
    padding: 2px 4px;
    cursor: pointer;
    border-radius: var(--radius-sm, 6px);
    transition: transform 0.12s ease;
  }

  .btn-quick-emoji:hover {
    transform: scale(1.3);
  }

  .msg-action-menu-wrap {
    position: relative;
    border-left: 1px solid var(--border-default, #343536);
    padding-left: 4px;
    margin-left: 2px;
  }

  .btn-msg-menu-trigger {
    background: transparent;
    border: none;
    color: var(--text-secondary, #818181);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border-radius: 4px;
  }

  .btn-msg-menu-trigger:hover {
    color: var(--text-primary, #FFFFFF);
    background: var(--bg-elevated, #272729);
  }

  .msg-dropdown-menu {
    position: absolute;
    top: 24px;
    min-width: 140px;
    background: var(--bg-elevated, #272729);
    border: 1px solid var(--border-default, #343536);
    border-radius: var(--radius-md, 8px);
    padding: 4px 0;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    z-index: 50;
    display: flex;
    flex-direction: column;
  }

  .msg-dropdown-menu.menu-align-right {
    right: 0;
  }

  .msg-dropdown-menu.menu-align-left {
    left: 0;
  }

  .dropdown-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    background: transparent;
    border: none;
    color: var(--text-primary, #FFFFFF);
    font-size: 12.5px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: background 0.12s ease;
  }

  .dropdown-menu-item:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .dropdown-menu-item.danger {
    color: #ff5252;
  }

  .dropdown-menu-item.danger:hover {
    background: rgba(255, 82, 82, 0.12);
  }

  /* WhatsApp Quoted Snippet Inside Bubble */
  .msg-quoted-snippet {
    background: rgba(0, 0, 0, 0.25);
    border-left: 3px solid var(--accent-primary, #FF4500);
    border-radius: 4px;
    padding: 6px 10px;
    margin-bottom: 3px;
    cursor: pointer;
    transition: opacity 0.15s ease;
    max-width: 100%;
  }

  .msg-quoted-snippet:hover {
    opacity: 0.85;
  }

  .msg-quoted-author {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent-primary, #FF4500);
    margin-bottom: 2px;
  }

  .msg-quoted-text {
    font-size: 12px;
    color: var(--text-secondary, #818181);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 260px;
  }

  /* Message Bubble */
  .thread-msg-bubble {
    padding: 8px 12px 6px;
    border-radius: 14px;
    font-size: 13.5px;
    line-height: 1.45;
    word-break: break-word;
    position: relative;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  }

  .bubble-mine {
    background: var(--accent-primary, #FF4500);
    color: #ffffff;
    border-bottom-right-radius: 2px;
  }

  .bubble-theirs {
    background: var(--bg-elevated, #272729);
    color: var(--text-primary, #FFFFFF);
    border: 1px solid var(--border-default, #343536);
    border-bottom-left-radius: 2px;
  }

  .bubble-deleted {
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px dashed var(--border-default, #343536) !important;
  }

  .deleted-message-text {
    font-size: 12.5px;
    font-style: italic;
    color: var(--text-secondary, #818181);
  }

  /* Bubble Meta Row (Inline Timestamp & Receipts) */
  .bubble-meta-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    margin-top: 2px;
    font-size: 10px;
    opacity: 0.8;
    user-select: none;
  }

  .edited-indicator {
    font-size: 9.5px;
    font-style: italic;
    opacity: 0.75;
  }

  .bubble-time-text {
    font-size: 10px;
  }

  .bubble-status-check {
    display: inline-flex;
    align-items: center;
  }

  /* Reaction Badges Dock */
  .msg-reactions-dock {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: -4px;
    z-index: 5;
  }

  .reaction-badge-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: var(--bg-surface, #1A1A1B);
    border: 1px solid var(--border-default, #343536);
    border-radius: var(--radius-full, 9999px);
    padding: 1px 6px;
    font-size: 11px;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transition: transform 0.12s ease;
  }

  .reaction-badge-pill:hover {
    transform: scale(1.1);
  }

  .reaction-badge-pill.active-mine {
    border-color: var(--accent-primary, #FF4500);
    background: rgba(255, 69, 0, 0.12);
  }

  .reaction-count {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-secondary, #818181);
  }

  .reaction-badge-pill.active-mine .reaction-count {
    color: var(--accent-primary, #FF4500);
  }

  /* Shared Quiz Embed Card inside message */
  .msg-quiz-card {
    background: var(--bg-elevated, #272729);
    border: 1px solid var(--border-default, #343536);
    border-radius: var(--radius-md, 8px);
    padding: 12px;
    margin-bottom: 2px;
    width: 270px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  }

  .msg-quiz-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .msg-quiz-tag {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: var(--radius-sm, 6px);
    background: rgba(255, 69, 0, 0.15);
    color: var(--accent-primary, #FF4500);
  }

  .msg-quiz-diff {
    font-size: 10.5px;
    color: var(--text-secondary, #818181);
  }

  .msg-quiz-title {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--text-primary, #FFFFFF);
    margin: 0 0 4px;
    line-height: 1.35;
  }

  .msg-quiz-desc {
    font-size: 11.5px;
    color: var(--text-secondary, #818181);
    margin: 0 0 10px;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .msg-quiz-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .msg-quiz-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--text-secondary, #818181);
  }

  .btn-play-shared-quiz {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 11px;
    border-radius: var(--radius-sm, 6px);
    background: var(--accent-primary, #FF4500);
    color: #ffffff;
    font-size: 11.5px;
    font-weight: 650;
    text-decoration: none;
    transition: all 0.15s ease;
  }

  .btn-play-shared-quiz:hover {
    background: var(--accent-hover, #FF571A);
    transform: translateY(-1px);
  }

  /* Shared comment embed */
  .msg-comment-card {
    background: var(--bg-elevated, #272729);
    border-left: 3px solid var(--accent-primary, #FF4500);
    border-radius: var(--radius-md, 8px);
    padding: 8px 12px;
    margin-bottom: 2px;
    width: 250px;
  }

  .msg-comment-quote-header {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--accent-primary, #FF4500);
    margin-bottom: 4px;
  }

  .msg-comment-quote-body {
    font-size: 11.5px;
    font-style: italic;
    color: var(--text-secondary, #818181);
    margin: 0;
  }

  /* Floating Scroll-To-Bottom Button */
  .btn-scroll-bottom-floating {
    position: absolute;
    right: 24px;
    bottom: 92px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--bg-surface, #1A1A1B);
    border: 1px solid var(--border-default, #343536);
    color: var(--text-primary, #FFFFFF);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
    z-index: 24;
    transition: all 0.15s ease;
  }

  .btn-scroll-bottom-floating:hover {
    border-color: var(--accent-primary, #FF4500);
    color: var(--accent-primary, #FF4500);
    transform: translateY(-2px);
  }

  /* Sticky Composer Wrapper */
  .thread-composer-wrapper {
    position: relative;
    z-index: 25;
    background: rgba(0, 0, 0, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-top: 1px solid var(--color-border);
    border-radius: 0;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  /* Replying & Editing Context Banners */
  .composer-context-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 18px;
    background: rgba(0, 0, 0, 0.25);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .replying-banner .banner-left-accent {
    width: 3px;
    height: 32px;
    border-radius: 2px;
    background: var(--accent-primary, #FF4500);
  }

  .editing-banner .banner-left-accent {
    width: 3px;
    height: 32px;
    border-radius: 2px;
    background: #00bcd4;
  }

  .banner-body {
    flex: 1;
    min-width: 0;
  }

  .banner-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--accent-primary, #FF4500);
    font-weight: 650;
    margin-bottom: 2px;
  }

  .editing-banner .banner-header {
    color: #00bcd4;
  }

  .banner-snippet {
    font-size: 12px;
    color: var(--text-secondary, #818181);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 480px;
  }

  .btn-banner-close {
    background: none;
    border: none;
    color: var(--text-secondary, #818181);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
  }

  .btn-banner-close:hover {
    color: var(--text-primary, #FFFFFF);
    background: var(--bg-elevated, #272729);
  }

  /* Composer Input Form */
  .thread-composer {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 18px;
  }

  .thread-composer-input {
    flex: 1;
    height: 40px;
    padding: 0 16px;
    border-radius: var(--radius-full, 9999px);
    background: var(--bg-elevated, #272729);
    border: 1px solid var(--border-default, #343536);
    color: var(--text-primary, #FFFFFF);
    font-size: 13.5px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .thread-composer-input:focus {
    border-color: var(--accent-primary, #FF4500);
  }

  .thread-composer-input::placeholder {
    color: var(--text-secondary, #818181);
  }

  .btn-send-message {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: var(--accent-primary, #FF4500);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .btn-send-message:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    background: var(--bg-elevated, #272729);
    color: var(--text-secondary, #818181);
  }

  .btn-send-message:not(:disabled):hover {
    background: var(--accent-hover, #FF571A);
    transform: scale(1.05);
  }

  /* ===== WHATSAPP DELETE MODAL ===== */
  .modal-backdrop-shell {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 16px;
  }

  .whatsapp-delete-modal-card {
    width: 100%;
    max-width: 380px;
    background: var(--bg-surface, #1A1A1B);
    border: 1px solid var(--border-default, #343536);
    border-radius: var(--radius-lg, 14px);
    padding: 24px 20px;
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.65);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .delete-modal-header h3 {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary, #FFFFFF);
  }

  .delete-modal-header p {
    margin: 0;
    font-size: 13px;
    color: var(--text-secondary, #818181);
    line-height: 1.45;
  }

  .delete-modal-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .btn-delete-option {
    width: 100%;
    height: 38px;
    border-radius: var(--radius-md, 8px);
    font-size: 13px;
    font-weight: 650;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.15s ease;
    font-family: inherit;
  }

  .btn-delete-everyone {
    background: #ff4500;
    color: #ffffff;
  }

  .btn-delete-everyone:hover {
    background: #ff571a;
  }

  .btn-delete-me {
    background: var(--bg-elevated, #272729);
    border-color: var(--border-default, #343536);
    color: var(--text-primary, #FFFFFF);
  }

  .btn-delete-me:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .btn-delete-cancel {
    background: transparent;
    border-color: transparent;
    color: var(--text-secondary, #818181);
  }

  .btn-delete-cancel:hover {
    color: var(--text-primary, #FFFFFF);
  }

  /* ===== NEW CHAT MODAL ===== */
  .new-chat-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 16px;
  }

  .new-chat-modal-card {
    width: 100%;
    max-width: 420px;
    background: var(--bg-surface, #1A1A1B);
    border: 1px solid var(--border-default, #343536);
    border-radius: var(--radius-lg, 16px);
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.6);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 80vh;
  }

  .new-chat-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border-default, #343536);
  }

  .new-chat-modal-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary, #FFFFFF);
  }

  .new-chat-modal-close {
    background: none;
    border: none;
    color: var(--text-secondary, #818181);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm, 6px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .new-chat-modal-close:hover {
    color: var(--text-primary, #FFFFFF);
    background: var(--bg-elevated, #272729);
  }

  .new-chat-search-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--border-default, #343536);
  }

  .search-label {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--text-primary, #FFFFFF);
  }

  .new-chat-search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-primary, #FFFFFF);
    font-size: 13.5px;
    font-family: inherit;
  }

  .new-chat-search-input::placeholder {
    color: var(--text-secondary, #818181);
  }

  .new-chat-results-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    display: flex;
    flex-direction: column;
  }

  .new-chat-section-label {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--accent-primary, #FF4500);
    padding: 8px 18px 4px;
    letter-spacing: 0.05em;
  }

  .new-chat-loading,
  .new-chat-no-results {
    padding: 24px 18px;
    text-align: center;
    color: var(--text-secondary, #818181);
    font-size: 12.5px;
  }

  .new-chat-user-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 18px;
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .new-chat-user-item:hover {
    background: var(--bg-elevated, #272729);
  }

  .new-chat-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
  }

  .new-chat-avatar-placeholder {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--bg-elevated, #272729);
    border: 1px solid var(--border-default, #343536);
    color: var(--text-primary, #FFFFFF);
    font-size: 13px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .new-chat-user-text {
    display: flex;
    flex-direction: column;
  }

  .new-chat-user-text strong {
    font-size: 13px;
    color: var(--text-primary, #FFFFFF);
  }

  .new-chat-user-text span {
    font-size: 11.5px;
    color: var(--text-secondary, #818181);
  }

  /* Real-Time Presence & Typing Indicators */
  .thread-user-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    line-height: 1;
    margin-top: 2px;
  }

  .thread-user-status.online {
    color: #22c55e;
    font-weight: 500;
  }

  .thread-user-status.offline {
    color: var(--text-secondary, #818181);
  }

  .thread-user-status.typing {
    color: #0ea5e9;
    font-style: italic;
    font-weight: 500;
    animation: fadeInTyping 0.2s ease-out;
  }

  .online-indicator-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
  }

  .thread-typing-bubble-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    margin-bottom: 8px;
    padding-left: 36px;
    animation: fadeInTyping 0.2s ease-out;
  }

  .typing-bubble {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 7px 11px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .typing-bubble .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #0ea5e9;
    animation: typingBounce 1.2s infinite ease-in-out;
  }

  .typing-bubble .dot-1 {
    animation-delay: 0s;
  }

  .typing-bubble .dot-2 {
    animation-delay: 0.2s;
  }

  .typing-bubble .dot-3 {
    animation-delay: 0.4s;
  }

  .typing-label {
    font-size: 12px;
    color: var(--text-secondary, #818181);
    font-style: italic;
  }

  @keyframes typingBounce {
    0%, 60%, 100% {
      transform: translateY(0);
      opacity: 0.4;
    }
    30% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }

  @keyframes fadeInTyping {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Responsive Mobile Overrides */
  @media (max-width: 768px) {
    .messages-layout-container {
      margin: 0;
      border-radius: 0;
      border: none;
      height: calc(100vh - 58px);
      height: calc(100dvh - 58px);
    }

    .hidden-on-mobile {
      display: none !important;
    }

    .messages-inbox-pane {
      width: 100%;
      min-width: 100%;
      border-right: none;
      border-radius: 0;
      position: static;
      height: 100%;
      max-height: none;
    }

    .messages-thread-pane {
      width: 100%;
      border-radius: 0;
    }

    .thread-stream {
      padding: 16px;
    }

    .thread-composer {
      padding: 10px 12px;
    }

    .btn-thread-back {
      display: flex;
    }

    .thread-bubble-container {
      max-width: 85%;
    }
  }
`;
