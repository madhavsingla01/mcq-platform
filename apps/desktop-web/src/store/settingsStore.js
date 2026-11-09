import { create } from 'zustand';
import api from '../api/axios';

export const DEFAULT_SETTINGS = {
  theme: 'dark', fontSize: 'md', density: 'comfortable', timerVisibility: 'visible',
  isNavigatorCollapsed: false, isAICollapsed: false,
  showCorrectAnswerInstantly: false, reducedMotion: false, focusMode: false,
  aiExplanations: true, aiPersonality: 'Encouraging',
  panelWidths: { navigator: 20, workspace: 55, ai: 25 },
  keyboardShortcutsEnabled: true, soundCues: false, autoAdvance: false,
  messagingSendOnEnter: true, messagingReadReceipts: true, messagingTypingIndicators: true,
};

const STORAGE_PREFIX = 'mcq.settings.preferences.v2:';
let accountId = null;
let sessionGeneration = 0;
let serverSessionAuthenticated = false;
let writeQueue = Promise.resolve();
let writeController = null;
let persistTimer = null;
let pendingPatch = {};
let failedPatch = {};
let inFlightPatch = {};

const storageKey = () => `${STORAGE_PREFIX}${accountId || 'guest'}`;
const pendingStorageKey = () => `${storageKey()}:pending`;
const runtimePreferences = (value = {}) => Object.fromEntries(
  Object.keys(DEFAULT_SETTINGS).filter((key) => value[key] !== undefined).map((key) => [key, value[key]])
);
const loadPrefs = (key = storageKey()) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? runtimePreferences(value) : {};
  } catch { return {}; }
};

const savePendingPrefs = () => {
  if (!accountId) return;
  const patch = { ...failedPatch, ...inFlightPatch, ...pendingPatch };
  try {
    if (Object.keys(patch).length) localStorage.setItem(pendingStorageKey(), JSON.stringify(patch));
    else localStorage.removeItem(pendingStorageKey());
  } catch { /* Preferences can still sync without browser storage. */ }
};
const savePrefs = () => {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(runtimePreferences(useSettingsStore.getState())));
    localStorage.setItem('mcq.sound.enabled', String(useSettingsStore.getState().soundCues));
    localStorage.setItem('mcq.quiz.autoAdvance', String(useSettingsStore.getState().autoAdvance));
  } catch { /* Settings still work when browser storage is unavailable. */ }
};

// Serialize profile and preference writes and scope queued requests to a session.
export const queueProfileUpdate = (payload) => {
  const generation = sessionGeneration;
  const operation = writeQueue.catch(() => {}).then(async () => {
    if (!serverSessionAuthenticated || generation !== sessionGeneration) {
      throw new Error('Your session changed. Please try again.');
    }
    const controller = new AbortController();
    writeController = controller;
    try {
      return await api.patch('/auth/me', payload, { signal: controller.signal });
    } finally {
      if (writeController === controller) writeController = null;
    }
  });
  writeQueue = operation.catch(() => {});
  return operation;
};

const flushPreferences = async () => {
  clearTimeout(persistTimer);
  if (Object.keys(inFlightPatch).length) return;
  const patch = { ...failedPatch, ...pendingPatch };
  if (!Object.keys(patch).length || !serverSessionAuthenticated) return;
  pendingPatch = {};
  failedPatch = {};
  inFlightPatch = patch;
  const generation = sessionGeneration;
  useSettingsStore.setState({ syncStatus: 'saving', syncError: '' });
  try {
    await queueProfileUpdate({ preferences: patch });
    if (generation !== sessionGeneration) return;
    inFlightPatch = {};
    useSettingsStore.setState({ syncStatus: Object.keys(pendingPatch).length ? 'saving' : 'saved' });
  } catch (error) {
    if (generation !== sessionGeneration) return;
    failedPatch = patch;
    inFlightPatch = {};
    useSettingsStore.setState({ syncStatus: 'error', syncError: error.response?.data?.message || 'Changes are saved on this device. Retry to sync your account.' });
  } finally {
    if (generation === sessionGeneration) {
      savePendingPrefs();
      if (Object.keys(pendingPatch).length) {
        clearTimeout(persistTimer);
        persistTimer = setTimeout(flushPreferences, 300);
      }
    }
  }
};

