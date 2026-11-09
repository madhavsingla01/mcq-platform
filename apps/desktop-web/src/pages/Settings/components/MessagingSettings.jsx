import React, { useState } from 'react';
import { Keyboard, MessageSquare, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../../store/authStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { SettingsSection, SettingsRow, SettingsToggle } from './SettingsSection';

export function MessagingSettings() {
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const sendOnEnter = useSettingsStore((state) => state.messagingSendOnEnter);
  const readReceipts = useSettingsStore((state) => state.messagingReadReceipts);
  const typingIndicators = useSettingsStore((state) => state.messagingTypingIndicators);
  const [saving, setSaving] = useState(false);

  const update = async (key, value) => {
    setSaving(true);
    try {
      await updateProfile({ preferences: { [key]: value } });
      toast.success('Messaging preference saved');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save messaging preference');
    } finally { setSaving(false); }
  };

  return (
    <div className="settings-tab-panel">
      <div className="settings-panel-hero"><h2 className="settings-panel-title">Messaging</h2></div>
      <SettingsSection title="Writing messages" icon={Keyboard}>
        <SettingsRow title="Send with Enter">
          <SettingsToggle ariaLabel="Send messages with Enter" checked={sendOnEnter} disabled={saving}
            onChange={(value) => update('messagingSendOnEnter', value)} />
        </SettingsRow>
        <p className="settings-supporting-note">{sendOnEnter ? 'Shift + Enter adds a new line.' : 'Enter adds a new line. Use the send button to send.'}</p>
      </SettingsSection>
      <SettingsSection title="Chat privacy" icon={Shield}>
        <SettingsRow title="Share read receipts">
          <SettingsToggle ariaLabel="Share read receipts" checked={readReceipts} disabled={saving}
            onChange={(value) => update('messagingReadReceipts', value)} />
        </SettingsRow>
        <SettingsRow title="Show when you are typing">
          <SettingsToggle ariaLabel="Share typing indicators" checked={typingIndicators} disabled={saving}
            onChange={(value) => update('messagingTypingIndicators', value)} />
        </SettingsRow>
        <p className="settings-supporting-note">Changes apply to future messages and activity. Read receipts already shared stay visible.</p>
      </SettingsSection>
      <SettingsSection title="Inbox permissions" icon={MessageSquare}>
        <p className="settings-supporting-note">Choose who can contact you in <a href="/settings/privacy">Privacy &amp; Security</a>.</p>
      </SettingsSection>
    </div>
  );
}
