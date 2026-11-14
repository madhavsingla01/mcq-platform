import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, DollarSign, Package, TrendingUp, PlusCircle, ShieldCheck, UploadCloud } from 'lucide-react';

export default function MobileMarketplaceManagePage() {
  const navigate = useNavigate();

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
          <Sparkles size={20} strokeWidth={2.2} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--color-text)' }}>
            Seller Dashboard
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            Creator Studio &amp; Listing Management
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div
          style={{
            backgroundColor: 'var(--bg-card, #121214)',
            borderRadius: 'var(--radius-card, 20px)',
            border: '1px solid var(--color-border)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-success)', fontSize: '12px' }}>
            <DollarSign size={14} />
            <span>Earnings</span>
          </div>
          <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text)' }}>$0.00</span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>0 sales</span>
        </div>

        <div
          style={{
            backgroundColor: 'var(--bg-card, #121214)',
            borderRadius: 'var(--radius-card, 20px)',
            border: '1px solid var(--color-border)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-info)', fontSize: '12px' }}>
            <Package size={14} />
            <span>Listings</span>
          </div>
          <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text)' }}>0</span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>0 active</span>
        </div>
      </div>

      {/* Boundary & Lifecycle Notice */}
      <div
        style={{
          padding: '16px',
          borderRadius: 'var(--radius-card, 20px)',
          backgroundColor: 'rgba(255, 69, 0, 0.08)',
          border: '1px solid rgba(255, 69, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent)' }}>
          <ShieldCheck size={18} />
          <span style={{ fontSize: '14px', fontWeight: 600 }}>Creator Publishing Lifecycle</span>
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
          Creator listings follow the strict state machine: <strong style={{ color: 'var(--color-text)' }}>draft → pending_review → published → archived</strong>. Creator payouts and public seller publishing will be fully enabled in Phase 4.
        </p>
      </div>

      {/* Action to create */}
      <div
        style={{
          padding: '24px 16px',
          textAlign: 'center',
          backgroundColor: 'var(--bg-card, #121214)',
          borderRadius: 'var(--radius-card, 20px)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <Package size={32} style={{ color: 'var(--color-text-muted)' }} />
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--color-text)' }}>
          No Marketplace Listings Yet
        </h3>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)', maxWidth: '280px' }}>
          Create a new quiz to prepare it for community listing in the marketplace.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '240px', marginTop: '6px' }}>
          <button
            type="button"
            onClick={() => navigate('/upload')}
            className="interactive-tap matte-accent-btn"
            style={{
              padding: '10px 18px',
              borderRadius: 'var(--radius-control)',
              backgroundColor: 'var(--color-accent)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              border: 'none',
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            <UploadCloud size={16} />
            Upload Educational Resource
          </button>
          <button
            type="button"
            onClick={() => navigate('/explore')}
            className="interactive-tap"
            style={{
              padding: '8px 18px',
              borderRadius: 'var(--radius-control)',
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--color-text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            <PlusCircle size={15} />
            Explore Quizzes to Share
          </button>
        </div>
      </div>
    </div>
  );
}
