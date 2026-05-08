import { useCallback, useState } from 'react';

export default function FileDropzone({ onFileDrop, accept = ".xlsx,.xls,.csv,.json", maxSize = 10485760 }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState('');

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const validateAndProcess = (file) => {
    setError('');
    if (!file) return;

    if (file.size > maxSize) {
      setError(`File is too large. Max size is ${Math.round(maxSize / 1024 / 1024)}MB`);
      return;
    }

    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const acceptedExts = accept.split(',');
    
    if (!acceptedExts.includes(ext) && !acceptedExts.includes(file.type)) {
       setError(`File type not supported. Allowed: ${accept}`);
       return;
    }

    onFileDrop(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcess(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcess(e.target.files[0]);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: 600, margin: '0 auto' }}>
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragActive ? 'var(--color-primary)' : 'var(--color-border-light)'}`,
          borderRadius: 16,
          padding: '60px 40px',
          textAlign: 'center',
          background: isDragActive ? 'var(--color-primary-light)' : 'var(--color-surface)',
          transition: 'all 0.3s ease',
          cursor: 'pointer',
        }}
        onClick={() => document.getElementById('fileInput').click()}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <h3 style={{ fontSize: 20, marginBottom: 8, color: 'var(--color-text)' }}>
          {isDragActive ? 'Drop file here' : 'Drag & Drop your MCQ file'}
        </h3>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24, fontSize: 14 }}>
          or click to browse from your computer
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {accept.split(',').map(ext => (
            <span key={ext} style={{ 
              background: 'var(--color-surface-alt)', 
              padding: '4px 10px', 
              borderRadius: 6, 
              fontSize: 12,
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)'
            }}>
              {ext}
            </span>
          ))}
        </div>
        <input 
          id="fileInput"
          type="file" 
          style={{ display: 'none' }} 
          accept={accept}
          onChange={handleChange}
        />
      </div>
      {error && <div style={{ color: 'var(--color-danger)', marginTop: 12, textAlign: 'center', fontSize: 14 }}>{error}</div>}
    </div>
  );
}
