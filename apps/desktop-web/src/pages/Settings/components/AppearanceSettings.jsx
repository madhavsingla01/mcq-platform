import React, { useState, useEffect } from 'react';
import { Palette, Moon, Sun, Monitor, Type, Layout, Eye, Check } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { useUIStore } from '../../../store/uiStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { SettingsInfo, SettingsSection, SettingsRow, SettingsToggle, SettingsSelect, SettingsRadioGroup } from './SettingsSection';

export function AppearanceSettings() {
  const { user, updateProfile } = useAuthStore();
  const { theme, setTheme } = useUIStore();
  const settingsStore = useSettingsStore();

  const [appearance, setAppearance] = useState({
    themeMode: theme || 'dark',
    density: settingsStore.density || 'comfortable',
    fontSize: settingsStore.fontSize || 'md',
    reducedMotion: Boolean(settingsStore.reducedMotion),
    focusMode: false,
  });

  const [toast, setToast] = useState('');

  useEffect(() => {
    const prefs = user?.preferences || {};
    setAppearance({
      themeMode: prefs.theme || theme || 'dark',
      density: prefs.density || settingsStore.density || 'comfortable',
      fontSize: prefs.fontSize || settingsStore.fontSize || 'md',
      reducedMotion: Boolean(prefs.reducedMotion ?? settingsStore.reducedMotion),
      focusMode: Boolean(prefs.focusMode),
    });
  }, [user, theme, settingsStore.density, settingsStore.fontSize, settingsStore.reducedMotion]);

  const showToast = (msg = 'Appearance updated') => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleUpdate = async (field, val) => {
    const next = { ...appearance, [field]: val };
    setAppearance(next);

    // Apply live
    if (field === 'themeMode') {
      setTheme(val);
    }
    if (field === 'density') {
      settingsStore.setDensity(val);
    }
    if (field === 'fontSize') {
      settingsStore.setFontSize(val);
    }
    if (field === 'reducedMotion') {
      settingsStore.setReducedMotion(val);
      if (val) {
        document.documentElement.classList.add('reduce-motion');
      } else {
        document.documentElement.classList.remove('reduce-motion');
      }
    }
    if (field === 'focusMode') {
      if (val) {
        document.documentElement.classList.add('focus-mode-active');
      } else {
        document.documentElement.classList.remove('focus-mode-active');
      }
    }

    try {
      await updateProfile({
        preferences: {
          theme: next.themeMode,
          density: next.density,
          fontSize: next.fontSize,
          reducedMotion: next.reducedMotion,
          focusMode: next.focusMode,
        },
      });
      showToast();
    } catch (err) {
      console.error('Failed to save appearance:', err);
    }
  };

  return (
    <div className="settings-tab-panel">
      {/* Category Hero */}
      <div className="settings-panel-hero">
        <div className="settings-panel-title-row">
          <h2 className="settings-panel-title">Appearance & Accessibility</h2>
          <SettingsInfo text="Customize the visual aesthetics, dark theme styles, interface density, and readability." />
        </div>
      </div>

      {toast && (
        <div className="settings-alert-banner success">
          <Check size={16} />
          <span>{toast}</span>
        </div>
      )}

      {/* 1. Theme Selection */}
      <SettingsSection
        title="Color Theme & Palette"
        description="Choose your preferred background tone and contrast level."
        icon={Palette}
      >
        <SettingsRow
          title="Theme Mode"
          align="start"
          className="theme-mode-row"
        >
          <SettingsRadioGroup
            value={appearance.themeMode}
            onChange={(val) => handleUpdate('themeMode', val)}
            options={[
              {
                value: 'oled',
                label: 'OLED Pitch Black & Orange',
              },
              {
                value: 'dark',
                label: 'Cyber Charcoal & Orange',
              },
              {
                value: 'light',
                label: 'Daylight Minimal',
              },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

      {/* 2. Layout & Typography */}
      <SettingsSection
        title="Interface Layout & Text Scale"
        description="Adjust spacing and font sizing across question screens and dashboards."
        icon={Layout}
      >
        <SettingsRow
          title="Information Density"
          description="Choose between relaxed spacing or compact information density."
        >
          <SettingsSelect
            value={appearance.density}
            onChange={(val) => handleUpdate('density', val)}
            options={[
              { value: 'comfortable', label: 'Comfortable (Standard)' },
              { value: 'compact', label: 'Compact (More data on screen)' },
            ]}
          />
        </SettingsRow>

        <SettingsRow
          title="Font Sizing"
          description="Scale default typography for quiz cards and questions."
        >
          <SettingsSelect
            value={appearance.fontSize}
            onChange={(val) => handleUpdate('fontSize', val)}
            options={[
              { value: 'sm', label: 'Small (14px)' },
              { value: 'md', label: 'Medium / Default (16px)' },
              { value: 'lg', label: 'Large (18px)' },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

      {/* 3. Accessibility & Motion */}
      <SettingsSection
        title="Motion & Cognitive Focus"
        description="Accessibility features to reduce visual distractions and motion."
        icon={Eye}
      >
        <SettingsRow
          title="Reduced Motion"
          description="Disables parallax shifts, floating gradient orbs, and energetic page transitions."
        >
          <SettingsToggle
            checked={appearance.reducedMotion}
            onChange={(checked) => handleUpdate('reducedMotion', checked)}
          />
        </SettingsRow>

        <SettingsRow
          title="High-Contrast Focus Mode"
          description="Strengthens borders and focus outlines for improved keyboard navigation."
        >
          <SettingsToggle
            checked={appearance.focusMode}
            onChange={(checked) => handleUpdate('focusMode', checked)}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

export default AppearanceSettings;
