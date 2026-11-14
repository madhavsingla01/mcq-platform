import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Star, FileQuestion, ShieldCheck, Sparkles, HelpCircle } from 'lucide-react';
import marketplaceService from '../../services/marketplace.service';

export default function ListingDetailsPage() {
  const { listingId } = useParams();
  const [listing, setListing] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchDetails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await marketplaceService.getListingDetails(listingId);
        if (isMounted) setListing(data?.data?.listing || data?.listing || data?.data || data);
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load listing details');
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
          maxWidth: '900px',
          margin: '40px auto',
          padding: '0 20px',
          color: 'var(--color-text-secondary, #a1a1aa)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            border: '2px solid rgba(255, 255, 255, 0.1)',
            borderTopColor: 'var(--accent-primary, #FF4500)',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <span>Loading listing details...</span>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div
        className="marketplace-detail-error"
        style={{
          maxWidth: '800px',
          margin: '40px auto',
          padding: '40px 24px',
          backgroundColor: 'rgba(18, 18, 20, 0.75)',
          borderRadius: 'var(--radius-card, 20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: 'var(--material-card-shadow)',
          backdropFilter: 'var(--material-blur)',
          textAlign: 'center',
        }}
      >
        <h2 style={{ color: '#f4f4f5', fontSize: '20px', marginBottom: '8px' }}>
          Listing Not Found
        </h2>
        <p style={{ color: '#a1a1aa', fontSize: '14px', marginBottom: '20px' }}>
          {error || 'The requested marketplace listing does not exist or has been removed.'}
        </p>
        <Link
          to="/marketplace"
          className="interactive-tap"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: 'var(--radius-control, 8px)',
            backgroundColor: 'var(--accent-primary, #FF4500)',
            color: '#ffffff',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '14px',
            touchAction: 'manipulation',
          }}
        >
          <ArrowLeft size={16} />
          Back to Marketplace
        </Link>
      </div>
    );
  }

  return (
    <div
      className="listing-details-page"
      style={{
        maxWidth: '960px',
        margin: '0 auto',
        padding: '24px 20px 60px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* Back button */}
      <div>
        <Link
          to="/marketplace"
          className="interactive-tap"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#a1a1aa',
            textDecoration: 'none',
            fontSize: '14px',
            touchAction: 'manipulation',
          }}
        >
          <ArrowLeft size={16} />
          Back to Catalog
        </Link>
      </div>

      {/* Main card */}
      <div
        style={{
          backgroundColor: 'rgba(18, 18, 20, 0.75)',
          borderRadius: 'var(--radius-card, 20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: 'var(--material-card-shadow)',
          backdropFilter: 'var(--material-blur)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  color: '#a1a1aa',
                  marginBottom: '10px',
                }}
              >
                {listing.category || 'Quiz'}
              </span>
              <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
                {listing.title}
              </h1>
            </div>

            <div
              style={{
                padding: '8px 18px',
                borderRadius: '9999px',
                fontSize: '18px',
                fontWeight: 700,
                backgroundColor: isFree ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 69, 0, 0.15)',
                color: isFree ? '#22c55e' : '#ff4500',
                border: isFree ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(255, 69, 0, 0.3)',
              }}
            >
              {displayPrice}
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '15px', color: '#d4d4d8', lineHeight: '1.6' }}>
            {listing.description || 'No description provided for this listing.'}
          </p>

          {/* Metadata Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              paddingTop: '16px',
            }}
          >
            <span style={{ fontSize: '14px', color: '#a1a1aa' }}>
              Creator: <strong style={{ color: '#f4f4f5' }}>{listing.author?.displayName || listing.authorName || 'Anonymous'}</strong>
            </span>

            {listing.rating !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', color: '#ffd60a' }}>
                <Star size={16} fill="#ffd60a" color="#ffd60a" />
                <span>{Number(listing.rating || 5.0).toFixed(1)}</span>
              </div>
            )}

            {listing.licenseType && (
              <span style={{ fontSize: '13px', color: '#a1a1aa' }}>
                License: <span style={{ textTransform: 'capitalize', color: '#f4f4f5' }}>{listing.licenseType.replace('_', ' ')}</span>
              </span>
            )}

            {listing.previewQuestionsCount !== undefined && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#0a84ff' }}>
                <HelpCircle size={14} />
                <span>{listing.previewQuestionsCount} Preview Questions</span>
              </span>
            )}
          </div>

          {/* Phase Boundary & Clear Status Indicator */}
          <div
            style={{
              marginTop: '8px',
              padding: '16px 20px',
              borderRadius: 'var(--radius-container, 14px)',
              backgroundColor: 'rgba(255, 69, 0, 0.08)',
              border: '1px solid rgba(255, 69, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary, #FF4500)' }}>
              <ShieldCheck size={18} />
              <span style={{ fontSize: '14px', fontWeight: 600 }}>Catalog Preview Mode</span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary, #a1a1aa)', lineHeight: '1.5' }}>
              Purchase and licensing transactions will be activated upon Payment Gateway integration in Phase 4. Published listings are currently in catalog preview mode with authoritative content ownership verified.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
