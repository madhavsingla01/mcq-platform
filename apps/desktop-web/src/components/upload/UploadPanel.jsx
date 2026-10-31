import { Check, CircleAlert, File, LoaderCircle, X } from 'lucide-react';
import { useUploadPanelStore } from '../../store/uploadPanelStore';

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

      <style>{uploadPanelStyles}</style>
    </section>
  );
}

const uploadPanelStyles = `
  .global-upload-panel {
    position: fixed;
    z-index: 1500;
    right: max(20px, env(safe-area-inset-right));
    bottom: max(20px, env(safe-area-inset-bottom));
    width: min(360px, calc(100vw - 32px));
    padding: 16px;
    color: var(--color-text, #f5f5f7);
    background: var(--color-surface, #1c1c1e);
    border: 1px solid var(--color-border-light, rgba(255,255,255,.12));
    border-radius: var(--radius-lg, 12px);
    box-shadow: 0 12px 40px rgba(0,0,0,.24);
  }
  .global-upload-panel-header, .global-upload-panel-status, .global-upload-panel-file {
    display: flex;
    align-items: center;
  }
  .global-upload-panel-header { gap: 10px; }
  .global-upload-panel-status { justify-content: center; width: 28px; height: 28px; border-radius: 50%; }
  .global-upload-panel-status.active { color: var(--color-primary, #ff6a00); }
  .global-upload-panel-status.complete { color: #30d158; }
  .global-upload-panel-status.error { color: var(--color-danger, #ff453a); }
  .global-upload-panel-heading { display: grid; flex: 1; gap: 2px; min-width: 0; }
  .global-upload-panel-heading strong { font-size: 14px; }
  .global-upload-panel-heading span, .global-upload-panel-file-details span, .global-upload-panel-message {
    color: var(--color-text-muted, #98989d);
    font-size: 12px;
  }
  .global-upload-panel-close { display: grid; place-items: center; padding: 6px; color: inherit; background: none; border: 0; cursor: pointer; }
  .global-upload-panel-file { gap: 10px; margin-top: 14px; padding: 10px; border-radius: 9px; background: var(--color-surface-alt, rgba(255,255,255,.05)); }
  .global-upload-panel-file > svg { flex: 0 0 auto; color: var(--color-primary, #ff6a00); }
  .global-upload-panel-file-details { display: grid; gap: 3px; min-width: 0; }
  .global-upload-panel-file-details strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .global-upload-panel-progress { height: 4px; margin-top: 14px; overflow: hidden; background: var(--color-border-light, rgba(255,255,255,.12)); border-radius: 4px; }
  .global-upload-panel-progress span { display: block; height: 100%; background: var(--color-primary, #ff6a00); }
  .global-upload-panel-message { margin: 8px 0 0; line-height: 1.4; }
  .global-upload-panel-message.error { color: var(--color-danger, #ff453a); }
`;
