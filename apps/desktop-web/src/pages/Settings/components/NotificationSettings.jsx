import React, { useState, useEffect } from 'react';
import { Bell, Trophy, MessageCircle, Heart, Mail, Check } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { SettingsInfo, SettingsSection, SettingsRow, SettingsToggle, SettingsSelect } from './SettingsSection';

export function NotificationSettings() {
  const { user, updateProfile } = useAuthStore();

  const [notifs, setNotifs] = useState({
    challengeInvites: true,
    quizResults: true,
    leaderboardUpdates: true,
    newFollowers: true,
    commentsAndReplies: true,
    directMessages: true,
    emailDigest: 'weekly',
  });

  const [toast, setToast] = useState('');

  useEffect(() => {
    if (user?.preferences?.notifications) {
      setNotifs((prev) => ({
        ...prev,
        ...user.preferences.notifications,
      }));
    }
  }, [user]);

  const showToast = (msg = 'Notification preferences updated') => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleToggle = async (key, val) => {
    const nextState = { ...notifs, [key]: val };
    setNotifs(nextState);

    try {
      await updateProfile({
        preferences: {
          notifications: nextState,
        },
      });
      showToast();
    } catch (err) {
      console.error('Failed to update notifications:', err);
    }
  };

  const messagesDisabled = user?.preferences?.allowMessagesFrom === 'none';
  const challengesPaused = user?.preferences?.challenges?.accept === 'never';

  return (
    <div className="settings-tab-panel">
      {/* Category Hero */}
      <div className="settings-panel-hero">
        <div className="settings-panel-title-row">
          <h2 className="settings-panel-title">Notifications</h2>
          <SettingsInfo text="Choose what events trigger in-app alerts, push notifications, and email digests." />
        </div>
      </div>

      {toast && (
        <div className="settings-alert-banner success">
          <Check size={16} />
          <span>{toast}</span>
        </div>
      )}

      {/* 1. Quiz & Competitions */}
      <SettingsSection
        title="Quizzes & Challenge Invites"
        description="Alerts related to practice sessions, multiplayer challenges, and rankings."
        icon={Trophy}
      >
        <SettingsRow
          title="Challenge Invitations"
          description={
            challengesPaused
              ? 'Challenge invites are currently paused in your Competition settings.'
              : 'Get notified when another user invites you to a head-to-head quiz challenge.'
          }
        >
          <SettingsToggle
            checked={challengesPaused ? false : notifs.challengeInvites}
            disabled={challengesPaused}
            onChange={(checked) => handleToggle('challengeInvites', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Quiz Results & Completion"
          description="Receive a summary notification whenever you complete a quiz or test run."
        >
          <SettingsToggle
            checked={notifs.quizResults}
            onChange={(checked) => handleToggle('quizResults', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Leaderboard & Rank Changes"
          description="Get alerted when your rank changes on global or category leaderboards."
        >
          <SettingsToggle
            checked={notifs.leaderboardUpdates}
            onChange={(checked) => handleToggle('leaderboardUpdates', checked)}
          />
        </SettingsRow>
      </SettingsSection>

      {/* 2. Social Interactions */}
      <SettingsSection
        title="Social & Community Alerts"
        description="Notifications for follows, comments, and conversation messages."
        icon={MessageCircle}
      >
        <SettingsRow
          title="New Followers"
          description="Notify me whenever another member starts following my profile."
        >
          <SettingsToggle
            checked={notifs.newFollowers}
            onChange={(checked) => handleToggle('newFollowers', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Comments & Replies"
          description="Notify me when someone leaves a comment or replies to my questions."
        >
          <SettingsToggle
            checked={notifs.commentsAndReplies}
            onChange={(checked) => handleToggle('commentsAndReplies', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Direct Messages"
          description={
            messagesDisabled
              ? 'Direct messaging is currently disabled in your Privacy settings.'
              : 'Receive notifications for incoming chat messages and shared quiz links.'
          }
        >
          <SettingsToggle
            checked={messagesDisabled ? false : notifs.directMessages}
            disabled={messagesDisabled}
            onChange={(checked) => handleToggle('directMessages', checked)}
          />
        </SettingsRow>
      </SettingsSection>

      {/* 3. Email Digest */}
      <SettingsSection
        title="Email Updates & Summaries"
        description="Configure automated periodic performance reports delivered to your inbox."
        icon={Mail}
      >
        <SettingsRow
          title="Email Digest Frequency"
          description="Receive curated stats on learning progress and trending community quizzes."
        >
          <SettingsSelect
            value={notifs.emailDigest}
            onChange={(val) => handleToggle('emailDigest', val)}
            options={[
              { value: 'weekly', label: 'Weekly Summary' },
              { value: 'monthly', label: 'Monthly Digest' },
              { value: 'off', label: 'Turn Off Email Digests' },
            ]}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

export default NotificationSettings;
