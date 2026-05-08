import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FileDropzone from '../../components/upload/FileDropzone';
import { Card, Button, ProgressBar } from '../../components/ui';
import { useUploadStore } from '../../store/uploadStore';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/axios';

export default function Upload() {
  const navigate = useNavigate();
  const { setFile, setUploadId, setStatus, setParsedData, setAutoMapping, status, error, setError } = useUploadStore();
  const { isAuthenticated } = useAuthStore();
  const [progress, setProgress] = useState(0);
  const [securityOverrideFile, setSecurityOverrideFile] = useState(null);
  const [isImportingAnyway, setIsImportingAnyway] = useState(false);

  const getSecurityOverrideError = (err) => {
    const errors = err.response?.data?.errors;
    if (!Array.isArray(errors)) return null;
    return errors.find((item) => item?.canImportAnyway || item?.code === 'SECURITY_VALIDATION_FAILED') || null;
  };

  const uploadAndParse = async (file, { importAnyway = false } = {}) => {
    setFile(file);
    setStatus('uploading');
    setProgress(0);
    setError(null);
    setSecurityOverrideFile(null);
    setIsImportingAnyway(importAnyway);

    const formData = new FormData();
    formData.append('file', file);
    if (importAnyway) {
      formData.append('importAnyway', 'true');
    }

    try {
      // 1. Upload
      const uploadRes = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          setProgress(Math.round((e.loaded * 100) / e.total));
        }
      });
      
      const uploadId = uploadRes.data.data.upload.id;
      setUploadId(uploadId);
      setStatus('parsing');

      // 2. Parse
      const parseRes = await api.post(`/parser/parse/${uploadId}`);
      const { headers, rowCount, preview, autoMapping, confidence } = parseRes.data.data;
      
      setParsedData({ headers, rowCount, preview });
      setAutoMapping(autoMapping, confidence);
      
      navigate(`/mapping/${uploadId}`);

    } catch (err) {
      console.error(err);
      const securityOverride = getSecurityOverrideError(err);
      if (!importAnyway && securityOverride) {
        setSecurityOverrideFile(file);
      }
      setError(err.response?.data?.message || 'Something went wrong during upload/parsing');
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
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 12 }}>Upload your MCQ file</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          We support Excel (.xlsx, .xls), CSV, and JSON files.
          {!isAuthenticated && <span style={{ display: 'block', marginTop: 4, color: 'var(--color-warning)' }}>Guest limit: 20KB. Log in for 10MB limit.</span>}
        </p>
      </div>

      {status === 'idle' || status === 'error' ? (
        <>
          <FileDropzone onFileDrop={handleDrop} maxSize={isAuthenticated ? 10485760 : 20480} />
          {error && (
            <Card style={{ marginTop: 24, border: '1px solid var(--color-danger)', background: 'var(--color-danger-light)' }}>
              <h4 style={{ color: 'var(--color-danger)', marginBottom: 8, fontWeight: 600 }}>
                {securityOverrideFile ? 'Security check failed' : 'Error'}
              </h4>
              <p style={{ color: 'var(--color-text)' }}>{error}</p>
              {securityOverrideFile && (
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginTop: 8 }}>
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
        <Card style={{ textAlign: 'center', padding: '60px 40px' }}>
          <h3 style={{ fontSize: 20, marginBottom: 24 }}>
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
