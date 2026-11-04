import { create } from 'zustand';

export const useUploadPanelStore = create((set) => ({
  upload: null,
  beginUpload: ({ id, fileName, size, type, purpose }) => set({
    upload: {
      id,
      fileName,
      size,
      type: type || 'Unknown file type',
      purpose,
      status: 'uploading',
      progress: 0,
      error: '',
    },
  }),
  setUploadProgress: (id, progress) => set((state) => (
    state.upload?.id === id
      ? { upload: { ...state.upload, progress: Math.max(0, Math.min(100, progress)) } }
      : state
  )),
  completeUpload: (id) => set((state) => (
    state.upload?.id === id
      ? { upload: { ...state.upload, status: 'complete', progress: 100 } }
      : state
  )),
  failUpload: (id, error) => set((state) => (
    state.upload?.id === id
      ? { upload: { ...state.upload, status: 'error', error } }
      : state
  )),
  dismissUpload: () => set({ upload: null }),
}));

let uploadQueue = Promise.resolve();

export const runWithUploadPanel = (file, { purpose }, uploadTask) => {
  const run = async () => {
    const id = globalThis.crypto.randomUUID();
    const store = useUploadPanelStore.getState();

    store.beginUpload({
      id,
      fileName: file.name || 'Untitled file',
      size: file.size,
      type: file.type,
      purpose,
    });

    try {
      const result = await uploadTask((event) => {
        if (!event.total) return;
        useUploadPanelStore.getState().setUploadProgress(id, Math.round((event.loaded * 100) / event.total));
      });
      useUploadPanelStore.getState().completeUpload(id);
      return result;
    } catch (error) {
      useUploadPanelStore.getState().failUpload(
        id,
        error.response?.data?.message || error.message || 'Upload failed.'
      );
      throw error;
    }
  };

  const queuedRun = uploadQueue.then(run, run);
  uploadQueue = queuedRun.catch(() => {});
  return queuedRun;
};

export const fileFromDataUrl = async (dataUrl, fileName) => {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
};
