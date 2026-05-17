import { create } from 'zustand';
import api, { AUTH_SESSION_EXPIRED_EVENT } from '../api/axios';
import { useSettingsStore } from './settingsStore';

const SESSION_HINT_KEY = 'mcq.auth.has-session.v1';
const SESSION_CHECKED_KEY = 'mcq.auth.session-checked.v1';

let checkAuthPromise = null;

const hasSessionHint = () => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SESSION_HINT_KEY) === 'true';
};

const hasCheckedSession = () => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(SESSION_CHECKED_KEY) === 'true';
};

const setSessionChecked = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SESSION_CHECKED_KEY, 'true');
  }
};

const setSessionHint = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SESSION_HINT_KEY, 'true');
    window.localStorage.setItem(SESSION_CHECKED_KEY, 'true');
  }
};

const clearSessionHint = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(SESSION_HINT_KEY);
    window.localStorage.setItem(SESSION_CHECKED_KEY, 'true');
  }
};

const unauthenticatedState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
};

export const useAuthStore = create((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  checkAuth: async ({ force = false } = {}) => {
    if (!force && !hasSessionHint() && hasCheckedSession()) {
      set(unauthenticatedState);
      return null;
    }

    if (checkAuthPromise) {
      return checkAuthPromise;
    }

    checkAuthPromise = (async () => {
      set({ isLoading: true });

      try {
        const { data } = await api.get('/auth/me', { skipAuthRefresh: true });
        setSessionHint();
        set({ user: data.data.user, isAuthenticated: true, isLoading: false });
        try {
          const prefs = data.data.user?.preferences || {};
          const s = useSettingsStore.getState();
          if (prefs.fontSize !== undefined && s.setFontSize) s.setFontSize(prefs.fontSize);
          if (prefs.density !== undefined && s.setDensity) s.setDensity(prefs.density);
          if (prefs.timerVisibility !== undefined && s.setTimerVisibility) s.setTimerVisibility(prefs.timerVisibility);
          if (prefs.showCorrectAnswerInstantly !== undefined && s.setShowCorrectAnswerInstantly) s.setShowCorrectAnswerInstantly(prefs.showCorrectAnswerInstantly);
          if (prefs.reducedMotion !== undefined && s.setReducedMotion) s.setReducedMotion(prefs.reducedMotion);
          if (prefs.aiExplanations !== undefined && s.setAIExplanations) s.setAIExplanations(prefs.aiExplanations);
          if (prefs.aiPersonality !== undefined && s.setAIPersonality) s.setAIPersonality(prefs.aiPersonality);
          if (prefs.keyboardShortcutsEnabled !== undefined && s.setKeyboardShortcutsEnabled) s.setKeyboardShortcutsEnabled(prefs.keyboardShortcutsEnabled);
          if (prefs.focusMode !== undefined && s.setFocusMode) s.setFocusMode(prefs.focusMode);
          if (prefs.isNavigatorCollapsed !== undefined && s.setNavigatorCollapsed) s.setNavigatorCollapsed(prefs.isNavigatorCollapsed);
          if (prefs.isAICollapsed !== undefined && s.setAICollapsed) s.setAICollapsed(prefs.isAICollapsed);
          if (prefs.panelWidths !== undefined && s.setPanelWidths) s.setPanelWidths(prefs.panelWidths);
        } catch (e) {
          // ignore
        }
        return data;
      } catch (error) {
        if (error.response?.status === 401) {
          try {
            await api.post('/auth/refresh', {}, { skipAuthRefresh: true });
            const { data } = await api.get('/auth/me', { skipAuthRefresh: true });
            setSessionHint();
            set({ user: data.data.user, isAuthenticated: true, isLoading: false });
            try {
              const prefs = data.data.user?.preferences || {};
              const s = useSettingsStore.getState();
              if (prefs.fontSize !== undefined && s.setFontSize) s.setFontSize(prefs.fontSize);
              if (prefs.density !== undefined && s.setDensity) s.setDensity(prefs.density);
              if (prefs.timerVisibility !== undefined && s.setTimerVisibility) s.setTimerVisibility(prefs.timerVisibility);
              if (prefs.showCorrectAnswerInstantly !== undefined && s.setShowCorrectAnswerInstantly) s.setShowCorrectAnswerInstantly(prefs.showCorrectAnswerInstantly);
              if (prefs.reducedMotion !== undefined && s.setReducedMotion) s.setReducedMotion(prefs.reducedMotion);
              if (prefs.aiExplanations !== undefined && s.setAIExplanations) s.setAIExplanations(prefs.aiExplanations);
              if (prefs.aiPersonality !== undefined && s.setAIPersonality) s.setAIPersonality(prefs.aiPersonality);
              if (prefs.keyboardShortcutsEnabled !== undefined && s.setKeyboardShortcutsEnabled) s.setKeyboardShortcutsEnabled(prefs.keyboardShortcutsEnabled);
              if (prefs.focusMode !== undefined && s.setFocusMode) s.setFocusMode(prefs.focusMode);
              if (prefs.isNavigatorCollapsed !== undefined && s.setNavigatorCollapsed) s.setNavigatorCollapsed(prefs.isNavigatorCollapsed);
              if (prefs.isAICollapsed !== undefined && s.setAICollapsed) s.setAICollapsed(prefs.isAICollapsed);
              if (prefs.panelWidths !== undefined && s.setPanelWidths) s.setPanelWidths(prefs.panelWidths);
            } catch (e) {
              // ignore
            }
            return data;
          } catch {
            clearSessionHint();
            set(unauthenticatedState);
            return null;
          }
        }

        clearSessionHint();
        set(unauthenticatedState);
        return null;
      } finally {
        setSessionChecked();
        checkAuthPromise = null;
      }
    })();

    return checkAuthPromise;
  },

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password }, { skipAuthRefresh: true });
    setSessionHint();
    set({ user: data.data.user, isAuthenticated: true, isLoading: false });
    try {
      const prefs = data.data.user?.preferences || {};
      const s = useSettingsStore.getState();
      if (prefs.fontSize !== undefined && s.setFontSize) s.setFontSize(prefs.fontSize);
      if (prefs.density !== undefined && s.setDensity) s.setDensity(prefs.density);
      if (prefs.timerVisibility !== undefined && s.setTimerVisibility) s.setTimerVisibility(prefs.timerVisibility);
      if (prefs.showCorrectAnswerInstantly !== undefined && s.setShowCorrectAnswerInstantly) s.setShowCorrectAnswerInstantly(prefs.showCorrectAnswerInstantly);
      if (prefs.reducedMotion !== undefined && s.setReducedMotion) s.setReducedMotion(prefs.reducedMotion);
      if (prefs.aiExplanations !== undefined && s.setAIExplanations) s.setAIExplanations(prefs.aiExplanations);
      if (prefs.aiPersonality !== undefined && s.setAIPersonality) s.setAIPersonality(prefs.aiPersonality);
      if (prefs.keyboardShortcutsEnabled !== undefined && s.setKeyboardShortcutsEnabled) s.setKeyboardShortcutsEnabled(prefs.keyboardShortcutsEnabled);
      if (prefs.focusMode !== undefined && s.setFocusMode) s.setFocusMode(prefs.focusMode);
      if (prefs.isNavigatorCollapsed !== undefined && s.setNavigatorCollapsed) s.setNavigatorCollapsed(prefs.isNavigatorCollapsed);
      if (prefs.isAICollapsed !== undefined && s.setAICollapsed) s.setAICollapsed(prefs.isAICollapsed);
      if (prefs.panelWidths !== undefined && s.setPanelWidths) s.setPanelWidths(prefs.panelWidths);
    } catch (e) {
      // ignore
    }
    return data;
  },

  register: async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password }, { skipAuthRefresh: true });
    setSessionHint();
    set({ user: data.data.user, isAuthenticated: true, isLoading: false });
    try {
      const prefs = data.data.user?.preferences || {};
      const s = useSettingsStore.getState();
      if (prefs.fontSize !== undefined && s.setFontSize) s.setFontSize(prefs.fontSize);
      if (prefs.density !== undefined && s.setDensity) s.setDensity(prefs.density);
      if (prefs.timerVisibility !== undefined && s.setTimerVisibility) s.setTimerVisibility(prefs.timerVisibility);
      if (prefs.showCorrectAnswerInstantly !== undefined && s.setShowCorrectAnswerInstantly) s.setShowCorrectAnswerInstantly(prefs.showCorrectAnswerInstantly);
      if (prefs.reducedMotion !== undefined && s.setReducedMotion) s.setReducedMotion(prefs.reducedMotion);
      if (prefs.aiExplanations !== undefined && s.setAIExplanations) s.setAIExplanations(prefs.aiExplanations);
      if (prefs.aiPersonality !== undefined && s.setAIPersonality) s.setAIPersonality(prefs.aiPersonality);
      if (prefs.keyboardShortcutsEnabled !== undefined && s.setKeyboardShortcutsEnabled) s.setKeyboardShortcutsEnabled(prefs.keyboardShortcutsEnabled);
      if (prefs.focusMode !== undefined && s.setFocusMode) s.setFocusMode(prefs.focusMode);
      if (prefs.isNavigatorCollapsed !== undefined && s.setNavigatorCollapsed) s.setNavigatorCollapsed(prefs.isNavigatorCollapsed);
      if (prefs.isAICollapsed !== undefined && s.setAICollapsed) s.setAICollapsed(prefs.isAICollapsed);
      if (prefs.panelWidths !== undefined && s.setPanelWidths) s.setPanelWidths(prefs.panelWidths);
    } catch (e) {
      // ignore
    }
    return data;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout', {}, { skipAuthRefresh: true });
    } finally {
      clearSessionHint();
      set(unauthenticatedState);
    }
  },
  updateProfile: async (payload) => {
    const { data } = await api.patch('/auth/me', payload);
    set({ user: data.data.user });
    try {
      const prefs = data.data.user?.preferences || {};
      const s = useSettingsStore.getState();
      if (prefs.fontSize !== undefined && s.setFontSize) s.setFontSize(prefs.fontSize);
      if (prefs.density !== undefined && s.setDensity) s.setDensity(prefs.density);
      if (prefs.timerVisibility !== undefined && s.setTimerVisibility) s.setTimerVisibility(prefs.timerVisibility);
      if (prefs.showCorrectAnswerInstantly !== undefined && s.setShowCorrectAnswerInstantly) s.setShowCorrectAnswerInstantly(prefs.showCorrectAnswerInstantly);
      if (prefs.reducedMotion !== undefined && s.setReducedMotion) s.setReducedMotion(prefs.reducedMotion);
      if (prefs.aiExplanations !== undefined && s.setAIExplanations) s.setAIExplanations(prefs.aiExplanations);
      if (prefs.aiPersonality !== undefined && s.setAIPersonality) s.setAIPersonality(prefs.aiPersonality);
      if (prefs.keyboardShortcutsEnabled !== undefined && s.setKeyboardShortcutsEnabled) s.setKeyboardShortcutsEnabled(prefs.keyboardShortcutsEnabled);
      if (prefs.focusMode !== undefined && s.setFocusMode) s.setFocusMode(prefs.focusMode);
      if (prefs.isNavigatorCollapsed !== undefined && s.setNavigatorCollapsed) s.setNavigatorCollapsed(prefs.isNavigatorCollapsed);
      if (prefs.isAICollapsed !== undefined && s.setAICollapsed) s.setAICollapsed(prefs.isAICollapsed);
      if (prefs.panelWidths !== undefined && s.setPanelWidths) s.setPanelWidths(prefs.panelWidths);
    } catch (e) {
      // ignore
    }
    return data;
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, () => {
    clearSessionHint();
    useAuthStore.setState(unauthenticatedState);
  });

  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_HINT_KEY && event.newValue !== 'true') {
      useAuthStore.setState(unauthenticatedState);
    }
  });
}
