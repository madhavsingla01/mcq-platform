import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * CustomSelect Component
 * Fully customizable, accessible dropdown replacement for native HTML <select>.
 * Features G2 continuous squircle curvature, keyboard navigation, and custom themes.
 *
 * @param {Array<string|{value: string, label: string, icon?: React.ReactNode, badge?: string, disabled?: boolean}>} options
 * @param {string} value
 * @param {function} onChange
 * @param {string} [placeholder="Select an option..."]
 * @param {'sm'|'md'|'lg'} [size='md']
 * @param {boolean} [disabled=false]
 * @param {string} [className='']
 * @param {object} [style={}]
 */
export function CustomSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Select an option...',
  size = 'md',
  disabled = false,
  className = '',
  style = {},
  id,
  name,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const generatedId = useId();
  const selectId = id || generatedId;

  // Normalize options
  const normalizedOptions = options.map((opt) => {
    if (typeof opt === 'object' && opt !== null) {
      return {
        value: opt.value ?? '',
        label: opt.label ?? opt.value ?? '',
        icon: opt.icon || null,
        badge: opt.badge || null,
        disabled: Boolean(opt.disabled),
      };
    }
    return {
      value: String(opt),
      label: String(opt),
      icon: null,
      badge: null,
      disabled: false,
    };
  });

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        const currentIndex = normalizedOptions.findIndex((opt) => opt.value === value);
        setActiveIndex(currentIndex >= 0 ? currentIndex : 0);
      } else if (activeIndex >= 0 && activeIndex < normalizedOptions.length) {
        const option = normalizedOptions[activeIndex];
        if (!option.disabled) {
          onChange?.(option.value);
          setIsOpen(false);
        }
      }
    } else if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(0);
      } else {
        setActiveIndex((prev) => {
          let next = prev + 1;
          while (next < normalizedOptions.length && normalizedOptions[next].disabled) {
            next++;
          }
          return next < normalizedOptions.length ? next : prev;
        });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(normalizedOptions.length - 1);
      } else {
        setActiveIndex((prev) => {
          let next = prev - 1;
          while (next >= 0 && normalizedOptions[next].disabled) {
            next--;
          }
          return next >= 0 ? next : prev;
        });
      }
    }
  };

  const handleSelect = (option) => {
    if (option.disabled || disabled) return;
    onChange?.(option.value);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`g2-select-container ${size} ${disabled ? 'disabled' : ''} ${className}`}
      style={style}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        type="button"
        id={selectId}
        className={`g2-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="g2-select-trigger-content">
          {selectedOption?.icon && (
            <span className="g2-select-icon">{selectedOption.icon}</span>
          )}
          <span className={`g2-select-label ${!selectedOption ? 'placeholder' : ''}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="g2-select-badge">{selectedOption.badge}</span>
          )}
        </span>
        <ChevronDown
          size={16}
          className={`g2-select-chevron ${isOpen ? 'rotated' : ''}`}
        />
      </button>

      {/* Floating Menu Popover */}
      {isOpen && (
        <div
          ref={listRef}
          className="g2-select-dropdown animate-scale-fade"
          role="listbox"
          tabIndex={-1}
        >
          <div className="g2-select-options-list">
            {normalizedOptions.length === 0 ? (
              <div className="g2-select-empty">No options available</div>
            ) : (
              normalizedOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === activeIndex;

                return (
                  <div
                    key={opt.value || idx}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled}
                    className={`g2-select-option ${isSelected ? 'selected' : ''} ${
                      isHighlighted ? 'highlighted' : ''
                    } ${opt.disabled ? 'disabled' : ''}`}
                    onClick={() => handleSelect(opt)}
                    onMouseEnter={() => !opt.disabled && setActiveIndex(idx)}
                  >
                    <div className="g2-select-option-content">
                      {opt.icon && <span className="g2-select-icon">{opt.icon}</span>}
                      <span className="g2-select-option-label">{opt.label}</span>
                      {opt.badge && (
                        <span className="g2-select-badge">{opt.badge}</span>
                      )}
                    </div>
                    {isSelected && (
                      <Check size={14} className="g2-select-check" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Scoped CSS for G2 Squircle Curves and Styling */}
      <style>{`
        .g2-select-container {
          position: relative;
          display: inline-block;
          width: 100%;
          min-width: 140px;
          user-select: none;
          box-sizing: border-box;
          font-family: inherit;
        }

        .g2-select-trigger {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background-color: var(--color-surface, #0A0A0C);
          border: 1px solid var(--color-border, rgba(255, 255, 255, 0.12));
          border-radius: var(--radius-control, 8px);
          corner-shape: squircle;
          -webkit-corner-shape: squircle;
          color: var(--color-text, #FFFFFF);
          cursor: pointer;
          font-family: inherit;
          font-weight: 550;
          text-align: left;
          transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
          box-sizing: border-box;
        }

        /* Sizes */
        .g2-select-container.sm .g2-select-trigger {
          height: 32px;
          padding: 0 10px;
          font-size: 12.5px;
        }

        .g2-select-container.md .g2-select-trigger {
          height: 40px;
          padding: 0 14px;
          font-size: 13.5px;
        }

        .g2-select-container.lg .g2-select-trigger {
          height: 44px;
          padding: 0 16px;
          font-size: 14.5px;
        }

        .g2-select-trigger:hover:not(:disabled) {
          border-color: rgba(255, 255, 255, 0.22);
          background-color: #121215;
        }

        .g2-select-trigger.open {
          border-color: var(--color-primary, #FF4500);
          box-shadow: 0 0 0 2px rgba(255, 69, 0, 0.2);
          background-color: #121215;
        }

        .g2-select-trigger:focus-visible {
          outline: none;
          border-color: var(--color-primary, #FF4500);
          box-shadow: 0 0 0 2px rgba(255, 69, 0, 0.25);
        }

        .g2-select-trigger.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .g2-select-trigger-content {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 0;
        }

        .g2-select-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .g2-select-label.placeholder {
          color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
        }

        .g2-select-chevron {
          color: var(--color-text-secondary, rgba(255, 255, 255, 0.65));
          flex-shrink: 0;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), color 0.15s ease;
        }

        .g2-select-trigger:hover .g2-select-chevron {
          color: var(--color-text, #FFFFFF);
        }

        .g2-select-chevron.rotated {
          transform: rotate(180deg);
          color: var(--color-primary, #FF4500);
        }

        /* Dropdown Popover */
        .g2-select-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          z-index: 999;
          background: #0B0B0E;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: var(--radius-container, 14px);
          corner-shape: squircle;
          -webkit-corner-shape: squircle;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          padding: 6px;
          min-width: 100%;
          width: max-content;
          max-width: 320px;
          animation: g2SelectSlideDown 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes g2SelectSlideDown {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .g2-select-options-list {
          max-height: 240px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .g2-select-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border-radius: var(--radius-control, 8px);
          corner-shape: squircle;
          -webkit-corner-shape: squircle;
          color: var(--color-text-secondary, rgba(255, 255, 255, 0.8));
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.12s ease, color 0.12s ease;
          box-sizing: border-box;
        }

        .g2-select-option:hover,
        .g2-select-option.highlighted {
          background-color: rgba(255, 255, 255, 0.08);
          color: #FFFFFF;
        }

        .g2-select-option.selected {
          background-color: rgba(255, 69, 0, 0.12);
          color: var(--color-primary, #FF4500);
          font-weight: 650;
        }

        .g2-select-option.disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .g2-select-option-content {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex: 1;
        }

        .g2-select-option-label {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .g2-select-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .g2-select-badge {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: var(--radius-xs, 4px);
          corner-shape: squircle;
          background: rgba(255, 255, 255, 0.08);
          color: var(--color-text-muted, #A1A1AA);
          text-transform: uppercase;
        }

        .g2-select-check {
          color: var(--color-primary, #FF4500);
          flex-shrink: 0;
          margin-left: 8px;
        }

        .g2-select-empty {
          padding: 12px;
          text-align: center;
          color: var(--color-text-muted, rgba(255, 255, 255, 0.4));
          font-size: 12.5px;
        }
      `}</style>
    </div>
  );
}

export default CustomSelect;
