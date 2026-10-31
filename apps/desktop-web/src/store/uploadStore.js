import { create } from 'zustand';

export const useUploadStore = create((set) => ({
  uploadId: null,
  file: null,
  status: 'idle', // idle, uploading, uploaded, parsing, parsed, mapping, mapped, generating, done, error
  progress: 0,
  parsedData: null,
  autoMapping: null,
  confidence: null,
  columnMapping: null,
  error: null,

  setFile: (file) => set({ file, status: 'idle', error: null }),
  setUploadId: (id) => set({ uploadId: id }),
  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),
  setParsedData: (data) => set({ parsedData: data, status: 'parsed' }),
  setAutoMapping: (mapping, confidence) => set({ autoMapping: mapping, confidence }),
  setColumnMapping: (mapping) => set({ columnMapping: mapping, status: 'mapped' }),
  setError: (error) => set({ error, status: 'error' }),
  reset: () => set({ uploadId: null, file: null, status: 'idle', progress: 0, parsedData: null, autoMapping: null, confidence: null, columnMapping: null, error: null }),
}));
