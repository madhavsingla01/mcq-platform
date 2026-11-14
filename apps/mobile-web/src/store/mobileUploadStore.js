import { create } from 'zustand';

export const useMobileUploadStore = create((set) => ({
  file: null,
  status: 'idle', // 'idle' | 'initiated' | 'uploaded' | 'scanning' | 'processing' | 'ready' | 'rejected' | 'failed' | 'quarantined'
  progress: 0,
  assetId: null,
  uploadId: null,
  metadata: null,
  duplicateSuggestion: null,
  error: null,

  setFile: (file) => set({ file, status: 'idle', error: null }),
  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress: Math.max(0, Math.min(100, progress)) }),
  setAssetId: (assetId) => set({ assetId }),
  setUploadId: (uploadId) => set({ uploadId }),
  setMetadata: (metadata) => set({ metadata }),
  setDuplicateSuggestion: (duplicateSuggestion) => set({ duplicateSuggestion }),
  setError: (error) => set({ error, status: error ? 'failed' : 'idle' }),
  reset: () => set({
    file: null,
    status: 'idle',
    progress: 0,
    assetId: null,
    uploadId: null,
    metadata: null,
    duplicateSuggestion: null,
    error: null,
  }),
}));
