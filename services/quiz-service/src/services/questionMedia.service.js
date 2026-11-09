import { AppError } from '../middleware/error.middleware.js';
import env from '../config/env.js';
import { normalizeMediaClips, stableOptionId, mediaIssues } from './questionMediaPolicy.js';
export { normalizeMediaClips, stableOptionId, mediaIssues } from './questionMediaPolicy.js';

export async function validateQuestionMedia(input,req,{draft=false}={}) {
  const questions=(input || []).map((question,index)=>{
    if (!question || typeof question !== 'object' || Array.isArray(question) || (question.options != null && !Array.isArray(question.options))) {
      throw new AppError(`Question ${index+1} must include a valid prompt and options array`,400);
    }
    if (['audio','video'].includes(question.media?.type)) {
      throw new AppError(`Question ${index+1}: upload audio and video through Media Service and attach the returned asset ID`,400);
    }
    const options=(question.options||[]).map(option=>{
      if (typeof option === 'string') return option;
      if (!option || typeof option !== 'object' || Array.isArray(option)) throw new AppError(`Question ${index+1} has an invalid option`,400);
      return {...option,optionId:stableOptionId(option),accessibilityMedia:normalizeMediaClips(option.accessibilityMedia)};
    });
    const optionIds = options.map(option=>option.optionId).filter(Boolean);
    if (new Set(optionIds).size !== optionIds.length) throw new AppError(`Question ${index+1} has duplicate option IDs`,400);
    return {...question,options,accessibilityMedia:normalizeMediaClips(question.accessibilityMedia)};
  });
  const clips=questions.flatMap(question=>[question,...question.options].flatMap(item=>item.accessibilityMedia||[]));
  const ids=[...new Set(clips.flatMap(clip=>[clip.assetId,clip.pendingAssetId,clip.captionAssetId,clip.describedAssetId,clip.describedCaptionAssetId].filter(Boolean)))];
  if(ids.length>512) throw new AppError('A quiz supports at most 512 distinct media assets',400);
  if(!clips.length) return questions;
  const assets=new Map();
  if(ids.length) {
    const origin=new URL(env.MEDIA_SERVICE_URL);
    if(!['http:','https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname!=='/') throw new AppError('Media service configuration is invalid',503);
    const headers={'content-type':'application/json'};
    for(const key of ['cookie','authorization','x-csrf-token','x-request-id']) if(req.headers[key]) headers[key]=req.headers[key];
    let response;
    try {response=await fetch(new URL('/api/v1/media/clips/validate-references',origin),{method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(10000),body:JSON.stringify({assetIds:ids})});}
    catch {throw new AppError('Media verification is temporarily unavailable. Your draft can be retried',503);}
    const body=await response.json().catch(()=>({}));
    if(!response.ok) throw new AppError(body.message || 'Media ownership verification failed',response.status);
    if(!Array.isArray(body.data?.assets)) throw new AppError('Media verification returned an invalid response',502);
    body.data.assets.forEach(asset=>assets.set(asset._id,asset));
  }
  if(!draft) {
    const errors=mediaIssues(questions,assets);
    if(errors.length) throw new AppError('Review media accessibility before publishing',422,errors);
  }
  return questions;
}
