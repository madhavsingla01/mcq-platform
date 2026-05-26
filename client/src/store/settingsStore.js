import { create } from 'zustand';
import api from '../api/axios';

const SETTINGS_PREFS_KEY = 'mcq.settings.preferences.v1';

const isBrowser = typeof window !== 'undefined';

const loadPrefs = () => {
  if (!isBrowser) return {};
  try {
    const raw = localStorage.getItem(SETTINGS_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const savePrefs = (prefs) => {
  if (!isBrowser) return;
  try {
    localStorage.setItem(SETTINGS_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
};

const savedPrefs = loadPrefs();

const persistState = (state) => {
  savePrefs({
    fontSize: state.fontSize,
    density: state.density,
    timerVisibility: state.timerVisibility,
    timerVisibility: state.timerVisibility,
    isNavigatorCollapsed: state.isNavigatorCollapsed,
    isAICollapsed: state.isAICollapsed,
    panelWidths: state.panelWidths,
    keyboardShortcutsEnabled: state.keyboardShortcutsEnabled,
    showCorrectAnswerInstantly: state.showCorrectAnswerInstantly,
    reducedMotion: state.reducedMotion,
    aiExplanations: state.aiExplanations,
    aiPersonality: state.aiPersonality,
  });
  // Attempt to persist preferences to server for authenticated users.
  try {
    const prefs = {
      fontSize: state.fontSize,
      density: state.density,
      timerVisibility: state.timerVisibility,
      timerVisibility: state.timerVisibility,
      isNavigatorCollapsed: state.isNavigatorCollapsed,
      isAICollapsed: state.isAICollapsed,
      panelWidths: state.panelWidths,
      keyboardShortcutsEnabled: state.keyboardShortcutsEnabled,
      showCorrectAnswerInstantly: state.showCorrectAnswerInstantly,
      reducedMotion: state.reducedMotion,
      aiExplanations: state.aiExplanations,
      aiPersonality: state.aiPersonality,
    };
    // fire-and-forget; server will reject if unauthenticated
    api.patch('/auth/me', { preferences: prefs }).catch(() => {});
  } catch (e) {
    // ignore errors
  }
};

/**
 * Hydrate settings from server preferences without triggering API persist.
 * Used by authStore after login/checkAuth to sync server → client.
 */
const hydrateServerPreferences = (prefs) => {
  if (!prefs || typeof prefs !== 'object') return;
  const updates = {};
  if (prefs.fontSize !== undefined) updates.fontSize = prefs.fontSize;
  if (prefs.density !== undefined) updates.density = prefs.density;
  if (prefs.timerVisibility !== undefined) updates.timerVisibility = prefs.timerVisibility;
  if (prefs.timerVisibility !== undefined) updates.timerVisibility = prefs.timerVisibility;
  if (prefs.isNavigatorCollapsed !== undefined) updates.isNavigatorCollapsed = prefs.isNavigatorCollapsed;
  if (prefs.isAICollapsed !== undefined) updates.isAICollapsed = prefs.isAICollapsed;
  if (prefs.panelWidths !== undefined) updates.panelWidths = prefs.panelWidths;
  if (prefs.keyboardShortcutsEnabled !== undefined) updates.keyboardShortcutsEnabled = prefs.keyboardShortcutsEnabled;
  if (prefs.showCorrectAnswerInstantly !== undefined) updates.showCorrectAnswerInstantly = prefs.showCorrectAnswerInstantly;
  if (prefs.reducedMotion !== undefined) updates.reducedMotion = prefs.reducedMotion;
  if (prefs.aiExplanations !== undefined) updates.aiExplanations = prefs.aiExplanations;
  if (prefs.aiPersonality !== undefined) updates.aiPersonality = prefs.aiPersonality;
  if (Object.keys(updates).length > 0) {
    useSettingsStore.setState(updates);
    savePrefs({ ...useSettingsStore.getState(), ...updates });
  }
};

export { hydrateServerPreferences };

export const useSettingsStore = create((set, get) => ({
  // Drawer state
  isDrawerOpen: false,

  // Preferences
  fontSize: savedPrefs.fontSize ?? 'md', // 'sm' | 'md' | 'lg'
  density: savedPrefs.density ?? 'comfortable', // 'comfortable' | 'compact'
  timerVisibility: savedPrefs.timerVisibility ?? 'visible', // 'visible' | 'hidden'
  timerVisibility: savedPrefs.timerVisibility ?? 'visible', // 'visible' | 'hidden'
  // Collapsed panel states
  isNavigatorCollapsed: savedPrefs.isNavigatorCollapsed ?? false,
  isAICollapsed: savedPrefs.isAICollapsed ?? false,
  // New preferences
  showCorrectAnswerInstantly: savedPrefs.showCorrectAnswerInstantly ?? false,
  reducedMotion: savedPrefs.reducedMotion ?? false,
  aiExplanations: savedPrefs.aiExplanations ?? true,
  aiPersonality: savedPrefs.aiPersonality ?? 'Encouraging',
  panelWidths: savedPrefs.panelWidths ?? {
    navigator: 20, // percentage for react-resizable-panels
    workspace: 55,
    ai: 25,
  },
  keyboardShortcutsEnabled: savedPrefs.keyboardShortcutsEnabled ?? true,

  // Actions
  toggleDrawer: () => set((s) => ({ isDrawerOpen: !s.isDrawerOpen })),
  setDrawerOpen: (open) => set({ isDrawerOpen: open }),

  setFontSize: (size) => {
    set({ fontSize: size });
    persistState(get());
    api.post('/activity/events', { eventType: 'FONT_SIZE_CHANGED', category: 'settings', metadata: { fontSize: size } }).catch(() => {});
  },

  setDensity: (density) => {
    set({ density });
    persistState(get());
    api.post('/activity/events', { eventType: 'DENSITY_CHANGED', category: 'settings', metadata: { density } }).catch(() => {});
  },

  setTimerVisibility: (visibility) => {
    set({ timerVisibility: visibility });
    persistState(get());
  },

  setTimerVisibility: (visibility) => {
    set({ timerVisibility: visibility });
    persistState(get());
  },

  setPanelWidths: (widths) => {
    set({ panelWidths: widths });
    persistState(get());
  },

  // Collapse / expand panels
  setNavigatorCollapsed: (collapsed) => {
    set({ isNavigatorCollapsed: collapsed });
    persistState(get());
  },

  toggleNavigatorCollapsed: () => {
    set((s) => {
      const next = !s.isNavigatorCollapsed;
      persistState({ ...get(), isNavigatorCollapsed: next });
      return { isNavigatorCollapsed: next };
    });
  },

  setAICollapsed: (collapsed) => {
    set({ isAICollapsed: collapsed });
    persistState(get());
  },

  toggleAICollapsed: () => {
    set((s) => {
      const next = !s.isAICollapsed;
      persistState({ ...get(), isAICollapsed: next });
      return { isAICollapsed: next };
    });
  },

  // Toggle both side panels together (collapse if any open, expand if both collapsed)
  toggleBothSidePanels: () => {
    set((s) => {
      const bothCollapsed = s.isNavigatorCollapsed && s.isAICollapsed;
      const next = !bothCollapsed; // if both collapsed -> expand (next=true means collapsed? Wait),
      // We want to collapse when not bothCollapsed, expand when bothCollapsed
      const collapse = !bothCollapsed;
      persistState({ ...get(), isNavigatorCollapsed: collapse, isAICollapsed: collapse });
      api.post('/activity/events', { eventType: 'PANELS_TOGGLED', category: 'settings', metadata: { collapsed: collapse } }).catch(() => {});
      return { isNavigatorCollapsed: collapse, isAICollapsed: collapse };
    });
  },

  setKeyboardShortcutsEnabled: (enabled) => {
    set({ keyboardShortcutsEnabled: enabled });
    persistState(get());
    api.post('/activity/events', { eventType: 'KEYBOARD_SHORTCUTS_TOGGLED', category: 'settings', metadata: { enabled } }).catch(() => {});
  },

  setShowCorrectAnswerInstantly: (enabled) => {
    set({ showCorrectAnswerInstantly: enabled });
    persistState(get());
  },

  setReducedMotion: (enabled) => {
    set({ reducedMotion: enabled });
    persistState(get());
  },

  setAIExplanations: (enabled) => {
    set({ aiExplanations: enabled });
    persistState(get());
  },

  setAIPersonality: (personality) => {
    set({ aiPersonality: personality });
    persistState(get());
  },
}));
