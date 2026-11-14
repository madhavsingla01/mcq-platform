import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowLeft, PlusCircle, DollarSign, Package, TrendingUp, ShieldCheck } from 'lucide-react';

export default function MarketplaceManagePage() {
  return (
    <div
      className="marketplace-manage-page"
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
            <Sparkles size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
              Seller Dashboard
            </h1>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-secondary, #a1a1aa)' }}>
              Manage your published listings, monitor sales, and update pricing
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

      {/* Metrics Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        <div
          style={{
            backgroundColor: 'rgba(18, 18, 20, 0.75)',
            borderRadius: 'var(--radius-card, 20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: 'var(--material-card-shadow)',
            backdropFilter: 'var(--material-blur)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22c55e', fontSize: '13px' }}>
            <DollarSign size={16} />
            <span>Total Earnings</span>
          </div>
          <span style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff' }}>$0.00</span>
          <span style={{ fontSize: '12px', color: '#71717a' }}>No payout balance due</span>
        </div>

        <div
          style={{
            backgroundColor: 'rgba(18, 18, 20, 0.75)',
            borderRadius: 'var(--radius-card, 20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: 'var(--material-card-shadow)',
            backdropFilter: 'var(--material-blur)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0a84ff', fontSize: '13px' }}>
            <Package size={16} />
            <span>Active Listings</span>
          </div>
          <span style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff' }}>0</span>
          <span style={{ fontSize: '12px', color: '#71717a' }}>0 in draft or review</span>
        </div>

        <div
          style={{
            backgroundColor: 'rgba(18, 18, 20, 0.75)',
            borderRadius: 'var(--radius-card, 20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: 'var(--material-card-shadow)',
            backdropFilter: 'var(--material-blur)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ffd60a', fontSize: '13px' }}>
            <TrendingUp size={16} />
            <span>Total Claims &amp; Sales</span>
          </div>
          <span style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff' }}>0</span>
          <span style={{ fontSize: '12px', color: '#71717a' }}>Across all published quizzes</span>
        </div>
      </div>

      {/* Boundary & Lifecycle Notice */}
      <div
        style={{
          padding: '20px 24px',
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
          <span style={{ fontSize: '14px', fontWeight: 600 }}>Creator Publishing Lifecycle</span>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-secondary, #a1a1aa)', lineHeight: '1.5' }}>
          Marketplace listings follow the domain lifecycle: <strong style={{ color: '#ffffff' }}>draft → pending_review → published → archived</strong>. Creator payouts and public seller publishing tools will be fully enabled in Phase 4.
        </p>
      </div>

      {/* Empty listings state */}
      <div
        style={{
          backgroundColor: 'rgba(18, 18, 20, 0.75)',
          borderRadius: 'var(--radius-card, 20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: 'var(--material-card-shadow)',
          backdropFilter: 'var(--material-blur)',
          padding: '40px 24px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <Package size={36} style={{ color: '#71717a' }} />
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f4f4f5' }}>
          No Marketplace Listings Yet
        </h3>
        <p style={{ margin: 0, fontSize: '14px', color: '#a1a1aa', maxWidth: '360px' }}>
          Create a quiz and prepare it for publishing to the QuizFocus Marketplace to share with learners worldwide.
        </p>
        <Link
          to="/create"
          className="interactive-tap"
          style={{
            marginTop: '8px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: 'var(--radius-control, 8px)',
            backgroundColor: 'var(--accent-primary, #FF4500)',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            textDecoration: 'none',
            touchAction: 'manipulation',
          }}
        >
          <PlusCircle size={16} />
          Create New Quiz
        </Link>
      </div>
    </div>
  );
}
