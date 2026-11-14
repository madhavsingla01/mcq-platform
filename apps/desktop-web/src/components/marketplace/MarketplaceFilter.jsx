import React from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';

export const SORT_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

export default function MarketplaceFilter({
  searchTerm = '',
  onSearchChange,
  sortBy = 'latest',
  onSortChange,
}) {
  return (
    <div
      className="marketplace-filter-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
        width: '100%',
      }}
    >
      {/* Search Input Container */}
      <div
        style={{
          position: 'relative',
          flex: '1 1 280px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Search
          size={18}
          style={{
            position: 'absolute',
            left: '12px',
            color: 'var(--color-text-muted, #71717a)',
            pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
          placeholder="Search quizzes, decks, topics..."
          className="marketplace-search-input"
          style={{
            width: '100%',
            height: '42px',
            paddingLeft: '38px',
            paddingRight: searchTerm ? '38px' : '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 'var(--radius-control, 8px)',
            color: '#f4f4f5',
            fontSize: '16px', // 16px min to prevent iOS auto-zoom
            outline: 'none',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
            transition: 'border-color 150ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)), background-color 150ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1))',
          }}
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => onSearchChange && onSearchChange('')}
            aria-label="Clear search"
            className="interactive-tap"
            style={{
              position: 'absolute',
              right: '10px',
              background: 'none',
              border: 'none',
              color: '#71717a',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '4px',
              touchAction: 'manipulation',
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Sort Select */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <SlidersHorizontal size={16} style={{ color: 'var(--color-text-muted, #71717a)' }} />
        <select
          value={sortBy}
          onChange={(e) => onSortChange && onSortChange(e.target.value)}
          aria-label="Sort listings"
          className="marketplace-sort-select"
          style={{
            height: '42px',
            padding: '0 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 'var(--radius-control, 8px)',
            color: '#f4f4f5',
            fontSize: '16px', // 16px min for iOS
            outline: 'none',
            cursor: 'pointer',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} style={{ backgroundColor: '#18181b', color: '#f4f4f5' }}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
