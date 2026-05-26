import React, { useMemo, useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileCheck,
  Link as LinkIcon,
  MessageCircle,
  Paperclip,
  QrCode,
  RotateCcw,
  Share2,
  Users,
  X,
} from 'lucide-react';
import {
  defaultManualExpiryValue,
  fromDatetimeLocalValue,
  mergeShareSettings,
  shareSettingOptions,
  toDatetimeLocalValue,
} from '../../utils/shareSettings';
import api from '../../api/axios';

export default function ShareSettingsModal({
  shareCode,
  initialSettings,
  onSave,
  onRegenerate,
  onClose,
}) {
  const [settings, setSettings] = useState(() => mergeShareSettings(initialSettings));
  const [expiryLocal, setExpiryLocal] = useState(() => (
    toDatetimeLocalValue(initialSettings?.expiresAt) || defaultManualExpiryValue()
  ));
  const [inviteeInput, setInviteeInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!inviteeInput.trim()) {
        setSuggestions([]);
        return;
      }
      try {
        const { data } = await api.get(`/auth/users/search?q=${inviteeInput}`);
        setSuggestions(data.data || []);
      } catch (err) {
        setSuggestions([]);
      }
    };
    
    const timeoutId = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [inviteeInput]);

  const shareUrl = useMemo(() => `${window.location.origin}/session/${shareCode}`, [shareCode]);

  const buildPayload = () => ({
    ...settings,
    expiresAt: settings.lifetime === 'manual' ? fromDatetimeLocalValue(expiryLocal) : null,
  });

  const handleChange = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'lifetime' && value === 'manual' && !expiryLocal
        ? { expiresAt: fromDatetimeLocalValue(defaultManualExpiryValue()) }
        : {}),
    }));

    if (key === 'lifetime' && value === 'manual' && !expiryLocal) {
      setExpiryLocal(defaultManualExpiryValue());
    }
  };

  const saveSettings = async (nextStatus = 'Settings saved') => {
    setIsSaving(true);
    setStatus('');
    try {
      const data = await onSave(buildPayload());
      setStatus(nextStatus);
      return data;
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  const handleCopyLink = async () => {
    try {
      await saveSettings('Settings saved and link copied');
      await copyToClipboard();
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      setStatus(err.response?.data?.message || 'Failed to save settings');
    }
  };

  const handleSaveSettings = async () => {
    try {
      await saveSettings();
    } catch (err) {
      setStatus(err.response?.data?.message || 'Failed to save settings');
    }
  };

  const handleOpenNewTab = async () => {
    try {
      await saveSettings('Settings saved');
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setStatus(err.response?.data?.message || 'Failed to open link');
    }
  };

  const handleRegenerate = async () => {
    if (!onRegenerate) return;

    setIsSaving(true);
    setStatus('');
    try {
      await onSave(buildPayload());
      await onRegenerate();
      setCopied(false);
      setStatus('New link generated');
    } catch (err) {
      setStatus(err.response?.data?.message || 'Failed to generate a new link');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddInvitee = (usernameOverride = null) => {
    const value = (typeof usernameOverride === 'string' ? usernameOverride : inviteeInput).trim().toLowerCase();
    if (!value) return;

    setSettings((prev) => ({
      ...prev,
      invitees: [...new Set([...(prev.invitees || []), value])],
    }));
    setInviteeInput('');
    setShowSuggestions(false);
  };

  const handleRemoveInvitee = (invitee) => {
    setSettings((prev) => ({
      ...prev,
      invitees: (prev.invitees || []).filter((item) => item !== invitee),
    }));
  };

  return (
    <>
      <div className="share-panel-overlay" onClick={onClose} />
      <section
        className="share-panel custom-scrollbar"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-panel-title"
      >
        <header className="share-panel-header">
          <div>
            <div className="share-panel-kicker">
              <Share2 size={15} />
              Share link settings
            </div>
            <h2 id="share-panel-title">Choose what end users can do</h2>
          </div>
          <button className="share-panel-close" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="share-panel-body">
          <SettingSection
            icon={<LinkIcon size={16} />}
            title="When creator shares quiz, what type of link should it be?"
            options={shareSettingOptions.linkType}
            value={settings.linkType}
            onChange={(value) => handleChange('linkType', value)}
          />

          {settings.linkType === 'invite_only' ? (
            <div className="invite-box">
              <label>Invited user IDs</label>
              <div className="invite-input-row" style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={inviteeInput}
                  placeholder="username, email, or user id"
                  onChange={(event) => {
                    setInviteeInput(event.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddInvitee();
                    }
                  }}
                />
                <button type="button" onClick={() => handleAddInvitee()}>Add</button>
                
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="suggestions-dropdown">
                    {suggestions.map(u => (
                      <li key={u._id} onClick={() => handleAddInvitee(u.username)}>
                        {u.avatar ? <img src={u.avatar} alt="avatar" /> : <div className="avatar-placeholder">{u.username.charAt(0).toUpperCase()}</div>}
                        <div className="suggestion-info">
                          <span className="suggestion-name">{u.name}</span>
                          <span className="suggestion-username">@{u.username}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {(settings.invitees || []).length > 0 ? (
                <div className="invite-list">
                  {settings.invitees.map((invitee) => (
                    <span key={invitee} className="invite-chip">
                      {invitee}
                      <button type="button" onClick={() => handleRemoveInvitee(invitee)} aria-label={`Remove ${invitee}`}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <SettingSection
            icon={<Clock size={16} />}
            title="Session lifetime"
            options={shareSettingOptions.lifetime}
            value={settings.lifetime}
            onChange={(value) => handleChange('lifetime', value)}
          />

          {settings.lifetime === 'manual' ? (
            <div className="manual-expiry">
              <label htmlFor="share-expiry">Expiry date and time</label>
              <input
                id="share-expiry"
                type="datetime-local"
                value={expiryLocal}
                onChange={(event) => setExpiryLocal(event.target.value)}
              />
            </div>
          ) : null}

          <SettingSection
            icon={<Users size={16} />}
            title="Participant visibility"
            options={shareSettingOptions.participantVisibility}
            value={settings.participantVisibility}
            onChange={(value) => handleChange('participantVisibility', value)}
          />

          <SettingSection
            icon={<MessageCircle size={16} />}
            title="Chat settings"
            options={shareSettingOptions.chatSettings}
            value={settings.chatSettings}
            onChange={(value) => handleChange('chatSettings', value)}
          />

          <SettingSection
            icon={<Paperclip size={16} />}
            title="File sharing in chat"
            options={shareSettingOptions.chatFileSharing}
            value={settings.chatFileSharing}
            onChange={(value) => handleChange('chatFileSharing', value)}
          />

          <SettingSection
            icon={<FileCheck size={16} />}
            title="Quiz access after submission"
            options={shareSettingOptions.postSubmissionAccess}
            value={settings.postSubmissionAccess}
            onChange={(value) => handleChange('postSubmissionAccess', value)}
          />
        </div>

        <footer className="share-panel-footer">
          <label className="share-link-preview">
            <span>Share link</span>
            <input type="text" value={shareUrl} readOnly />
          </label>

          {status ? <div className="share-status">{status}</div> : null}

          <div className="share-actions" aria-label="Share link features">
            <button type="button" className="share-action secondary" onClick={handleSaveSettings} disabled={isSaving}>
              <CheckCircle2 size={16} />
              Save settings
            </button>
            <button type="button" className="share-action primary" onClick={handleCopyLink} disabled={isSaving}>
              {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button type="button" className="share-action secondary" onClick={handleOpenNewTab} disabled={isSaving}>
              <ExternalLink size={16} />
              Open in new tab
            </button>
            <button type="button" className="share-action secondary" onClick={handleRegenerate} disabled={isSaving || !onRegenerate}>
              <RotateCcw size={16} />
              Generate new link
            </button>
            <button type="button" className="share-action disabled" disabled title="QR code later">
              <QrCode size={16} />
              QR code later
            </button>
          </div>
        </footer>
      </section>

      <style>{shareSettingsStyles}</style>
    </>
  );
}

function SettingSection({ icon, title, options, value, onChange }) {
  return (
    <section className="share-setting-section">
      <div className="share-setting-title">
        {icon}
        <h3>{title}</h3>
      </div>
      <div className="share-option-grid">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`share-option ${value === option.key ? 'selected' : ''}`}
            onClick={() => onChange(option.key)}
          >
            <span className="share-option-letter">{option.letter}</span>
            <span className="share-option-copy">
              <strong>{option.title}</strong>
              <span>{option.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

const shareSettingsStyles = `
  .share-panel-overlay {
    position: fixed;
    inset: 0;
    background: rgba(24, 24, 27, 0.38);
    z-index: 1000;
    backdrop-filter: blur(3px);
  }

  .share-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(760px, calc(100vw - 24px));
    max-height: min(88vh, 820px);
    overflow-y: auto;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    z-index: 1001;
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.18);
  }

  .share-panel-header {
    position: sticky;
    top: 0;
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(12px);
    z-index: 1;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 22px;
    border-bottom: 1px solid var(--color-border-light);
  }

  .share-panel-kicker {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
  }

  .share-panel-header h2 {
    font-size: 22px;
    line-height: 1.2;
    font-weight: 800;
    color: var(--color-text);
    letter-spacing: 0;
  }

  .share-panel-close {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .share-panel-body {
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .share-setting-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .share-setting-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-text);
  }

  .share-setting-title h3 {
    font-size: 14px;
    line-height: 1.35;
    font-weight: 750;
    letter-spacing: 0;
  }

  .share-option-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .share-option {
    min-height: 82px;
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 10px;
    align-items: start;
    text-align: left;
    padding: 12px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  }

  .share-option:hover {
    border-color: var(--color-primary);
  }

  .share-option.selected {
    border-color: var(--color-primary);
    background: rgba(79, 70, 229, 0.05);
    box-shadow: inset 0 0 0 1px rgba(79, 70, 229, 0.12);
  }

  .share-option-letter {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border-light);
    color: var(--color-text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 800;
  }

  .share-option.selected .share-option-letter {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .share-option-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .share-option-copy strong {
    font-size: 13px;
    line-height: 1.28;
    font-weight: 750;
    overflow-wrap: anywhere;
  }

  .share-option-copy span {
    font-size: 12px;
    line-height: 1.35;
    color: var(--color-text-secondary);
    overflow-wrap: anywhere;
  }

  .invite-box,
  .manual-expiry {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px dashed var(--color-border);
    border-radius: 8px;
    background: var(--color-surface-alt);
  }

  .invite-box label,
  .manual-expiry label,
  .share-link-preview span {
    font-size: 12px;
    font-weight: 750;
    color: var(--color-text-secondary);
  }

  .invite-input-row {
    display: flex;
    gap: 8px;
  }

  .invite-input-row input,
  .manual-expiry input,
  .share-link-preview input {
    width: 100%;
    min-width: 0;
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 13px;
    outline: none;
  }

  .invite-input-row button {
    height: 40px;
    padding: 0 14px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .suggestions-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 80px;
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    margin-top: 4px;
    z-index: 10;
    list-style: none;
    padding: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    max-height: 200px;
    overflow-y: auto;
  }

  .suggestions-dropdown li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .suggestions-dropdown li:hover {
    background-color: var(--color-surface);
  }

  .suggestions-dropdown img, .avatar-placeholder {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
  }

  .avatar-placeholder {
    background: var(--color-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 12px;
  }

  .suggestion-info {
    display: flex;
    flex-direction: column;
  }

  .suggestion-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text);
  }

  .suggestion-username {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .invite-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .invite-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 5px 8px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    font-size: 12px;
    font-weight: 650;
    color: var(--color-text);
    overflow-wrap: anywhere;
  }

  .invite-chip button {
    display: inline-flex;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
  }

  .share-panel-footer {
    position: sticky;
    bottom: 0;
    background: rgba(250, 250, 250, 0.98);
    backdrop-filter: blur(12px);
    border-top: 1px solid var(--color-border);
    padding: 16px 22px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .share-link-preview {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .share-status {
    min-height: 18px;
    font-size: 12px;
    font-weight: 700;
    color: var(--color-primary);
  }

  .share-actions {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }

  .share-action {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 8px 10px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.2;
    font-weight: 750;
    cursor: pointer;
    background: var(--color-surface);
    color: var(--color-text);
  }

  .share-action.primary {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: white;
  }

  .share-action.secondary:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .share-action:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .share-action.disabled {
    background: var(--color-surface-alt);
    color: var(--color-text-muted);
  }

  @media (max-width: 760px) {
    .share-panel {
      width: calc(100vw - 16px);
      max-height: calc(100vh - 16px);
    }

    .share-option-grid {
      grid-template-columns: 1fr;
    }

    .share-actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 420px) {
    .share-panel-header,
    .share-panel-body,
    .share-panel-footer {
      padding-left: 14px;
      padding-right: 14px;
    }

    .share-actions {
      grid-template-columns: 1fr;
    }

    .invite-input-row {
      flex-direction: column;
    }
  }
`;
