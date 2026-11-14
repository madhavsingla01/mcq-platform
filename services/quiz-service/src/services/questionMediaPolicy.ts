import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { AppError } from '../middleware/error.middleware.js';
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const clipKinds = ['audio', 'video', 'image'] as const;
const purposes = ['speech', 'signed-language', 'gesture', 'demonstration'] as const;
const uploadStates = ['uploading', 'processing', 'failed'] as const;
const assetFields = ['assetId', 'captionAssetId', 'describedAssetId', 'describedCaptionAssetId'] as const;

function isChoice<T extends string>(choices: readonly T[], value: unknown): value is T {
  return choices.some(choice => choice === value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assetId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value !== 'string' || !uuid.test(value)) throw new AppError('Media requires an uploaded asset ID', 400);
  return value;
}

const bounded = (value: unknown, max: number) => {
  if(value == null) return '';
  if(typeof value!=='string' || value.length>max) throw new AppError('Media text exceeds its supported length',400);
  return value.trim();
};
const languageTag = (value: unknown) => {
  const tag = bounded(value,35);
  if (!tag) return '';
  try { return Intl.getCanonicalLocales(tag)[0] ?? ''; }
  catch { throw new AppError('Use a language code such as en or en-US',400); }
};
export function stableOptionId(option: unknown): string {
  if (isRecord(option)) {
    if (typeof option.optionId === 'string' && /^[a-z\d_-]{8,100}$/i.test(option.optionId)) return option.optionId;
    const legacyId = typeof option._id === 'string' || option._id instanceof mongoose.Types.ObjectId ? String(option._id) : '';
    if (/^[a-f\d]{24}$/i.test(legacyId)) return legacyId;
  }
  return randomUUID();
}

function normalizeClip(clip: Record<string, unknown>, kind: typeof clipKinds[number]) {
  return {
    kind,
    label: bounded(clip.label, 120),
    transcript: bounded(clip.transcript, 8000),
    language: languageTag(clip.language),
    captionLanguage: languageTag(clip.captionLanguage),
    signedLanguage: bounded(clip.signedLanguage, 100),
    purpose: isChoice(purposes, clip.purpose) ? clip.purpose : 'speech',
    uploadState: isChoice(uploadStates, clip.uploadState) ? clip.uploadState : '',
    pendingTarget: isChoice(assetFields, clip.pendingTarget) ? clip.pendingTarget : 'assetId',
    uploadRequestId: typeof clip.uploadRequestId === 'string' && uuid.test(clip.uploadRequestId) ? clip.uploadRequestId : null,
    assetId: assetId(clip.assetId),
    captionAssetId: assetId(clip.captionAssetId),
    describedAssetId: assetId(clip.describedAssetId),
    describedCaptionAssetId: assetId(clip.describedCaptionAssetId),
    pendingAssetId: assetId(clip.pendingAssetId),
    textEquivalentConfirmed: clip.textEquivalentConfirmed === true,
    equivalenceReviewed: clip.equivalenceReviewed === true,
    meaningfulAudio: typeof clip.meaningfulAudio === 'boolean' ? clip.meaningfulAudio : null,
    essentialVisuals: clip.essentialVisuals === true,
    integratedDescription: clip.integratedDescription === true,
  };
}

export type NormalizedClip = ReturnType<typeof normalizeClip>;

export function normalizeMediaClips(input: unknown): NormalizedClip[] {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > 3) throw new AppError('Each question or answer supports one audio clip, one video, and one image', 400);
  const kinds = new Set<typeof clipKinds[number]>();
  return input.map((clip: unknown) => {
    if (!isRecord(clip) || !isChoice(clipKinds, clip.kind) || kinds.has(clip.kind)) {
      throw new AppError('Attach at most one audio clip, one video, and one image', 400);
    }
    kinds.add(clip.kind);
    const result = normalizeClip(clip, clip.kind);
    if (clip.kind !== 'video' && (result.captionAssetId || result.describedAssetId || result.describedCaptionAssetId || result.pendingTarget !== 'assetId')) {
      throw new AppError('Attach video captions and described video to a video clip', 400);
    }
    return result;
  });
}

