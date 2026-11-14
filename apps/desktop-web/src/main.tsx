import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './components/search/SearchField.css';
import './components/ui/SegmentedControls.css';

if (import.meta.env.PROD) {
  window.addEventListener('vite:preloadError', (event) => {
    const payload = 'payload' in event ? event.payload : undefined;
    const message = payload instanceof Error ? payload.message : '';
    if (!navigator.onLine || !/failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|unable to preload css/i.test(message)) return;

    try {
      const key = 'quizfocus.preload-recovery';
      if (sessionStorage.getItem(key) === import.meta.url) return;
      sessionStorage.setItem(key, import.meta.url);
    } catch {
      return;
    }

    event.preventDefault();
    window.location.reload();
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
