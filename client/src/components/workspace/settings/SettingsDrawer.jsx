import { memo } from 'react';
import { useSettingsStore } from '../../../store/settingsStore';
import { X, Type, MonitorSmartphone, Clock, Maximize, Keyboard } from 'lucide-react';

function SettingsDrawer() {
  const {
    isDrawerOpen,
    toggleDrawer,
    fontSize,
    setFontSize,
    density,
    setDensity,
    timerVisibility,
    setTimerVisibility,
    focusMode,
    toggleFocusMode,
    keyboardShortcutsEnabled,
    setKeyboardShortcutsEnabled
  } = useSettingsStore();

  if (!isDrawerOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100]"
        onClick={toggleDrawer}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl z-[101] flex flex-col animate-slide-in-right border-l border-zinc-200">
        <div className="h-14 px-5 flex items-center justify-between border-b border-zinc-100 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-900 tracking-tight">Appearance & Settings</h2>
          <button
            onClick={toggleDrawer}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-10 divide-y divide-zinc-100 custom-scrollbar">

          {/* Typography */}
          <section>
            <div className="flex items-center gap-2 mb-4 text-zinc-800">
              <Type className="w-4 h-4" />
              <h3 className="text-sm font-semibold">Typography</h3>
            </div>
            <div className="bg-zinc-50 p-2 rounded-xl flex gap-2">
              {['sm', 'md', 'lg'].map((size) => (
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg capitalize transition-colors min-h-[40px] ${fontSize === size ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-zinc-200/50' : 'text-zinc-500 hover:text-zinc-900'}`}
                >
                  {size === 'sm' ? 'Small' : size === 'md' ? 'Medium' : 'Large'}
                </button>
              ))}
            </div>
          </section>

          {/* Layout Density */}
          <section>
            <div className="flex items-center gap-2 mb-4 text-zinc-800">
              <MonitorSmartphone className="w-4 h-4" />
              <h3 className="text-sm font-semibold">Layout Density</h3>
            </div>
            <div className="bg-zinc-50 p-2 rounded-xl flex gap-2">
              {['compact', 'comfortable'].map((d) => (
                <button
                  key={d}
                  onClick={() => setDensity(d)}
                  className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg capitalize transition-colors min-h-[40px] ${density === d ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-zinc-200/50' : 'text-zinc-500 hover:text-zinc-900'}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </section>

          {/* Timer */}
          <section>
            <div className="flex items-center gap-2 mb-4 text-zinc-800">
              <Clock className="w-4 h-4" />
              <h3 className="text-sm font-semibold">Timer Display</h3>
            </div>
            <div className="bg-zinc-50 p-2 rounded-xl flex gap-2">
              {['visible', 'hidden'].map((v) => (
                <button
                  key={v}
                  onClick={() => setTimerVisibility(v)}
                  className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg capitalize transition-colors min-h-[40px] ${timerVisibility === v ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-zinc-200/50' : 'text-zinc-500 hover:text-zinc-900'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </section>

          {/* Focus Mode Toggle */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-zinc-800">
                <Maximize className="w-4 h-4" />
                <h3 className="text-sm font-semibold">Focus Mode</h3>
              </div>
              <button
                type="button"
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${focusMode ? 'bg-indigo-600' : 'bg-zinc-200'}`}
                role="switch"
                aria-checked={focusMode}
                onClick={toggleFocusMode}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${focusMode ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>
            <p className="text-sm text-zinc-500 pl-8">Hides the navigator and AI panels for distraction-free reading.</p>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-zinc-800">
                <Keyboard className="w-4 h-4" />
                <h3 className="text-sm font-semibold">Keyboard Shortcuts</h3>
              </div>
              <button
                type="button"
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${keyboardShortcutsEnabled ? 'bg-indigo-600' : 'bg-zinc-200'}`}
                role="switch"
                aria-checked={keyboardShortcutsEnabled}
                onClick={() => setKeyboardShortcutsEnabled(!keyboardShortcutsEnabled)}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${keyboardShortcutsEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>
              {keyboardShortcutsEnabled && (
              <div className="mt-4 bg-zinc-50 rounded-xl p-6 text-sm text-zinc-600 space-y-3">
                <div className="flex justify-between"><span>Previous/Next</span><kbd className="font-sans font-bold">← / →</kbd></div>
                <div className="flex justify-between"><span>Select Option</span><kbd className="font-sans font-bold">1-4 / A-D</kbd></div>
                <div className="flex justify-between"><span>Flag Question</span><kbd className="font-sans font-bold">F</kbd></div>
                <div className="flex justify-between"><span>Toggle Focus</span><kbd className="font-sans font-bold">Ctrl+Shift+F</kbd></div>
                <div className="flex justify-between"><span>Submit Quiz</span><kbd className="font-sans font-bold">Ctrl+Enter</kbd></div>
              </div>
            )}
          </section>

        </div>
      </div>
    </>
  );
}

export default memo(SettingsDrawer);