const persistPatch = (patch) => {
  useSettingsStore.setState(patch);
  savePrefs();
  if (!serverSessionAuthenticated) return;
  pendingPatch = { ...pendingPatch, ...patch };
  savePendingPrefs();
  useSettingsStore.setState({ syncStatus: 'saving', syncError: '' });
  clearTimeout(persistTimer);
  persistTimer = setTimeout(flushPreferences, 300);
};

export const setServerSessionAuthenticated = (authenticated, userId = null) => {
  const nextAccount = authenticated ? String(userId || accountId || '') : null;
  if (accountId !== nextAccount || serverSessionAuthenticated !== authenticated) {
    sessionGeneration += 1;
    writeController?.abort();
    clearTimeout(persistTimer);
    pendingPatch = {}; failedPatch = {}; inFlightPatch = {};
    accountId = nextAccount;
    pendingPatch = accountId ? loadPrefs(pendingStorageKey()) : {};
    const hasPending = Object.keys(pendingPatch).length > 0;
    useSettingsStore.setState({ ...DEFAULT_SETTINGS, ...loadPrefs(), ...pendingPatch, isDrawerOpen: false, syncStatus: hasPending ? 'saving' : 'idle', syncError: '' });
    savePrefs();
    if (hasPending) persistTimer = setTimeout(flushPreferences, 300);
  }
  serverSessionAuthenticated = authenticated;
};

export const hydrateServerPreferences = (prefs = {}) => {
  useSettingsStore.setState({
    ...DEFAULT_SETTINGS,
    ...runtimePreferences(prefs || {}),
    ...inFlightPatch, ...failedPatch, ...pendingPatch,
  });
  savePrefs();
};

export async function clearCachedPreferences() {
  await writeQueue;
  await flushPreferences();
  if (Object.keys({ ...failedPatch, ...pendingPatch, ...inFlightPatch }).length) return false;
  try {
    localStorage.removeItem(storageKey());
    localStorage.removeItem(pendingStorageKey());
    localStorage.removeItem('mcq.ui.preferences.v1');
  } catch { return false; }
  return true;
}

export const useSettingsStore = create((set, get) => ({
  ...DEFAULT_SETTINGS, ...loadPrefs(), isDrawerOpen: false, syncStatus: 'idle', syncError: '',
  toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),
  setDrawerOpen: (open) => set({ isDrawerOpen: open }),
  setFontSize: (fontSize) => persistPatch({ fontSize }),
  updatePreference: (key, value) => persistPatch({ [key]: value }),
  setDensity: (density) => persistPatch({ density }),
  setTimerVisibility: (timerVisibility) => persistPatch({ timerVisibility }),
  setPanelWidths: (panelWidths) => persistPatch({ panelWidths }),
  setNavigatorCollapsed: (isNavigatorCollapsed) => persistPatch({ isNavigatorCollapsed }),
  toggleNavigatorCollapsed: () => persistPatch({ isNavigatorCollapsed: !get().isNavigatorCollapsed }),
  setAICollapsed: (isAICollapsed) => persistPatch({ isAICollapsed }),
  toggleAICollapsed: () => persistPatch({ isAICollapsed: !get().isAICollapsed }),
  toggleBothSidePanels: () => {
    const collapsed = !(get().isNavigatorCollapsed && get().isAICollapsed);
    persistPatch({ isNavigatorCollapsed: collapsed, isAICollapsed: collapsed });
  },
  setKeyboardShortcutsEnabled: (keyboardShortcutsEnabled) => persistPatch({ keyboardShortcutsEnabled }),
  setShowCorrectAnswerInstantly: (showCorrectAnswerInstantly) => persistPatch({ showCorrectAnswerInstantly }),
  setReducedMotion: (reducedMotion) => persistPatch({ reducedMotion }),
  setAIExplanations: (aiExplanations) => persistPatch({ aiExplanations }),
  setAIPersonality: (aiPersonality) => persistPatch({ aiPersonality }),
  retryPreferenceSync: flushPreferences,
}));