interface MediaItem {
  text?: unknown;
  accessibilityMedia?: readonly NormalizedClip[];
}

interface MediaQuestion extends MediaItem {
  questionText?: unknown;
  options?: readonly (string | MediaItem)[];
}

export interface ReferencedAsset {
  kind: string;
  status: string;
  duration: number;
  hasAudio: boolean;
}

export function mediaIssues(questions: readonly MediaQuestion[], assets: ReadonlyMap<string, ReferencedAsset> = new Map()) {
  const errors: { path: string; message: string }[] = [];
  for(const [index,question] of questions.entries()) {
    const items=[{...question,location:`Question ${index+1}`,text:question.questionText ?? question.text ?? ''},
      ...(question.options ?? []).map((option, i) => ({
        ...(typeof option === 'string' ? {} : option),
        location: `Question ${index+1}, option ${String.fromCharCode(65+i)}`,
        text: typeof option === 'string' ? option : option.text ?? '',
      }))];
    for(const item of items) for(const clip of item.accessibilityMedia || []) {
      const at=`${item.location}, ${clip.kind}`;
      const issue=(message: string)=>errors.push({path:at,message});
      const asset=clip.assetId ? assets.get(clip.assetId) : undefined;
      if(clip.uploadState || clip.pendingAssetId || !asset || asset.status!=='ready' || asset.kind!==clip.kind) issue('Wait for the clip to finish uploading and processing, or cancel the replacement.');
      if(!clip.label) issue('Add a short accessible clip label.');
      const equivalentText=clip.textEquivalentConfirmed && String(item.text||'').trim().length>=3 && !/^(question|option)\s+[a-h\d]+$/i.test(String(item.text).trim());
      if(!clip.transcript && !equivalentText) {
        const alternative = { audio: 'a transcript', video: 'a descriptive transcript', image: 'an image description' }[clip.kind];
        issue(`Add ${alternative} or confirm that the visible text includes the same information.`);
      }
      if(!clip.equivalenceReviewed) issue('Review the alternatives for equivalent difficulty and confirm that they do not reveal the answer.');
      if(clip.kind!=='video') continue;
      const caption=clip.captionAssetId ? assets.get(clip.captionAssetId) : undefined;
      const described=clip.describedAssetId ? assets.get(clip.describedAssetId) : undefined;
      const describedCaption=clip.describedCaptionAssetId ? assets.get(clip.describedCaptionAssetId) : undefined;
      if(clip.describedCaptionAssetId && !clip.describedAssetId) issue('Attach the audio-described video that these captions describe.');
      const meaningfulAudio=clip.meaningfulAudio ?? asset?.hasAudio;
      if(meaningfulAudio || clip.captionAssetId) {
        if(!caption || caption.kind!=='captions' || caption.status!=='ready') issue('Upload synchronized WebVTT captions for meaningful speech and sounds.');
        else if(asset && caption.duration>asset.duration+0.25) issue('Caption cue timing exceeds the video duration.');
      }
      if(clip.describedAssetId || (meaningfulAudio && clip.essentialVisuals && !clip.integratedDescription)) {
        if(!described || described.kind!=='video' || described.status!=='ready' || !described.hasAudio || clip.assetId===clip.describedAssetId) {
          issue('Provide a separate audio-described video, or confirm that the main audio describes the essential visuals.');
        } else if(!describedCaption || describedCaption.kind!=='captions' || describedCaption.status!=='ready') {
          issue('Upload WebVTT captions for the audio-described video.');
        } else if(describedCaption.duration>described.duration+0.25) {
          issue('Caption cue timing exceeds the audio-described video duration.');
        }
      }
    }
  }
  return errors;
}

