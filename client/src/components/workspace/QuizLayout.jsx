import { useSettingsStore } from '../../store/settingsStore';
import { useAIStore } from '../../store/aiStore';
import TopNavbar from './navbar/TopNavbar';
import NavigatorSidebar from './navigator/NavigatorSidebar';
import QuestionWorkspace from './question/QuestionWorkspace';
import AIWorkspace from './ai/AIWorkspace';
import SettingsDrawer from './settings/SettingsDrawer';

export default function QuizLayout() {
  const {
    focusMode,
    panelWidths,
    isDrawerOpen,
    isNavigatorCollapsed,
    isAICollapsed,
    
  } = useSettingsStore();

  const { isOpen: isAIOpen } = useAIStore();

  const navPercent = panelWidths?.navigator ?? 20;
  const aiPercent = panelWidths?.ai ?? 25;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#fafafa] text-zinc-900 font-sans">
      <TopNavbar />

      <main className="flex-1 min-h-0 relative">
        <div className="h-full flex">
          {/* Panels control moved to header for a cleaner, professional UI */}
          {/* Navigator Column */}
          {!focusMode && (
            <aside
              className="bg-[#fcfcfc] border-r border-zinc-200 flex flex-col"
              style={{ flex: `0 0 ${isNavigatorCollapsed ? '64px' : `${navPercent}%`}` }}
            >
              
              <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                <NavigatorSidebar collapsed={isNavigatorCollapsed} />
              </div>
            </aside>
          )}

          {/* Main Workspace */}
          <div className="flex-1 min-w-0">
            <QuestionWorkspace />
          </div>

          {/* AI Column */}
          {!focusMode && isAIOpen && (
            <aside
              className="bg-white border-l border-zinc-200 flex flex-col"
              style={{ flex: `0 0 ${isAICollapsed ? '64px' : `${aiPercent}%`}` }}
            >
              <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                <AIWorkspace collapsed={isAICollapsed} />
              </div>
            </aside>
          )}
        </div>
      </main>

      {/* Settings Drawer Overlay */}
      {isDrawerOpen && <SettingsDrawer />}
    </div>
  );
}
