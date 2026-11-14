import { useEffect } from 'react';
import AppRouter from './routes/AppRouter';
import { useAuthStore } from './store/authStore';
import { useUIStore } from './store/uiStore';
import { useSettingsStore } from './store/settingsStore';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { CustomDialogContainer } from './components/ui';
import UploadPanel from './components/upload/UploadPanel';

import { Toaster } from 'sonner';

function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const theme = useSettingsStore((state) => state.theme);
  const reducedMotion = useSettingsStore((state) => state.reducedMotion);
  const focusMode = useSettingsStore((state) => state.focusMode);
  const density = useSettingsStore((state) => state.density);
  const fontSize = useSettingsStore((state) => state.fontSize);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('reduce-motion', reducedMotion);
    root.classList.toggle('focus-mode-active', focusMode);
    root.dataset.density = density;
    root.dataset.fontSize = fontSize;
    const ui = useUIStore.getState();
    ui.setTheme(theme);
    ui.setContentDensity(density);
    ui.setFontSize(fontSize);
  }, [theme, reducedMotion, focusMode, density, fontSize]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <ErrorBoundary fullPage>
      <div className="App">
        <AppRouter />
        <UploadPanel />
        <CustomDialogContainer />
        <Toaster
          position="bottom-right"
          theme={theme === 'light' ? 'light' : 'dark'}
          richColors
          closeButton
          duration={3500}
          offset="24px"
          mobileOffset="16px"
        />
      </div>
    </ErrorBoundary>
  );
}

export default App;
