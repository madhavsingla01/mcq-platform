import { useState, useRef } from 'react';
import { Hash, X } from 'lucide-react';
import './HashtagInput.css';

/**
 * Reusable Hashtag Chip Input component.
 * Allows users to type tags, press Enter or Comma to add.
 * Normalizes tags to lowercase, strips leading '#', removes duplicates.
 */
export default function HashtagInput({
  tags = [],
  onChange,
  maxTags = 10,
  placeholder = 'Add hashtags (e.g. javascript, dsa, upsc)...',
}) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);

  const cleanTag = (raw) => {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/^#+/, '')
      .replace(/[^a-z0-9_-]/g, '');
  };

  const addTag = (text) => {
    const cleaned = cleanTag(text);
    if (!cleaned) return;
    if (tags.map((t) => cleanTag(t)).includes(cleaned)) {
      setInputValue('');
      return;
    }
    if (tags.length >= maxTags) {
      setInputValue('');
      return;
    }
    onChange?.([...tags, cleaned]);
    setInputValue('');
  };

  const removeTag = (indexToRemove) => {
    onChange?.(tags.filter((_, idx) => idx !== indexToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  };

  return (
    <div
      className="qf-hashtag-input-container"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="qf-hashtag-chips-wrap">
        {tags.map((tag, idx) => {
          const display = cleanTag(tag);
          if (!display) return null;
          return (
            <span key={`${display}-${idx}`} className="qf-hashtag-chip">
              <span className="qf-chip-prefix">#</span>
              <span className="qf-chip-text">{display}</span>
              <button
                type="button"
                className="qf-chip-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(idx);
                }}
                aria-label={`Remove tag #${display}`}
              >
                <X size={12} />
              </button>
            </span>
          );
        })}

        {tags.length < maxTags && (
          <div className="qf-hashtag-input-field-wrap">
            <Hash size={14} className="qf-hashtag-field-icon" />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              placeholder={tags.length === 0 ? placeholder : 'Add more...'}
              className="qf-hashtag-field-input"
            />
          </div>
        )}
      </div>

      <div className="qf-hashtag-hint">
        <span>{tags.length} / {maxTags} tags</span>
        <span>Press Enter or Comma to add</span>
      </div>
    </div>
  );
}
