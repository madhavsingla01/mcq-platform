import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './components/search/SearchField.css';
import './components/ui/SegmentedControls.css';

if (import.meta.env.PROD) {
  window.addEventListener('vite:preloadError', (event) => {
    const message = event.payload?.message || '';
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
