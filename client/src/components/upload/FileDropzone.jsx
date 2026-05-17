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

  const formatLabels = {
    '.xlsx': 'XLSX',
    '.xls': 'XLS',
    '.csv': 'CSV',
    '.json': 'JSON',
  };

  return (
    <>
      <div className="qf-dropzone-wrapper">
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`qf-dropzone ${isDragActive ? 'active' : ''}`}
          onClick={() => document.getElementById('fileInput').click()}
        >
          <div className="qf-dropzone-icon">
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--color-primary)' }}>
              upload_file
            </span>
          </div>
          <h3 className="qf-dropzone-title">
            {isDragActive ? 'Drop file here' : 'Drop Excel, CSV, JSON or click to upload'}
          </h3>
          <p className="qf-dropzone-subtitle">
            Supported: {accept.split(',').map(e => formatLabels[e] || e).join(' • ')} • Multi-sheet
          </p>
          <input 
            id="fileInput"
            type="file" 
            style={{ display: 'none' }} 
            accept={accept}
            onChange={handleChange}
          />
        </div>
        {error && <div className="qf-dropzone-error">{error}</div>}
      </div>

      <style>{dropzoneStyles}</style>
    </>
  );
}

const dropzoneStyles = `
  .qf-dropzone-wrapper {
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
  }

  .qf-dropzone {
    border: 2px dashed var(--color-border-light);
    border-radius: 16px;
    padding: 60px 40px;
    text-align: center;
    background: var(--color-surface);
    transition: all 0.3s ease;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .qf-dropzone:hover {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }

  .qf-dropzone.active {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
    box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.06);
  }

  .qf-dropzone-icon {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: var(--color-surface-alt);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 4px;
  }

  .qf-dropzone-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
    letter-spacing: -0.01em;
  }

  .qf-dropzone-subtitle {
    font-size: 13px;
    color: var(--color-text-muted);
  }

  .qf-dropzone-error {
    color: var(--color-danger);
    margin-top: 12px;
    text-align: center;
    font-size: 14px;
  }
`;
