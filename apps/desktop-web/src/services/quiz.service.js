import api from '../api/axios';
import { runWithUploadPanel } from '../store/uploadPanelStore';
import { MediaService } from './media.service';

/**
 * QuizService (SOLID: Single Responsibility Principle)
 * Handles quiz discovery, retrieval, creation, and configuration.
 */
export const QuizService = {
  getQuizzes: async (params = {}) => {
    const { data } = await api.get('/quizzes', { params });
    return data?.data || {};
  },

  getQuizById: async (quizId) => {
    const { data } = await api.get(`/quizzes/${quizId}`);
    return data?.data || {};
  },

  updateSettings: async (quizId, settings) => {
    const { data } = await api.put(`/quizzes/${quizId}/settings`, settings);
    return data?.data || {};
  },

  createManualQuiz: async (quizPayload) => {
    const { data } = await api.post('/quizzes/manual', quizPayload);
    return data?.data || {};
  },

  deleteQuiz: async (quizId) => {
    const { data } = await api.delete(`/quizzes/${quizId}`);
    return data;
  },

  uploadCoverImage: async (quizId, fileInput) => {
    // Safely extract File/Blob from raw File or from compressor result { file, previewUrl }
    let rawFile = fileInput?.file || fileInput;

    if (!rawFile || !(rawFile instanceof Blob)) {
      throw new Error('Please provide a valid image file');
    }

    let fileToUpload = rawFile;
    try {
      if (typeof window !== 'undefined' && rawFile.type?.startsWith('image/')) {
        const { compressImage } = await import('../utils/imageCompressor');
        const compressed = await compressImage(rawFile, { maxWidth: 1280, maxHeight: 720, quality: 0.82 });
        if (compressed?.file && compressed.file instanceof Blob) {
          fileToUpload = compressed.file;
        }
      }
    } catch (err) {
      console.warn('Browser compression fallback to original:', err);
    }

    const fileName = fileToUpload.name || (rawFile.name || 'cover.webp');
    const fileForPanel = fileToUpload instanceof File
      ? fileToUpload
      : new File([fileToUpload], fileName, { type: fileToUpload.type || rawFile.type || 'application/octet-stream' });
    const response = await runWithUploadPanel(
      fileForPanel,
      { purpose: 'Quiz cover image' },
      async (onUploadProgress) => {
        const asset = await MediaService.uploadImage(fileForPanel, 'quiz-cover', onUploadProgress);
        return api.post(`/quiz/${quizId}/cover`, { imageUrl: asset.url });
      }
    );
    return response.data?.data || {};
  },

  removeCoverImage: async (quizId) => {
    const { data } = await api.delete(`/quiz/${quizId}/cover`);
    return data?.data || {};
  },

  // ── Draft Document APIs ──
  getDrafts: async (params = {}) => {
    const { data } = await api.get('/quiz/drafts', { params });
    return data?.data || { drafts: [] };
  },

  getDraftById: async (draftId) => {
    const { data } = await api.get(`/quiz/drafts/${draftId}`);
    return data?.data || {};
  },

  updateDraft: async (draftId, payload) => {
    const { data } = await api.put(`/quiz/drafts/${draftId}`, payload);
    return data?.data || {};
  },

  publishDraft: async (draftId, payload = {}) => {
    const { data } = await api.post(`/quiz/drafts/${draftId}/publish`, payload);
    return data?.data || {};
  },

  duplicateDraft: async (draftId) => {
    const { data } = await api.post(`/quiz/drafts/${draftId}/duplicate`);
    return data?.data || {};
  },

  deleteDraft: async (draftId) => {
    const { data } = await api.delete(`/quiz/drafts/${draftId}`);
    return data;
  },
};

export default QuizService;
