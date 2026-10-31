import React, { useState, useEffect } from 'react';
import { Trophy, Clock, Shuffle, Eye, Award, Check } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { useQuizStore } from '../../../store/quizStore';
import { SettingsInfo, SettingsSection, SettingsRow, SettingsToggle, SettingsSelect } from './SettingsSection';

export function CompetitionSettings() {
  const { user, updateProfile } = useAuthStore();
  const setInstantFeedback = useQuizStore((s) => s.setInstantFeedback);
  const settingsStore = useSettingsStore();

  const [comp, setComp] = useState({
    acceptChallenges: 'always',
    challengeTimeLimit: 60,
    instantFeedback: false,
    shuffleQuestions: false,
    timerVisibility: 'visible',
    showOnLeaderboards: true,
    showRankOnProfile: true,
  });

  const [toast, setToast] = useState('');

  useEffect(() => {
    const prefs = user?.preferences || {};
    setComp({
      acceptChallenges: prefs.challenges?.accept || 'always',
      challengeTimeLimit: prefs.challenges?.timeLimit || 60,
      instantFeedback: Boolean(prefs.showCorrectAnswerInstantly ?? settingsStore.showCorrectAnswerInstantly),
      shuffleQuestions: Boolean(prefs.shuffleQuestions ?? false),
      timerVisibility: prefs.timerVisibility || settingsStore.timerVisibility || 'visible',
      showOnLeaderboards: prefs.challenges?.showOnLeaderboards !== false,
      showRankOnProfile: prefs.challenges?.showRankOnProfile !== false,
    });
  }, [user, settingsStore.showCorrectAnswerInstantly, settingsStore.timerVisibility]);

  const showToast = (msg = 'Competition preferences saved') => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleUpdate = async (field, val) => {
    const nextComp = { ...comp, [field]: val };
    setComp(nextComp);

    // Sync with runtime stores
    if (field === 'instantFeedback') {
      settingsStore.setShowCorrectAnswerInstantly(val);
      setInstantFeedback(val);
    }
    if (field === 'timerVisibility') {
      settingsStore.setTimerVisibility(val);
    }

    try {
      await updateProfile({
        preferences: {
          showCorrectAnswerInstantly: nextComp.instantFeedback,
          shuffleQuestions: nextComp.shuffleQuestions,
          timerVisibility: nextComp.timerVisibility,
          challenges: {
            accept: nextComp.acceptChallenges,
            timeLimit: nextComp.challengeTimeLimit,
            showOnLeaderboards: nextComp.showOnLeaderboards,
            showRankOnProfile: nextComp.showRankOnProfile,
          },
        },
      });
      showToast();
    } catch (err) {
      console.error('Failed to save competition settings:', err);
    }
  };

  return (
    <div className="settings-tab-panel">
      {/* Category Hero */}
      <div className="settings-panel-hero">
        <div className="settings-panel-title-row">
          <h2 className="settings-panel-title">Competition & Challenges</h2>
          <SettingsInfo text="Set your multiplayer challenge rules, question solving defaults, and leaderboard rankings." />
        </div>
      </div>

      {toast && (
        <div className="settings-alert-banner success">
          <Check size={16} />
          <span>{toast}</span>
        </div>
      )}

      {/* 1. Challenge Invitations */}
      <SettingsSection
        title="Multiplayer Challenges"
        description="Configure invitation filters and standard challenge round constraints."
        icon={Trophy}
      >
        <SettingsRow
          title="Accept Challenge Invites"
          description="Control who is allowed to send you quiz challenge invitations."
        >
          <SettingsSelect
            value={comp.acceptChallenges}
            onChange={(val) => handleUpdate('acceptChallenges', val)}
            options={[
              { value: 'always', label: 'From Everyone' },
              { value: 'followers', label: 'Only from Followers' },
              { value: 'never', label: 'Pause Challenge Invites' },
            ]}
          />
        </SettingsRow>

        <SettingsRow
          title="Default Challenge Timer"
          description="Time allocated per question during 1v1 challenges."
        >
          <SettingsSelect
            value={comp.challengeTimeLimit}
            onChange={(val) => handleUpdate('challengeTimeLimit', Number(val))}
            options={[
              { value: 30, label: '30 seconds per question' },
              { value: 60, label: '60 seconds per question' },
              { value: 90, label: '90 seconds per question' },
              { value: 120, label: '120 seconds per question' },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

      {/* 2. Solving Defaults */}
      <SettingsSection
        title="Default Quiz Solving Preferences"
        description="Applied automatically when starting new practice sessions."
        icon={Clock}
      >
        <SettingsRow
          title="Instant Answer Reveal"
          description="Show correct answers, explanations, and key takeaways immediately upon selection."
        >
          <SettingsToggle
            checked={comp.instantFeedback}
            onChange={(checked) => handleUpdate('instantFeedback', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Shuffle Questions by Default"
          description="Randomize question sequence to test recall from different angles."
        >
          <SettingsToggle
            checked={comp.shuffleQuestions}
            onChange={(checked) => handleUpdate('shuffleQuestions', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Timer Display Visibility"
          description="Keep countdown timers visible or hidden during solo practice."
        >
          <SettingsSelect
            value={comp.timerVisibility}
            onChange={(val) => handleUpdate('timerVisibility', val)}
            options={[
              { value: 'visible', label: 'Visible Countdown Timer' },
              { value: 'hidden', label: 'Hidden (Stress-Free Mode)' },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

      {/* 3. Leaderboard Visibility */}
      <SettingsSection
        title="Rankings & Public Scores"
        description="Choose how your competitive performance appears to other learners."
        icon={Award}
      >
        <SettingsRow
          title="Show My Scores on Leaderboards"
          description="Display your username and score on global and category leaderboards."
        >
          <SettingsToggle
            checked={comp.showOnLeaderboards}
            onChange={(checked) => handleUpdate('showOnLeaderboards', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="Display Ranking on Public Profile"
          description="Show your competitive rank and badge on your public profile."
        >
          <SettingsToggle
            checked={comp.showRankOnProfile}
            onChange={(checked) => handleUpdate('showRankOnProfile', checked)}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

export default CompetitionSettings;
