import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Send,
  Search,
  SquarePen,
  ArrowLeft,
  MessageSquare,
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
import { toast } from 'sonner';
import './Messages.css';

const QUICK_REACTIONS = ['ðŸ‘', 'â¤ï¸', 'ðŸ˜‚', 'ðŸ˜®', 'ðŸ˜¢', 'ðŸ™'];

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

const dedupeMessages = (items) => {
  const seen = new Set();
  return items.filter((message) => {
    if (message?._id == null) return true;
    const id = String(message._id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
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
          setMessages(dedupeMessages(data.messages || []));
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
        setMessages((prev) => dedupeMessages([...prev, payload.message]));
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
        toast.error('Could not edit message. Please try again.');
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
      setMessages((prev) => {
        const reconciled = prev.map((message) =>
          String(message._id) === tempId ? data.message : message
        );
        const responseAlreadyPresent = reconciled.some(
          (message) => String(message._id) === String(data.message._id)
        );
        return dedupeMessages(
          responseAlreadyPresent ? reconciled : [...reconciled, data.message]
        );
      });
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
      toast.error('Failed to send message. Please try again.');
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
      toast.error('Could not delete message. Please try again.');
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
      toast.error(err.response?.data?.message || 'Could not start conversation.');
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
                  <p>@{otherUser?.username} Â· QuizFocus Member</p>
                  <Link to={`/@${otherUser?.username}`} className="btn-view-profile">
                    View Profile
                  </Link>
                  <div className="thread-icebreaker">
                    Wave hello or share a quiz challenge to kick off the conversation! ðŸ‘‹
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
                        className={`thread-msg-row ${isMine ? 'mine' : 'theirs'} ${isHighlighted ? 'highlighted-msg' : ''
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
                          className={`thread-bubble-container ${hoveredMessageId === msg._id ? 'message-hovered' : ''
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
                            className={`thread-msg-bubble ${isMine ? 'bubble-mine' : 'bubble-theirs'
                              } ${isDeleted ? 'bubble-deleted' : ''}`}
                          >
                            {isDeleted ? (
                              <span className="deleted-message-text">
                                ðŸš« This message was deleted
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
    </div>
  );
}
