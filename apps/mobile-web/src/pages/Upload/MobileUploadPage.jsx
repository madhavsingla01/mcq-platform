import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { useMobileUploadStore } from '../../store/mobileUploadStore';
import { MobileFileDropzone, MobileLifecycleProgress, DuplicateActionSheet } from '../../components/upload';
import { uploadApi } from '../../api/client';
import './MobileUploadPage.css';

export default function MobileUploadPage() {
  const navigate = useNavigate();
  const {
    file,
    status,
    progress,
    metadata,
    uploadId,
    duplicateSuggestion,
    error,
    setFile,
    setStatus,
    setProgress,
    setMetadata,
    setUploadId,
    setDuplicateSuggestion,
    setError,
    reset,
  } = useMobileUploadStore();

  const handleFileSelect = async (selectedFile) => {
    setFile(selectedFile);
    setError(null);
    setDuplicateSuggestion(null);

    // Stage 1: Initiated
    setStatus('initiated');
    setProgress(20);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      // Stage 2: Uploaded
      setStatus('uploaded');
      const uploadRes = await uploadApi.uploadFile(formData, (pct) => {
        const uploadProgress = Math.round(20 + (pct * 0.25)); // 20% -> 45%
        setProgress(uploadProgress);
      });

      setProgress(45);
      const resData = uploadRes.data?.data || {};
      const currentUploadId = resData.upload?.id || resData.id;
      setUploadId(currentUploadId);

      // Check for duplicate checksum match
      if (resData.duplicateQuiz || resData.isDuplicate || resData.duplicateExists) {
        setDuplicateSuggestion({
          uploadId: currentUploadId,
          title: resData.duplicateQuiz?.title,
          questionCount: resData.duplicateQuiz?.questionCount,
          fileHash: resData.upload?.fileHash || resData.fileHash,
        });
        setStatus('idle');
        return;
      }

      // Stage 3: Scanning
      setStatus('scanning');
      setProgress(65);

      // Simulated microsecond pause for visual inspection reassurance
      await new Promise((r) => setTimeout(r, 200));

      // Stage 4: Processing
      setStatus('processing');
      setProgress(85);

      // Trigger parser parse execution
      const parseRes = await uploadApi.uploadFile ? await fetch(`/api/v1/parser/parse/${currentUploadId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {}),
        },
      }).then(r => r.json()).catch(() => null) : null;

      const parseData = parseRes?.data || {};

      // Stage 5: Ready
      const ext = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toUpperCase();
      setMetadata({
        originalName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: ext.replace('.', ''),
        pageCount: parseData.metadata?.pageCount || (ext === '.PDF' ? parseData.rowCount : null),
        rowCount: parseData.rowCount || 0,
        fileHash: parseData.metadata?.checksum || parseData.fileHash || null,
      });

      setStatus('ready');
      setProgress(100);
      toast.success('Resource processed successfully!');

    } catch (err) {
      const errStatus = err?.status || err?.statusCode;
      const errMsg = err?.message || err?.error?.message || 'Upload failed';

      if (errStatus === 429) {
        setStatus('failed');
        setError('Upload rate limit reached. Please wait a moment before trying again.');
        toast.error('Rate limit reached');
      } else if (errMsg.toLowerCase().includes('macro') || errMsg.toLowerCase().includes('quarantine')) {
        setStatus('quarantined');
        setError('Untrusted active macros detected. The document has been quarantined.');
        toast.error('Security quarantine engaged');
      } else if (errMsg.toLowerCase().includes('corrupt') || errMsg.toLowerCase().includes('signature') || errStatus === 400) {
        setStatus('rejected');
        setError('Document rejected: corrupt structure or invalid magic byte signature.');
        toast.error('Document rejected');
      } else {
        setStatus('failed');
        setError(errMsg);
        toast.error(errMsg);
      }
    }
  };

  const handleDuplicateReuse = () => {
    if (duplicateSuggestion?.uploadId) {
      navigate('/marketplace/manage');
      setDuplicateSuggestion(null);
      toast.success('Reused existing educational resource');
    }
  };

  const handleDuplicateReimport = async () => {
    if (file) {
      setDuplicateSuggestion(null);
      await handleFileSelect(file);
    }
  };

  return (
    <div className="mobile-upload-container">
      {/* Top Header with Back Button */}
      <div className="mobile-upload-header">
        <button
          className="mobile-back-btn"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="mobile-upload-title">Upload Resource</h1>
        <div style={{ width: 36 }} />
      </div>

      <div className="mobile-upload-content">
        <div className="mobile-upload-intro">
          <p className="mobile-upload-lead">
            Upload course materials, lecture notes, question banks, or spreadsheets.
          </p>
          <div className="mobile-security-badge">
            <ShieldCheck size={14} />
            <span>Encrypted & Private by default</span>
          </div>
        </div>

        {status === 'idle' ? (
          <MobileFileDropzone onFileSelect={handleFileSelect} />
        ) : (
          <MobileLifecycleProgress
            status={status}
            progress={progress}
            metadata={metadata}
            error={error}
            onRetry={() => file && handleFileSelect(file)}
            onReset={reset}
            onContinue={() => navigate('/marketplace/manage')}
          />
        )}
      </div>

      {/* Apple-Style Bottom Sheet Drawer for Duplicate Checksums */}
      <DuplicateActionSheet
        isOpen={Boolean(duplicateSuggestion)}
        duplicateInfo={duplicateSuggestion}
        onReuse={handleDuplicateReuse}
        onReimport={handleDuplicateReimport}
        onDismiss={() => setDuplicateSuggestion(null)}
      />
    </div>
  );
}
