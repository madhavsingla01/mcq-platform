import { useId, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import './FileDropzone.css';

export default function FileDropzone({ onFileDrop, accept = ".pdf,.xlsx,.xls,.csv,.json", maxSize = 10485760 }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const descriptionId = useId();

  const handleDragEnter = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    if (++dragDepth.current === 1) setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragDepth.current > 0 && --dragDepth.current === 0) setIsDragActive(false);
  };

  const handleDragOver = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const validateAndProcess = (file) => {
    setError('');
    if (!file) return;

    if (file.size <= 0) {
      setError('File is empty (0 bytes). Please upload a valid file.');
      return;
    }

    const forbiddenExts = ['.exe', '.dmg', '.bat', '.sh', '.bin', '.cmd'];
    const filenameLower = file.name.toLowerCase();
    if (forbiddenExts.some(fExt => filenameLower.endsWith(fExt))) {
      setError('Executable and binary scripts are strictly prohibited.');
      return;
    }

    if (file.size > maxSize) {
      setError(`File is too large. Max size is ${Math.round(maxSize / 1024 / 1024)}MB`);
      return;
    }

    const lastDot = file.name.lastIndexOf('.');
    const ext = lastDot !== -1 ? file.name.substring(lastDot).toLowerCase().trim() : '';
    const acceptedExts = accept.split(',').map(e => e.trim().toLowerCase());
    
    if (ext && !acceptedExts.includes(ext) && !acceptedExts.includes(file.type?.toLowerCase())) {
       setError(`File type not supported. Allowed: ${accept}`);
       return;
    }

    onFileDrop(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcess(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) validateAndProcess(file);
  };

  const formatLabels = {
    '.pdf': 'PDF',
    '.xlsx': 'XLSX',
    '.xls': 'XLS',
    '.csv': 'CSV',
    '.json': 'JSON',
  };

  const supportedText = accept
    .split(',')
    .map(e => formatLabels[e.trim().toLowerCase()] || e.trim().replace('.', '').toUpperCase())
    .join(' • ');

  return (
    <div className="qf-dropzone-wrapper">
      <button
        type="button"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`qf-dropzone ${isDragActive ? 'active' : ''}`}
        onClick={() => inputRef.current?.click()}
        aria-describedby={descriptionId}
      >
        <span className="qf-dropzone-icon apple-squircle">
          <UploadCloud size={32} aria-hidden="true" />
        </span>
        <span className="qf-dropzone-title">{isDragActive ? 'Drop file here' : 'Choose a file or drop it here'}</span>
      </button>
      <span id={descriptionId} className="qf-dropzone-subtitle">{supportedText}</span>
      <input ref={inputRef} type="file" hidden accept={accept} onChange={handleChange} />
      {error && <div role="alert" className="qf-dropzone-error">{error}</div>}
    </div>
  );
}
