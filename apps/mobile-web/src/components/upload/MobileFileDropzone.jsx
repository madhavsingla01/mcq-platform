import { useState, useRef } from 'react';
import { UploadCloud, FileText, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function MobileFileDropzone({
  onFileSelect,
  accept = ".pdf,.xlsx,.xls,.csv,.json",
  maxSize = 52428800, // 50MB default
  disabled = false,
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const formatLabels = [
    { ext: 'PDF', label: 'PDF Document' },
    { ext: 'XLSX', label: 'Excel Workbook' },
    { ext: 'CSV', label: 'CSV Tabular' },
    { ext: 'JSON', label: 'Question Bank' },
  ];

  const validateAndSelect = (file) => {
    if (!file) return;

    if (file.size <= 0) {
      toast.error('File is empty (0 bytes). Please select a valid document.');
      return;
    }

    const forbiddenExts = ['.exe', '.dmg', '.bat', '.sh', '.bin', '.cmd'];
    const nameLower = file.name.toLowerCase();
    if (forbiddenExts.some(ext => nameLower.endsWith(ext))) {
      toast.error('Executable scripts and binaries are strictly prohibited.');
      return;
    }

    if (file.size > maxSize) {
      const maxMb = Math.round(maxSize / (1024 * 1024));
      toast.error(`File is too large. Maximum size is ${maxMb}MB.`);
      return;
    }

    const lastDot = file.name.lastIndexOf('.');
    const ext = lastDot !== -1 ? file.name.substring(lastDot).toLowerCase().trim() : '';
    const acceptedExts = accept.split(',').map(e => e.trim().toLowerCase());

    if (ext && !acceptedExts.includes(ext) && !acceptedExts.includes(file.type?.toLowerCase())) {
      toast.error(`Unsupported file type. Allowed formats: ${accept}`);
      return;
    }

    onFileSelect(file);
  };

  const handleCardClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const handleInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSelect(e.target.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (!disabled && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSelect(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      className={`mobile-card qf-mobile-dropzone ${isDragActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={handleCardClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      aria-label="Upload Educational Resource"
      style={{
        border: isDragActive ? '2px dashed var(--color-accent, #ff4500)' : '2px dashed rgba(255, 255, 255, 0.16)',
        borderRadius: 'var(--radius-card, 20px)',
        padding: '32px 20px',
        textAlign: 'center',
        background: isDragActive ? 'rgba(255, 69, 0, 0.08)' : 'var(--bg-card, #121214)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        transition: 'transform var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)), border-color 150ms ease, background-color 150ms ease',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        disabled={disabled}
        style={{
          display: 'none',
          fontSize: '16px', // Prevents iOS Safari auto-zoom
        }}
      />

      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: 16,
          background: 'rgba(255, 69, 0, 0.12)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
          color: 'var(--color-accent, #ff4500)',
        }}
      >
        <UploadCloud size={30} />
      </div>

      <h3
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: '#ffffff',
          margin: '0 0 6px 0',
          letterSpacing: '-0.02em',
        }}
      >
        Select Educational Resource
      </h3>

      <p
        style={{
          fontSize: 13,
          color: 'var(--color-text-secondary, #a1a1aa)',
          margin: '0 0 18px 0',
          lineHeight: 1.4,
        }}
      >
        Tap to browse files or drop document here
      </p>

      {/* Format pills */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 14,
        }}
      >
        {formatLabels.map((fmt) => (
          <span
            key={fmt.ext}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 'var(--radius-pill, 9999px)',
              background: 'var(--bg-subtle, #1c1c1f)',
              color: 'var(--color-text-secondary, #d4d4d8)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            {fmt.ext}
          </span>
        ))}
      </div>

      <span
        style={{
          fontSize: 12,
          color: 'var(--color-text-muted, #71717a)',
        }}
      >
        Max {Math.round(maxSize / (1024 * 1024))}MB per document
      </span>
    </div>
  );
}
