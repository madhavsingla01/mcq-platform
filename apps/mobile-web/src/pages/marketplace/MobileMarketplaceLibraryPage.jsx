import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, CheckCircle2, ArrowRight } from 'lucide-react';
import { marketplaceApi } from '../../api/client';

export default function MobileMarketplaceLibraryPage() {
  const navigate = useNavigate();
  const [entitlements, setEntitlements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadEntitlements = async () => {
      setIsLoading(true);
      try {
        const res = await marketplaceApi.getEntitlements({ status: 'active' });
        if (isMounted) {
          setEntitlements(res?.data?.entitlements || []);
        }
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

      {/* Header */}
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
          <BookOpen size={20} strokeWidth={2.2} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--color-text)' }}>
            Marketplace Library
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Your claimed and acquired quiz licenses
          </p>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading your library...
        </div>
      ) : entitlements.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {entitlements.map((item) => (
            <div
              key={item.entitlementId || item._id}
              style={{
                backgroundColor: 'var(--bg-card, #121214)',
                borderRadius: 'var(--radius-card, 20px)',
                border: '1px solid var(--color-border)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-success)', fontSize: '12px', fontWeight: 600 }}>
                <CheckCircle2 size={14} />
                <span>Active Entitlement</span>
              </div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--color-text)' }}>
                {item.listing?.title || 'Claimed Quiz'}
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>
                License: {item.licenseType || 'single_user'}
              </p>
              <div style={{ paddingTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => navigate(`/quiz/${item.listing?.contentRef?.id || item.listingId}`)}
                  className="interactive-tap"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'var(--color-accent)',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  Start Quiz <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: '40px 16px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-card, #121214)',
            borderRadius: 'var(--radius-card, 20px)',
            border: '1px solid var(--color-border)',
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
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-muted)',
            }}
          >
            <BookOpen size={20} />
          </div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--color-text)' }}>
            Your Library is Empty
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)', maxWidth: '280px' }}>
            You haven't claimed or acquired any marketplace quizzes yet.
          </p>
          <button
            type="button"
            onClick={() => navigate('/marketplace')}
            className="interactive-tap"
            style={{
              marginTop: '4px',
              padding: '8px 18px',
              borderRadius: 'var(--radius-control)',
              backgroundColor: 'var(--color-accent)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            Explore Marketplace
          </button>
        </div>
      )}
    </div>
  );
}
