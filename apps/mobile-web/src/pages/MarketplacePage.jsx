import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Store, FileQuestion, Star, Layers, Package, X, RefreshCw, BookOpen, Sparkles } from 'lucide-react';
import { marketplaceApi } from '../api/client';

const CATEGORIES = ['All', 'Quizzes', 'Decks', 'Bundles'];

function getCategoryFallbackIcon(category = '') {
  const cat = String(category).toLowerCase();
  if (cat.includes('deck') || cat.includes('flashcard')) return <Layers size={20} />;
  if (cat.includes('bundle')) return <Package size={20} />;
  return <FileQuestion size={20} />;
}

export default function MarketplacePage() {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [listings, setListings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransitional, setIsTransitional] = useState(false);
  const [error, setError] = useState(null);
  const [imageErrors, setImageErrors] = useState({});

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch genuine catalog listings
  const loadCatalog = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await marketplaceApi.getCatalog({
        q: debouncedSearch || undefined,
        category: selectedCategory !== 'All' ? selectedCategory : undefined,
      });

      if (res?.isTransitional) {
        setIsTransitional(true);
        setListings([]);
      } else {
        setIsTransitional(false);
        setListings(res?.data?.items || []);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load marketplace catalog');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, [selectedCategory, debouncedSearch]);

  return (
    <div
      className="mobile-marketplace-page"
      style={{
        padding: '16px 16px calc(24px + var(--safe-bottom))',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        minHeight: '100%',
        backgroundColor: 'var(--bg-base, #000000)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 69, 0, 0.15)',
              color: 'var(--color-accent, #ff4500)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Store size={20} strokeWidth={2.2} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--color-text)' }}>
              Marketplace
            </h1>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              Discover &amp; acquire community quizzes
            </p>
          </div>
        </div>

        {/* Quick Route Shortcuts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={() => navigate('/marketplace/library')}
            className="interactive-tap"
            aria-label="My Library"
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <BookOpen size={14} />
            <span>Library</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/marketplace/manage')}
            className="interactive-tap"
            aria-label="Seller Studio"
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: 'rgba(255, 69, 0, 0.15)',
              border: '1px solid rgba(255, 69, 0, 0.3)',
              color: 'var(--color-accent)',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Sparkles size={14} />
            <span>Studio</span>
          </button>
        </div>
      </div>

      {/* Search Bar - 16px font-size to prevent iOS auto-zoom */}
      <div style={{ position: 'relative', width: '100%' }}>
        <Search
          size={18}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-text-muted, #71717a)',
            pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search quizzes, decks, topics..."
          style={{
            width: '100%',
            height: '44px',
            paddingLeft: '38px',
            paddingRight: search ? '38px' : '12px',
            backgroundColor: 'var(--bg-surface, #101012)',
            border: '1px solid var(--color-border, rgba(255, 255, 255, 0.08))',
            borderRadius: 'var(--radius-control, 14px)',
            color: '#f4f4f5',
            fontSize: '16px', // Mandatory: 16px min for iOS Safari zoom prevention
            touchAction: 'manipulation',
            outline: 'none',
          }}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: '#71717a',
              cursor: 'pointer',
              touchAction: 'manipulation',
              padding: '6px',
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Category Pills */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className="interactive-tap"
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-pill, 9999px)',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 500,
                backgroundColor: isActive ? 'var(--color-accent, #ff4500)' : 'var(--bg-surface, #101012)',
                color: isActive ? '#ffffff' : 'var(--color-text-secondary, #a1a1aa)',
                border: isActive ? '1px solid transparent' : '1px solid var(--color-border, rgba(255, 255, 255, 0.08))',
                cursor: 'pointer',
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent',
                whiteSpace: 'nowrap',
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Transitional Launch State */}
      {isTransitional && (
        <div
          style={{
            padding: '24px 16px',
            backgroundColor: 'var(--bg-card, #121214)',
            borderRadius: 'var(--radius-card, 20px)',
            border: '1px solid rgba(255, 69, 0, 0.25)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: 'rgba(255, 69, 0, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-accent)',
            }}
          >
            <Store size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--color-text)' }}>
              Marketplace Catalog Preparing for Launch
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--color-text-secondary)', maxWidth: '320px', lineHeight: '1.4' }}>
              Published community quizzes will appear here upon Phase 2 backend activation.
            </p>
          </div>
          <button
            type="button"
            onClick={loadCatalog}
            className="interactive-tap"
            style={{
              marginTop: '4px',
              padding: '8px 18px',
              borderRadius: 'var(--radius-control)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              fontSize: '13px',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={14} />
            <span>Check Catalog Status</span>
          </button>
        </div>
      )}

      {/* Error state */}
      {error && !isTransitional && (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 'var(--radius-control)',
            backgroundColor: 'rgba(255, 69, 58, 0.1)',
            border: '1px solid rgba(255, 69, 58, 0.3)',
            color: '#ff453a',
            fontSize: '13px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={loadCatalog}
            style={{ color: '#ff453a', fontWeight: 600, fontSize: '13px', background: 'none', border: 'none' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Skeletons on loading */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              style={{
                height: '130px',
                borderRadius: 'var(--radius-card, 20px)',
                backgroundColor: 'var(--bg-card, #121214)',
                border: '1px solid var(--color-border)',
                opacity: 0.6,
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      ) : !isTransitional && listings.length > 0 ? (
        /* Listing Cards */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {listings.map((item) => {
            const isFree = item.isFree || item.price === 0 || item.price === '0.00' || item.price === '0';
            const displayPrice = isFree ? 'Free' : `$${Number(item.price || 0).toFixed(2)}`;
            const itemKey = item.listingId || item._id || item.id;
            const hasThumbnail = Boolean(item.thumbnailUrl) && !imageErrors[itemKey];

            return (
              <div
                key={itemKey}
                onClick={() => navigate(`/marketplace/${itemKey}`)}
                className="interactive-tap"
                style={{
                  backgroundColor: 'var(--bg-card, #121214)',
                  borderRadius: 'var(--radius-card, 20px)',
                  border: '1px solid var(--color-border, rgba(255, 255, 255, 0.08))',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-text-secondary)',
                        overflow: 'hidden',
                      }}
                    >
                      {hasThumbnail ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title}
                          onError={() => setImageErrors((prev) => ({ ...prev, [itemKey]: true }))}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        getCategoryFallbackIcon(item.category)
                      )}
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-pill)',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: 'rgba(255, 255, 255, 0.06)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {item.category || 'Quiz'}
                    </span>
                  </div>

                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: 'var(--radius-pill)',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: isFree ? 'var(--color-success-subtle)' : 'var(--color-accent-subtle)',
                      color: isFree ? 'var(--color-success)' : 'var(--color-accent)',
                      border: isFree ? '1px solid rgba(48, 209, 88, 0.3)' : '1px solid rgba(255, 69, 0, 0.3)',
                    }}
                  >
                    {displayPrice}
                  </span>
                </div>

                <h3
                  style={{
                    margin: 0,
                    fontSize: '15px',
                    fontWeight: 600,
                    color: 'var(--color-text)',
                    lineHeight: '1.4',
                  }}
                >
                  {item.title}
                </h3>

                {item.description && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: '13px',
                      color: 'var(--color-text-secondary)',
                      lineHeight: '1.4',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {item.description}
                  </p>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    {item.author?.displayName || item.authorName || 'Anonymous'}
                  </span>
                  {item.rating !== undefined && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '12px', color: '#ffd60a' }}>
                      <Star size={13} fill="#ffd60a" color="#ffd60a" />
                      <span>{Number(item.rating || 5.0).toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : !isTransitional ? (
        /* Empty State */
        <div
          style={{
            padding: '40px 16px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-card, #121214)',
            borderRadius: 'var(--radius-card, 20px)',
            border: '1px solid var(--color-border, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
            }}
          >
            <Store size={22} />
          </div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--color-text)' }}>
            No quizzes found
          </h3>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '13px', maxWidth: '280px' }}>
            {search
              ? `No quizzes matched "${search}". Try clearing search filters.`
              : 'There are currently no listings in this category.'}
          </p>
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="interactive-tap"
              style={{
                marginTop: '4px',
                padding: '6px 14px',
                borderRadius: 'var(--radius-control)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                fontSize: '12px',
              }}
            >
              Clear Search
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
