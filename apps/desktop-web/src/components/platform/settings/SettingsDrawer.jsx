import React, { memo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../../../store/settingsStore';
import { useUIStore } from '../../../store/uiStore';
import { useQuizStore } from '../../../store/quizStore';
import { useAuthStore } from '../../../store/authStore';
import './SettingsDrawer.css';
import {
  showCustomDialog,
  SettingsSection,
  SettingsRow,
  SettingsToggle,
  Button,
} from '../../ui';
import {
  X,
  Maximize,
  Minimize,
  Keyboard,
  Share2,
  LogOut,
  Check,
  Palette,
  Sun,
  Moon,
  Zap,
  Sliders,
} from 'lucide-react';

const getMenuPosition = () => {
  const trigger = document.querySelector('[data-settings-trigger]');
  if (!trigger) return { top: 84, right: 16 };

  const bounds = trigger.getBoundingClientRect();
  const panelWidth =
    document.querySelector('.settings-drawer-panel')?.getBoundingClientRect().width ??
    Math.min(420, document.documentElement.clientWidth - 24);
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const preferredRight = viewportWidth - bounds.right;
  const maxRight = viewportWidth - panelWidth - 8;

  return {
    top: Math.max(8, Math.min(bounds.bottom + 10, window.innerHeight - 180)),
    right: Math.max(8, Math.min(preferredRight, maxRight)),
  };
};

// Tiny Web Audio synthesizer click feedback
const playAudioFeedback = (type = 'click') => {
  try {
    const isSoundEnabled = localStorage.getItem('mcq.sound.enabled') !== 'false';
    if (!isSoundEnabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'click') {
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } else if (type === 'toggle') {
      osc.frequency.setValueAtTime(750, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(950, ctx.currentTime + 0.09);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    }
  } catch {}
};

function SettingsDrawer({ collaboration }) {
  const navigate = useNavigate();
  const { theme, setTheme } = useUIStore();
  const {
    setDrawerOpen,
    fontSize,
    setFontSize,
    timerVisibility,
    setTimerVisibility,
    keyboardShortcutsEnabled,
    setKeyboardShortcutsEnabled,
    showCorrectAnswerInstantly,
    setShowCorrectAnswerInstantly,
  } = useSettingsStore();

  const setInstantFeedback = useQuizStore((s) => s.setInstantFeedback);

  const user = useAuthStore((s) => s.user);
  const menuRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState(getMenuPosition);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (user?.preferences?.soundCues !== undefined) return Boolean(user.preferences.soundCues);
    return localStorage.getItem('mcq.sound.enabled') !== 'false';
  });
  const [autoAdvance, setAutoAdvance] = useState(() => {
    if (user?.preferences?.autoAdvance !== undefined) return Boolean(user.preferences.autoAdvance);
    return localStorage.getItem('mcq.quiz.autoAdvance') === 'true';
  });

  useEffect(() => {
    if (user?.preferences?.soundCues !== undefined) {
      setSoundEnabled(Boolean(user.preferences.soundCues));
      localStorage.setItem('mcq.sound.enabled', String(user.preferences.soundCues));
    }
    if (user?.preferences?.autoAdvance !== undefined) {
      setAutoAdvance(Boolean(user.preferences.autoAdvance));
      localStorage.setItem('mcq.quiz.autoAdvance', String(user.preferences.autoAdvance));
    }
  }, [user?.preferences?.soundCues, user?.preferences?.autoAdvance]);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useLayoutEffect(() => {
    const updatePosition = () => setMenuPosition(getMenuPosition());
    updatePosition();
    menuRef.current?.focus({ preventScroll: true });

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, []);

  useEffect(() => {
    const closeOnOutsidePointer = (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('.settings-drawer-panel, [data-settings-trigger]')) return;
      setDrawerOpen(false);
    };

    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setDrawerOpen(false);
      document.querySelector('[data-settings-trigger]')?.focus();
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [setDrawerOpen]);

  const copyShareLink = async () => {
    playAudioFeedback('click');
    const shareCode = collaboration?.shareCode;
    const url = shareCode
      ? `${window.location.origin}/session/${shareCode}`
      : window.location.href;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showCustomDialog({
        title: 'Share Quiz',
        message: `Share this link: ${url}`,
        type: 'info',
      });
    }
  };

  const toggleFullscreen = () => {
    playAudioFeedback('click');
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleToggleSound = (next) => {
    playAudioFeedback('toggle');
    setSoundEnabled(next);
    localStorage.setItem('mcq.sound.enabled', String(next));
    const auth = useAuthStore.getState();
    if (auth.isAuthenticated) {
      auth.updateProfile({ preferences: { soundCues: next } }).catch(() => {});
    }
  };

  const handleToggleAutoAdvance = (next) => {
    playAudioFeedback('toggle');
    setAutoAdvance(next);
    localStorage.setItem('mcq.quiz.autoAdvance', String(next));
    const auth = useAuthStore.getState();
    if (auth.isAuthenticated) {
      auth.updateProfile({ preferences: { autoAdvance: next } }).catch(() => {});
    }
  };

  const handleToggleTimer = (checked) => {
    playAudioFeedback('toggle');
    const mode = checked ? 'visible' : 'hidden';
    setTimerVisibility(mode);
    const auth = useAuthStore.getState();
    if (auth.isAuthenticated) {
      auth.updateProfile({ preferences: { timerVisibility: mode } }).catch(() => {});
    }
  };

  const handleToggleInstantFeedback = (checked) => {
    playAudioFeedback('toggle');
    setShowCorrectAnswerInstantly(checked);
    setInstantFeedback(checked);
  };

  const handleQuitQuiz = async () => {
    playAudioFeedback('click');
    const confirmed = await showCustomDialog({
      title: 'Quit Quiz Session?',
      message:
        'Are you sure you want to exit? Your selected answers are preserved in draft mode so you can resume later.',
      type: 'warning',
      confirmText: 'Quit Attempt',
      cancelText: 'Stay in Quiz',
    });

    if (confirmed) {
      setDrawerOpen(false);
      navigate('/dashboard');
    }
  };

  const closeMenu = () => {
    setDrawerOpen(false);
    document.querySelector('[data-settings-trigger]')?.focus();
  };

  return (
      <aside
        ref={menuRef}
        className="settings-drawer-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="settings-drawer-title"
        tabIndex={-1}
        id="settings-drawer"
        style={{
          '--settings-menu-top': `${menuPosition.top}px`,
          '--settings-menu-right': `${menuPosition.right}px`,
        }}
      >
        <div className="settings-drawer-header">
          <div className="settings-drawer-title-wrap">
            <div className="settings-drawer-title-icon">
              <Sliders size={18} />
            </div>
            <div className="settings-drawer-title-copy">
              <span className="settings-drawer-kicker">Practice Controls</span>
              <span className="settings-drawer-heading" id="settings-drawer-title">Session Settings</span>
            </div>
          </div>

          <button
            type="button"
            onClick={closeMenu}
            className="settings-drawer-close"
            title="Close Settings (Esc)"
            aria-label="Close Settings"
          >
            <X size={17} />
          </button>
        </div>

        <div className="settings-drawer-body">
          <SettingsSection
            className="settings-drawer-section"
            title="Visual Appearance"
            description="Adjust display contrast, text sizing, and full-screen immersion."
            icon={Palette}
          >
            <SettingsRow className="settings-drawer-row settings-drawer-row--stacked" title="Theme Mode">
              <div className="settings-drawer-segmented" role="group" aria-label="Theme mode">
                {[
                  { id: 'dark', label: 'Dark', icon: Moon },
                  { id: 'oled', label: 'OLED', icon: Moon },
                  { id: 'light', label: 'Light', icon: Sun },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      playAudioFeedback('click');
                      setTheme(id);
                    }}
                    className={`settings-drawer-segmented-button ${theme === id ? 'active' : ''}`}
                    aria-pressed={theme === id}
                  >
                    <Icon size={11} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </SettingsRow>

            <SettingsRow className="settings-drawer-row settings-drawer-row--stacked" title="Font Size">
              <div className="settings-drawer-segmented settings-drawer-segmented-small" role="group" aria-label="Font size">
                {[
                  ['sm', 'Small'],
                  ['md', 'Medium'],
                  ['lg', 'Large'],
                ].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      playAudioFeedback('click');
                      setFontSize(val);
                    }}
                    className={`settings-drawer-segmented-button settings-drawer-segmented-button-small ${fontSize === val ? 'active' : ''}`}
                    aria-pressed={fontSize === val}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </SettingsRow>

            <SettingsRow className="settings-drawer-row" title="Fullscreen Immersion" description="Distraction-free exam viewport">
              <Button className="settings-drawer-inline-button" variant="secondary" size="sm" onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
                <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
              </Button>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            className="settings-drawer-section"
            title="Solving Experience"
            description="Manage countdown display, audio feedback, and question advance."
            icon={Zap}
          >
            <SettingsRow
              className="settings-drawer-row"
              title="Sound Cues"
              description="Subtle click audio on selection & answer toggles"
            >
              <SettingsToggle
                id="drawer-sound"
                ariaLabel="Sound cues"
                checked={soundEnabled}
                onChange={handleToggleSound}
              />
            </SettingsRow>

            <SettingsRow
              className="settings-drawer-row"
              title="Timer Display"
              description="Show remaining countdown in the top bar"
            >
              <SettingsToggle
                id="drawer-timer"
                ariaLabel="Timer display"
                checked={timerVisibility === 'visible'}
                onChange={handleToggleTimer}
              />
            </SettingsRow>

            <SettingsRow
              className="settings-drawer-row"
              title="Instant Explanations"
              description="Reveal answers immediately upon answering"
            >
              <SettingsToggle
                id="drawer-instant"
                ariaLabel="Instant explanations"
                checked={Boolean(showCorrectAnswerInstantly)}
                onChange={handleToggleInstantFeedback}
              />
            </SettingsRow>

            <SettingsRow
              className="settings-drawer-row"
              title="Auto-Advance"
              description="Jump to next question automatically on answer"
            >
              <SettingsToggle
                id="drawer-autoadvance"
                ariaLabel="Auto-advance"
                checked={autoAdvance}
                onChange={handleToggleAutoAdvance}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            className="settings-drawer-section"
            title="Keyboard Navigation"
            description="Rapid question answering via keys"
            icon={Keyboard}
          >
            <SettingsRow
              className="settings-drawer-row"
              title="Enable Keyboard Shortcuts"
              description="A-D or 1-4 for options, arrows for navigation"
            >
              <SettingsToggle
                id="drawer-shortcuts"
                ariaLabel="Enable keyboard shortcuts"
                checked={keyboardShortcutsEnabled}
                onChange={(checked) => {
                  playAudioFeedback('toggle');
                  setKeyboardShortcutsEnabled(checked);
                }}
              />
            </SettingsRow>

            {keyboardShortcutsEnabled && (
              <div className="settings-drawer-shortcut-grid">
                <div className="settings-drawer-shortcut-item">
                  <span>Select Option</span>
                  <kbd className="settings-drawer-keycap">1-4 / A-D</kbd>
                </div>
                <div className="settings-drawer-shortcut-item">
                  <span>Next / Prev</span>
                  <kbd className="settings-drawer-keycap">← / →</kbd>
                </div>
                <div className="settings-drawer-shortcut-item">
                  <span>Flag Question</span>
                  <kbd className="settings-drawer-keycap">F</kbd>
                </div>
                <div className="settings-drawer-shortcut-item">
                  <span>Submit Quiz</span>
                  <kbd className="settings-drawer-keycap">Ctrl+Enter</kbd>
                </div>
              </div>
            )}
          </SettingsSection>

          <SettingsSection
            className="settings-drawer-section"
            title="Session Actions"
            description="Share this practice challenge or link with others."
            icon={Share2}
          >
            <SettingsRow className="settings-drawer-row" title="Share Quiz Link">
              <Button className="settings-drawer-inline-button" variant="secondary" size="sm" onClick={copyShareLink}>
                {copied ? <Check size={13} className="text-emerald-400" /> : <Share2 size={13} />}
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
              </Button>
            </SettingsRow>
          </SettingsSection>
        </div>

        <div className="settings-drawer-footer">
          <Button className="settings-drawer-quit-btn" variant="danger" size="sm" onClick={handleQuitQuiz}>
            <LogOut size={13} />
            <span>Quit Attempt</span>
          </Button>
        </div>
      </aside>
  );
}

export default memo(SettingsDrawer);
