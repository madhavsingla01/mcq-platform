import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Settings, X } from 'lucide-react';
import { SettingsToggle } from '../../../pages/Settings/components/SettingsSection';
import CustomSelect from '../CustomSelect';
import './SettingsMenu.css';

/**
 * SettingsMenu
 * Unified settings component supporting 'popover', 'drawer', and 'modal' variants.
 * Strictly adheres to Emil Kowalski motion curves and dark neutral glass aesthetics.
 */
export default function SettingsMenu({
  trigger,
  triggerAriaLabel = 'Settings',
  variant = 'popover', // 'popover' | 'drawer' | 'modal'
  title,
  subtitle,
  icon: IconComponent,
  sections = [],
  tabs = [],
  activeTab,
  onTabChange,
  isOpen: controlledIsOpen,
  onOpenChange,
  onClose,
  align = 'right', // 'right' | 'left' | 'center'
  className = '',
  panelStyle = {},
  footer,
  children,
}) {
  const isControlled = typeof controlledIsOpen === 'boolean';
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? controlledIsOpen : internalOpen;

  const anchorRef = useRef(null);
  const panelRef = useRef(null);

  const setOpen = useCallback(
    (nextOpen) => {
      if (!isControlled) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
      if (!nextOpen) {
        onClose?.();
      }
    },
    [isControlled, onOpenChange, onClose]
  );

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setOpen]);

  // Click outside for Popover variant
  useEffect(() => {
    if (!isOpen || variant !== 'popover') return;

    const handlePointerDown = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, variant, setOpen]);

  // Render a single settings item
  const renderItem = (item) => {
    if (item.render) {
      return <div key={item.id} className="settings-menu-custom-item">{item.render()}</div>;
    }

    if (item.type === 'divider') {
      return <div key={item.id || Math.random()} className="settings-menu-divider" />;
    }

    const {
      id,
      label,
      description,
      icon,
      type = 'action',
      value,
      options = [],
      checked,
      onChange,
      onClick,
      primary,
      danger,
      disabled,
    } = item;

    return (
      <div key={id} className={`settings-menu-item-row type-${type}`}>
        <div className="settings-menu-item-info">
          <div className="settings-menu-item-label-wrap">
            {icon && <span className="settings-menu-item-icon">{icon}</span>}
            <span className="settings-menu-item-label">{label}</span>
          </div>
          {description && <span className="settings-menu-item-desc">{description}</span>}
        </div>

        <div className="settings-menu-item-control">
          {type === 'toggle' && (
            <SettingsToggle
              id={id}
              checked={checked}
              onChange={onChange}
              disabled={disabled}
              ariaLabel={label}
              size="sm"
            />
          )}

          {type === 'select' && (
            <CustomSelect
              value={value}
              onChange={onChange}
              options={options}
              disabled={disabled}
              size="sm"
              portal={variant === 'modal' || variant === 'drawer'}
            />
          )}

          {type === 'segmented' && (
            <div className="settings-menu-segmented" role="radiogroup" aria-label={label}>
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`settings-menu-segmented-btn ${value === opt.value ? 'is-active' : ''}`}
                  onClick={() => onChange?.(opt.value)}
                  disabled={disabled}
                  role="radio"
                  aria-checked={value === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {type === 'action' && (
            <button
              type="button"
              className={`settings-menu-action-btn ${primary ? 'is-primary' : ''} ${danger ? 'is-danger' : ''}`}
              onClick={(e) => onClick?.(e)}
              disabled={disabled}
            >
              {icon}
              <span>{label}</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  // Render structured sections
  const renderSections = () => {
    if (!sections || sections.length === 0) return null;

    return sections.map((sec, idx) => {
      const SecIcon = sec.icon;
      return (
        <section key={sec.id || idx} className="settings-menu-section">
          {(sec.title || SecIcon) && (
            <header className="settings-menu-section-header">
              <div className="settings-menu-section-title-wrap">
                {SecIcon && (React.isValidElement(SecIcon) ? SecIcon : <SecIcon size={14} />)}
                {sec.title && <h4 className="settings-menu-section-title">{sec.title}</h4>}
              </div>
              {sec.description && <span className="settings-menu-section-desc">{sec.description}</span>}
            </header>
          )}
          {sec.render ? (
            sec.render()
          ) : (
            <div className="settings-menu-section-items">
              {sec.items?.map((item) => renderItem(item))}
            </div>
          )}
        </section>
      );
    });
  };

  // Render Header
  const renderHeader = () => {
    if (!title && !subtitle && variant === 'popover' && !IconComponent) return null;

    return (
      <div className="settings-menu-header">
        <div className="settings-menu-title-wrap">
          {IconComponent && (
            <div className="settings-menu-icon-badge">
              {React.isValidElement(IconComponent) ? IconComponent : <IconComponent size={16} />}
            </div>
          )}
          <div className="settings-menu-title-col">
            {title && <h3 className="settings-menu-title">{title}</h3>}
            {subtitle && <p className="settings-menu-subtitle">{subtitle}</p>}
          </div>
        </div>
        <button
          type="button"
          className="settings-menu-close-btn"
          onClick={() => setOpen(false)}
          aria-label="Close settings"
        >
          <X size={16} />
        </button>
      </div>
    );
  };

  // Render Tabs Bar
  const renderTabsBar = () => {
    if (!tabs || tabs.length === 0) return null;

    return (
      <div className="settings-menu-tabs-bar" role="tablist">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`settings-menu-tab-btn ${isActive ? 'is-active' : ''}`}
              onClick={() => onTabChange?.(tab.id)}
            >
              {tab.icon && <span className="tab-icon">{tab.icon}</span>}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  // The inner settings panel
  const panelElement = (
    <div
      ref={panelRef}
      className={`settings-menu-panel variant-${variant} align-${align} ${className}`}
      style={panelStyle}
      role="dialog"
      aria-label={title || triggerAriaLabel}
      aria-modal={variant !== 'popover'}
      onClick={(e) => e.stopPropagation()}
    >
      {renderHeader()}
      {renderTabsBar()}
      <div className="settings-menu-body">
        {renderSections()}
        {children}
      </div>
      {footer && <div className="settings-menu-footer">{footer}</div>}
    </div>
  );

  // Trigger element
  const triggerElement = trigger ? (
    React.cloneElement(trigger, {
      onClick: (e) => {
        trigger.props.onClick?.(e);
        setOpen(!isOpen);
      },
      'aria-expanded': isOpen,
    })
  ) : (
    <button
      type="button"
      className={`settings-menu-default-trigger ${isOpen ? 'is-active' : ''}`}
      onClick={() => setOpen(!isOpen)}
      aria-label={triggerAriaLabel}
      aria-expanded={isOpen}
    >
      <Settings size={18} />
    </button>
  );

  // Return based on variant
  if (variant === 'popover') {
    return (
      <div className="settings-menu-anchor" ref={anchorRef}>
        {triggerElement}
        {isOpen && panelElement}
      </div>
    );
  }

  // For modal & drawer: Render backdrop + panel when open, alongside trigger
  return (
    <>
      {trigger && triggerElement}
      {isOpen && (
        <div
          className="settings-menu-backdrop"
          onClick={() => setOpen(false)}
        >
          {panelElement}
        </div>
      )}
    </>
  );
}
