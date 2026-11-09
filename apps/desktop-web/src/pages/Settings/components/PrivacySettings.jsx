import React, { useState } from 'react';
import { Shield, KeyRound, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../../store/authStore';
import { SettingsSection, SettingsRow, SettingsToggle, SettingsSelect } from './SettingsSection';

export function PrivacySettings() {
  const { user, updateProfile, revokeOtherSessions } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const preferences = user?.preferences || {};

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
      toast.success('Other sessions signed out');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not sign out other sessions');
    } finally { setSaving(false); }
  };

  return (
    <div className="settings-tab-panel">
      <div className="settings-panel-hero"><h2 className="settings-panel-title">Privacy &amp; Security</h2></div>
      <SettingsSection title="Account visibility" icon={Shield}>
        <SettingsRow title="Private account" description="Restrict your public profile. Quiz visibility is set separately on each quiz.">
          <SettingsToggle checked={user?.isPrivate === true || user?.isProfilePublic === false} disabled={saving}
            onChange={(value) => update({ isPrivate: value, isProfilePublic: !value })} />
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
        <SettingsRow title="Sign out other sessions" />
        <p className="settings-supporting-note">Confirm your password to revoke older sign-ins. This browser stays signed in.</p>
        <form className="settings-session-form" onSubmit={revoke}>
          <label htmlFor="revoke-session-password">Current password</label>
          <input id="revoke-session-password" type="password" autoComplete="current-password"
            value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={saving} required maxLength={1024} />
          <button type="submit" disabled={saving || !currentPassword}>{saving ? 'Saving…' : 'Sign out other sessions'}</button>
        </form>
      </SettingsSection>
    </div>
  );
}
export default PrivacySettings;
