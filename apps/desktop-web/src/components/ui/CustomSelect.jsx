import React, { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import './CustomSelect.css';

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
  portal = false,
  dropdownClassName = '',
  ariaLabel,
  id,
  name,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState(null);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
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
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target) &&
        !listRef.current?.contains(e.target)
      ) {
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

  useLayoutEffect(() => {
    if (!isOpen || !portal || !triggerRef.current) return undefined;

    const updateDropdownPosition = () => {
      const dropdown = listRef.current;
      const optionsList = dropdown?.firstElementChild;
      if (!optionsList) return;
      const triggerRect = triggerRef.current.getBoundingClientRect();
      let scrollBoundary = containerRef.current?.parentElement;
      while (scrollBoundary && scrollBoundary !== document.body) {
        const overflowY = window.getComputedStyle(scrollBoundary).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') break;
        scrollBoundary = scrollBoundary.parentElement;
      }

      const viewport = document.documentElement;
      const boundary = scrollBoundary && scrollBoundary !== document.body
        ? scrollBoundary.getBoundingClientRect()
        : { top: 0, bottom: viewport.clientHeight, left: 0, right: viewport.clientWidth };
      const topEdge = Math.max(8, boundary.top + 4);
      const bottomEdge = Math.min(viewport.clientHeight - 8, boundary.bottom - 4);
      const leftEdge = Math.max(8, boundary.left);
      const rightEdge = Math.min(viewport.clientWidth - 8, boundary.right);
      if (triggerRect.bottom <= topEdge || triggerRect.top >= bottomEdge) {
        setIsOpen(false);
        return;
      }

      const style = window.getComputedStyle(dropdown);
      const chrome = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
        .reduce((sum, property) => sum + parseFloat(style[property]), 0);
      const desiredHeight = Math.min(240, optionsList.scrollHeight + chrome);
      const gap = 6;
      const spaceBelow = Math.max(0, bottomEdge - triggerRect.bottom - gap);
      const spaceAbove = Math.max(0, triggerRect.top - topEdge - gap);
      const openAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
      const availableHeight = openAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.min(desiredHeight, availableHeight);
      const width = Math.min(triggerRect.width, rightEdge - leftEdge);
      if (maxHeight <= 0 || width <= 0) {
        setIsOpen(false);
        return;
      }
      const left = Math.max(leftEdge, Math.min(triggerRect.left, rightEdge - width));
      const top = openAbove
        ? triggerRect.top - maxHeight - gap
        : triggerRect.bottom + gap;

      setDropdownPosition((previous) => {
        const next = { top, left, width, maxHeight };
        if (
          previous &&
          previous.top === next.top &&
          previous.left === next.left &&
          previous.width === next.width &&
          previous.maxHeight === next.maxHeight
        ) {
          return previous;
        }
        return next;
      });
    };

    updateDropdownPosition();
    const panel = triggerRef.current.closest('.settings-menu-panel');
    panel?.addEventListener('animationend', updateDropdownPosition);
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
      panel?.removeEventListener('animationend', updateDropdownPosition);
    };
  }, [isOpen, portal, normalizedOptions.length]);

  useLayoutEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const list = listRef.current?.firstElementChild;
    const option = list?.children[activeIndex];
    if (!option) return;
    const visible = list.getBoundingClientRect();
    const item = option.getBoundingClientRect();
    if (item.bottom > visible.bottom) list.scrollTop += item.bottom - visible.bottom;
    else if (item.top < visible.top) list.scrollTop += item.top - visible.top;
  }, [activeIndex, isOpen, dropdownPosition]);

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
      e.stopPropagation();
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

  const dropdownMenu = (
    <div
      ref={listRef}
      id={`${selectId}-options`}
      className={`g2-select-dropdown ${portal ? 'g2-select-dropdown--portal' : 'animate-scale-fade'} ${dropdownClassName}`}
      role="listbox"
      tabIndex={-1}
      style={portal ? {
        position: 'fixed',
        top: dropdownPosition?.top ?? -1000,
        left: dropdownPosition?.left ?? -1000,
        width: dropdownPosition?.width,
        minWidth: 0,
        maxHeight: dropdownPosition?.maxHeight,
        zIndex: triggerRef.current?.closest('.settings-menu-panel') ? 1300 : 1100,
      } : undefined}
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
  );

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
        ref={triggerRef}
        id={selectId}
        className={`g2-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${selectId}-options`}
        aria-label={ariaLabel}
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
      {isOpen && (portal ? createPortal(dropdownMenu, document.body) : dropdownMenu)}

    </div>
  );
}

export default CustomSelect;
