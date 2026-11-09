import { randomUUID } from 'node:crypto';
import { AppError } from '../middleware/error.middleware.js';
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const bounded = (value,max) => {
  if(value == null) return '';
  if(typeof value!=='string' || value.length>max) throw new AppError('Media text exceeds its supported length',400);
  return value.trim();
};
const languageTag = value => {
  const tag = bounded(value,35);
  if (!tag) return '';
  try { return Intl.getCanonicalLocales(tag)[0]; }
  catch { throw new AppError('Use a language code such as en or en-US',400); }
};
export const stableOptionId = option => typeof option?.optionId === 'string' && /^[a-z\d_-]{8,100}$/i.test(option.optionId) ? option.optionId
  : /^[a-f\d]{24}$/i.test(option?._id || '') ? String(option._id) : randomUUID();

export function normalizeMediaClips(input) {
  if(input==null) return [];
  if(!Array.isArray(input) || input.length>3) throw new AppError('Each question or answer supports one audio clip, one video, and one image',400);
  const kinds = new Set();
  return input.map(clip=>{
    if(!clip || typeof clip!=='object' || !['audio','video','image'].includes(clip.kind) || kinds.has(clip.kind)) throw new AppError('Attach at most one audio clip, one video, and one image',400);
    kinds.add(clip.kind);
    const result={kind:clip.kind,label:bounded(clip.label,120),transcript:bounded(clip.transcript,8000),language:languageTag(clip.language),
      captionLanguage:languageTag(clip.captionLanguage),signedLanguage:bounded(clip.signedLanguage,100),
      purpose:['speech','signed-language','gesture','demonstration'].includes(clip.purpose)?clip.purpose:'speech'};
    result.uploadState=['uploading','processing','failed'].includes(clip.uploadState)?clip.uploadState:'';
    result.pendingTarget=['assetId','captionAssetId','describedAssetId','describedCaptionAssetId'].includes(clip.pendingTarget)?clip.pendingTarget:'assetId';
    result.uploadRequestId=uuid.test(clip.uploadRequestId || '')?clip.uploadRequestId:null;
    for(const key of ['assetId','captionAssetId','describedAssetId','describedCaptionAssetId','pendingAssetId']) {
      if(clip[key] && (typeof clip[key]!=='string' || !uuid.test(clip[key]))) throw new AppError('Media requires an uploaded asset ID',400);
      result[key]=clip[key] || null;
    }
    if(clip.kind!=='video' && (result.captionAssetId || result.describedAssetId || result.describedCaptionAssetId || result.pendingTarget!=='assetId')) {
      throw new AppError('Attach video captions and described video to a video clip',400);
    }
    for(const key of ['textEquivalentConfirmed','equivalenceReviewed','meaningfulAudio','essentialVisuals','integratedDescription']) result[key]=clip[key]===true;
    if(typeof clip.meaningfulAudio!=='boolean')result.meaningfulAudio=null;
    return result;
  });
}

export function mediaIssues(questions, assets=new Map()) {
  const errors=[];
  for(const [index,question] of questions.entries()) {
    const items=[{...question,location:`Question ${index+1}`,text:question.questionText ?? question.text ?? ''},
      ...(question.options||[]).map((option,i)=>({...option,location:`Question ${index+1}, option ${String.fromCharCode(65+i)}`,text:option?.text||''}))];
    for(const item of items) for(const clip of item.accessibilityMedia || []) {
      const at=`${item.location}, ${clip.kind}`;
      const issue=message=>errors.push({path:at,message});
      const asset=assets.get(clip.assetId);
      if(clip.uploadState || clip.pendingAssetId || !asset || asset.status!=='ready' || asset.kind!==clip.kind) issue('Wait for the clip to finish uploading and processing, or cancel the replacement.');
      if(!clip.label) issue('Add a short accessible clip label.');
      const equivalentText=clip.textEquivalentConfirmed && String(item.text||'').trim().length>=3 && !/^(question|option)\s+[a-h\d]+$/i.test(String(item.text).trim());
      if(!clip.transcript && !equivalentText) {
        const alternative = { audio: 'a transcript', video: 'a descriptive transcript', image: 'an image description' }[clip.kind];
        issue(`Add ${alternative} or confirm that the visible text includes the same information.`);
      }
      if(!clip.equivalenceReviewed) issue('Review the alternatives for equivalent difficulty and confirm that they do not reveal the answer.');
      if(clip.kind!=='video') continue;
      const caption=assets.get(clip.captionAssetId);
      const described=assets.get(clip.describedAssetId);
      const describedCaption=assets.get(clip.describedCaptionAssetId);
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

