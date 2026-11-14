import React, { useState } from 'react';
import { FileQuestion, Star, Layers, Package, Brain, Code, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function getFallbackCategoryIcon(category = '', tags = []) {
  const cat = String(category).toLowerCase();
  const tagList = Array.isArray(tags) ? tags.map((t) => String(t).toLowerCase()) : [];
  const combined = [cat, ...tagList].join(' ');

  if (combined.includes('deck') || combined.includes('flashcard')) return Layers;
  if (combined.includes('bundle') || combined.includes('pack')) return Package;
  if (combined.includes('code') || combined.includes('programming') || combined.includes('software')) return Code;
  if (combined.includes('ai') || combined.includes('brain') || combined.includes('science')) return Brain;
  if (combined.includes('store') || combined.includes('market')) return Store;
  return FileQuestion;
}

export default function MarketplaceCard({ listing, onClaim, onClick }) {
  const [imageError, setImageError] = useState(false);
  const navigate = useNavigate();

  if (!listing) return null;

  const isFree = listing.isFree || listing.price === 0 || listing.price === '0.00' || listing.price === '0';
  const displayPrice = isFree ? 'Free' : `$${Number(listing.price || 0).toFixed(2)}`;
  const hasThumbnail = Boolean(listing.thumbnailUrl) && !imageError;
  const FallbackIcon = getFallbackCategoryIcon(listing.category, listing.tags);
  const listingId = listing.listingId || listing._id || listing.id;

  const handleClick = () => {
    if (onClick) {
      onClick(listing);
    } else if (listingId) {
      navigate(`/marketplace/${listingId}`);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className="marketplace-card interactive-tap group"
      style={{
        backgroundColor: 'var(--bg-card, rgba(18, 18, 20, 0.75))',
        backdropFilter: 'var(--material-blur, blur(20px) saturate(180%))',
        WebkitBackdropFilter: 'var(--material-blur, blur(20px) saturate(180%))',
        borderRadius: 'var(--radius-card, 20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: 'var(--material-card-shadow, 0 4px 24px -1px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08))',
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 200ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)), box-shadow 200ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)), border-color 200ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1))',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Thumbnail area */}
      <div
        className="marketplace-card-thumb"
        style={{
          width: '100%',
          height: '160px',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {hasThumbnail ? (
          <img
            src={listing.thumbnailUrl}
            alt={listing.title}
            onError={() => setImageError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform 240ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1))',
            }}
          />
        ) : (
          <div
            className="marketplace-card-fallback-icon"
            style={{
              width: '64px',
              height: '64px',
              borderRadius: 'var(--radius-container, 14px)',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary, #FF4500)',
            }}
          >
            <FallbackIcon size={32} strokeWidth={1.75} />
          </div>
        )}

        {/* Category Pill on top-left of thumbnail */}
        {listing.category && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              padding: '3px 8px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              color: '#d4d4d8',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            {listing.category}
          </div>
        )}

        {/* Price badge on top-right of thumbnail */}
        <div
          className="marketplace-card-price-badge"
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            padding: '4px 10px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: 700,
            backgroundColor: isFree ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 69, 0, 0.2)',
            color: isFree ? '#22c55e' : '#ff4500',
            border: isFree ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(255, 69, 0, 0.4)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
          }}
        >
          {displayPrice}
        </div>
      </div>

      {/* Card Body */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, gap: '8px' }}>
        <h3
          className="marketplace-card-title"
          style={{
            margin: 0,
            fontSize: '16px',
            fontWeight: 600,
            color: '#f4f4f5',
            lineHeight: '1.4',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {listing.title}
        </h3>

        {listing.description && (
          <p
            style={{
              margin: 0,
              fontSize: '13px',
              color: 'var(--color-text-secondary, #a1a1aa)',
              lineHeight: '1.4',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {listing.description}
          </p>
        )}

        <div
          style={{
            marginTop: 'auto',
            paddingTop: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted, #71717a)' }}>
            {listing.author?.displayName || listing.authorName || 'Anonymous'}
          </span>
          {listing.rating !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#ffd60a' }}>
              <Star size={14} fill="#ffd60a" color="#ffd60a" />
              <span>{Number(listing.rating || 5.0).toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
