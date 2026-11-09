import api from '../api/axios';

export const MediaService = {
  clipCapabilities: async () => (await api.get('/media/clip-capabilities')).data.data,
  uploadClip: async (file, kind, { signal, onUploadProgress, uploadRequestId = crypto.randomUUID() } = {}) => {
    const form = new FormData();
    form.append('kind', kind); form.append('uploadRequestId', uploadRequestId); form.append('file', file, file.name || 'clip');
    return (await api.post('/media/clips', form, { headers: { 'Content-Type': 'multipart/form-data' }, signal, onUploadProgress })).data.data.asset;
  },
  importClipImage: async (url, { signal, uploadRequestId = crypto.randomUUID() } = {}) => (
    await api.post('/media/clips/image-url', { url, uploadRequestId }, { signal })
  ).data.data.asset,
  getClip: async (id, signal) => (await api.get(`/media/clips/${id}`, { signal })).data.data.asset,
  retryClip: async (id) => (await api.post(`/media/clips/${id}/retry`)).data.data.asset,
  deleteClip: async (id, pending = false) => (await api.delete(`/media/clips/${id}`, { params: { pending } })).data,
  clipAccess: async (assetIds, context = {}, signal) => (await api.post('/media/clips/access', { assetIds, ...context }, { signal })).data.data.assets,
  uploadImage: async (file, purpose, onUploadProgress) => {
    if (!(file instanceof Blob)) throw new Error('A valid image file is required');

    const formData = new FormData();
    formData.append('image', file, file.name || 'image');
    formData.append('purpose', purpose);

    const { data } = await api.post('/media/images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    });
    return data?.data?.asset;
  },

  validateImageUrl: async (url) => {
    const { data } = await api.post('/media/validate-url', { url });
    return data?.data;
  },
};
