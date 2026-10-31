import React, { memo, useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSettingsStore } from '../../../store/settingsStore';
import { useUIStore } from '../../../store/uiStore';
import { useQuizStore } from '../../../store/quizStore';
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
  Clock,
  Volume2,
} from 'lucide-react';

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
    isDrawerOpen,
    toggleDrawer,
    fontSize,
    setFontSize,
    density,
    setDensity,
    timerVisibility,
    setTimerVisibility,
    keyboardShortcutsEnabled,
    setKeyboardShortcutsEnabled,
    showCorrectAnswerInstantly,
    setShowCorrectAnswerInstantly,
  } = useSettingsStore();

  const setInstantFeedback = useQuizStore((s) => s.setInstantFeedback);

  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('mcq.sound.enabled') !== 'false';
  });
  const [autoAdvance, setAutoAdvance] = useState(() => {
    return localStorage.getItem('mcq.quiz.autoAdvance') === 'true';
  });

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  if (!isDrawerOpen) return null;

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
  };

  const handleToggleAutoAdvance = (next) => {
    playAudioFeedback('toggle');
    setAutoAdvance(next);
    localStorage.setItem('mcq.quiz.autoAdvance', String(next));
  };

  const handleToggleTimer = (checked) => {
    playAudioFeedback('toggle');
    setTimerVisibility(checked ? 'visible' : 'hidden');
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
      toggleDrawer();
      navigate('/dashboard');
    }
  };

  return (
    <>
      <div className="settings-drawer-backdrop" onClick={toggleDrawer} />

      <aside className="settings-drawer-panel" role="dialog" aria-modal="true" aria-label="Practice Controls">
        {/* Drawer Header */}
        <div className="settings-drawer-header">
          <div className="settings-drawer-title-wrap">
            <Sliders size={18} className="text-orange-500" />
            <span>Practice Controls &amp; Settings</span>
          </div>

          <button
            type="button"
            onClick={toggleDrawer}
            className="settings-drawer-close"
            title="Close Settings (Esc)"
            aria-label="Close Settings"
          >
            <X size={17} />
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="settings-drawer-body">
          {/* Section 1: Visual Theme & Font */}
          <SettingsSection
            title="Visual Appearance"
            description="Adjust display contrast, text sizing, and full-screen immersion."
            icon={Palette}
          >
            <SettingsRow title="Theme Mode">
              <div className="flex items-center gap-1 bg-[#121215] border border-white/10 rounded-lg p-1">
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
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      theme === id
                        ? 'bg-orange-500 text-white font-bold shadow-sm'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Icon size={11} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </SettingsRow>

            <SettingsRow title="Font Size">
              <div className="flex items-center gap-1 bg-[#121215] border border-white/10 rounded-lg p-1">
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
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      fontSize === val
                        ? 'bg-orange-500 text-white font-bold shadow-sm'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </SettingsRow>

            <SettingsRow title="Fullscreen Immersion" description="Distraction-free exam viewport">
              <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
                <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
              </Button>
            </SettingsRow>
          </SettingsSection>

          {/* Section 2: Quiz Taking Mechanics */}
          <SettingsSection
            title="Solving Experience"
            description="Manage countdown display, audio feedback, and question advance."
            icon={Zap}
          >
            <SettingsRow
              title="Sound Cues"
              description="Subtle click audio on selection & answer toggles"
            >
              <SettingsToggle
                id="drawer-sound"
                checked={soundEnabled}
                onChange={handleToggleSound}
              />
            </SettingsRow>

            <SettingsRow
              title="Timer Display"
              description="Show remaining countdown in the top bar"
            >
              <SettingsToggle
                id="drawer-timer"
                checked={timerVisibility === 'visible'}
                onChange={handleToggleTimer}
              />
            </SettingsRow>

            <SettingsRow
              title="Instant Explanations"
              description="Reveal answers immediately upon answering"
            >
              <SettingsToggle
                id="drawer-instant"
                checked={Boolean(showCorrectAnswerInstantly)}
                onChange={handleToggleInstantFeedback}
              />
            </SettingsRow>

            <SettingsRow
              title="Auto-Advance"
              description="Jump to next question automatically on answer"
            >
              <SettingsToggle
                id="drawer-autoadvance"
                checked={autoAdvance}
                onChange={handleToggleAutoAdvance}
              />
            </SettingsRow>
          </SettingsSection>

          {/* Section 3: Keyboard Shortcuts */}
          <SettingsSection
            title="Keyboard Navigation"
            description="Rapid question answering via keys"
            icon={Keyboard}
          >
            <SettingsRow
              title="Enable Keyboard Shortcuts"
              description="A-D or 1-4 for options, arrows for navigation"
            >
              <SettingsToggle
                id="drawer-shortcuts"
                checked={keyboardShortcutsEnabled}
                onChange={(checked) => {
                  playAudioFeedback('toggle');
                  setKeyboardShortcutsEnabled(checked);
                }}
              />
            </SettingsRow>

            {keyboardShortcutsEnabled && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/5 text-xs text-gray-300">
                  <span>Select Option</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-black/50 border border-white/10 text-[11px] font-mono font-bold text-orange-400">1-4 / A-D</kbd>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/5 text-xs text-gray-300">
                  <span>Next / Prev</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-black/50 border border-white/10 text-[11px] font-mono font-bold text-orange-400">← / →</kbd>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/5 text-xs text-gray-300">
                  <span>Flag Question</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-black/50 border border-white/10 text-[11px] font-mono font-bold text-orange-400">F</kbd>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/5 text-xs text-gray-300">
                  <span>Submit Quiz</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-black/50 border border-white/10 text-[11px] font-mono font-bold text-orange-400">Ctrl+Enter</kbd>
                </div>
              </div>
            )}
          </SettingsSection>

          {/* Section 4: Share & Collaboration */}
          <SettingsSection
            title="Session Actions"
            description="Share this practice challenge or link with others."
            icon={Share2}
          >
            <SettingsRow title="Share Quiz Link">
              <Button variant="secondary" size="sm" onClick={copyShareLink}>
                {copied ? <Check size={13} className="text-emerald-400" /> : <Share2 size={13} />}
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
              </Button>
            </SettingsRow>
          </SettingsSection>
        </div>

        {/* Drawer Footer with Link to Full Settings */}
        <div className="settings-drawer-footer">
          <Link
            to="/settings"
            onClick={toggleDrawer}
            className="settings-link-pill text-xs flex items-center gap-1.5"
          >
            <Sliders size={13} />
            <span>Open All Platform Settings &rarr;</span>
          </Link>

          <Button variant="danger" size="sm" onClick={handleQuitQuiz}>
            <LogOut size={13} />
            <span>Quit Attempt</span>
          </Button>
        </div>
      </aside>
    </>
  );
}

export default memo(SettingsDrawer);
