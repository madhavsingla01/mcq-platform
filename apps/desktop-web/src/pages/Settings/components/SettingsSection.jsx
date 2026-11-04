import React from 'react';
import { CustomSelect } from '../../../components/ui/CustomSelect';

export function SettingsInfo() {
  return null;
}

/**
 * SettingsSection
 * Reusable grouped settings container card with header, description, and children.
 */
export function SettingsSection({
  title,
  description,
  icon: Icon,
  badge,
  dangerZone = false,
  children,
  className = '',
  action,
}) {
  return (
    <section className={`settings-section-card ${dangerZone ? 'danger-zone' : ''} ${className}`}>
      {(title || description || action) && (
        <header className="settings-section-header">
          <div className="settings-section-header-text">
            {title && (
              <div className="settings-section-title-wrap">
                {Icon && <Icon size={18} className="settings-section-icon" />}
                <h3 className="settings-section-title">{title}</h3>
                {badge && <span className="settings-section-badge">{badge}</span>}
              </div>
            )}
          </div>
          {action && <div className="settings-section-header-action">{action}</div>}
        </header>
      )}

      <div className="settings-section-body">
        {children}
      </div>
    </section>
  );
}

/**
 * SettingsRow
 * Individual setting item with title, optional description, and right-hand control element.
 */
export function SettingsRow({
  title,
  description,
  children,
  align = 'center',
  destructive = false,
  className = '',
  onClick,
}) {
  const isClickable = Boolean(onClick);

  return (
    <div
      className={`settings-row-item ${align === 'start' ? 'align-start' : 'align-center'} ${destructive ? 'destructive' : ''} ${isClickable ? 'clickable' : ''} ${className}`}
      onClick={onClick}
    >
      <div className="settings-row-info">
        {title && (
          <div className="settings-row-title-wrap">
            <span className="settings-row-title">{title}</span>
            {description && <SettingsInfo text={description} />}
          </div>
        )}
      </div>

      {children && (
        <div className="settings-row-control" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * SettingsToggle
 * Modern switch toggle with animated sliding knob.
 */
export function SettingsToggle({
  checked,
  onChange,
  disabled = false,
  id,
  label,
  ariaLabel,
  size = 'md',
}) {
  return (
    <label
      htmlFor={id}
      className={`settings-switch-label ${disabled ? 'disabled' : ''} size-${size}`}
      title={label}
    >
      <input
        type="checkbox"
        id={id}
        checked={Boolean(checked)}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
        aria-label={ariaLabel}
        className="settings-switch-input"
      />
      <span className="settings-switch-slider">
        <span className="settings-switch-thumb" />
      </span>
      {label && <span className="settings-switch-text">{label}</span>}
    </label>
  );
}

/**
 * SettingsSelect
 * Stylized dropdown select.
 */
export function SettingsSelect({
  value,
  onChange,
  options = [],
  disabled = false,
  className = '',
  placeholder,
}) {
  return (
    <div className={`settings-select-wrapper ${className}`} style={{ minWidth: 160 }}>
      <CustomSelect
        value={value}
        onChange={onChange}
        options={options}
        disabled={disabled}
        placeholder={placeholder}
        size="md"
      />
    </div>
  );
}

/**
 * SettingsRadioGroup
 * Modern radio group with cards or pills.
 */
export function SettingsRadioGroup({
  value,
  onChange,
  options = [],
  disabled = false,
  layout = 'horizontal', // 'horizontal' | 'vertical' | 'grid'
}) {
  return (
    <div className={`settings-radio-group layout-${layout}`}>
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`settings-radio-card ${isSelected ? 'selected' : ''}`}
            disabled={disabled}
            onClick={() => onChange?.(opt.value)}
          >
            <div className="settings-radio-indicator">
              <div className="settings-radio-dot" />
            </div>
            <div className="settings-radio-text">
              <span className="settings-radio-label">{opt.label}</span>
              {opt.desc && <span className="settings-radio-desc">{opt.desc}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default SettingsSection;
