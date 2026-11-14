import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, FileQuestion, Store, BookOpen, Layers, ShieldCheck, Info } from 'lucide-react';
import { marketplaceApi } from '../../api/client';

export default function MobileListingDetailsPage() {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchDetails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await marketplaceApi.getListing(listingId);
        if (isMounted) {
          setListing(res?.data?.listing || res?.listing || res?.data || res);
        }
      } catch (err) {
        if (isMounted) {
          setError(err?.message || 'Listing not found or currently unavailable');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    if (listingId) {
      fetchDetails();
    }
    return () => { isMounted = false; };
  }, [listingId]);

  const isFree = listing?.isFree || listing?.price === 0 || listing?.price === '0.00' || listing?.price === '0';
  const displayPrice = isFree ? 'Free' : `$${Number(listing?.price || 0).toFixed(2)}`;

  if (isLoading) {
    return (
      <div
        style={{
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: '12px',
          color: 'var(--color-text-secondary, #a1a1aa)',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: '3px solid var(--color-border)',
            borderTopColor: 'var(--color-accent)',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <span style={{ fontSize: '14px' }}>Loading listing details...</span>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div
        style={{
          padding: '32px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '16px',
          minHeight: '50vh',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-pill)',
            backgroundColor: 'rgba(255, 69, 58, 0.12)',
            color: 'var(--color-danger, #ff453a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Info size={24} />
        </div>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text)' }}>
            Listing Unavailable
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '4px', maxWidth: '300px' }}>
            {error || 'This marketplace listing could not be found or has expired.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/marketplace')}
          className="interactive-tap"
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--radius-control)',
            backgroundColor: 'var(--color-accent)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <ArrowLeft size={16} />
          Return to Marketplace
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '16px 16px calc(24px + var(--safe-bottom))',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxWidth: '480px',
        margin: '0 auto',
      }}
    >
      {/* Top back button */}
      <div>
        <button
          type="button"
          onClick={() => navigate('/marketplace')}
          className="interactive-tap"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--color-text-secondary)',
            fontSize: '14px',
          }}
        >
          <ArrowLeft size={16} />
          Back to Catalog
        </button>
      </div>

      {/* Main card */}
      <div
        style={{
          backgroundColor: 'var(--bg-card, #121214)',
          borderRadius: 'var(--radius-card, 20px)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header section with price pill */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                borderRadius: 'var(--radius-pill)',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {listing.category || 'Quiz'}
            </span>

            <span
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-pill)',
                fontSize: '14px',
                fontWeight: 700,
                backgroundColor: isFree ? 'var(--color-success-subtle)' : 'var(--color-accent-subtle)',
                color: isFree ? 'var(--color-success)' : 'var(--color-accent)',
                border: isFree ? '1px solid rgba(48, 209, 88, 0.3)' : '1px solid rgba(255, 69, 0, 0.3)',
              }}
            >
              {displayPrice}
            </span>
          </div>

          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--color-text)', lineHeight: '1.3' }}>
            {listing.title}
          </h1>

          <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
            {listing.description || 'No description provided for this listing.'}
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '12px',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
              Author: <strong style={{ color: 'var(--color-text)' }}>{listing.author?.displayName || listing.authorName || 'Anonymous'}</strong>
            </span>
            {listing.rating !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#ffd60a' }}>
                <Star size={14} fill="#ffd60a" color="#ffd60a" />
                <span>{Number(listing.rating || 5.0).toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Phase Boundary & Licensing Notice */}
        <div
          style={{
            margin: '0 16px 16px',
            padding: '14px',
            borderRadius: 'var(--radius-control)',
            backgroundColor: 'rgba(255, 69, 0, 0.08)',
            border: '1px solid rgba(255, 69, 0, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent)' }}>
            <ShieldCheck size={16} />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Catalog Preview Mode</span>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>
            Purchase and licensing transactions will be activated upon Payment Gateway integration in Phase 4. Published listings are currently in catalog preview mode.
          </p>
        </div>
      </div>
    </div>
  );
}
