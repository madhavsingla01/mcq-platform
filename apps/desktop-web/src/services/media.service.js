import api from '../api/axios';

export const MediaService = {
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
