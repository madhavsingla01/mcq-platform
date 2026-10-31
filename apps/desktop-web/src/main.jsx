import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './components/search/SearchField.css';
import './components/ui/SegmentedControls.css';

// Register G2 Squircle Paint Worklet for browsers supporting CSS Houdini Paint API
if (typeof window !== 'undefined' && typeof CSS !== 'undefined' && 'paintWorklet' in CSS) {
  try {
    CSS.paintWorklet.addModule('/squircle-worklet.js').catch(() => {
      // Graceful fallback: CSS corner-shape & border-radius handles it natively
    });
  } catch {
    // Graceful fallback
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
