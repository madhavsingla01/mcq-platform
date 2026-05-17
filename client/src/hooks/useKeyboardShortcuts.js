import { useEffect, useCallback } from 'react';
import { useUIStore } from '../store/uiStore';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent);

/**
 * Global keyboard shortcuts hook.
 *
 * @param {Object} handlers - Optional overrides for quiz-specific shortcuts
 * @param {Function} handlers.onPrev - Previous question
 * @param {Function} handlers.onNext - Next question
 * @param {Function} handlers.onSelectOption - Select option by index (0-3)
 * @param {Function} handlers.onFlag - Toggle flag on current question
 * @param {Function} handlers.onSubmit - Submit quiz
 * @param {boolean} enabled - Whether shortcuts are active
 */
export function useKeyboardShortcuts({
  onPrev,
  onNext,
  onSelectOption,
  onFlag,
  onSubmit,
  enabled = true,
} = {}) {
  // focus mode keyboard shortcuts removed

  const handleKeyDown = useCallback((e) => {
    if (!enabled) return;

    // Modifier key (Cmd on Mac, Ctrl on others)
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    // Ignore when typing in inputs
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) {
      return;
    }

    // focus-mode shortcuts removed

    // Arrow keys → Navigation
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      onPrev?.();
      return;
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      onNext?.();
      return;
    }

    // 1-9 → Select option
    if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      onSelectOption?.(parseInt(e.key, 10) - 1);
      return;
    }

    // A-D → Select option by label
    if (/^[a-dA-D]$/.test(e.key) && !modKey && !e.shiftKey) {
      e.preventDefault();
      onSelectOption?.(e.key.toUpperCase().charCodeAt(0) - 65);
      return;
    }

    // F → Flag/unflag
    if (e.key === 'f' || e.key === 'F') {
      if (!modKey && !e.shiftKey) {
        e.preventDefault();
        onFlag?.();
        return;
      }
    }

    // Ctrl/Cmd + Enter → Submit
    if (modKey && e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.();
      return;
    }
  }, [enabled, onPrev, onNext, onSelectOption, onFlag, onSubmit]);

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}
