import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, Search, Copy, ArrowRight } from 'lucide-react';
import FileDropzone from '../../components/upload/FileDropzone';
import { Card, Button, ProgressBar } from '../../components/ui';
import { useUploadStore } from '../../store/uploadStore';
import { useAuthStore } from '../../store/authStore';
import { runWithUploadPanel } from '../../store/uploadPanelStore';
import api from '../../api/axios';
import './Upload.css';

export default function Upload() {
  const navigate = useNavigate();
  const { setFile, setUploadId, setStatus, setParsedData, setAutoMapping, status, error, setError } = useUploadStore();
  const { isAuthenticated } = useAuthStore();
  const [progress, setProgress] = useState(0);
  const [securityOverrideFile, setSecurityOverrideFile] = useState(null);
  const [isImportingAnyway, setIsImportingAnyway] = useState(false);
  const [duplicateSuggestion, setDuplicateSuggestion] = useState(null);

  const getSecurityOverrideError = (err) => {
    const errors = err.response?.data?.errors;
    if (!Array.isArray(errors)) return null;
    return errors.find((item) => item?.canImportAnyway || item?.code === 'SECURITY_VALIDATION_FAILED') || null;
  };

  const proceedToMapping = async (uploadId) => {
    setDuplicateSuggestion(null);
    setStatus('parsing');
    try {
      const parseRes = await api.post(`/parser/parse/${uploadId}`);
      const { headers, rowCount, preview, autoMapping, confidence } = parseRes.data.data;

      setParsedData({ headers, rowCount, preview });
      setAutoMapping(autoMapping, confidence);

      navigate(`/mapping/${uploadId}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to parse file');
      setStatus('idle');
    }
  };

  const uploadAndParse = async (file, { importAnyway = false } = {}) => {
    setFile(file);
    setStatus('uploading');
    setProgress(0);
    setError(null);
    setSecurityOverrideFile(null);
    setDuplicateSuggestion(null);
    setIsImportingAnyway(importAnyway);

    const formData = new FormData();
    formData.append('file', file);
    if (importAnyway) {
      formData.append('importAnyway', 'true');
    }

    try {
      // 1. Upload
      const uploadRes = await runWithUploadPanel(file, { purpose: 'Quiz dataset' }, (onUploadProgress) => (
        api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) setProgress(Math.round((e.loaded * 100) / e.total));
            onUploadProgress(e);
          },
        })
      ));
      
      const uploadId = uploadRes.data.data.upload.id;
      const duplicateQuiz = uploadRes.data.data.duplicateQuiz;
      setUploadId(uploadId);

      // If a duplicate quiz is detected, show suggestion and offer redirect or continue
      if (duplicateQuiz) {
        setDuplicateSuggestion({
          uploadId,
          duplicateQuiz,
        });
        setStatus('idle');
        return;
      }

      // 2. Parse if no duplicate
      await proceedToMapping(uploadId);

    } catch (err) {
      const securityOverride = getSecurityOverrideError(err);
      if (!importAnyway && securityOverride) {
        setSecurityOverrideFile(file);
      }
      setError(err.response?.data?.message || 'Something went wrong during upload/parsing');
      setStatus('idle');
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
    setStatus('idle');
  };

  return (
    <div className="qf-upload-shell">
        <div className="qf-upload-header">
          {!isAuthenticated && <p className="qf-upload-guest-note">Guest limit: 20KB. Log in for 10MB limit.</p>}
        </div>

        {status === 'idle' || status === 'error' ? (
          <>
            <FileDropzone onFileDrop={handleDrop} maxSize={isAuthenticated ? 10485760 : 20480} />
            {duplicateSuggestion && (
              <Card style={{ marginTop: 24, borderLeft: '4px solid var(--color-primary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Copy size={18} style={{ color: 'var(--color-primary)' }} />
                  <h4 style={{ color: 'var(--color-text)', margin: 0, fontWeight: 700, fontSize: 16 }}>
                    Identical Dataset Already Exists
                  </h4>
                </div>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, margin: '6px 0 12px 0' }}>
                  A quiz titled <strong>"{duplicateSuggestion.duplicateQuiz.title}"</strong> ({duplicateSuggestion.duplicateQuiz.questionCount} questions) was generated from this identical file.
                </p>
                <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                  <Button
                    variant="primary"
                    onClick={() => navigate(`/quiz/${duplicateSuggestion.duplicateQuiz.id}`)}
                  >
                    <span>Open Existing Quiz</span>
                    <ArrowRight size={14} style={{ marginLeft: 6 }} />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => proceedToMapping(duplicateSuggestion.uploadId)}
                  >
                    Import & Map Anyway
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setDuplicateSuggestion(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </Card>
            )}
            {error && (
              <Card style={{ marginTop: 24, borderLeft: '4px solid var(--color-danger)' }}>
                <h4 style={{ color: 'var(--color-danger)', marginBottom: 8, fontWeight: 600, fontSize: 15 }}>
                  {securityOverrideFile ? 'Security check failed' : 'Error'}
                </h4>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>{error}</p>
                {securityOverrideFile && (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 8 }}>
                    Only import this file if you trust its source.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
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
        ) : (
          <Card style={{ textAlign: 'center', padding: '60px 40px', maxWidth: 600, margin: '0 auto' }}>
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
              {status === 'uploading' ? (
                <UploadCloud size={40} style={{ color: 'var(--color-primary)' }} />
              ) : (
                <Search size={40} style={{ color: 'var(--color-primary)' }} />
              )}
            </div>
            <h3 style={{ fontSize: 20, marginBottom: 24, fontWeight: 600 }}>
              {status === 'uploading' ? 'Uploading file...' : 'Analyzing columns...'}
            </h3>
            <ProgressBar value={status === 'parsing' ? 100 : progress} />
            <p style={{ marginTop: 16, color: 'var(--color-text-secondary)', fontSize: 14 }}>
              {status === 'uploading' ? `${progress}% complete` : 'Running smart detection engine...'}
            </p>
          </Card>
        )}
      </div>
  );
}
