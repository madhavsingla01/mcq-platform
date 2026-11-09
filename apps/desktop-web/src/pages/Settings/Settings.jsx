import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Cloud, Loader2 } from 'lucide-react';
import { usePageSearch } from '../../components/search/PageSearchContext';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { SettingsSidebar } from './components/SettingsSidebar';
import { AccountSettings } from './components/AccountSettings';
import { PrivacySettings } from './components/PrivacySettings';
import { NotificationSettings } from './components/NotificationSettings';
import { CompetitionSettings } from './components/CompetitionSettings';
import { FeedSettings } from './components/FeedSettings';
import { AppearanceSettings } from './components/AppearanceSettings';
import { ActivitySettings } from './components/ActivitySettings';
import { HelpSettings } from './components/HelpSettings';
import { MessagingSettings } from './components/MessagingSettings';
import './Settings.css';

const panels = {
  account: AccountSettings, privacy: PrivacySettings, notifications: NotificationSettings,
  challenges: CompetitionSettings, feed: FeedSettings, appearance: AppearanceSettings,
  activity: ActivitySettings, help: HelpSettings, messaging: MessagingSettings,
};
const aliases = { info: 'account', profile: 'account', public: 'account', security: 'privacy',
  preferences: 'appearance', theme: 'appearance', data: 'activity' };

export default function Settings() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const status = useSettingsStore(state => state.syncStatus);
  const error = useSettingsStore(state => state.syncError);
  const retry = useSettingsStore(state => state.retryPreferenceSync);
  const key = tab?.toLowerCase();
  const category = aliases[key] || key;
  const active = Object.hasOwn(panels, category) ? category : 'account';
  const Panel = panels[active];
  const { query } = usePageSearch();
  const categoryQuery = active === 'activity' ? '' : query;

  return (
    <div className={`settings-page-shell settings-redesign ${tab ? 'settings-has-category' : ''} ${categoryQuery.trim() ? 'settings-searching' : ''}`}>
      <div className="settings-redesign-header app-page-tools">
        <div className="settings-save-status" role="status">
          {status === 'saving' ? <><Loader2 size={15} className="animate-spin" /> Saving preferences</>
            : status === 'saved' ? <><CheckCircle2 size={15} /> Preferences saved</>
            : status === 'error' ? <button type="button" onClick={retry}>Retry sync</button>
            : <><Cloud size={15} /> Account preferences</>}
        </div>
      </div>
      {status === 'error' && <p className="settings-sync-notice" role="alert">{error}</p>}
      <div className="settings-redesign-grid">
        <SettingsSidebar activeCategory={active} onSelectCategory={id => navigate(`/settings/${id}`)} user={user} searchQuery={categoryQuery} />
        <div className="settings-redesign-content" id="settings-desktop-panel">
          <Link to="/settings" className="settings-redesign-back"><ArrowLeft size={16} /> All settings</Link>
          <Panel key={active} />
        </div>
      </div>
    </div>
  );
}
