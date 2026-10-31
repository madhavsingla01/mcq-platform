import { useSettingsStore } from '../../store/settingsStore';
import TopNavbar from './navbar/TopNavbar';
import QuestionWorkspace from './question/QuestionWorkspace';
import SettingsDrawer from './settings/SettingsDrawer';

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

      <style>{layoutStyles}</style>
    </div>
  );
}

const layoutStyles = `
  .ws-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--color-bg, #0E1113);
    font-family: var(--font-sans, 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    color: var(--color-text, #EDEFF1);
  }

  .ws-main {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .ws-columns {
    height: 100%;
    display: flex;
  }

  .ws-workspace {
    flex: 1;
    min-width: 0;
  }
`;
