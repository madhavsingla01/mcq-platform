import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Shield, KeyRound, MessageSquare, Monitor, LogOut, Smartphone, Tablet, Info, X,
  Globe2, Clock3,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../../store/authStore';
import { isProfilePrivate, profilePrivacyUpdate } from '../../../utils/profilePrivacy';
import { SettingsSection, SettingsRow, SettingsToggle, SettingsSelect } from './SettingsSection';

const describeLocation = (location) => {
  if (!location) return 'Location not shared';
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const accuracy = Number(location.accuracy);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) {
    return 'Location unavailable';
  }
  const capturedAt = location.capturedAt
    ? ` shared ${new Date(location.capturedAt).toLocaleString()}`
    : ' shared';
  return `Location${capturedAt}: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${Math.round(accuracy)} m)`;
};

export function PrivacySettings() {
  const { user, updateProfile, revokeOtherSessions, getSessions, revokeSession } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [revokeAllDialogOpen, setRevokeAllDialogOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState('');
  const [revokingSessionId, setRevokingSessionId] = useState('');
  const [sessionToRevoke, setSessionToRevoke] = useState('');
  const [sessionRevokePassword, setSessionRevokePassword] = useState('');
  const [detailsSessionId, setDetailsSessionId] = useState('');
  const sessionRevokeInputRef = useRef(null);
  const sessionRevokeDialogRef = useRef(null);
  const sessionRevokeTriggerRef = useRef(null);
  const revokeAllInputRef = useRef(null);
  const revokeAllDialogRef = useRef(null);
  const revokeAllTriggerRef = useRef(null);
  const sessionDetailsDialogRef = useRef(null);
  const sessionDetailsTriggerRef = useRef(null);
  const revokingSessionIdRef = useRef('');
  const savingRef = useRef(false);
  revokingSessionIdRef.current = revokingSessionId;
  savingRef.current = saving;
  const sessionIdsRef = useRef(null);
  const sessionPollErrorRef = useRef('');
  const preferences = user?.preferences || {};

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    const loadSessions = async () => {
      if (!active || requestInFlight || document.visibilityState === 'hidden') return;
      requestInFlight = true;
      try {
        const activeSessions = await getSessions();
        if (!active) return;
        setDetailsSessionId((current) => current && !activeSessions.some((session, index) =>
          (session.sessionId || `legacy-${index}`) === current
        ) ? '' : current);
        const sessionIds = new Set(activeSessions.map((session) => session.sessionId).filter(Boolean));
        if (sessionIdsRef.current) {
          const newlySignedIn = activeSessions.filter((session) =>
            session.sessionId && !session.isCurrent && !sessionIdsRef.current.has(session.sessionId)
          );
          newlySignedIn.forEach((session) => toast.info(`New sign-in detected: ${session.device}`));
        }
        sessionIdsRef.current = sessionIds;
        setSessions(activeSessions);
        setSessionsError('');
        sessionPollErrorRef.current = '';
      } catch (error) {
        if (!active) return;
        const message = error.response?.data?.message || 'Could not update active sessions';
        setSessionsError(message);
        if (sessionPollErrorRef.current !== message) toast.error(message);
        sessionPollErrorRef.current = message;
      } finally {
        requestInFlight = false;
        if (active) setSessionsLoading(false);
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void loadSessions();
    };
    void loadSessions();
    const intervalId = window.setInterval(loadSessions, 3000);
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [getSessions]);

  useEffect(() => {
    if (!sessionToRevoke) return undefined;
    sessionRevokeInputRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !revokingSessionIdRef.current) {
        setSessionToRevoke('');
        setSessionRevokePassword('');
      } else if (event.key === 'Tab') {
        const focusable = sessionRevokeDialogRef.current?.querySelectorAll(
          'input:not(:disabled), button:not(:disabled)'
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      sessionRevokeTriggerRef.current?.focus();
    };
  }, [sessionToRevoke]);

  useEffect(() => {
    if (!revokeAllDialogOpen) return undefined;
    revokeAllInputRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !savingRef.current) {
        setRevokeAllDialogOpen(false);
        setCurrentPassword('');
      } else if (event.key === 'Tab') {
        const focusable = revokeAllDialogRef.current?.querySelectorAll(
          'input:not(:disabled), button:not(:disabled)'
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      revokeAllTriggerRef.current?.focus();
    };
  }, [revokeAllDialogOpen]);

  useEffect(() => {
    if (!detailsSessionId) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sessionDetailsDialogRef.current?.querySelector('button')?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setDetailsSessionId('');
      } else if (event.key === 'Tab') {
        const focusable = sessionDetailsDialogRef.current?.querySelectorAll(
          'button:not(:disabled), summary, a[href], input:not(:disabled)'
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      sessionDetailsTriggerRef.current?.focus();
    };
  }, [detailsSessionId]);

  const update = async (payload) => {
    setSaving(true);
    try {
      await updateProfile(payload);
      toast.success('Privacy settings saved');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save privacy settings');
    } finally { setSaving(false); }
  };

  const revoke = async (event) => {
    event.preventDefault();
    if (!currentPassword || saving) return;
    setSaving(true);
    try {
      await revokeOtherSessions(currentPassword);
      setCurrentPassword('');
      setRevokeAllDialogOpen(false);
      toast.success('Other sessions signed out');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not sign out other sessions');
    } finally { setSaving(false); }
  };

  const revokeDeviceSession = async (session) => {
    if (!session.sessionId || session.isCurrent || revokingSessionId || !sessionRevokePassword) return;
    setRevokingSessionId(session.sessionId);
    try {
      await revokeSession(session.sessionId, sessionRevokePassword);
      setSessions((current) => current.filter((entry) => entry.sessionId !== session.sessionId));
      setSessionToRevoke('');
      setSessionRevokePassword('');
      toast.success(`${session.device} signed out`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not sign out this session');
    } finally {
      setRevokingSessionId('');
    }
  };

  const closeSessionRevokeDialog = () => {
    if (revokingSessionId) return;
    setSessionToRevoke('');
    setSessionRevokePassword('');
  };
  const closeRevokeAllDialog = () => {
    if (saving) return;
    setRevokeAllDialogOpen(false);
    setCurrentPassword('');
  };
  const selectedSession = sessions.find((session) => session.sessionId === sessionToRevoke);
  const detailsSession = sessions.find((session, index) =>
    (session.sessionId || `legacy-${index}`) === detailsSessionId
  );

  return (
    <div className="settings-tab-panel">
      <div className="settings-panel-hero"><h2 className="settings-panel-title">Privacy &amp; Security</h2></div>
      <SettingsSection title="Account visibility" icon={Shield}>
        <SettingsRow title="Private account" description="Restrict your public profile. Quiz visibility is set separately on each quiz.">
          <SettingsToggle checked={isProfilePrivate(user)} disabled={saving}
            onChange={(value) => update(profilePrivacyUpdate(value))} />
        </SettingsRow>
        <SettingsRow title="Appear in member search" description="Control whether people can find your account through search.">
          <SettingsToggle checked={preferences.searchDiscovery !== false} disabled={saving}
            onChange={(value) => update({ preferences: { searchDiscovery: value } })} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Direct messages" icon={MessageSquare}>
        <SettingsRow title="Who can message you">
          <SettingsSelect value={preferences.allowMessagesFrom || 'everyone'} disabled={saving}
            onChange={(value) => update({ preferences: { allowMessagesFrom: value } })}
            options={[
              { value: 'everyone', label: 'Everyone' },
              { value: 'followers', label: 'Followers' },
              { value: 'following', label: 'People you follow' },
              { value: 'none', label: 'No one' },
            ]} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Session security" icon={KeyRound}>
        <SettingsRow title="Two-factor authentication"><span className="settings-badge-pill">Not available yet</span></SettingsRow>
        <p className="settings-supporting-note">Your password protects sign-in. Two-factor authentication has not been configured for this application.</p>
        <div className="settings-active-sessions">
          <div className="settings-active-sessions-heading">
            <div>
              <h3>Active sessions</h3>
              <p className="settings-supporting-note">Devices currently signed in to your account.</p>
            </div>
          </div>
          {sessionsLoading ? (
            <p className="settings-supporting-note">Loading sessions…</p>
          ) : sessions.length ? (
            <>
              {sessionsError && <p className="settings-supporting-note" role="alert">{sessionsError}</p>}
              <ul className="settings-session-list">
                {sessions.map((session, index) => (
                  <li className="settings-session-item" key={session.sessionId || `legacy-${index}`}>
                    <div className="settings-session-card">
                      <div className="settings-session-card-heading">
                        <button
                          type="button"
                          className="settings-session-summary"
                          aria-haspopup="dialog"
                          onClick={(event) => {
                            sessionDetailsTriggerRef.current = event.currentTarget;
                            setDetailsSessionId(session.sessionId || `legacy-${index}`);
                          }}
                        >
                          {session.deviceType === 'Mobile' ? (
                            <Smartphone size={20} className="settings-session-device-icon" aria-hidden="true" />
                          ) : session.deviceType === 'Tablet' ? (
                            <Tablet size={20} className="settings-session-device-icon" aria-hidden="true" />
                          ) : (
                            <Monitor size={20} className="settings-session-device-icon" aria-hidden="true" />
                          )}
                          <span className="settings-session-summary-copy">
                            <span className="settings-session-device">
                              <strong>{session.device}</strong>
                              {session.isCurrent && <span className="settings-badge-pill">This device</span>}
                            </span>
                            <span className="settings-session-last-active">
                              Last active {session.lastActiveAt ? new Date(session.lastActiveAt).toLocaleString() : 'Unknown'}
                            </span>
                          </span>
                          <Info size={17} className="settings-session-info" aria-hidden="true" />
                        </button>
                        {!session.isCurrent && (
                          <div className="settings-session-actions">
                            <button type="button" className="settings-session-revoke"
                              onClick={(event) => {
                                sessionRevokeTriggerRef.current = event.currentTarget;
                                setSessionRevokePassword('');
                                setSessionToRevoke(session.sessionId);
                              }}
                              disabled={saving || Boolean(revokingSessionId) || !session.sessionId}>
                              <LogOut size={14} />
                              Sign out
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : sessionsError ? (
            <p className="settings-supporting-note" role="alert">{sessionsError}</p>
          ) : (
            <p className="settings-supporting-note">No active sessions found.</p>
          )}
          <p className="settings-supporting-note">
            Device, IP, language, and time-zone details are recorded for security. Precise location is not requested.
          </p>
        </div>
        <div className="settings-session-revoke-all">
          <div className="settings-session-revoke-all-copy">
            <h4>Sign out other sessions</h4>
            <p>Confirm your password to revoke older sign-ins. This browser stays signed in.</p>
          </div>
          <button type="button" className="settings-session-revoke-all-trigger"
            onClick={(event) => {
              revokeAllTriggerRef.current = event.currentTarget;
              setCurrentPassword('');
              setRevokeAllDialogOpen(true);
            }}>
            <LogOut size={15} />
            Sign out other sessions
          </button>
        </div>
      </SettingsSection>
      {selectedSession && createPortal(
        <div
          className="settings-session-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSessionRevokeDialog();
          }}
        >
          <section
            ref={sessionRevokeDialogRef}
            className="settings-session-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-session-dialog-title"
            aria-describedby="settings-session-dialog-description"
          >
            <h3 id="settings-session-dialog-title">Sign out device?</h3>
            <p id="settings-session-dialog-description">
              Enter your password to sign out {selectedSession.device}.
            </p>
            <form onSubmit={(event) => {
              event.preventDefault();
              void revokeDeviceSession(selectedSession);
            }}>
              <label htmlFor="settings-session-revoke-password">Current password</label>
              <input
                ref={sessionRevokeInputRef}
                id="settings-session-revoke-password"
                type="password"
                autoComplete="current-password"
                value={sessionRevokePassword}
                onChange={(event) => setSessionRevokePassword(event.target.value)}
                disabled={revokingSessionId === selectedSession.sessionId}
                required
                maxLength={1024}
              />
              <div className="settings-session-dialog-actions">
                <button type="button" onClick={closeSessionRevokeDialog}
                  disabled={revokingSessionId === selectedSession.sessionId}>Cancel</button>
                <button type="submit"
                  disabled={!sessionRevokePassword || revokingSessionId === selectedSession.sessionId}>
                  {revokingSessionId === selectedSession.sessionId ? 'Signing out…' : 'Confirm sign out'}
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body
      )}
      {detailsSession && createPortal(
        <div
          className="settings-session-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailsSessionId('');
          }}
        >
          <section
            ref={sessionDetailsDialogRef}
            className="settings-session-dialog settings-session-details-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-session-details-title"
          >
            <button type="button" className="settings-session-dialog-close"
              onClick={() => setDetailsSessionId('')} aria-label="Close device details">
              <X size={18} />
            </button>
            <header className="settings-device-dialog-header">
              <span className="settings-device-dialog-icon">
                {detailsSession.deviceType === 'Mobile' ? <Smartphone size={21} /> : <Monitor size={21} />}
              </span>
              <div>
                <h3 id="settings-session-details-title">Device details</h3>
                <p>{detailsSession.device}</p>
              </div>
            </header>
            <div className="settings-device-dialog-groups">
              <section className="settings-device-dialog-group">
                <h4><Monitor size={15} />Device &amp; browser</h4>
                <span><small>Device type</small>{detailsSession.deviceType || 'Unavailable'}</span>
                <span><small>Browser</small>{detailsSession.browser || 'Unavailable'}</span>
                <span><small>Operating system</small>{detailsSession.operatingSystem || 'Unavailable'}</span>
              </section>
              <section className="settings-device-dialog-group">
                <h4><Globe2 size={15} />Network &amp; location</h4>
                <span><small>IP address</small>{detailsSession.ipAddress || 'Unavailable'}</span>
                <span><small>Language / Time zone</small>
                  {[detailsSession.locale || detailsSession.language, detailsSession.timeZone].filter(Boolean).join(' · ') || 'Unavailable'}
                </span>
                <span><small>Location</small>{describeLocation(detailsSession.location)}</span>
              </section>
              <section className="settings-device-dialog-group">
                <h4><Clock3 size={15} />Session activity</h4>
                <span><small>Last active</small>{detailsSession.lastActiveAt ? new Date(detailsSession.lastActiveAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Unknown'}</span>
                <span><small>Signed in</small>{detailsSession.createdAt ? new Date(detailsSession.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Unknown'}</span>
                <span><small>Expires</small>{detailsSession.expiresAt ? new Date(detailsSession.expiresAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Unknown'}</span>
              </section>
            </div>
            {detailsSession.userAgent && (
              <details className="settings-session-technical">
                <summary>Technical details</summary>
                <code>{detailsSession.userAgent}</code>
              </details>
            )}
            <div className="settings-device-dialog-footer">
              <button type="button" onClick={() => setDetailsSessionId('')}>Close</button>
            </div>
          </section>
        </div>,
        document.body
      )}
      {revokeAllDialogOpen && createPortal(
        <div
          className="settings-session-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRevokeAllDialog();
          }}
        >
          <section
            ref={revokeAllDialogRef}
            className="settings-session-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-revoke-all-title"
            aria-describedby="settings-revoke-all-description"
          >
            <h3 id="settings-revoke-all-title">Sign out other sessions?</h3>
            <p id="settings-revoke-all-description">
              All other devices will be signed out and will need to log in again.
            </p>
            <form onSubmit={revoke}>
              <label htmlFor="revoke-session-password">Current password</label>
              <input
                ref={revokeAllInputRef}
                id="revoke-session-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                disabled={saving}
                required
                maxLength={1024}
              />
              <div className="settings-session-dialog-actions">
                <button type="button" onClick={closeRevokeAllDialog} disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving || !currentPassword}>
                  {saving ? 'Signing out…' : 'Confirm sign out'}
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}
export default PrivacySettings;
