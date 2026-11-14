import { CheckCircle2, Clock, UploadCloud, ShieldCheck, Sparkles, AlertTriangle, ShieldAlert, RefreshCw, ArrowRight } from 'lucide-react';

const STEPS = [
  { key: 'initiated', label: 'Lease', icon: Clock },
  { key: 'uploaded', label: 'Upload', icon: UploadCloud },
  { key: 'scanning', label: 'Inspect', icon: ShieldCheck },
  { key: 'processing', label: 'Process', icon: Sparkles },
  { key: 'ready', label: 'Ready', icon: CheckCircle2 },
];

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function MobileLifecycleProgress({
  status = 'initiated',
  progress = 0,
  metadata = null,
  error = null,
  onRetry,
  onReset,
  onContinue,
}) {
  const getStepIndex = (st) => {
    switch (st) {
      case 'initiated': return 0;
      case 'uploaded':
      case 'uploading': return 1;
      case 'scanning': return 2;
      case 'processing': return 3;
      case 'ready': return 4;
      default: return -1;
    }
  };

  const currentIdx = getStepIndex(status);
  const isFailed = ['rejected', 'failed', 'quarantined'].includes(status);
  const isReady = status === 'ready';

  return (
    <div className="mobile-card" style={{ padding: '24px 18px', background: 'var(--bg-card, #121214)' }}>
      {/* 5-State Horizontal Stepper Track */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'relative',
          marginBottom: 20,
        }}
      >
        {STEPS.map((step, idx) => {
          const IconComp = step.icon;
          const isDone = currentIdx > idx || (isReady && idx === 4);
          const isCurrent = currentIdx === idx && !isReady;

          return (
            <div
              key={step.key}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                flex: 1,
                opacity: isDone || isCurrent ? 1 : 0.35,
                transition: 'opacity 200ms ease',
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isDone
                    ? 'rgba(48, 209, 88, 0.15)'
                    : isCurrent
                    ? 'rgba(255, 69, 0, 0.15)'
                    : 'var(--bg-subtle, #1c1c1f)',
                  border: isDone
                    ? '1.5px solid var(--color-success, #30d158)'
                    : isCurrent
                    ? '1.5px solid var(--color-accent, #ff4500)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  color: isDone
                    ? 'var(--color-success, #30d158)'
                    : isCurrent
                    ? 'var(--color-accent, #ff4500)'
                    : 'var(--color-text-muted, #71717a)',
                  transition: 'all 200ms ease',
                }}
              >
                <IconComp size={16} />
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: isCurrent ? 'var(--color-accent, #ff4500)' : 'var(--color-text-secondary, #a1a1aa)',
                }}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress Bar (during active processing) */}
      {!isFailed && !isReady && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              height: 6,
              background: 'var(--bg-subtle, #1c1c1f)',
              borderRadius: 3,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.max(5, Math.min(100, progress))}%`,
                background: 'var(--color-accent, #ff4500)',
                borderRadius: 3,
                transition: 'width 240ms cubic-bezier(0.23, 1, 0.32, 1)',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 10,
              fontSize: 12,
              color: 'var(--color-text-secondary, #a1a1aa)',
            }}
          >
            <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {status === 'initiated' && 'Allocating lease...'}
              {status === 'uploaded' && 'Binary transferred...'}
              {status === 'scanning' && 'Scanning security & MIME...'}
              {status === 'processing' && 'Extracting columns & preview...'}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{progress}%</span>
          </div>
        </div>
      )}

      {/* Terminal Ready State: File Summary */}
      {isReady && (
        <div style={{ textAlign: 'left', marginTop: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px',
              borderRadius: 'var(--radius-control, 14px)',
              background: 'rgba(48, 209, 88, 0.1)',
              border: '1px solid rgba(48, 209, 88, 0.25)',
              marginBottom: 16,
            }}
          >
            <CheckCircle2 size={24} style={{ color: 'var(--color-success, #30d158)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff' }}>Resource Ready</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #a1a1aa)' }}>
                Sanitized preview generated without private data leakage.
              </div>
            </div>
          </div>

          {metadata && (
            <div
              style={{
                background: 'var(--bg-elevated, #18181b)',
                borderRadius: 'var(--radius-control, 14px)',
                padding: '14px 16px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                marginBottom: 20,
                fontSize: 13,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted, #71717a)' }}>Name:</span>
                <span style={{ fontWeight: 600, color: '#ffffff', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {metadata.originalName || 'Resource'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted, #71717a)' }}>Size:</span>
                <span style={{ fontWeight: 600, color: '#ffffff' }}>
                  {formatBytes(metadata.fileSize)}
                </span>
              </div>
              {metadata.pageCount != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted, #71717a)' }}>Pages:</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-accent, #ff4500)' }}>
                    📄 {metadata.pageCount} pages rendered
                  </span>
                </div>
              )}
              {metadata.rowCount != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted, #71717a)' }}>Items:</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-accent, #ff4500)' }}>
                    📊 {metadata.rowCount} validated rows
                  </span>
                </div>
              )}
              {metadata.fileHash && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted, #71717a)' }}>SHA-256:</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-text-secondary, #a1a1aa)' }}>
                    {metadata.fileHash.slice(0, 16)}...
                  </span>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={onContinue}
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
              <span>Create Marketplace Listing</span>
              <ArrowRight size={16} />
            </button>
            <button
              onClick={onReset}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 'var(--radius-control, 14px)',
                background: 'transparent',
                color: 'var(--color-text-secondary, #a1a1aa)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              Upload Another File
            </button>
          </div>
        </div>
      )}

      {/* Terminal Failure States */}
      {isFailed && (
        <div style={{ textAlign: 'left', marginTop: 10 }}>
          <div
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-control, 14px)',
              background: status === 'quarantined'
                ? 'rgba(255, 69, 58, 0.12)'
                : 'rgba(255, 214, 10, 0.12)',
              border: status === 'quarantined'
                ? '1px solid rgba(255, 69, 58, 0.3)'
                : '1px solid rgba(255, 214, 10, 0.3)',
              marginBottom: 16,
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            {status === 'quarantined' ? (
              <ShieldAlert size={24} style={{ color: 'var(--color-danger, #ff453a)', flexShrink: 0, marginTop: 2 }} />
            ) : (
              <AlertTriangle size={24} style={{ color: 'var(--color-warning, #ffd60a)', flexShrink: 0, marginTop: 2 }} />
            )}
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', marginBottom: 4 }}>
                {status === 'quarantined' ? 'Security Quarantine' : status === 'rejected' ? 'Upload Rejected' : 'Processing Failed'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary, #a1a1aa)', lineHeight: 1.4 }}>
                {error || 'Unable to process the document under platform security policies.'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            {onRetry && (
              <button
                onClick={onRetry}
                className="matte-accent-btn"
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: 'var(--radius-control, 14px)',
                  background: 'var(--color-accent, #ff4500)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <RefreshCw size={15} />
                <span>Retry</span>
              </button>
            )}
            <button
              onClick={onReset}
              style={{
                flex: 1,
                padding: '12px',
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
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
