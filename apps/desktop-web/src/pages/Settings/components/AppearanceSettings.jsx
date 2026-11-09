import { Palette, Layout, Eye, Keyboard } from 'lucide-react';
import { useSettingsStore } from '../../../store/settingsStore';
import { SettingsSection, SettingsRow, SettingsToggle, SettingsSelect, SettingsRadioGroup } from './SettingsSection';

export function AppearanceSettings() {
  const settings = useSettingsStore();
  const update = settings.updatePreference;

  return (
    <div className="settings-tab-panel">
      <div className="settings-panel-hero"><h2 className="settings-panel-title">Appearance &amp; Accessibility</h2></div>
      <SettingsSection title="Theme" icon={Palette}>
        <SettingsRow title="Background" align="start">
          <SettingsRadioGroup value={settings.theme}
            onChange={(value) => update('theme', value)}
            options={[{ value: 'dark', label: 'Charcoal' }, { value: 'oled', label: 'Black' }, { value: 'light', label: 'Light' }]} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Reading & layout" icon={Layout}>
        <SettingsRow title="Information density">
          <SettingsSelect value={settings.density} onChange={(value) => update('density', value)}
            options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
        </SettingsRow>
        <SettingsRow title="Text size">
          <SettingsSelect value={settings.fontSize} onChange={(value) => update('fontSize', value)}
            options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Default' }, { value: 'lg', label: 'Large' }]} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Accessibility" icon={Eye}>
        <SettingsRow title="Reduce motion">
          <SettingsToggle checked={settings.reducedMotion} onChange={(value) => update('reducedMotion', value)} />
        </SettingsRow>
        <SettingsRow title="Stronger keyboard focus outlines">
          <SettingsToggle checked={settings.focusMode} onChange={(value) => update('focusMode', value)} />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Keyboard" icon={Keyboard}>
        <SettingsRow title="Enable keyboard shortcuts">
          <SettingsToggle checked={settings.keyboardShortcutsEnabled}
            onChange={(value) => update('keyboardShortcutsEnabled', value)} />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
export default AppearanceSettings;
