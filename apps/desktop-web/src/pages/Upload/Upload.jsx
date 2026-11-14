import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Layers,
  Hash,
  ArrowRight,
  FileSpreadsheet,
  Copy,
} from 'lucide-react';
import FileDropzone from '../../components/upload/FileDropzone';
import { Card, Button, ProgressBar } from '../../components/ui';
import { useUploadStore } from '../../store/uploadStore';
import { useAuthStore } from '../../store/authStore';
import { runWithUploadPanel } from '../../store/uploadPanelStore';
import api from '../../api/axios';
import './Upload.css';

const LIFECYCLE_STEPS = [
  { key: 'initiated', label: 'Initiated', icon: Clock, desc: 'Validated & lease allocated' },
  { key: 'uploaded', label: 'Uploaded', icon: UploadCloud, desc: 'Binary payload transferred' },
  { key: 'scanning', label: 'Scanning', icon: ShieldCheck, desc: 'MIME & macro security verification' },
  { key: 'processing', label: 'Processing', icon: Sparkles, desc: 'Metadata & column extraction' },
  { key: 'ready', label: 'Ready', icon: CheckCircle2, desc: 'Safe preview & metadata cataloged' },
];

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function Upload() {
  const navigate = useNavigate();
  const { setFile, setUploadId, setStatus, setParsedData, setAutoMapping, status, error, setError } = useUploadStore();
  const { isAuthenticated } = useAuthStore();

  const [progress, setProgress] = useState(0);
  const [activeFile, setActiveFile] = useState(null);
  const [securityOverrideFile, setSecurityOverrideFile] = useState(null);
  const [isImportingAnyway, setIsImportingAnyway] = useState(false);
  const [duplicateSuggestion, setDuplicateSuggestion] = useState(null);

  // Metadata summary state for 'ready' state
  const [fileMetadata, setFileMetadata] = useState(null);
  const [failureType, setFailureType] = useState(null); // 'rejected' | 'failed' | 'quarantined' | null
  const [failureReason, setFailureReason] = useState('');

  const clampedProgress = useMemo(() => Math.max(0, Math.min(100, progress)), [progress]);

  const getSecurityOverrideError = (err) => {
    const errors = err?.response?.data?.errors;
    if (!Array.isArray(errors)) return null;
    return errors.find((item) => item?.canImportAnyway || item?.code === 'SECURITY_VALIDATION_FAILED') || null;
  };

  const getLifecycleStepIndex = (currentStatus) => {
    switch (currentStatus) {
      case 'initiated':
        return 0;
      case 'uploading':
      case 'uploaded':
        return 1;
      case 'scanning':
        return 2;
      case 'processing':
      case 'parsing':
        return 3;
      case 'ready':
      case 'parsed':
        return 4;
      default:
        return -1;
    }
  };

  const proceedToMapping = async (targetUploadId) => {
    setDuplicateSuggestion(null);
    setStatus('processing');
    setProgress(85);
    try {
      const parseRes = await api.post(`/parser/parse/${targetUploadId}`);
      const { headers = [], rowCount = 0, preview = [], autoMapping = {}, confidence = 0, metadata = {} } = parseRes.data.data;

      setParsedData({ headers, rowCount, preview });
      setAutoMapping(autoMapping, confidence);

      // Extract and catalog metadata for 'ready' state
      const lastDot = activeFile?.name ? activeFile.name.lastIndexOf('.') : -1;
      const ext = lastDot !== -1 ? activeFile.name.substring(lastDot).toUpperCase() : 'DOCUMENT';
      setFileMetadata({
        originalName: activeFile?.name || metadata.originalName || 'Uploaded Resource',
        fileSize: activeFile?.size || metadata.fileSize || 0,
        fileType: ext.replace('.', ''),
        fileHash: metadata.checksum || metadata.fileHash || parseRes.data.data.fileHash || null,
        pageCount: metadata.pageCount || (ext === '.PDF' ? rowCount : null),
        rowCount,
        headers,
        isTextSearchable: metadata.isTextSearchable ?? true,
      });

      setStatus('ready');
      setProgress(100);
    } catch (err) {
      const statusResponse = err.response?.status;
      const errorMsg = err.response?.data?.message || err.message || 'Failed to parse file';

      if (statusResponse === 429) {
        setFailureType('failed');
        setFailureReason('Upload rate limit exceeded. Please wait a moment before retrying.');
        setError('Rate limit exceeded: Please wait before requesting additional processing.');
      } else {
        setFailureType('failed');
        setFailureReason(errorMsg);
        setError(errorMsg);
      }
      setStatus('failed');
    }
  };

  const uploadAndParse = async (file, { importAnyway = false } = {}) => {
    setActiveFile(file);
    setFile(file);
    setFileMetadata(null);
    setFailureType(null);
    setFailureReason('');
    setError(null);
    setSecurityOverrideFile(null);
    setDuplicateSuggestion(null);
    setIsImportingAnyway(importAnyway);

    // 1. Stage: Initiated
    setStatus('initiated');
    setProgress(15);

    const formData = new FormData();
    formData.append('file', file);
    if (importAnyway) {
      formData.append('importAnyway', 'true');
    }

    try {
      // 2. Stage: Uploading & Uploaded
      setStatus('uploading');
      const uploadRes = await runWithUploadPanel(file, { purpose: 'Quiz dataset' }, (onUploadProgress) => (
        api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) {
              const uploadPct = Math.round((e.loaded * 40) / e.total) + 15; // 15% to 55%
              setProgress(Math.max(15, Math.min(55, uploadPct)));
            }
            onUploadProgress(e);
          },
        })
      ));

      setStatus('uploaded');
      setProgress(55);

      const uploadData = uploadRes.data?.data || {};
      const currentUploadId = uploadData.upload?.id || uploadData.id;
      const duplicateQuiz = uploadData.duplicateQuiz;
      const isDuplicate = uploadData.isDuplicate || uploadData.duplicateExists;
      const fileHash = uploadData.upload?.fileHash || uploadData.fileHash;

      setUploadId(currentUploadId);

      // Handle duplicate detection resolution without private metadata leakage
      if (duplicateQuiz || isDuplicate) {
        setDuplicateSuggestion({
          uploadId: currentUploadId,
          duplicateQuiz,
          isDuplicate: Boolean(isDuplicate),
          fileHash,
        });
        setStatus('idle');
        return;
      }

      // 3. Stage: Scanning (Security inspection)
      setStatus('scanning');
      setProgress(75);

      // 4. Stage: Processing / Parsing
      await proceedToMapping(currentUploadId);

    } catch (err) {
      const errStatus = err.response?.status;
      const errData = err.response?.data;
      const errorMessage = errData?.message || err.message || 'Something went wrong during upload/parsing';

      // Classify failure state deterministically
      if (errStatus === 429) {
        setFailureType('failed');
        setFailureReason('Upload rate limit exceeded. Standard quota protection engaged.');
        setError('Upload rate limit exceeded. Please wait a moment before trying again.');
        setStatus('failed');
      } else if (errData?.error?.code === 'MACRO_DETECTED' || errorMessage.toLowerCase().includes('macro') || errorMessage.toLowerCase().includes('quarantine')) {
        setFailureType('quarantined');
        setFailureReason('Executable macros or untrusted active code detected. The asset has been isolated.');
        setError(errorMessage);
        setStatus('quarantined');
      } else if (errData?.error?.code === 'MIME_SPOOFED' || errStatus === 400 || errorMessage.toLowerCase().includes('corrupted') || errorMessage.toLowerCase().includes('magic byte')) {
        setFailureType('rejected');
        setFailureReason('Document failed security inspection: corrupt headers or MIME signature mismatch.');
        setError(errorMessage);
        setStatus('rejected');
      } else {
        const securityOverride = getSecurityOverrideError(err);
        if (!importAnyway && securityOverride) {
          setSecurityOverrideFile(file);
        }
        setFailureType('failed');
        setFailureReason(errorMessage);
        setError(errorMessage);
        setStatus('failed');
      }
    } finally {
      setIsImportingAnyway(false);
    }
  };

  const handleDrop = (file) => {
    uploadAndParse(file);
  };

  const handleImportAnyway = () => {
    if (securityOverrideFile) {
      uploadAndParse(securityOverrideFile, { importAnyway: true });
    }
  };

  const handleTryAgain = () => {
    setSecurityOverrideFile(null);
    setFailureType(null);
    setFailureReason('');
    setError(null);
    setStatus('idle');
  };

  const handleDismissDuplicate = () => {
    setDuplicateSuggestion(null);
  };

  const handleContinueToMapping = () => {
    const storeUploadId = useUploadStore.getState().uploadId;
    if (storeUploadId) {
      navigate(`/mapping/${storeUploadId}`);
    }
  };

  const currentStepIndex = getLifecycleStepIndex(status);
  const isProgressing = ['initiated', 'uploading', 'uploaded', 'scanning', 'processing', 'parsing'].includes(status);
  const isFailed = ['rejected', 'failed', 'quarantined'].includes(status);

  return (
    <div className="qf-upload-shell">
      <div className="qf-upload-header">
        <h1>Educational Resource Ingestion</h1>
        <p>Upload lecture notes, spreadsheets, question banks, or curricula to prepare them for marketplace listing.</p>
        {!isAuthenticated && <p className="qf-upload-guest-note">Guest limit: 20KB. Log in for 50MB limit.</p>}
      </div>

      {/* 1. Idle & Initial Dropzone View */}
      {status === 'idle' && (
        <>
          <FileDropzone onFileDrop={handleDrop} maxSize={isAuthenticated ? 52428800 : 20480} />

          {/* Duplicate Suggestion Card */}
          {duplicateSuggestion && (
            <Card className="qf-duplicate-card">
              <div className="qf-card-header-row">
                <Copy size={20} className="qf-accent-icon" />
                <h4 className="qf-card-title">
                  {duplicateSuggestion.duplicateQuiz ? 'Identical Dataset Already Exists' : 'Duplicate File Detected (SHA-256 Match)'}
                </h4>
              </div>

              {duplicateSuggestion.duplicateQuiz ? (
                <p className="qf-card-desc">
                  A quiz titled <strong>"{duplicateSuggestion.duplicateQuiz.title}"</strong> ({duplicateSuggestion.duplicateQuiz.questionCount} questions) was generated from this identical file.
                </p>
              ) : (
                <p className="qf-card-desc">
                  An identical resource with matching byte checksum ({duplicateSuggestion.fileHash ? `${duplicateSuggestion.fileHash.slice(0, 16)}...` : 'verified'}) already exists in the system. You can reuse the existing asset or re-import it.
                </p>
              )}

              <div className="qf-action-row">
                {duplicateSuggestion.duplicateQuiz ? (
                  <Button
                    variant="primary"
                    onClick={() => navigate(`/quiz/${duplicateSuggestion.duplicateQuiz.id}`)}
                  >
                    <span>Open Existing Quiz</span>
                    <ArrowRight size={14} style={{ marginLeft: 6 }} />
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => proceedToMapping(duplicateSuggestion.uploadId)}
                  >
                    <span>Reuse Existing Resource</span>
                    <ArrowRight size={14} style={{ marginLeft: 6 }} />
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => proceedToMapping(duplicateSuggestion.uploadId)}
                >
                  Import & Map Anyway
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDismissDuplicate}
                >
                  Dismiss
                </Button>
              </div>
            </Card>
          )}

          {/* Active Error Card in Idle */}
          {error && (
            <Card className="qf-failure-card error">
              <div className="qf-card-header-row">
                <AlertTriangle size={20} style={{ color: 'var(--color-danger, #ff453a)' }} />
                <h4 className="qf-card-title" style={{ color: 'var(--color-danger, #ff453a)' }}>
                  {securityOverrideFile ? 'Security check failed' : 'Upload Issue'}
                </h4>
              </div>
              <p className="qf-card-desc">{error}</p>
              {securityOverrideFile && (
                <p className="qf-security-note">Only import this file if you trust its source.</p>
              )}
              <div className="qf-action-row">
                <Button variant="secondary" onClick={handleTryAgain}>Try Again</Button>
                {securityOverrideFile && (
                  <Button variant="danger" onClick={handleImportAnyway} disabled={isImportingAnyway}>
                    {isImportingAnyway ? 'Importing...' : 'Import Anyway'}
                  </Button>
                )}
              </div>
            </Card>
          )}
        </>
      )}

      {/* 2. Active 5-State Lifecycle Progression View */}
      {isProgressing && (
        <Card className="qf-processing-container">
          <div className="qf-lifecycle-stepper">
            {LIFECYCLE_STEPS.map((step, idx) => {
              const IconComponent = step.icon;
              const isPast = currentStepIndex > idx;
              const isCurrent = currentStepIndex === idx;

              return (
                <div
                  key={step.key}
                  className={`qf-stepper-step ${isPast ? 'complete' : ''} ${isCurrent ? 'active' : ''}`}
                >
                  <div className="qf-step-icon-wrap">
                    <IconComponent size={18} />
                  </div>
                  <div className="qf-step-label">{step.label}</div>
                  <div className="qf-step-desc">{step.desc}</div>
                </div>
              );
            })}
          </div>

          <div className="qf-progress-track-wrapper">
            <ProgressBar value={clampedProgress} />
            <div className="qf-progress-meta-row">
              <span className="qf-status-pill">{status.toUpperCase()}</span>
              <span className="qf-progress-number">{clampedProgress}% complete</span>
            </div>
          </div>
        </Card>
      )}

      {/* 3. Terminal Ready State: File Metadata Summary Card */}
      {status === 'ready' && (
        <Card className="qf-metadata-summary-card">
          <div className="qf-ready-badge-row">
            <div className="qf-ready-icon-wrap">
              <CheckCircle2 size={32} style={{ color: 'var(--color-success, #30d158)' }} />
            </div>
            <div>
              <h3 className="qf-ready-title">Resource Successfully Processed & Ready</h3>
              <p className="qf-ready-subtitle">Safe previews generated and metadata cataloged with zero secret leakage.</p>
            </div>
          </div>

          {fileMetadata && (
            <div className="qf-metadata-stats-grid">
              <div className="qf-metadata-stat-box">
                <span className="qf-stat-label">Document Name</span>
                <span className="qf-stat-value" title={fileMetadata.originalName}>
                  {fileMetadata.originalName}
                </span>
              </div>
              <div className="qf-metadata-stat-box">
                <span className="qf-stat-label">Format / Size</span>
                <span className="qf-stat-value">
                  <span className="qf-format-pill">{fileMetadata.fileType}</span> {formatBytes(fileMetadata.fileSize)}
                </span>
              </div>
              {fileMetadata.pageCount != null && (
                <div className="qf-metadata-stat-box">
                  <span className="qf-stat-label">Page Count</span>
                  <span className="qf-stat-value">{fileMetadata.pageCount} Pages</span>
                </div>
              )}
              {fileMetadata.rowCount != null && (
                <div className="qf-metadata-stat-box">
                  <span className="qf-stat-label">Items / Questions</span>
                  <span className="qf-stat-value">{fileMetadata.rowCount} Entries</span>
                </div>
              )}
              {fileMetadata.fileHash && (
                <div className="qf-metadata-stat-box span-all">
                  <span className="qf-stat-label">SHA-256 Checksum Fingerprint</span>
                  <span className="qf-stat-value code-font">
                    {fileMetadata.fileHash}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="qf-action-row" style={{ marginTop: 24 }}>
            <Button variant="primary" onClick={handleContinueToMapping}>
              <span>Continue to Column Mapping</span>
              <ArrowRight size={16} style={{ marginLeft: 8 }} />
            </Button>
            <Button variant="secondary" onClick={handleTryAgain}>
              Upload Another File
            </Button>
          </div>
        </Card>
      )}

      {/* 4. Failure States: rejected, failed, quarantined */}
      {isFailed && (
        <Card className={`qf-failure-card ${failureType}`}>
          <div className="qf-card-header-row">
            {failureType === 'quarantined' ? (
              <ShieldAlert size={28} style={{ color: 'var(--color-danger, #ff453a)' }} />
            ) : failureType === 'rejected' ? (
              <AlertTriangle size={28} style={{ color: 'var(--color-warning, #ffd60a)' }} />
            ) : (
              <RefreshCw size={28} style={{ color: 'var(--color-danger, #ff453a)' }} />
            )}
            <div>
              <h4 className="qf-card-title">
                {failureType === 'quarantined'
                  ? 'Resource Quarantined'
                  : failureType === 'rejected'
                  ? 'Upload Rejected'
                  : 'Processing Failed'}
              </h4>
              <p className="qf-card-desc">{failureReason || error || 'An unrecoverable processing error occurred.'}</p>
            </div>
          </div>

          <div className="qf-action-row" style={{ marginTop: 20 }}>
            <Button variant="primary" onClick={handleTryAgain}>
              <RefreshCw size={14} style={{ marginRight: 6 }} />
              <span>Retry Processing</span>
            </Button>
            <Button variant="outline" onClick={handleTryAgain}>
              Try Another File
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
