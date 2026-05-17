import { useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useQuizStore } from '../../store/quizStore';

const personalities = ['Encouraging', 'Neutral', 'Analytical'];

export default function Preferences() {
  const settings = useSettingsStore((s) => ({
    fontSize: s.fontSize,
    density: s.density,
    timerVisibility: s.timerVisibility,
    showCorrectAnswerInstantly: s.showCorrectAnswerInstantly,
    reducedMotion: s.reducedMotion,
    aiExplanations: s.aiExplanations,
    aiPersonality: s.aiPersonality,
  }));

  const actions = useSettingsStore((s) => ({
    setFontSize: s.setFontSize,
    setDensity: s.setDensity,
    setTimerVisibility: s.setTimerVisibility,
    setShowCorrectAnswerInstantly: s.setShowCorrectAnswerInstantly,
    setReducedMotion: s.setReducedMotion,
    setAIExplanations: s.setAIExplanations,
    setAIPersonality: s.setAIPersonality,
  }));

  const setInstant = useQuizStore((s) => s.setInstantFeedback);

  const [local, setLocal] = useState(settings);
  const [saving, setSaving] = useState(false);

  const onSave = () => {
    setSaving(true);
    try {
      actions.setFontSize(local.fontSize);
      actions.setDensity(local.density);
      actions.setTimerVisibility(local.timerVisibility);
      actions.setShowCorrectAnswerInstantly(local.showCorrectAnswerInstantly);
      actions.setReducedMotion(local.reducedMotion);
      actions.setAIExplanations(local.aiExplanations);
      actions.setAIPersonality(local.aiPersonality);

      // Apply instant feedback to active quiz runtime
      setInstant(local.showCorrectAnswerInstantly);

      alert('Preferences saved');
    } catch (err) {
      console.error(err);
      alert('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: 'var(--color-surface)', padding: 24, borderRadius: 10, border: '1px solid var(--color-border)' }}>
      <h2 style={{ marginBottom: 8 }}>Preferences</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 18 }}>Customize your learning environment and AI assistant behavior.</p>

      <section style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 8 }}>Quiz Experience</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Show Correct Answer Instantly</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Reveal the correct answer as soon as you submit an answer.</div>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={local.showCorrectAnswerInstantly} onChange={(e) => setLocal({ ...local, showCorrectAnswerInstantly: e.target.checked })} />
          </label>
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 8 }}>Accessibility</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {['sm', 'md', 'lg'].map((size) => (
            <button key={size} onClick={() => setLocal({ ...local, fontSize: size })} style={{ flex: 1, padding: 12, borderRadius: 8, background: local.fontSize === size ? 'var(--color-primary)' : 'transparent', color: local.fontSize === size ? '#fff' : 'inherit' }}>{size === 'sm' ? 'Small' : size === 'md' ? 'Default' : 'Large'}</button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Reduced Motion</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Limit animations and motion effects for accessibility.</div>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={local.reducedMotion} onChange={(e) => setLocal({ ...local, reducedMotion: e.target.checked })} />
          </label>
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 8 }}>AI Configuration</h3>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--color-border)', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>AI Explanations</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Enable AI-generated explanations for questions.</div>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={local.aiExplanations} onChange={(e) => setLocal({ ...local, aiExplanations: e.target.checked })} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>AI Personality</div>
            <select value={local.aiPersonality} onChange={(e) => setLocal({ ...local, aiPersonality: e.target.value })} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--color-border)' }}>
              {personalities.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </section>

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button onClick={() => window.history.back()} style={{ padding: '8px 14px', borderRadius: 8 }}>Cancel</button>
        <button onClick={onSave} disabled={saving} style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--color-primary)', color: '#fff' }}>{saving ? 'Saving...' : 'Save Changes'}</button>
      </div>
    </div>
  );
}
