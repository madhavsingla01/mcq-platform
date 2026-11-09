import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Send,
  Check,
  Copy,
  Users,
  Link2,
} from 'lucide-react';
import api from '../../api/axios';
import { toast } from 'sonner';
import { useAuthStore } from '../../store/authStore';
import { Spinner } from '../ui';
import './ShareModal.css';

export default function ShareModal({ isOpen, onClose, quiz, comment = null, profile = null }) {
  const { isAuthenticated, user } = useAuthStore();
  const [contacts, setContacts] = useState([]);
  const [frequent, setFrequent] = useState([]);
  const [loading, setLoading] = useState(false);
  const [contactsError, setContactsError] = useState('');
  const [contactsOwner, setContactsOwner] = useState(null);
  const [reloadContacts, setReloadContacts] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [customMessage, setCustomMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const searchInputRef = useRef(null);

  const isComment = Boolean(comment);
  const quizId = typeof quiz === 'string'
    ? quiz
    : (quiz?._id || quiz?.id || comment?.quiz?._id || comment?.quiz?.id || (typeof comment?.quiz === 'string' ? comment.quiz : null));
  const quizTitle = quiz?.title || 'Shared quiz';
  const commentAuthor = comment?.author?.name || comment?.author?.username || 'user';
  const effectiveTitle = profile?.title || (isComment ? `Comment by @${commentAuthor}` : quizTitle);

  const challengeUrl = profile?.url || (quizId && typeof window !== 'undefined'
    ? (isComment
        ? `${window.location.origin}/quiz/${quizId}#comment-${comment._id}`
        : `${window.location.origin}/${quiz?.isChallenge ? 'challenges' : 'quiz'}/${quizId}${quiz?.isChallenge ? '/take' : ''}`)
    : '');

  const shareText = profile ? `${profile.title} on QuizFocus` : isComment
    ? `Check out @${commentAuthor}'s comment on QuizFocus: "${comment.body?.slice(0, 100)}..."`
    : `Check out this quiz: "${quizTitle}" on QuizFocus!`;

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll and compensate for scrollbar width
  useEffect(() => {
    if (!isOpen) return;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [isOpen]);

  // Account-specific contacts; failed requests never invent recipients.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setContacts([]); setFrequent([]); setSelectedContacts([]);
    setContactsOwner(user?._id || null); setContactsError('');
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    api.get('/social/share-contacts').then(({ data }) => {
      if (cancelled) return;
      setFrequent(data.data?.frequentlyConnected || []);
      setContacts(data.data?.contacts || []);
    }).catch(() => {
      if (!cancelled) setContactsError('Could not load connections.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, isAuthenticated, user?._id, reloadContacts]);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    if (!challengeUrl) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(challengeUrl);
      } else {
        const input = document.createElement('input');
        input.value = challengeUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      // Record share stat
      if (isAuthenticated && quizId) {
        api.post(`/social/quizzes/${quizId}/share`, { channel: 'copy_link' }).catch(() => {});
      }
    } catch {
      prompt('Copy link:', challengeUrl);
    }
  };

  const handleToggleContact = (contact) => {
    setSelectedContacts((prev) => {
      const exists = prev.some((c) => c._id === contact._id);
      if (exists) {
        return prev.filter((c) => c._id !== contact._id);
      } else {
        return [...prev, contact];
      }
    });
  };

  const handleSendToSelected = async () => {
    if (selectedContacts.length === 0 || isSending) return;
    const targets = [...selectedContacts];
    const msg = customMessage.trim();

    setIsSending(true);

    try {
      const results = await Promise.allSettled(targets.map(contact => api.post('/messages/start', {
        recipientId: contact._id, initialMessage: msg || shareText,
        ...(profile ? { link: challengeUrl } : { quizId, ...(isComment ? { commentId: comment._id } : {}) }),
      })));
      const failed = targets.filter((_, index) => results[index].status === 'rejected');
      const sent = targets.length - failed.length;
      setSelectedContacts(failed);
      if (sent) toast.success(sent === 1 ? 'Shared with 1 connection' : 'Shared with ' + sent + ' connections');
      if (failed.length) toast.error('Could not send to ' + failed.length + ' connection(s). Check their messaging permissions and retry.');
      else { setCustomMessage(''); onClose(); }

    } finally {
      setIsSending(false);
    }
  };

  const ownContacts = contactsOwner === user?._id ? contacts : [];
  const filteredContacts = ownContacts.filter(contact => {
    const query = searchQuery.toLowerCase().trim();
    return !query || [contact.name, contact.username].some(value => value?.toLowerCase().includes(query));
  });
  const displayFrequent = contactsOwner === user?._id ? frequent : [];

  const modalContent = (
    <div className="share-modal-overlay" onClick={onClose}>
      <div
        className="share-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
      >
        {/* ── Modal Header (Screenshot: Orange Send icon box + Title + Close X) ── */}
        <div className="share-dialog-header">
          <div className="share-dialog-header-left">
            <div className="share-header-icon-box">
              <Send size={18} color="#FFFFFF" strokeWidth={2.4} />
            </div>
            <div className="share-header-meta">
              <h3 id="share-modal-title" className="share-dialog-title">
                {profile ? 'Share profile' : isComment ? 'Share Comment' : 'Share Quiz'}
              </h3>
              <p className="share-dialog-subtitle" title={effectiveTitle}>
                {effectiveTitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="share-dialog-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── SHARE LINK Section (Screenshot: Label + Input + Copy link button + Social row) ── */}
        <div className="share-link-block">
          <span className="share-link-label">SHARE LINK</span>

          <div className="share-link-input-row">
            <div className="share-link-box">
              <Link2 size={16} className="share-link-box-icon" />
              <input
                type="text"
                readOnly
                value={challengeUrl}
                className="share-link-native-input"
                onClick={(e) => e.target.select()}
                spellCheck="false"
              />
            </div>

            <button
              type="button"
              className={`share-pill-copy-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopyLink}
              disabled={!challengeUrl}
            >
              {copied ? (
                <>
                  <Check size={14} strokeWidth={2.8} />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copy link</span>
                </>
              )}
            </button>
          </div>

          {/* Social Platforms Row (Screenshot: WhatsApp, @ X, Telegram, LinkedIn, Reddit) */}
          <div className="share-social-row">
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText} ${challengeUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="social-pill-link"
            >
              <span className="social-pill-dot" />
              <span>WhatsApp</span>
            </a>

            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(challengeUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="social-pill-link"
            >
              <span className="social-pill-symbol">@</span>
              <span>X</span>
            </a>

            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(challengeUrl)}&text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="social-pill-link"
            >
              <Send size={11} className="social-pill-icon" />
              <span>Telegram</span>
            </a>

            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(challengeUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="social-pill-link"
            >
              <span className="social-pill-dot linkedin" />
              <span>LinkedIn</span>
            </a>

            <a
              href={`https://www.reddit.com/submit?url=${encodeURIComponent(challengeUrl)}&title=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="social-pill-link"
            >
              <span className="social-pill-dot reddit" />
              <span>Reddit</span>
            </a>
          </div>
        </div>

        {/* ── Two-Column Layout (Screenshot: Connections on left, Message preview on right) ── */}
        <div className="share-panels-grid">
          {/* ── LEFT COLUMN: Connections ── */}
          <div className="share-connections-col">
            <div className="col-header-row">
              <h4 className="col-title">Connections</h4>
              <span className="col-count-text">
                {selectedContacts.length} selected
              </span>
            </div>

            {/* Pill Search Input */}
            <div className="connections-search-capsule consistent-search-field">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="connections-search-input consistent-search-input"
                aria-label="Search connections"
              />
            </div>

            {/* Frequently Connected Avatars Horizontal Strip */}
            {!searchQuery && (
              <div className="frequent-strip">
                {displayFrequent.map((contact) => {
                  const isSelected = selectedContacts.some((c) => c._id === contact._id);
                  const initial = (contact.name?.[0] || contact.username?.[0] || 'U').toUpperCase();

                  return (
                    <button
                      key={contact._id}
                      type="button"
                      className={`frequent-circle-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleToggleContact(contact)}
                      title={`@${contact.username || contact.name}`}
                    >
                      <div className="frequent-avatar-circle">
                        {contact.avatar ? (
                          <img src={contact.avatar} alt={contact.username} className="frequent-avatar-img" />
                        ) : (
                          <span>{initial}</span>
                        )}
                      </div>
                      <span className="frequent-handle">{contact.username || contact.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Vertical Connections List */}
            <div className="connections-list-scroll custom-scrollbar">
              {loading && <div role="status"><Spinner size="sm" /> Loading connections…</div>}
              {contactsError && <p role="alert">{contactsError} <button type="button" onClick={() => setReloadContacts(n => n + 1)}>Retry</button></p>}
              {!loading && !contactsError && filteredContacts.length === 0 && <p>{!isAuthenticated ? 'Sign in to share with connections.' : searchQuery ? 'No matching connections.' : 'Your connections will appear here. You can still copy the link.'}</p>}
              {filteredContacts.map((contact) => {
                const isSelected = selectedContacts.some((c) => c._id === contact._id);
                const initial = (contact.name?.[0] || contact.username?.[0] || 'U').toUpperCase();

                return (
                  <div
                    key={contact._id}
                    role="checkbox"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleToggleContact(contact); } }}
                    className={`connection-row-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleToggleContact(contact)}
                  >
                    <div className="connection-row-avatar">
                      {contact.avatar ? (
                        <img src={contact.avatar} alt={contact.username} className="connection-row-img" />
                      ) : (
                        <span>{initial}</span>
                      )}
                    </div>

                    <div className="connection-row-info">
                      <h5 className="connection-display-name">{contact.name || contact.username}</h5>
                      <p className="connection-handle-name">@{contact.username}</p>
                    </div>

                    <div className={`connection-row-check ${isSelected ? 'checked' : ''}`}>
                      {isSelected ? (
                        <Check size={12} strokeWidth={3} />
                      ) : (
                        <span className="connection-plus-symbol">+</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT COLUMN: Message preview ── */}
          <div className="share-preview-col">
            <div className="col-header-row">
              <h4 className="col-title">Message preview</h4>
            </div>

            {/* Quiz Preview Box with Textarea */}
            <div className="quiz-preview-card">
              <div className="preview-quiz-top">
                <div className="preview-quiz-texts">
                  <h5 className="preview-quiz-name">{effectiveTitle}</h5>
                </div>
              </div>

              <textarea
                className="preview-quiz-textarea"
                placeholder="Try this quiz and challenge me..."
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={3}
                maxLength={2000}
                aria-label="Optional message"
              />

              <span className="preview-hint-note">Your message is optional.</span>
            </div>

            {/* Bottom Recipient Action Card (Dark Warm Box) */}
            <div className="recipient-action-box">
              <div className="action-box-info-row">
                <div className="action-box-users-icon">
                  <Users size={18} color="#FF4500" />
                </div>
                <div className="action-box-texts">
                  <h5 className="action-count-title">
                    {selectedContacts.length} {selectedContacts.length === 1 ? 'recipient' : 'recipients'}
                  </h5>
                  <p className="action-status-desc">
                    {selectedContacts.length === 0
                      ? 'Select connections from the left'
                      : 'Ready to receive your invitation'}
                  </p>
                </div>
              </div>

              <div className="action-box-buttons-row">
                <button
                  type="button"
                  className="action-btn-clear-all"
                  onClick={() => {
                    setSelectedContacts([]);
                    setCustomMessage('');
                  }}
                  disabled={selectedContacts.length === 0}
                >
                  Clear all
                </button>

                <button
                  type="button"
                  className="action-btn-send-main"
                  onClick={handleSendToSelected}
                  disabled={selectedContacts.length === 0 || isSending || !challengeUrl || !isAuthenticated}
                >
                  {isSending ? (
                    <Spinner size={14} />
                  ) : sendSuccess ? (
                    <>
                      <Check size={14} strokeWidth={2.8} />
                      <span>Sent!</span>
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      <span>Send ({selectedContacts.length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
