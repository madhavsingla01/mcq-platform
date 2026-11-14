import { Copy, X, CheckCircle, ArrowRight } from 'lucide-react';

export default function DuplicateActionSheet({
  isOpen = false,
  duplicateInfo = null,
  onReuse,
  onReimport,
  onDismiss,
}) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
      onClick={onDismiss}
    >
      <div
        style={{
          background: 'var(--bg-elevated, #18181b)',
          borderTopLeftRadius: 'var(--radius-sheet, 28px)',
          borderTopRightRadius: 'var(--radius-sheet, 28px)',
          borderTop: '1px solid var(--color-border, rgba(255, 255, 255, 0.12))',
          padding: '16px 20px calc(24px + env(safe-area-inset-bottom, 16px)) 20px',
          animation: 'slideUpSheet 280ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Apple Centered Drag Pill */}
        <div
          style={{
            width: 36,
            height: 5,
            borderRadius: 3,
            background: 'rgba(255, 255, 255, 0.25)',
            margin: '0 auto 16px',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'rgba(255, 69, 0, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-accent, #ff4500)',
            }}
          >
            <Copy size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Identical Dataset Detected
            </h3>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary, #a1a1aa)' }}>
              SHA-256 byte checksum match found
            </span>
          </div>
        </div>

        <p
          style={{
            fontSize: 14,
            color: 'var(--color-text-secondary, #a1a1aa)',
            lineHeight: 1.45,
            margin: '12px 0 20px 0',
          }}
        >
          {duplicateInfo?.title ? (
            <>An existing quiz titled <strong>"{duplicateInfo.title}"</strong> ({duplicateInfo.questionCount || 0} questions) was generated from this identical file.</>
          ) : (
            <>An existing verified educational resource matches this exact binary checksum. Reusing it skips processing and preserves your storage quota.</>
          )}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={onReuse}
            className="matte-accent-btn"
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 'var(--radius-control, 14px)',
              background: 'var(--color-accent, #ff4500)',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              touchAction: 'manipulation',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span>{duplicateInfo?.title ? 'Open Existing Quiz' : 'Reuse Existing Resource'}</span>
            <ArrowRight size={16} />
          </button>

          <button
            onClick={onReimport}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: 'var(--radius-control, 14px)',
              background: 'var(--bg-subtle, #1c1c1f)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            Re-import & Overwrite
          </button>

          <button
            onClick={onDismiss}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 'var(--radius-control, 14px)',
              background: 'transparent',
              color: 'var(--color-text-muted, #71717a)',
              border: 'none',
              fontSize: 14,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
