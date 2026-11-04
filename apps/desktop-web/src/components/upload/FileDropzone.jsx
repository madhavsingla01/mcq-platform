import { useCallback, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import './FileDropzone.css';

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
            <UploadCloud size={40} style={{ color: 'var(--color-primary)' }} />
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
    </>
  );
}
