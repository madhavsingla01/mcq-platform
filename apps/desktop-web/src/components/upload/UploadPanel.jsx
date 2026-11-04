import { Check, CircleAlert, File, LoaderCircle, X } from 'lucide-react';
import { useUploadPanelStore } from '../../store/uploadPanelStore';
import './UploadPanel.css';

const formatSize = (bytes) => {
  if (!Number.isFinite(bytes)) return 'Size unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function UploadPanel() {
  const upload = useUploadPanelStore((state) => state.upload);
  const dismissUpload = useUploadPanelStore((state) => state.dismissUpload);

  if (!upload) return null;

  const isUploading = upload.status === 'uploading';
  const isError = upload.status === 'error';

  return (
    <section className="global-upload-panel" aria-live="polite" aria-label="Upload status">
      <header className="global-upload-panel-header">
        <span className={`global-upload-panel-status ${isError ? 'error' : isUploading ? 'active' : 'complete'}`}>
          {isUploading ? <LoaderCircle size={17} /> : isError ? <CircleAlert size={17} /> : <Check size={17} />}
        </span>
        <div className="global-upload-panel-heading">
          <strong>{isUploading ? 'Uploading' : isError ? 'Upload failed' : 'Upload complete'}</strong>
          <span>{upload.purpose}</span>
        </div>
        {!isUploading && (
          <button type="button" className="global-upload-panel-close" onClick={dismissUpload} aria-label="Dismiss upload status">
            <X size={17} />
          </button>
        )}
      </header>

      <div className="global-upload-panel-file">
        <File size={17} aria-hidden="true" />
        <div className="global-upload-panel-file-details">
          <strong title={upload.fileName}>{upload.fileName}</strong>
          <span>{upload.type} · {formatSize(upload.size)}</span>
        </div>
      </div>

      {isUploading && (
        <>
          <div
            className="global-upload-panel-progress"
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={upload.progress}
          >
            <span style={{ width: `${upload.progress}%` }} />
          </div>
          <p className="global-upload-panel-message">{upload.progress}% uploaded</p>
        </>
      )}
      {isError && <p className="global-upload-panel-message error">{upload.error}</p>}
      {upload.status === 'complete' && <p className="global-upload-panel-message">File received and checked by the server.</p>}
    </section>
  );
}
