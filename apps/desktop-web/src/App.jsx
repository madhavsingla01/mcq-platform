import { useEffect } from 'react';
import AppRouter from './routes/AppRouter';
import { useAuthStore } from './store/authStore';
import { useUIStore } from './store/uiStore';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { CustomDialogContainer } from './components/ui';
import GlobalSearchModal from './components/search/GlobalSearchModal';
import UploadPanel from './components/upload/UploadPanel';

import { Toaster } from 'sonner';

function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const openSearch = useUIStore((state) => state.openSearch);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Global shortcut: Ctrl+K or Cmd+K to open universal search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openSearch]);

  return (
    <ErrorBoundary fullPage>
      <div className="App">
        <AppRouter />
        <GlobalSearchModal />
        <UploadPanel />
        <CustomDialogContainer />
        <Toaster
          position="bottom-right"
          theme="dark"
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
