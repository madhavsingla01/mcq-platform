import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import marketplaceService from '../../services/marketplace.service';

export default function MarketplaceLibraryPage() {
  const [entitlements, setEntitlements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadEntitlements = async () => {
      setIsLoading(true);
      try {
        const res = await marketplaceService.getUserEntitlements({ status: 'active' });
        if (isMounted) setEntitlements(res?.data?.entitlements || []);
      } catch {
        if (isMounted) setEntitlements([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadEntitlements();
    return () => { isMounted = false; };
  }, []);

  return (
    <div
      className="marketplace-library-page"
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '24px 20px 60px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* Header */}
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
            <BookOpen size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
              Marketplace Library
            </h1>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary, #a1a1aa)' }}>
              Quizzes, study decks, and bundles you own or claimed
            </p>
          </div>
        </div>

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

      {/* Content */}
      {isLoading ? (
        <div style={{ color: '#71717a', padding: '40px 0' }}>Loading your library...</div>
      ) : entitlements.length > 0 ? (
        <div
          className="marketplace-library-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          style={{ gap: '24px' }}
        >
          {entitlements.map((item) => (
            <div
              key={item.entitlementId || item._id}
              style={{
                backgroundColor: 'rgba(18, 18, 20, 0.75)',
                borderRadius: 'var(--radius-card, 20px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: 'var(--material-card-shadow)',
                backdropFilter: 'var(--material-blur)',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22c55e', fontSize: '13px', fontWeight: 600 }}>
                <CheckCircle2 size={16} />
                <span>Active Entitlement</span>
              </div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f4f4f5' }}>
                {item.listing?.title || 'Claimed Quiz'}
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#a1a1aa' }}>
                License: {item.licenseType || 'single_user'}
              </p>
              <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                <Link
                  to={`/quiz/${item.listing?.contentRef?.id || item.listingId}`}
                  className="interactive-tap"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: 'var(--accent-primary, #FF4500)',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: 600,
                    touchAction: 'manipulation',
                  }}
                >
                  Start Quiz <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: '60px 20px',
            textAlign: 'center',
            backgroundColor: 'rgba(18, 18, 20, 0.75)',
            borderRadius: 'var(--radius-card, 20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: 'var(--material-card-shadow)',
            backdropFilter: 'var(--material-blur)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
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
            <BookOpen size={24} />
          </div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f4f4f5' }}>
            Your Library is Empty
          </h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#a1a1aa', maxWidth: '360px' }}>
            You haven't claimed or purchased any marketplace quizzes yet.
          </p>
          <Link
            to="/marketplace"
            className="interactive-tap"
            style={{
              marginTop: '8px',
              padding: '10px 18px',
              borderRadius: 'var(--radius-control, 8px)',
              backgroundColor: 'var(--accent-primary, #FF4500)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              touchAction: 'manipulation',
            }}
          >
            Explore Marketplace
          </Link>
        </div>
      )}
    </div>
  );
}
