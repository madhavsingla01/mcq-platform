import { useState } from 'react';
import { Bell, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../../store/authStore';
import { SettingsSection, SettingsRow, SettingsToggle } from './SettingsSection';

export function NotificationSettings() {
  const { user, updateProfile } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const preferences = user?.preferences?.notifications || {};
  const update = async (key, value) => {
    setSaving(true);
    try { await updateProfile({ preferences: { notifications: { [key]: value } } }); }
    catch (error) { toast.error(error.response?.data?.message || 'Could not save notifications'); }
    finally { setSaving(false); }
  };

  return (
    <div className="settings-tab-panel">
      <div className="settings-panel-hero"><h2 className="settings-panel-title">Notifications</h2></div>
      <SettingsSection title="In-app alerts" icon={Bell}>
        <SettingsRow title="Comments and replies" description="Include comments and replies in Notifications and its unread count.">
          <SettingsToggle checked={preferences.commentsAndReplies !== false} disabled={saving}
            onChange={value => update('commentsAndReplies', value)} />
        </SettingsRow>
        <SettingsRow title="New followers" description="Include new follows in Notifications.">
          <SettingsToggle checked={preferences.newFollowers !== false} disabled={saving}
            onChange={value => update('newFollowers', value)} />
        </SettingsRow>
        <SettingsRow title="Direct message badge" description="Show the unread message badge in navigation.">
          <SettingsToggle checked={preferences.directMessages !== false} disabled={saving}
            onChange={value => update('directMessages', value)} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Delivery options" icon={Mail}>
        <p className="settings-supporting-note">Email digests and separate alerts for quiz results, invitations, and ranking changes are unavailable.</p>
      </SettingsSection>
    </div>
  );
}
export default NotificationSettings;
