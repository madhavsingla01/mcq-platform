import type { IncomingHttpHeaders } from 'node:http';
import { z } from 'zod';
import { AppError } from '../middleware/error.middleware.js';
import env from '../config/env.js';
import { isRecord, normalizeMediaClips, stableOptionId, mediaIssues, type ReferencedAsset } from './questionMediaPolicy.js';

export { normalizeMediaClips, stableOptionId, mediaIssues } from './questionMediaPolicy.js';

const referenceResponse = z.object({
  data: z.object({
    assets: z.array(z.object({
      _id: z.uuid(),
      kind: z.enum(['image', 'audio', 'video', 'captions']),
      status: z.string(),
      duration: z.number().nonnegative(),
      hasAudio: z.boolean(),
    })).max(512),
  }),
});
const errorResponse = z.object({ message: z.string().optional() });

export async function validateQuestionMedia(
  input: unknown,
  req: { headers: IncomingHttpHeaders },
  { draft = false } = {},
) {
  if (input != null && !Array.isArray(input)) throw new AppError('questions array is required', 400);
  const questions = (input ?? []).map((question: unknown, index: number) => {
    if (!isRecord(question) || (question.options != null && !Array.isArray(question.options))) {
      throw new AppError(`Question ${index + 1} must include a valid prompt and options array`, 400);
    }
    const mediaType = isRecord(question.media) ? question.media.type : undefined;
    if (mediaType === 'audio' || mediaType === 'video') {
      throw new AppError(`Question ${index + 1}: upload audio and video through Media Service and attach the returned asset ID`, 400);
    }

    const options = (question.options ?? []).map((option: unknown) => {
      if (typeof option === 'string') return option;
      if (!isRecord(option)) throw new AppError(`Question ${index + 1} has an invalid option`, 400);
      return {
        ...option,
        optionId: stableOptionId(option),
        accessibilityMedia: normalizeMediaClips(option.accessibilityMedia),
      };
    });
    const optionIds = options.flatMap(option => typeof option === 'string' ? [] : [option.optionId]);
    if (new Set(optionIds).size !== optionIds.length) throw new AppError(`Question ${index + 1} has duplicate option IDs`, 400);
    return { ...question, options, accessibilityMedia: normalizeMediaClips(question.accessibilityMedia) };
  });

  const clips = questions.flatMap(question => [question, ...question.options]
    .flatMap(item => typeof item === 'string' ? [] : item.accessibilityMedia));
  const ids = [...new Set(clips.flatMap(clip => [
    clip.assetId, clip.pendingAssetId, clip.captionAssetId, clip.describedAssetId, clip.describedCaptionAssetId,
  ].filter(id => id !== null)))];
  if (ids.length > 512) throw new AppError('A quiz supports at most 512 distinct media assets', 400);
  if (!clips.length) return questions;

  const assets = new Map<string, ReferencedAsset>();
  if (ids.length) {
    const origin = new URL(env.MEDIA_SERVICE_URL);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') {
      throw new AppError('Media service configuration is invalid', 503);
    }
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    for (const key of ['cookie', 'authorization', 'x-csrf-token', 'x-request-id']) {
      const value = req.headers[key];
      if (typeof value === 'string') headers[key] = value;
    }

    let response: Response;
    try {
      response = await fetch(new URL('/api/v1/media/clips/validate-references', origin), {
        method: 'POST', headers, redirect: 'error',
        signal: AbortSignal.timeout(10000), body: JSON.stringify({ assetIds: ids }),
      });
    } catch {
      throw new AppError('Media verification is temporarily unavailable. Your draft can be retried', 503);
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const upstreamError = errorResponse.safeParse(body).data;
      throw new AppError(upstreamError?.message || 'Media ownership verification failed', response.status);
    }
    const verified = referenceResponse.safeParse(body);
    if (!verified.success) throw new AppError('Media verification returned an invalid response', 502);
    for (const asset of verified.data.data.assets) assets.set(asset._id, asset);
  }

  if (!draft) {
    const errors = mediaIssues(questions, assets);
    if (errors.length) throw new AppError('Review media accessibility before publishing', 422, errors);
  }
  return questions;
}
