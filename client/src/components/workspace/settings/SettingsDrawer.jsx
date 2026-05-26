import { memo, useState } from 'react';
import { useSettingsStore } from '../../../store/settingsStore';
import { X, Type, MonitorSmartphone, Maximize, Keyboard, MessageCircle, Users, Settings as SettingsIcon, Link as LinkIcon } from 'lucide-react';
import ChatPanel from '../../session/ChatPanel';
import ParticipantsPanel from '../../session/ParticipantsPanel';

function SettingsDrawer({ collaboration }) {
  const {
    isDrawerOpen,
    toggleDrawer,
    fontSize,
    setFontSize,
    density,
    setDensity,
    keyboardShortcutsEnabled,
    setKeyboardShortcutsEnabled
  } = useSettingsStore();

  const [activeTab, setActiveTab] = useState('settings'); // 'settings', 'chat', 'participants'
  const [copied, setCopied] = useState(false);

  if (!isDrawerOpen) return null;

  const copyShareLink = async () => {
    if (!collaboration?.shareCode) return;
    const url = `${window.location.origin}/session/${collaboration.shareCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  };

  const showCollaboration = Boolean(collaboration?.sessionId);

  return (
    <>
      <div className="ws-drawer-backdrop" onClick={toggleDrawer} />

      <div className="ws-drawer">
        <div className="ws-drawer-header">
          <div className="ws-drawer-tabs">
            <button 
              className={`ws-tab-btn ${activeTab === 'settings' ? 'ws-tab-btn--active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
            {showCollaboration && (
              <>
                <button 
                  className={`ws-tab-btn ${activeTab === 'chat' ? 'ws-tab-btn--active' : ''}`}
                  onClick={() => setActiveTab('chat')}
                >
                  <MessageCircle className="w-4 h-4" />
                </button>
                <button 
                  className={`ws-tab-btn ${activeTab === 'participants' ? 'ws-tab-btn--active' : ''}`}
                  onClick={() => setActiveTab('participants')}
                >
                  <Users className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
          <button onClick={toggleDrawer} className="ws-drawer-close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="ws-drawer-body">
          {activeTab === 'settings' && (
            <div className="ws-settings-tab">
              <SettingsSection icon={<LinkIcon className="w-4 h-4" />} title="Share Link">
                <button className="ws-drawer-action-btn" onClick={copyShareLink}>
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </SettingsSection>

              <SettingsSection icon={<Maximize className="w-4 h-4" />} title="Screen">
                <button className="ws-drawer-action-btn" onClick={toggleFullscreen}>
                  Toggle Full Screen
                </button>
              </SettingsSection>

              <SettingsSection icon={<Type className="w-4 h-4" />} title="Font Size">
                <div className="ws-seg-control">
                  {[['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']].map(([val, label]) => (
                    <button key={val} onClick={() => setFontSize(val)}
                      className={`ws-seg-btn ${fontSize === val ? 'ws-seg-btn--active' : ''}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </SettingsSection>

              <SettingsSection icon={<MonitorSmartphone className="w-4 h-4" />} title="Density">
                <div className="ws-seg-control">
                  {[['compact', 'Compact'], ['comfortable', 'Comfortable']].map(([val, label]) => (
                    <button key={val} onClick={() => setDensity(val)}
                      className={`ws-seg-btn ${density === val ? 'ws-seg-btn--active' : ''}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </SettingsSection>

              <SettingsSection icon={<Keyboard className="w-4 h-4" />} title="Keyboard Shortcuts">
                <ToggleSwitch enabled={keyboardShortcutsEnabled} onToggle={() => setKeyboardShortcutsEnabled(!keyboardShortcutsEnabled)} />
                {keyboardShortcutsEnabled && (
                  <div className="ws-shortcuts-grid">
                    <ShortcutRow label="Previous / Next" keys="← / →" />
                    <ShortcutRow label="Select Option" keys="1-4 or A-D" />
                    <ShortcutRow label="Flag Question" keys="F" />
                    <ShortcutRow label="Submit Quiz" keys="Ctrl+Enter" />
                  </div>
                )}
              </SettingsSection>
            </div>
          )}

          {activeTab === 'chat' && showCollaboration && (
            <div className="ws-drawer-embedded-panel">
              <ChatPanel creatorId={collaboration.creatorId} />
            </div>
          )}

          {activeTab === 'participants' && showCollaboration && (
            <div className="ws-drawer-embedded-panel">
              <ParticipantsPanel creatorId={collaboration.creatorId} />
            </div>
          )}
        </div>
      </div>

      <style>{drawerStyles}</style>
    </>
  );
}

function SettingsSection({ icon, title, children }) {
  return (
    <section className="ws-setting-section">
      <div className="ws-setting-header">
        {icon}
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function ToggleSwitch({ enabled, onToggle }) {
  return (
    <button type="button" className={`ws-toggle ${enabled ? 'ws-toggle--on' : ''}`} role="switch" aria-checked={enabled} onClick={onToggle}>
      <span className="ws-toggle-thumb" />
    </button>
  );
}

function ShortcutRow({ label, keys }) {
  return (
    <div className="ws-shortcut-row">
      <span>{label}</span>
      <kbd>{keys}</kbd>
    </div>
  );
}

export default memo(SettingsDrawer);

const drawerStyles = `
  .ws-drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(4px);
    z-index: 100;
  }

  .ws-drawer {
    position: fixed;
    top: 0;
    right: 0;
    height: 100%;
    width: 380px;
    max-width: 100vw;
    background: #fff;
    border-left: 1px solid #e4e4e7;
    z-index: 101;
    display: flex;
    flex-direction: column;
    animation: ws-drawer-in 0.2s ease-out;
  }

  @keyframes ws-drawer-in {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .ws-drawer-header {
    height: 52px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #f4f4f5;
    flex-shrink: 0;
  }

  .ws-drawer-tabs {
    display: flex;
    gap: 8px;
  }

  .ws-tab-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: #71717a;
    cursor: pointer;
    transition: all 0.2s;
  }

  .ws-tab-btn:hover {
    background: #f4f4f5;
    color: #18181b;
  }

  .ws-tab-btn--active {
    background: #eef2ff;
    color: #6366f1;
  }

  .ws-drawer-close {
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    border-radius: 8px;
    color: #a1a1aa;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
  }

  .ws-drawer-close:hover { background: #f4f4f5; color: #18181b; }

  .ws-drawer-body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .ws-settings-tab {
    flex: 1;
    overflow-y: auto;
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .ws-drawer-embedded-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .ws-drawer-embedded-panel > * {
    flex: 1;
  }

  .ws-setting-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .ws-setting-header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #3f3f46;
  }

  .ws-setting-header h3 {
    font-size: 13px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .ws-drawer-action-btn {
    padding: 10px 16px;
    border: 1px solid #e4e4e7;
    background: #fafafa;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #18181b;
    cursor: pointer;
    transition: background 0.2s;
    text-align: left;
  }

  .ws-drawer-action-btn:hover {
    background: #f4f4f5;
  }

  /* ── Segmented Control ── */
  .ws-seg-control {
    display: flex;
    gap: 4px;
    background: #f4f4f5;
    padding: 4px;
    border-radius: 12px;
  }

  .ws-seg-btn {
    flex: 1;
    padding: 8px 12px;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 550;
    color: #71717a;
    background: none;
    cursor: pointer;
    transition: all 0.15s;
  }

  .ws-seg-btn:hover { color: #18181b; }

  .ws-seg-btn--active {
    background: #fff;
    color: #6366f1;
    
  }

  /* ── Toggle ── */
  .ws-toggle {
    position: relative;
    width: 44px;
    height: 24px;
    border: none;
    border-radius: 12px;
    background: #e4e4e7;
    cursor: pointer;
    transition: background 0.2s;
    flex-shrink: 0;
  }

  .ws-toggle--on { background: #6366f1; }

  .ws-toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 10px;
    background: #fff;
    
    transition: transform 0.2s;
  }

  .ws-toggle--on .ws-toggle-thumb { transform: translateX(20px); }

  /* ── Shortcuts ── */
  .ws-shortcuts-grid {
    display: flex;
    flex-direction: column;
    gap: 0;
    background: #fafafa;
    border-radius: 12px;
    padding: 4px 0;
    margin-top: 4px;
  }

  .ws-shortcut-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 14px;
    font-size: 13px;
    color: #52525b;
  }

  .ws-shortcut-row kbd {
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    color: #3f3f46;
    background: #fff;
    border: 1px solid #e4e4e7;
    padding: 2px 8px;
    border-radius: 6px;
  }
`;
