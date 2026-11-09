import { useState } from 'react';
import { Award, Clock, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../../store/authStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { SettingsSection, SettingsRow, SettingsToggle, SettingsSelect } from './SettingsSection';

export function CompetitionSettings() {
  const { user, updateProfile } = useAuthStore();
  const { showCorrectAnswerInstantly, timerVisibility, updatePreference } = useSettingsStore();
  const [saving, setSaving] = useState(false);
  const preferences = user?.preferences || {};
  const challenge = preferences.challenges || {};
  const update = async (patch) => {
    setSaving(true);
    try { await updateProfile({ preferences: patch }); }
    catch (error) { toast.error(error.response?.data?.message || 'Could not save competition settings'); }
    finally { setSaving(false); }
  };

  return (
    <div className="settings-tab-panel">
      <div className="settings-panel-hero"><h2 className="settings-panel-title">Competition &amp; practice</h2></div>
      <SettingsSection title="Practice defaults" description="These preferences apply to solo quizzes. Ranked competitions use the host’s rules." icon={Clock}>
        <SettingsRow title="Instant feedback" description="Show feedback after answering in a new practice attempt.">
          <SettingsToggle checked={showCorrectAnswerInstantly} onChange={value => updatePreference('showCorrectAnswerInstantly', value)} />
        </SettingsRow>
        <SettingsRow title="Shuffle questions" description="Randomize questions when starting a new practice attempt.">
          <SettingsToggle checked={preferences.shuffleQuestions === true} disabled={saving} onChange={shuffleQuestions => update({ shuffleQuestions })} />
        </SettingsRow>
        <SettingsRow title="Practice timer display" description="Hiding the timer leaves any time limit in effect.">
          <SettingsSelect value={timerVisibility} onChange={value => updatePreference('timerVisibility', value)}
            options={[{ value: 'visible', label: 'Show' }, { value: 'hidden', label: 'Hide' }]} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Public results" icon={Award}>
        <SettingsRow title="Appear on leaderboards" description="Allow your name and score to appear in published standings.">
          <SettingsToggle checked={preferences.showOnLeaderboard !== false && challenge.showOnLeaderboards !== false} disabled={saving}
            onChange={value => update({ showOnLeaderboard: value, challenges: { showOnLeaderboards: value } })} />
        </SettingsRow>
        <SettingsRow title="Show performance on your profile" description="Show your public attempt statistics and rank when available.">
          <SettingsToggle checked={preferences.showRankOnProfile !== false && challenge.showRankOnProfile !== false} disabled={saving}
            onChange={value => update({ showRankOnProfile: value, challenges: { showRankOnProfile: value } })} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="One-on-one challenges" icon={Trophy}>
        <p className="settings-supporting-note">One-on-one matchmaking and invitation preferences are unavailable.</p>
      </SettingsSection>
    </div>
  );
}
export default CompetitionSettings;
