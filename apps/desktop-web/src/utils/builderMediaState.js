const newId = () => globalThis.crypto.randomUUID();
export const MAX_BUILDER_OPTIONS = 8;

export function isEmptyBuilderOption(question, index) {
  return !question.options[index].trim() && !question.optionMedia[question.optionIds[index]]?.length;
}

export function fillBuilderOptions(question, entries, byPosition = false) {
  if (question.type === 'short_answer' || question.type === 'true_false') return question;
  let nextEntry = 0;
  const options = question.options.map((option, index) => {
    if (!isEmptyBuilderOption(question, index)) return option;
    return entries[byPosition ? index : nextEntry++] ?? option;
  });
  const added = byPosition ? [] : entries.slice(nextEntry);
  if (options.length + added.length > MAX_BUILDER_OPTIONS) return question;
  return { ...question, options: [...options, ...added], optionIds: [...question.optionIds, ...added.map(newId)] };
}
export function withMediaIds(question) {
  const options=question.options || [];
  const optionIds=options.map((option,index)=>question.optionIds?.[index] || option?.optionId || option?._id || newId()).map(String);
  return {...question,optionIds,accessibilityMedia:question.accessibilityMedia || [],optionMedia:question.optionMedia || {}};
}
export function reorderBuilderOption(question,from,to) {
  if(from<0 || to<0 || from>=question.options.length || to>=question.options.length) return question;
  const ids=[...question.optionIds],options=[...question.options];
  const correctId=ids[question.correctIndex],correctIds=new Set((question.correctIndexes || []).map(index=>ids[index]));
  const [id]=ids.splice(from,1),[option]=options.splice(from,1);ids.splice(to,0,id);options.splice(to,0,option);
  return {...question,options,optionIds:ids,correctIndex:ids.indexOf(correctId),correctIndexes:ids.map((id,index)=>correctIds.has(id)?index:-1).filter(index=>index>=0)};
}
export function removeBuilderOption(question,index) {
  const correctId=question.optionIds[question.correctIndex],correctIds=new Set((question.correctIndexes || []).map(i=>question.optionIds[i]));
  const removedId=question.optionIds[index],optionIds=question.optionIds.filter((_,i)=>i!==index),optionMedia={...question.optionMedia};delete optionMedia[removedId];
  const selected=optionIds.map((id,i)=>correctIds.has(id)?i:-1).filter(i=>i>=0);
  return {...question,optionIds,optionMedia,options:question.options.filter((_,i)=>i!==index),correctIndex:Math.max(0,optionIds.indexOf(correctId)),correctIndexes:selected.length?selected:[0]};
}

export function firstMediaIssue(clips, text) {
  for (const clip of clips || []) {
    const prefix = { audio: 'Audio', video: 'Video', image: 'Image' }[clip.kind] || 'Media';
    if (!clip.assetId || clip.pendingAssetId || clip.uploadState) return `${prefix}: finish the upload or cancel the replacement.`;
    if (!clip.label?.trim()) return `${prefix}: add a short clip label.`;
    if (!clip.transcript?.trim() && !(clip.textEquivalentConfirmed && canUseVisibleMediaText(text))) {
      return `${prefix}: add ${clip.kind === 'image' ? 'an image description' : 'a transcript'} or confirm equivalent visible text.`;
    }
    if (clip.kind === 'video') {
      if (clip.meaningfulAudio && !clip.captionAssetId) return 'Video: upload synchronized WebVTT captions.';
      if (clip.meaningfulAudio && clip.essentialVisuals && !clip.integratedDescription && !clip.describedAssetId) {
        return 'Video: provide audio description for essential visuals.';
      }
      if (clip.describedAssetId && !clip.describedCaptionAssetId) return 'Video: upload WebVTT captions for the audio-described version.';
    }
    if (!clip.equivalenceReviewed) return `${prefix}: confirm the alternatives preserve the difficulty without revealing the answer.`;
  }
  return '';
}

export function canUseVisibleMediaText(text) {
  const value = text?.trim() || '';
  return value.length >= 3 && !/^(question|option)\s+[a-h\d]+$/i.test(value);
}
