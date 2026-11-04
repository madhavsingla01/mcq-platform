import { useSettingsStore } from '../../store/settingsStore';
import TopNavbar from './navbar/TopNavbar';
import QuestionWorkspace from './question/QuestionWorkspace';
import SettingsDrawer from './settings/SettingsDrawer';
import './QuizLayout.css';

export default function QuizLayout({ collaboration = null }) {
  const { isDrawerOpen } = useSettingsStore();

  return (
    <div className="ws-root">
      <TopNavbar collaboration={collaboration} />

      <main className="ws-main">
        <div className="ws-columns">
          {/* Main Workspace Only */}
          <div className="ws-workspace">
            <QuestionWorkspace />
          </div>
        </div>
      </main>

      {/* Settings Drawer Overlay */}
      {isDrawerOpen && <SettingsDrawer collaboration={collaboration} />}
    </div>
  );
}
