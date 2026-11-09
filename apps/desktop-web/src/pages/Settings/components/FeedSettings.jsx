import { useState } from 'react';
import { Filter, Sliders } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../../store/authStore';
import { SettingsSection, SettingsRow, SettingsSelect, SettingsToggle } from './SettingsSection';

const categories = ['All Categories', 'General', 'Computer Science', 'Science', 'Mathematics', 'History', 'Languages', 'Business'];
const difficulties = ['All Levels', 'Beginner', 'Intermediate', 'Advanced'];
const options = values => values.map(value => ({ value, label: value }));

export function FeedSettings() {
  const { user, updateProfile } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const prefs = user?.preferences || {};
  const feed = prefs.feed || {};
  const update = async (key, value, accountKey = key) => {
    setSaving(true);
    try { await updateProfile({ preferences: { [accountKey]: value, feed: { [key]: value } } }); }
    catch (error) { toast.error(error.response?.data?.message || 'Could not save feed preferences'); }
    finally { setSaving(false); }
  };

  return (
    <div className="settings-tab-panel">
      <div className="settings-panel-hero"><h2 className="settings-panel-title">Feed &amp; discovery</h2></div>
      <SettingsSection title="Explore defaults" icon={Sliders}>
        <SettingsRow title="Difficulty">
          <SettingsSelect value={prefs.defaultDifficulty || feed.defaultDifficulty || 'All Levels'} disabled={saving}
            onChange={value => update('defaultDifficulty', value)} options={options(difficulties)} />
        </SettingsRow>
        <SettingsRow title="Category">
          <SettingsSelect value={prefs.primaryCategory || feed.preferredCategory || 'All Categories'} disabled={saving}
            onChange={value => update('preferredCategory', value, 'primaryCategory')} options={options(categories)} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Explore filters" icon={Filter}>
        <SettingsRow title="Hide completed quizzes">
          <SettingsToggle checked={prefs.hideCompletedQuizzes ?? feed.hideCompletedQuizzes ?? false} disabled={saving}
            onChange={value => update('hideCompletedQuizzes', value)} />
        </SettingsRow>
        <SettingsRow title="Only show verified quizzes">
          <SettingsToggle checked={prefs.filterUnverified ?? feed.filterUnverified ?? prefs.showVerifiedOnly ?? false} disabled={saving}
            onChange={value => update('filterUnverified', value)} />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
export default FeedSettings;
