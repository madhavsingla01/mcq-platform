import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Store, BookOpen, Sparkles, RefreshCw } from 'lucide-react';
import MarketplaceCard from '../../components/marketplace/MarketplaceCard';
import CategoryTabs from '../../components/marketplace/CategoryTabs';
import MarketplaceFilter from '../../components/marketplace/MarketplaceFilter';
import MarketplaceSkeleton from '../../components/marketplace/MarketplaceSkeleton';
import marketplaceService from '../../services/marketplace.service';

export default function MarketplaceCatalogPage() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('latest');
  const [listings, setListings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransitional, setIsTransitional] = useState(false);
  const [error, setError] = useState(null);
  const [refreshCount, setRefreshCount] = useState(0);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setIsLoading(true);
    setError(null);
    marketplaceService.fetchCatalog({
      q: debouncedSearch || undefined,
      category: selectedCategory !== 'All' ? selectedCategory : undefined,
      sortBy,
    }, { signal }).then(result => {
      if (signal.aborted) return;
      setIsTransitional(Boolean(result?.isTransitional));
      setListings(result?.isTransitional ? [] : result?.data?.items || []);
    }).catch(err => {
      if (!signal.aborted) setError(err.message || 'Failed to load marketplace catalog');
    }).finally(() => {
      if (!signal.aborted) setIsLoading(false);
    });
    return () => controller.abort();
  }, [selectedCategory, debouncedSearch, sortBy, refreshCount]);

  const refreshCatalog = () => setRefreshCount(count => count + 1);

  return (
    <div
      className="marketplace-catalog-page"
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '24px 20px 60px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* Catalog Header */}
      <div
        className="marketplace-header"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-container, 14px)',
                backgroundColor: 'rgba(255, 69, 0, 0.15)',
                color: 'var(--accent-primary, #FF4500)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Store size={22} strokeWidth={2.2} />
            </div>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: 700,
                  color: '#ffffff',
                  letterSpacing: '-0.02em',
                }}
              >
                QuizFocus Marketplace
              </h1>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary, #a1a1aa)' }}>
                Discover, share, and acquire high-quality community quizzes and study decks
              </p>
            </div>
          </div>

          {/* Quick links to Library and Seller Studio */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link
              to="/marketplace/library"
              className="interactive-tap"
              style={{
                padding: '8px 14px',
                borderRadius: 'var(--radius-control, 8px)',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: '#f4f4f5',
                fontSize: '13px',
                fontWeight: 500,
                textDecoration: 'none',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                touchAction: 'manipulation',
              }}
            >
              <BookOpen size={15} />
              <span>My Library</span>
            </Link>
            <Link
              to="/marketplace/manage"
              className="interactive-tap"
              style={{
                padding: '8px 14px',
                borderRadius: 'var(--radius-control, 8px)',
                backgroundColor: 'var(--accent-primary, #FF4500)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                touchAction: 'manipulation',
              }}
            >
              <Sparkles size={15} />
              <span>Seller Dashboard</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Filter and Category Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <CategoryTabs
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />
        <MarketplaceFilter
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />
      </div>

      {/* Transitional Launch State */}
      {isTransitional && (
        <div
          className="marketplace-transitional-banner"
          style={{
            padding: '32px 24px',
            borderRadius: 'var(--radius-card, 20px)',
            backgroundColor: 'rgba(18, 18, 20, 0.75)',
            border: '1px solid rgba(255, 69, 0, 0.3)',
            boxShadow: 'var(--material-card-shadow)',
            backdropFilter: 'var(--material-blur)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '14px',
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: 'var(--radius-container, 14px)',
              backgroundColor: 'rgba(255, 69, 0, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary, #FF4500)',
            }}
          >
            <Store size={26} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f4f4f5' }}>
              Marketplace Catalog is Preparing for Launch
            </h3>
            <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#a1a1aa', maxWidth: '460px', lineHeight: '1.5' }}>
              Published community quizzes will appear here upon Phase 2 activation. Browse the community catalog or check back shortly.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshCatalog}
            className="interactive-tap"
            style={{
              marginTop: '4px',
              padding: '10px 20px',
              borderRadius: 'var(--radius-control, 8px)',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              touchAction: 'manipulation',
            }}
          >
            <RefreshCw size={15} />
            <span>Check Catalog Status</span>
          </button>
        </div>
      )}

      {/* Error state */}
      {error && !isTransitional && (
        <div
          style={{
            padding: '16px 20px',
            borderRadius: 'var(--radius-container, 14px)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            fontSize: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={refreshCatalog}
            style={{ color: '#ef4444', fontWeight: 600, fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Catalog Grid */}
      {isLoading ? (
        <MarketplaceSkeleton count={8} />
      ) : !isTransitional && listings.length > 0 ? (
        <div
          className="marketplace-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '24px',
          }}
        >
          {listings.map((item) => (
            <MarketplaceCard key={item.listingId || item._id || item.id} listing={item} />
          ))}
        </div>
      ) : !isTransitional ? (
        /* Empty State */
        <div
          className="marketplace-empty-state"
          style={{
            padding: '60px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            backgroundColor: 'rgba(18, 18, 20, 0.75)',
            borderRadius: 'var(--radius-card, 20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: 'var(--material-card-shadow)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#71717a',
            }}
          >
            <Store size={24} />
          </div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f4f4f5' }}>
            No quizzes found
          </h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#a1a1aa', maxWidth: '380px' }}>
            {searchTerm
              ? `No quizzes matched "${searchTerm}". Try a different search term or category filter.`
              : 'There are currently no listings in this category. Check back soon!'}
          </p>
          {(searchTerm || selectedCategory !== 'All') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('All');
              }}
              className="interactive-tap"
              style={{
                marginTop: '8px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-control, 8px)',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
