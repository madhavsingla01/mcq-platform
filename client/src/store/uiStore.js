import { create } from 'zustand';

const UI_PREFS_KEY = 'mcq.ui.preferences.v1';

const isBrowser = typeof window !== 'undefined';

const loadPrefs = () => {
  if (!isBrowser) return {};
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const savePrefs = (prefs) => {
  if (!isBrowser) return;
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
};

const savedPrefs = loadPrefs();

const persistableKeys = [
  'sidebarCollapsed',
  'sidebarWidth',
  'contentDensity',
  'fontSize',
];

const persistState = (state) => {
  const prefs = {};
  persistableKeys.forEach((key) => {
    if (state[key] !== undefined) {
      prefs[key] = state[key];
    }
  });
  savePrefs(prefs);
};

export const useUIStore = create((set, get) => ({
  // Theme
  theme: 'light',

  // Layout
  sidebarCollapsed: savedPrefs.sidebarCollapsed ?? false,
  sidebarWidth: savedPrefs.sidebarWidth ?? 320,
  sidebarOpen: false, // mobile sidebar toggle

  // Focus Mode
  focusMode: false,

  // Content density
  contentDensity: savedPrefs.contentDensity ?? 'comfortable', // 'comfortable' | 'compact'

  // Font size
  fontSize: savedPrefs.fontSize ?? 'md', // 'sm' | 'md' | 'lg'

  // Toasts
  toasts: [],

  // Sidebar actions
  toggleSidebar: () => set((s) => {
    const next = { sidebarOpen: !s.sidebarOpen };
    return next;
  }),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setSidebarCollapsed: (collapsed) => {
    set({ sidebarCollapsed: collapsed });
    persistState(get());
  },

  toggleSidebarCollapsed: () => {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
    persistState(get());
  },

  setSidebarWidth: (width) => {
    const clamped = Math.min(Math.max(width, 240), 480);
    set({ sidebarWidth: clamped });
    persistState(get());
  },

  // Focus mode
  toggleFocusMode: () => {
    set((s) => ({ focusMode: !s.focusMode }));
  },

  setFocusMode: (enabled) => set({ focusMode: enabled }),

  // Content density
  setContentDensity: (density) => {
    if (!['comfortable', 'compact'].includes(density)) return;
    set({ contentDensity: density });
    persistState(get());
  },

  toggleContentDensity: () => {
    set((s) => ({
      contentDensity: s.contentDensity === 'comfortable' ? 'compact' : 'comfortable',
    }));
    persistState(get());
  },

  // Font size
  setFontSize: (size) => {
    if (!['sm', 'md', 'lg'].includes(size)) return;
    set({ fontSize: size });
    persistState(get());
  },

  // Toast actions
  addToast: (toast) => set((s) => ({
    toasts: [...s.toasts, { id: Date.now(), duration: 4000, ...toast }],
  })),

  removeToast: (id) => set((s) => ({
    toasts: s.toasts.filter((t) => t.id !== id),
  })),
}));
