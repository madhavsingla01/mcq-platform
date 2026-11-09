import { AppError } from '../middleware/error.middleware.js';

export const assetIdPattern = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export function assetIds(value, max = 512) {
  if (!Array.isArray(value) || value.length > max || value.some(id => typeof id !== 'string' || !assetIdPattern.test(id))) throw new AppError('Invalid media references', 400);
  return [...new Set(value)];
}

export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new AppError('Requested media range is unavailable', 416);
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) throw new AppError('Requested media range is unavailable', 416);
  return { start, end };
}

const timestamp = value => {
  const match = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value);
  if (!match) throw new AppError('Captions need valid WebVTT timestamps', 400);
  return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
};
export function sanitizeWebVtt(buffer, maxDuration = 300) {
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'); }
  catch { throw new AppError('Captions must be UTF-8 WebVTT', 400); }
  if (!/^WEBVTT(?:\n|$)/.test(source)) throw new AppError('Upload a WebVTT file beginning with WEBVTT', 400);
  const blocks = source.slice(6).trim().split(/\n\s*\n/);
  const cues = []; let previousStart = -1; let duration = 0;
  for (const block of blocks) {
    if (block.startsWith('NOTE')) continue;
    const lines = block.split('\n');
    if (!lines[0].includes('-->')) lines.shift();
    const match = /^(\S+)\s+-->\s+(\S+)$/.exec(lines.shift() || '');
    if (!match) throw new AppError('Captions contain an invalid cue. Use plain WebVTT cues without styling', 400);
    const start = timestamp(match[1]), end = timestamp(match[2]);
    if (start < previousStart || end <= start || end > maxDuration + 1 || cues.length >= 2000) throw new AppError('Caption cue timing exceeds the supported clip duration or order', 400);
    const text = lines.join('\n').replace(/<[^>]*>/g, '').trim();
    if (!text || text.length > 2000) throw new AppError('Every caption cue needs meaningful text', 400);
    cues.push(`${match[1]} --> ${match[2]}\n${text}`); previousStart = start; duration = Math.max(duration, end);
  }
  if (!cues.length) throw new AppError('Captions need at least one timed cue', 400);
  return { text: 'WEBVTT\n\n' + cues.join('\n\n') + '\n', duration };
}

export const publicClip = asset => ({
  _id: String(asset._id), kind: asset.kind, status: asset.status,
  failureCode: asset.failureCode || '', duration: asset.content?.duration || 0,
  hasAudio: asset.content?.hasAudio === true,
  animated: asset.content?.animated === true,
  width: asset.content?.width || 0, height: asset.content?.height || 0,
});

export const questionAssetFilter = {
  $or: [{ kind: { $in: ['audio', 'video', 'captions'] } }, { kind: 'image', purpose: 'quiz-clip' }],
};

export function referencedAssets(questions, includePending = false) {
  const ids = new Set();
  for (const question of questions || []) for (const item of [question, ...(question.options || [])]) {
    for (const clip of item.accessibilityMedia || []) for (const field of ['assetId', 'captionAssetId', 'describedAssetId', 'describedCaptionAssetId', ...(includePending ? ['pendingAssetId'] : [])]) {
      if (assetIdPattern.test(clip[field] || '')) ids.add(clip[field]);
    }
  }
  return ids;
}
