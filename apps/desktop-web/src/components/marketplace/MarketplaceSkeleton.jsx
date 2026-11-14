import React from 'react';

export default function MarketplaceSkeleton({ count = 8 }) {
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <div
      className="marketplace-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
      aria-label="Loading marketplace listings"
      style={{
        gap: '24px',
      }}
    >
      {items.map((idx) => (
        <div
          key={idx}
          className="marketplace-skeleton-card"
          style={{
            height: '320px',
            backgroundColor: 'var(--bg-card, #121214)',
            borderRadius: 'var(--radius-card, 20px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: 'var(--material-card-shadow)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            animation: 'pulse 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        >
          {/* Skeleton Thumbnail */}
          <div
            style={{
              width: '100%',
              height: '160px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '54px',
                height: '24px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
              }}
            />
          </div>

          {/* Skeleton Content */}
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, gap: '10px' }}>
            {/* Title Line 1 */}
            <div
              style={{
                height: '18px',
                width: '85%',
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
              }}
            />
            {/* Title Line 2 */}
            <div
              style={{
                height: '14px',
                width: '60%',
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
              }}
            />

            {/* Description lines */}
            <div
              style={{
                height: '12px',
                width: '95%',
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                marginTop: '4px',
              }}
            />
            <div
              style={{
                height: '12px',
                width: '75%',
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
              }}
            />

            {/* Bottom Meta */}
            <div
              style={{
                marginTop: 'auto',
                paddingTop: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid rgba(255, 255, 255, 0.04)',
              }}
            >
              <div
                style={{
                  height: '12px',
                  width: '70px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                }}
              />
              <div
                style={{
                  height: '12px',
                  width: '36px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
