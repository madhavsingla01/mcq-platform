import React, { useState, useEffect } from 'react';
import {
  Shield,
  Lock,
  Globe,
  Eye,
  EyeOff,
  Smartphone,
  Check,
  AlertCircle,
  KeyRound,
  MessageSquare,
} from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { SettingsInfo, SettingsSection, SettingsRow, SettingsToggle, SettingsSelect } from './SettingsSection';
import { Button, showCustomDialog } from '../../../components/ui';

export function PrivacySettings() {
  const { user, updateProfile } = useAuthStore();

  const [isPrivate, setIsPrivate] = useState(false);
  const [searchDiscovery, setSearchDiscovery] = useState(true);
  const [allowMessagesFrom, setAllowMessagesFrom] = useState('everyone');
  const [savingField, setSavingField] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (user) {
      setIsPrivate(Boolean(user.isPrivate));
      const prefs = user.preferences || {};
      setSearchDiscovery(prefs.searchDiscovery !== false);
      setAllowMessagesFrom(prefs.allowMessagesFrom || 'everyone');
    }
  }, [user]);

  const showSavedToast = (msg = 'Settings saved') => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleTogglePrivate = async (val) => {
    setIsPrivate(val);
    setSavingField('isPrivate');
    try {
      await updateProfile({
        isPrivate: val,
        isProfilePublic: !val,
      });
      showSavedToast(val ? 'Account is now Private' : 'Account is now Public');
    } catch (err) {
      console.error(err);
      showCustomDialog({
        title: 'Update Failed',
        message: err.response?.data?.message || 'Failed to update account visibility',
        type: 'error',
      });
    } finally {
      setSavingField('');
    }
  };

  const handleToggleDiscovery = async (val) => {
    setSearchDiscovery(val);
    setSavingField('searchDiscovery');
    try {
      await updateProfile({
        preferences: {
          searchDiscovery: val,
        },
      });
      showSavedToast('Discovery preference updated');
    } catch (err) {
      console.error(err);
      showCustomDialog({
        title: 'Update Failed',
        message: err.response?.data?.message || 'Failed to update discovery settings',
        type: 'error',
      });
    } finally {
      setSavingField('');
    }
  };

  const handleChangeMessagesFrom = async (val) => {
    setAllowMessagesFrom(val);
    setSavingField('allowMessagesFrom');
    try {
      await updateProfile({
        preferences: {
          allowMessagesFrom: val,
        },
      });
      showSavedToast('Messaging privacy updated');
    } catch (err) {
      console.error(err);
      showCustomDialog({
        title: 'Update Failed',
        message: err.response?.data?.message || 'Failed to update messaging settings',
        type: 'error',
      });
    } finally {
      setSavingField('');
    }
  };

  return (
    <div className="settings-tab-panel">
      {/* Category Hero */}
      <div className="settings-panel-hero">
        <div className="settings-panel-title-row">
          <h2 className="settings-panel-title">Privacy & Security</h2>
          <SettingsInfo text="Control who can see your activity, manage messaging permissions, and audit account security." />
        </div>
      </div>

      {toast && (
        <div className="settings-alert-banner success">
          <Check size={16} />
          <span>{toast}</span>
        </div>
      )}

      {/* 1. Profile Visibility */}
      <SettingsSection
        title="Account Visibility"
        description="Choose how your profile and published quizzes appear to the community."
        icon={Shield}
      >
        <SettingsRow
          title="Private Account"
          description={
            isPrivate
              ? 'Only approved followers can view your full profile and quizzes.'
              : 'Anyone on QuizFocus can see your public quizzes and profile stats.'
          }
        >
          <SettingsToggle
            checked={isPrivate}
            onChange={handleTogglePrivate}
            label={isPrivate ? 'Private' : 'Public'}
          />
        </SettingsRow>

        <SettingsRow
          title="Search & Explore Discovery"
          description={
            isPrivate
              ? 'When Private is active, your quizzes remain hidden from Explore feeds and public search catalogs.'
              : 'Allow your profile and public quizzes to appear in search results and member recommendations.'
          }
        >
          <SettingsToggle
            checked={searchDiscovery}
            onChange={handleToggleDiscovery}
            label={searchDiscovery ? 'Visible' : 'Hidden'}
          />
        </SettingsRow>
      </SettingsSection>

      {/* 2. Direct Messaging Permissions */}
      <SettingsSection
        title="Direct Messaging & Interactions"
        description="Configure who can send you direct chat messages and challenge links."
        icon={MessageSquare}
      >
        <SettingsRow
          title="Who Can Message You"
          description="Control incoming chat requests in your messages inbox."
        >
          <SettingsSelect
            value={allowMessagesFrom}
            onChange={handleChangeMessagesFrom}
            options={[
              { value: 'everyone', label: 'Everyone on QuizFocus' },
              { value: 'followers', label: 'People you follow / Followers' },
              { value: 'none', label: 'No one (Disable direct messages)' },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

      {/* 3. Login Sessions & Security Audit */}
      <SettingsSection
        title="Active Sessions & Security"
        description="Review active devices and manage account credentials."
        icon={KeyRound}
      >
        <SettingsRow
          title="Two-Factor Authentication (2FA)"
          description="Protect your account with an extra verification layer upon sign in."
        >
          <span className="settings-badge-pill active">Protected (Password + JWT)</span>
        </SettingsRow>

        <SettingsRow
          title="Current Device Session"
          description={`Logged in as ${user?.email || 'User'} • Active Now • Desktop / Browser`}
          align="start"
        >
          <div className="settings-session-chip">
            <span className="status-dot online" />
            <span>Active Session</span>
          </div>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

export default PrivacySettings;
