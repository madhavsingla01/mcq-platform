import React from 'react';

export const MARKETPLACE_CATEGORIES = ['All', 'Quizzes', 'Decks', 'Bundles'];

export default function CategoryTabs({ selectedCategory = 'All', onSelectCategory }) {
  return (
    <div
      className="marketplace-category-tabs"
      role="tablist"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '4px',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {MARKETPLACE_CATEGORIES.map((category) => {
        const isActive = selectedCategory === category;
        return (
          <button
            key={category}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectCategory && onSelectCategory(category)}
            className="category-tab-btn interactive-tap"
            style={{
              padding: '8px 16px',
              borderRadius: '9999px',
              fontSize: '14px',
              fontWeight: isActive ? 600 : 500,
              backgroundColor: isActive ? 'var(--color-primary, #ff4500)' : 'rgba(255, 255, 255, 0.05)',
              color: isActive ? '#ffffff' : 'var(--color-text-secondary, #a1a1aa)',
              border: isActive ? '1px solid transparent' : '1px solid rgba(255, 255, 255, 0.08)',
              cursor: 'pointer',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              transition: 'background-color 150ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)), color 150ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)), border-color 150ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1))',
              whiteSpace: 'nowrap',
            }}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}
