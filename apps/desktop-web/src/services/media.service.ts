import type { AxiosProgressEvent, AxiosRequestConfig } from 'axios';
import api from '../api/axios';
import {
  ClipAccessResponse, ClipCapabilitiesResponse, ClipResponse, UploadedImageResponse, type ClipKind,
} from '../../../../contracts/v1/domain.js';
import { MediaDeletionResponse, ValidatedImageUrlResponse } from '../../../../contracts/v1/media.js';

type UploadProgress = (event: AxiosProgressEvent) => void;
interface ClipUploadOptions {
  signal?: AbortSignal;
  onUploadProgress?: UploadProgress;
  uploadRequestId?: string;
}

interface ClipAccessContext {
  quizId?: string | null;
  attemptId?: string | null;
}

const signalConfig = (signal?: AbortSignal): AxiosRequestConfig<unknown> => signal ? { signal } : {};
const uploadConfig = (onUploadProgress?: UploadProgress): AxiosRequestConfig<FormData> => ({
  headers: { 'Content-Type': 'multipart/form-data' },
  ...(onUploadProgress ? { onUploadProgress } : {}),
});

export const MediaService = {
  clipCapabilities: async () => ClipCapabilitiesResponse.parse(
    (await api.get<unknown>('/media/clip-capabilities')).data,
  ).data,
  uploadClip: async (file: File, kind: ClipKind, {
    signal, onUploadProgress, uploadRequestId = crypto.randomUUID(),
  }: ClipUploadOptions = {}) => {
    const form = new FormData();
    form.append('kind', kind);
    form.append('uploadRequestId', uploadRequestId);
    form.append('file', file, file.name || 'clip');
    const { data } = await api.post<unknown>('/media/clips', form, {
      ...uploadConfig(onUploadProgress), ...signalConfig(signal),
    });
    return ClipResponse.parse(data).data.asset;
  },
  importClipImage: async (url: string, {
    signal, uploadRequestId = crypto.randomUUID(),
  }: ClipUploadOptions = {}) => {
    const { data } = await api.post<unknown>('/media/clips/image-url', { url, uploadRequestId }, signalConfig(signal));
    return ClipResponse.parse(data).data.asset;
  },
  getClip: async (id: string, signal?: AbortSignal) =>
    ClipResponse.parse((await api.get<unknown>(`/media/clips/${id}`, signalConfig(signal))).data).data.asset,
  retryClip: async (id: string) =>
    ClipResponse.parse((await api.post<unknown>(`/media/clips/${id}/retry`)).data).data.asset,
  deleteClip: async (id: string, pending = false) =>
    MediaDeletionResponse.parse((await api.delete<unknown>(`/media/clips/${id}`, { params: { pending } })).data),
  clipAccess: async (assetIds: readonly string[], context: ClipAccessContext = {}, signal?: AbortSignal) =>
    ClipAccessResponse.parse((await api.post<unknown>('/media/clips/access', { assetIds, ...context }, signalConfig(signal))).data).data.assets,
  uploadImage: async (file: Blob, purpose: string, onUploadProgress?: UploadProgress) => {
    if (!(file instanceof Blob)) throw new Error('A valid image file is required');
    const formData = new FormData();
    formData.append('image', file, file instanceof File && file.name ? file.name : 'image');
    formData.append('purpose', purpose);
    const { data } = await api.post<unknown>('/media/images', formData, uploadConfig(onUploadProgress));
    return UploadedImageResponse.parse(data).data.asset;
  },
  validateImageUrl: async (url: string) =>
    ValidatedImageUrlResponse.parse((await api.post<unknown>('/media/validate-url', { url })).data).data,
};
