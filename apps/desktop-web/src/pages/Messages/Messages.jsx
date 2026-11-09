import { rankSearchResults } from '../../components/search/rankSearchResults';
import { usePageSearch } from '../../components/search/PageSearchContext';
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
import { useSettingsStore } from '../../store/settingsStore';
import { MESSAGE_LIMIT, mergeMessages, applyMessageDeletion, applyReadReceipt, canEditMessage, readDraft, writeDraft } from './chatState';
import { messageService } from '../../services/message.service';
import {
  getSocket,
  joinConversation,
  leaveConversation,
  sendTypingStart,
  sendTypingStop,
  fetchUserPresence,
} from '../../services/socket.service';
import { Spinner, Button } from '../../components/ui';
import { toast } from 'sonner';
import './Messages.css';

const QUICK_REACTIONS = ['\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}'];

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
  const sendOnEnter = useSettingsStore((s) => s.messagingSendOnEnter);
  const typingIndicators = useSettingsStore((s) => s.messagingTypingIndicators);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);

  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const { query, setQuery } = usePageSearch();
  const searchQuery = conversationId ? '' : query;
  const threadSearch = conversationId ? query : '';
  const [inboxPagination, setInboxPagination] = useState(null);
  const [loadingMoreChats, setLoadingMoreChats] = useState(false);
  const [inboxError, setInboxError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [historyPagination, setHistoryPagination] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchPagination, setSearchPagination] = useState(null);
  const [searchingMessages, setSearchingMessages] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [connected, setConnected] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
  const peerTypingTimerRef = useRef(null);
  const lastTypingAtRef = useRef(0);
  const currentConversationRef = useRef(conversationId);
  currentConversationRef.current = conversationId;
  const currentSearchRef = useRef(threadSearch);
  currentSearchRef.current = threadSearch;
  const inboxPagesRef = useRef(1);
  const inboxReloadTimer = useRef(null);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const sendingRef = useRef(false);
  const readIdsRef = useRef(new Set());
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const retryPayloadRef = useRef(null);
  const reactionPendingRef = useRef(new Set());
  const draftBeforeEditRef = useRef('');
  const editingMessageRef = useRef(editingMessage);
  editingMessageRef.current = editingMessage;
  const dialogRef = useRef(null);

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
      behavior: smooth && !reducedMotion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant',
    });
  }, [reducedMotion]);

  const markVisibleRead = useCallback(() => {
    const stream = threadStreamRef.current;
    if (!conversationId || document.hidden || !stream || currentSearchRef.current.trim()) return;
    const bounds = stream.getBoundingClientRect();
    const bottom = Math.min(bounds.bottom, window.innerHeight);
    const top = Math.max(bounds.top, 0);
    const ids = messagesRef.current.filter((message) => {
      if (message.isOptimistic || String(message.sender?._id || message.sender) === String(currentUser?._id) || readIdsRef.current.has(message._id)) return false;
      const item = document.getElementById(`msg-${message._id}`)?.getBoundingClientRect();
      return item && item.bottom > top && item.top < bottom;
    }).slice(0, 200).map((message) => message._id);
    if (!ids.length) return;
    ids.forEach((id) => readIdsRef.current.add(id));
    messageService.markConversationRead(conversationId, ids).then((data) => {
      setConversations((previous) => previous.map((item) => item._id === conversationId
        ? { ...item, unreadCount: data.unreadCount } : item));
    }).catch(() => ids.forEach((id) => readIdsRef.current.delete(id)));
  }, [conversationId, currentUser?._id]);

  useEffect(() => {
    const stream = threadStreamRef.current;
    if (!stream) return;
    let frame = 0;
    const handleScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setHoveredMessageId(null);
        const distance = stream.scrollHeight - stream.scrollTop - stream.clientHeight;
        setShowScrollBottom(distance > 240);
        markVisibleRead();
      });
    };
    stream.addEventListener('scroll', handleScroll, { passive: true });
    return () => { stream.removeEventListener('scroll', handleScroll); cancelAnimationFrame(frame); };
  }, [markVisibleRead]);

  useEffect(() => {
    const frame = requestAnimationFrame(markVisibleRead);
    document.addEventListener('visibilitychange', markVisibleRead);
    window.addEventListener('focus', markVisibleRead);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', markVisibleRead);
      window.removeEventListener('focus', markVisibleRead);
    };
  }, [messages, threadSearch, loadingMessages, markVisibleRead]);

  // Trap focus in dialogs, support Escape and return focus to the opener.
  useEffect(() => {
    if (!deleteTarget && !newChatModalOpen) return;
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    const controls = () => [...(dialog?.querySelectorAll('button:not(:disabled), input, [href]') || [])];
    controls()[0]?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape' && !deleting) {
        setDeleteTarget(null);
        setNewChatModalOpen(false);
      }
      if (event.key === 'Tab') {
        const items = controls();
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus(); };
  }, [Boolean(deleteTarget), newChatModalOpen, deleting]);

  // Close active dropdown menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setActiveActionMenuId(null);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const loadConversations = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingConversations(true);
    try {
      const pages = await Promise.all(Array.from({ length: quiet ? 1 : inboxPagesRef.current }, (_, index) =>
        messageService.getConversations({ page: index + 1, limit: 30 })));
      const unique = new Map(pages.flatMap((page) => page.conversations || []).map((item) => [item._id, item]));
      setConversations(previous => {
        if (quiet && inboxPagesRef.current > 1) for (const item of previous) if (!unique.has(item._id)) unique.set(item._id, item);
        return [...unique.values()].sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
      });
      if (!quiet || inboxPagesRef.current === 1) setInboxPagination(pages.at(-1)?.pagination);
      setInboxError('');
    } catch {
      setInboxError('Could not load conversations.');
    } finally {
      if (!quiet) setLoadingConversations(false);
    }
  }, []);

  const loadMoreConversations = async () => {
    if (loadingMoreChats || !inboxPagination?.hasMore) return;
    setLoadingMoreChats(true);
    try {
      const page = inboxPagesRef.current + 1;
      const data = await messageService.getConversations({ page, limit: 30 });
      setConversations((previous) => [...new Map([...previous, ...(data.conversations || [])].map((item) => [item._id, item])).values()]);
      inboxPagesRef.current = page;
      setInboxPagination(data.pagination);
    } catch { toast.error('Could not load more conversations.'); }
    finally { setLoadingMoreChats(false); }
  };

  useEffect(() => {
    loadConversations();
    const interval = setInterval(() => { if (!document.hidden) loadConversations(true); }, 30000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  const loadThread = useCallback(async () => {
    if (!conversationId) return;
    const target = conversationId;
    setLoadingMessages(true);
    setThreadError('');
    try {
      const data = await messageService.getMessages(target, { limit: 40 });
      if (currentConversationRef.current !== target) return;
      setActiveConversation(data.conversation);
      setMessages((previous) => mergeMessages(previous, data.messages || []));
      setHistoryPagination(data.pagination);
      requestAnimationFrame(() => scrollToBottom(false));
    } catch (error) {
      if (currentConversationRef.current === target) setThreadError(error.response?.data?.message || 'Could not load this conversation.');
    } finally {
      if (currentConversationRef.current === target) setLoadingMessages(false);
    }
  }, [conversationId, scrollToBottom]);

  useEffect(() => {
    setActiveConversation(null);
    setMessages([]);
    setHistoryPagination(null);
    setReplyingTo(null);
    setEditingMessage(null);
    setDeleteTarget(null);
    setActiveActionMenuId(null);
    setIsPeerTyping(false);
    setIsPeerOnline(false);
    setPeerLastSeen(null);
    setShowScrollBottom(false);
    setSearchResults([]);
    setInputText(readDraft(currentUser?._id, conversationId));
    setThreadError('');
    setLoadingHistory(false);
    readIdsRef.current = new Set();
    retryPayloadRef.current = null;
    if (conversationId) loadThread();
    return () => {
      clearTimeout(typingDebounceTimerRef.current);
      clearTimeout(peerTypingTimerRef.current);
      if (conversationId) sendTypingStop(conversationId);
    };
  }, [conversationId, currentUser?._id, loadThread]);

  const loadOlderMessages = async () => {
    if (loadingHistory || !historyPagination?.hasMore) return;
    const target = conversationId;
    const stream = threadStreamRef.current;
    const previousHeight = stream?.scrollHeight || 0;
    const previousTop = stream?.scrollTop || 0;
    setLoadingHistory(true);
    try {
      const data = await messageService.getMessages(target, { before: historyPagination.nextCursor, limit: 40 });
      if (currentConversationRef.current !== target) return;
      setMessages((previous) => mergeMessages(previous, data.messages || []));
      setHistoryPagination(data.pagination);
      requestAnimationFrame(() => {
        if (stream && currentConversationRef.current === target) stream.scrollTop = previousTop + stream.scrollHeight - previousHeight;
      });
    } catch { toast.error('Could not load earlier messages.'); }
    finally { if (currentConversationRef.current === target) setLoadingHistory(false); }
  };

  useEffect(() => {
    if (!conversationId || !threadSearch.trim()) { setSearchResults([]); setSearchPagination(null); setSearchError(''); setSearchingMessages(false); return; }
    const controller = new AbortController();
    setSearchingMessages(true);
    setSearchPagination(null);
    const timer = setTimeout(async () => {
      try {
        const data = await messageService.getMessages(conversationId, { q: threadSearch.trim(), match: 'closest', limit: 40 }, controller.signal);
        if (controller.signal.aborted) return;
        setSearchResults(data.messages || []);
        setSearchPagination(data.pagination);
        setSearchError('');
        requestAnimationFrame(() => {
          if (!controller.signal.aborted && threadStreamRef.current) threadStreamRef.current.scrollTop = 0;
        });
      } catch (error) { if (!controller.signal.aborted) setSearchError('Could not search messages. Try again.'); }
      finally { if (!controller.signal.aborted) setSearchingMessages(false); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [conversationId, threadSearch]);

  const loadMoreSearchResults = async () => {
    const target = conversationId;
    const query = threadSearch;
    if (searchingMessages || !searchPagination?.hasMore) return;
    setSearchingMessages(true);
    try {
      const data = await messageService.getMessages(target, { q: query.trim(), match: 'closest', before: searchPagination.nextCursor, limit: 40 });
      if (currentConversationRef.current !== target || currentSearchRef.current !== query) return;
      setSearchResults(previous => [...new Map([...previous, ...(data.messages || [])].map(message => [message._id, message])).values()]);
      setSearchPagination(data.pagination);
    } catch { toast.error('Could not load more search results.'); }
    finally { if (currentConversationRef.current === target && currentSearchRef.current === query) setSearchingMessages(false); }
  };

  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;
    const otherId = activeConversation?.otherParticipant?._id;
    const refreshPresence = () => {
      if (otherId) fetchUserPresence([otherId]).then((result) => {
        if (cancelled) return;
        setIsPeerOnline(Boolean(result?.[otherId]?.isOnline));
        setPeerLastSeen(result?.[otherId]?.lastSeen || null);
      });
    };
    const handleConnect = async () => {
      setConnected(true);
      if (conversationId) joinConversation(conversationId);
      refreshPresence();
      loadConversations(true);
      if (conversationId) {
        try {
          const data = await messageService.getMessages(conversationId, { limit: 40 });
          if (!cancelled) {
            // Reload the latest server state after a connection gap. This also
            // removes messages hidden on another device while disconnected.
            setMessages(data.messages || []);
            setHistoryPagination(data.pagination);
            const query = currentSearchRef.current.trim();
            if (!query) requestAnimationFrame(() => scrollToBottom(false));
            else {
              const results = await messageService.getMessages(conversationId, { q: query, match: 'closest', limit: 40 });
              if (!cancelled && currentSearchRef.current.trim() === query) {
                setSearchResults(results.messages || []);
                setSearchPagination(results.pagination);
                setSearchError('');
              }
            }
          }
        } catch { /* Keep current history while reconnecting. */ }
      }
    };
    const handleDisconnect = () => { setConnected(false); setIsPeerTyping(false); setIsPeerOnline(false); };
    setConnected(socket.connected);
    if (socket.connected) { if (conversationId) joinConversation(conversationId); refreshPresence(); }

    const updateMessage = (id, updater) => {
      setMessages((previous) => previous.map((item) => item._id === id ? updater(item) : item));
      setSearchResults((previous) => previous.map((item) => item._id === id ? updater(item) : item));
    };
    const handleNewMessage = (payload) => {
      if (payload.conversationId !== conversationId || !payload.message) return;
      const stream = threadStreamRef.current;
      const nearBottom = stream && stream.scrollHeight - stream.scrollTop - stream.clientHeight < 160;
      setMessages((previous) => mergeMessages(previous, [payload.message]));
      if (nearBottom && !currentSearchRef.current.trim()) requestAnimationFrame(() => scrollToBottom(false));
      else setShowScrollBottom(true);
    };
    const handleConversationUpdated = (data) => {
      if (!conversationsRef.current.some(item => item._id === data.conversationId)) {
        clearTimeout(inboxReloadTimer.current);
        inboxReloadTimer.current = setTimeout(() => loadConversations(true), 250);
        return;
      }
      setConversations(previous => previous.map(item => item._id !== data.conversationId ? item : {
        ...item, lastMessage: data.lastMessage, lastMessageAt: data.lastMessageAt, lastMessageText: data.lastMessageText,
        unreadCount: data.unreadCounts?.find(entry => String(entry.user) === String(currentUser?._id))?.count ?? item.unreadCount,
      }).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)));
    };
    const handleTyping = (data) => {
      if (data.conversationId !== conversationId || String(data.user?._id) === String(currentUser?._id)) return;
      setIsPeerTyping(Boolean(data.isTyping));
      clearTimeout(peerTypingTimerRef.current);
      if (data.isTyping) peerTypingTimerRef.current = setTimeout(() => setIsPeerTyping(false), 5000);
    };
    const handlePresence = (data) => {
      if (String(data.userId) === String(otherId)) { setIsPeerOnline(data.isOnline); setPeerLastSeen(data.lastSeen); }
    };
    const handleReaction = (data) => {
      if (data.conversationId === conversationId) updateMessage(data.messageId, (message) => ({ ...message, reactions: data.reactions }));
    };
    const handleEdited = (data) => {
      if (data.conversationId === conversationId) updateMessage(data.messageId, (message) => ({ ...message, text: data.text, isEdited: true, editedAt: data.editedAt }));
    };
    const handleDeleted = (data) => {
      if (data.conversationId !== conversationId) return;
      const update = (previous) => applyMessageDeletion(previous, data.messageId, data.mode);
      setMessages(update);
      setSearchResults(previous => previous.filter(message => message._id !== data.messageId));
      setDeleteTarget((previous) => previous?._id === data.messageId ? null : previous);
      setReplyingTo((previous) => previous?._id === data.messageId ? null : previous);
      if (editingMessageRef.current?._id === data.messageId) {
        setEditingMessage(null);
        setInputText(draftBeforeEditRef.current);
      }
    };
    const handleRead = (data) => {
      if (data.conversationId === conversationId && String(data.readerId) !== String(currentUser?._id)) {
        setMessages((previous) => applyReadReceipt(previous, data, currentUser?._id));
      }
    };
    const subscriptions = { connect: handleConnect, disconnect: handleDisconnect, connect_error: handleDisconnect,
      'message:new': handleNewMessage, 'conversation:updated': handleConversationUpdated,
      'typing:update': handleTyping, 'presence:update': handlePresence,
      'message:reaction_update': handleReaction, 'message:edited': handleEdited,
      'message:deleted': handleDeleted, 'message:read_status': handleRead };
    Object.entries(subscriptions).forEach(([event, handler]) => socket.on(event, handler));
    return () => {
      cancelled = true;
      clearTimeout(inboxReloadTimer.current);
      if (conversationId) leaveConversation(conversationId);
      Object.entries(subscriptions).forEach(([event, handler]) => socket.off(event, handler));
    };
  }, [conversationId, activeConversation?.otherParticipant?._id, currentUser?._id, loadConversations, scrollToBottom]);

  const handleInputChange = (event) => {
    const value = event.target.value;
    setInputText(value);
    if (!editingMessage) writeDraft(currentUser?._id, conversationId, value);
    if (!conversationId || !typingIndicators) return;
    if (Date.now() - lastTypingAtRef.current > 1500) {
      sendTypingStart(conversationId);
      lastTypingAtRef.current = Date.now();
    }
    clearTimeout(typingDebounceTimerRef.current);
    typingDebounceTimerRef.current = setTimeout(() => sendTypingStop(conversationId), 2000);
  };

  const handleSendMessage = async (event) => {
    event?.preventDefault();
    const text = inputText.trim();
    if (!text || text.length > MESSAGE_LIMIT || sendingRef.current || !conversationId || loadingMessages || threadError) return;
    const target = conversationId;
    const belongsToCurrent = () => currentConversationRef.current === target;
    clearTimeout(typingDebounceTimerRef.current);
    sendTypingStop(target);
    sendingRef.current = true;
    setSending(true);

    if (editingMessage) {
      const targetId = editingMessage._id;
      try {
        const data = await messageService.editMessage(targetId, text);
        if (belongsToCurrent()) {
          setMessages((previous) => previous.map((message) => message._id === targetId ? data.message : message));
          setSearchResults((previous) => previous.map((message) => message._id === targetId ? data.message : message));
          setEditingMessage(null);
          setInputText(draftBeforeEditRef.current);
        }
      } catch (error) { toast.error(error.response?.data?.message || 'Could not edit message. Please try again.'); }
      finally { sendingRef.current = false; setSending(false); if (belongsToCurrent()) inputRef.current?.focus(); }
      return;
    }

    const quote = replyingTo ? {
      messageId: replyingTo._id,
      senderName: replyingTo.sender?.name || replyingTo.sender?.username || 'User',
      text: replyingTo.text,
    } : null;
    const previousAttempt = retryPayloadRef.current;
    const clientMessageId = previousAttempt?.conversationId === target && previousAttempt.text === text && previousAttempt.replyId === quote?.messageId
      ? previousAttempt.id : (crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''));
    retryPayloadRef.current = { conversationId: target, text, replyId: quote?.messageId, id: clientMessageId };
    const temporaryId = `temp-${clientMessageId}`;
    const optimistic = { _id: temporaryId, clientMessageId, sender: currentUser, text, type: 'text', replyTo: quote,
      createdAt: new Date().toISOString(), isOptimistic: true, reactions: [] };
    setMessages((previous) => mergeMessages(previous, [optimistic]));
    setInputText('');
    setReplyingTo(null);
    writeDraft(currentUser?._id, target, '');
    setQuery('');
    requestAnimationFrame(() => scrollToBottom(false));
    try {
      const data = await messageService.sendMessage(target, { text, replyTo: quote, clientMessageId });
      retryPayloadRef.current = null;
      if (belongsToCurrent()) setMessages((previous) => mergeMessages(previous, [data.message]));
      loadConversations(true);
    } catch (error) {
      writeDraft(currentUser?._id, target, text);
      if (belongsToCurrent()) {
        setMessages((previous) => previous.filter((message) => message._id !== temporaryId));
        setInputText(text);
        setReplyingTo(replyingTo);
      }
      toast.error(error.apiFailure?.message || error.response?.data?.message || 'Message not confirmed. Your draft is saved; retry to confirm delivery.');
    } finally {
      sendingRef.current = false;
      setSending(false);
      if (belongsToCurrent()) inputRef.current?.focus();
    }
  };

  const handleStartReply = (message) => {
    if (editingMessage) setInputText(draftBeforeEditRef.current);
    setReplyingTo(message);
    setEditingMessage(null);
    setActiveActionMenuId(null);
    inputRef.current?.focus();
  };
  const handleStartEdit = (message) => {
    if (!canEditMessage(message)) { toast.error('Messages can be edited for 15 minutes after sending.'); return; }
    if (!editingMessage) draftBeforeEditRef.current = inputText;
    setEditingMessage(message);
    setReplyingTo(null);
    setInputText(message.text || '');
    setActiveActionMenuId(null);
    inputRef.current?.focus();
  };
  const handleCancelEdit = () => { setEditingMessage(null); setInputText(draftBeforeEditRef.current); };
  const handleCopyText = async (message) => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedMessageId(message._id);
      toast.success('Message copied');
    } catch { toast.error('Could not copy. Select the message text to copy it.'); }
    setActiveActionMenuId(null);
  };
  const handleDeleteConfirm = async (mode) => {
    if (!deleteTarget || deleting) return;
    const target = conversationId;
    const targetId = deleteTarget._id;
    setDeleting(true);
    try {
      await messageService.deleteMessage(targetId, mode);
      if (currentConversationRef.current === target) {
        const update = (previous) => applyMessageDeletion(previous, targetId, mode);
        setMessages(update);
        setSearchResults(previous => previous.filter(message => message._id !== targetId));
        setDeleteTarget(null);
        if (replyingTo?._id === targetId) setReplyingTo(null);
        if (editingMessage?._id === targetId) handleCancelEdit();
      }
      loadConversations(true);
    } catch (error) { toast.error(error.response?.data?.message || 'Could not delete message. Please try again.'); }
    finally { setDeleting(false); }
  };
  const handleToggleReaction = async (id, emoji) => {
    if (reactionPendingRef.current.has(id)) return;
    const target = conversationId;
    reactionPendingRef.current.add(id);
    setActiveActionMenuId(null);
    try {
      const data = await messageService.toggleReaction(id, emoji);
      if (currentConversationRef.current !== target) return;
      const update = (previous) => previous.map((message) => message._id === id ? data.message : message);
      setMessages(update);
      setSearchResults(update);
    } catch (error) { toast.error(error.response?.data?.message || 'Could not update reaction.'); }
    finally { reactionPendingRef.current.delete(id); }
  };
  const handleQuoteClick = (id) => {
    const element = document.getElementById(`msg-${id}`);
    if (!element) { toast('Load earlier messages to view this reply.'); return; }
    element.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    setHighlightedMessageId(id);
    setTimeout(() => setHighlightedMessageId(null), 1800);
  };

  const openNewChat = () => { setNewChatModalOpen(true); setUserSearchQuery(''); setSuggestedUsers([]); };
  useEffect(() => {
    if (!newChatModalOpen) return;
    let cancelled = false;
    setSearchingUsers(true);
    const timer = setTimeout(async () => {
      try {
        const users = await messageService.searchUsers(userSearchQuery.trim());
        if (!cancelled) setSuggestedUsers(users);
      } catch { if (!cancelled) { setSuggestedUsers([]); toast.error('Could not search members.'); } }
      finally { if (!cancelled) setSearchingUsers(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [newChatModalOpen, userSearchQuery]);

  const handleSelectUserToChat = async (user) => {
    setNewChatModalOpen(false);
    try {
      const data = await messageService.startConversation({ recipientId: user._id });
      loadConversations(true);
      navigate(`/messages/${data.conversation._id}`);
    } catch (error) { toast.error(error.response?.data?.message || 'Could not start conversation.'); }
  };

  // Filtered conversations list
  const filteredConversations = rankSearchResults(conversations, searchQuery, conversation => [
    conversation.otherParticipant?.name, conversation.otherParticipant?.username, conversation.lastMessageText,
  ]);

  const isSearchingHistory = Boolean(threadSearch.trim());
  const displayedMessages = isSearchingHistory ? searchResults : messages;
  const otherUser = activeConversation?.otherParticipant;
  const otherInitial = (otherUser?.name?.[0] || otherUser?.username?.[0] || 'U').toUpperCase();

  return (
    <div className="messages-layout-container">
      {      /* ===== LEFT PANE: INBOX LIST ===== */}
      <aside
        className={`messages-inbox-pane ${conversationId ? 'hidden-on-mobile' : ''}`}
        aria-label="Messages inbox"
      >
        <div className="inbox-header">
          <div className="inbox-header-title-box">
            <h2 className="inbox-username">Inbox</h2>
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

        {inboxError && <div className="chat-inline-error" role="alert">{inboxError}<button type="button" onClick={() => loadConversations()}>Retry</button></div>}

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
                  aria-current={isActive ? 'page' : undefined}
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
          {inboxPagination?.hasMore && <button type="button" className="chat-load-more" onClick={loadMoreConversations} disabled={loadingMoreChats}>
            {loadingMoreChats ? 'Loading…' : 'Load more conversations'}
          </button>}
        </div>
      </aside>

      {/* ===== RIGHT PANE: INDEPENDENT CONVERSATION SCROLL ===== */}
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

              <Link to={otherUser?.username ? `/@${otherUser.username}` : '/messages'} className="thread-user-link">
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
                    <strong>{otherUser?.name || otherUser?.username || 'Conversation'}</strong>
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
            {!connected && <div className="chat-connection-status" role="status">Reconnecting live updates. You can still send messages.</div>}
            {/* Message Stream */}
            <div
              ref={threadStreamRef}
              className="thread-stream"
              aria-label={isSearchingHistory ? 'Search results' : 'Messages'}
              aria-busy={loadingMessages || searchingMessages}
            >
              {isSearchingHistory ? <div className="chat-search-summary" role="status">
                {searchingMessages ? 'Searching…' : searchError || `${searchResults.length}${searchPagination?.hasMore ? '+' : ''} matching messages`}
                {searchPagination?.hasMore && <button type="button" className="chat-load-more" onClick={loadMoreSearchResults} disabled={searchingMessages}>Load more matches</button>}
              </div> : historyPagination?.hasMore && <button type="button" className="chat-load-more" onClick={loadOlderMessages} disabled={loadingHistory}>
                {loadingHistory ? 'Loading…' : 'Load earlier messages'}
              </button>}
              {threadError ? <div className="thread-stream-empty" role="alert"><p>{threadError}</p><Button onClick={loadThread}>Try again</Button></div> : loadingMessages ? (
                <div className="thread-stream-loading">
                  <Spinner size={32} />
                  <span>Loading messages...</span>
                </div>
              ) : displayedMessages.length === 0 && isSearchingHistory ? <div className="thread-stream-empty">{searchingMessages ? 'Searching messages…' : 'No matching messages'}</div> : displayedMessages.length === 0 ? (
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
                    Say hello or share a quiz to start the conversation.
                  </div>
                </div>
              ) : (
                displayedMessages.map((msg, index) => {
                  const isMine = String(msg.sender?._id || msg.sender) === String(currentUser?._id);
                  const isDeleted = msg.isDeleted;
                  const isHighlighted = highlightedMessageId === msg._id;
                  const isActionMenuOpen = activeActionMenuId === msg._id;

                  // Group by calendar date
                  const currentDateKey = getMessageDateKey(msg.createdAt);
                  const prevDateKey = index > 0 ? getMessageDateKey(displayedMessages[index - 1].createdAt) : null;
                  const showDateDivider = currentDateKey !== prevDateKey;

                  // Avatars for received messages
                  const showAvatar =
                    !isMine &&
                    (index === displayedMessages.length - 1 ||
                      String(displayedMessages[index + 1]?.sender?._id || displayedMessages[index + 1]?.sender) !== String(msg.sender?._id || msg.sender));

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
                          tabIndex={isDeleted ? undefined : 0}
                          aria-label={isDeleted ? undefined : `Message from ${isMine ? 'you' : msg.sender?.name || 'member'}`}
                          onKeyDown={(event) => { if (event.key === 'Escape') setActiveActionMenuId(null); }}
                          onMouseEnter={() => setHoveredMessageId(msg._id)}
                          onMouseLeave={() =>
                            setHoveredMessageId((currentId) =>
                              currentId === msg._id ? null : currentId
                            )
                          }
                        >
                          {/* Floating WhatsApp Action & Reaction Bar (Hover) */}
                          {!isDeleted && !msg.isOptimistic && (
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
                                    aria-label={`React with ${emoji}`}
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
                                  aria-label="Message options"
                                  aria-expanded={isActionMenuOpen}
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

                                    {isMine && canEditMessage(msg) && (
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
                                This message was deleted
                              </span>
                            ) : (
                              <span className="thread-msg-text">{msg.text}</span>
                            )}

                            {/* Timestamp, Edited badge & Receipt inside bubble */}
                            <div className="bubble-meta-row">
                              {msg.isEdited && <span className="edited-indicator">edited</span>}
                              <span className="bubble-time-text">{messageTimeFormat(msg.createdAt)}</span>
                              {isMine && !isDeleted && (
                                <span className="bubble-status-check" role="img" aria-label={msg.isOptimistic ? 'Sending' : msg.deliveryStatus === 'read' ? 'Read' : msg.deliveryStatus === 'delivered' ? 'Delivered' : 'Sent'}>
                                  {msg.isOptimistic || msg.deliveryStatus === 'sent' ? (
                                    <Check size={13} />
                                  ) : (
                                    <CheckCheck size={13} />
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
                <textarea
                  ref={inputRef}
                  rows={1}
                  aria-label={editingMessage ? 'Edit message' : 'Write a message'}
                  aria-describedby="chat-composer-hint"
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
                    if (e.key === 'Enter' && sendOnEnter && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                    if (e.key === 'Escape') {
                      if (editingMessage) handleCancelEdit();
                      if (replyingTo) setReplyingTo(null);
                    }
                  }}
                />
                <button
                  type="submit"
                  className="btn-send-message"
                  disabled={!inputText.trim() || sending || loadingMessages || Boolean(threadError)}
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
              <span className="sr-only" id="chat-composer-hint">
                {sendOnEnter ? 'Enter sends the message. Shift and Enter adds a new line.' : 'Enter adds a new line. Use the Send button to send.'}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ===== WHATSAPP DELETE CONFIRMATION MODAL ===== */}
      {deleteTarget && (
        <div className="modal-backdrop-shell" onClick={() => { if (!deleting) setDeleteTarget(null); }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="delete-message-title" className="whatsapp-delete-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-header">
              <h3 id="delete-message-title">Delete message?</h3>
              <p>You can delete this message for everyone or delete it just for yourself.</p>
            </div>

            <div className="delete-modal-actions">
              {String(deleteTarget.sender?._id || deleteTarget.sender) === String(currentUser?._id) && (
                <button
                  type="button"
                  className="btn-delete-option btn-delete-everyone"
                  onClick={() => handleDeleteConfirm('everyone')}
                  disabled={deleting}
                >
                  Delete for everyone
                </button>
              )}

              <button
                type="button"
                className="btn-delete-option btn-delete-me"
                onClick={() => handleDeleteConfirm('me')}
                disabled={deleting}
              >
                Delete for me
              </button>

              <button
                type="button"
                className="btn-delete-option btn-delete-cancel"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
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
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="new-message-title" className="new-chat-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="new-chat-modal-header">
              <h3 id="new-message-title">New message</h3>
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
                onChange={(e) => setUserSearchQuery(e.target.value)}
                maxLength={100}
                aria-label="Search members"
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
