import { useEffect, useId, useRef, useState } from 'react';
import { AudioLines, Image as ImageIcon, Plus, Repeat2, Trash2, Video } from 'lucide-react';
import { MediaService } from '../../services/media.service';
import { canUseVisibleMediaText } from '../../utils/builderMediaState';
import AccessibleMedia from './AccessibleMedia';
import './MediaEditor.css';
let capabilitiesPromise;
const capabilities = () => capabilitiesPromise ||= MediaService.clipCapabilities().finally(()=>{capabilitiesPromise=null;});
const mediaTypes = {
  audio: { name: 'Audio', label: 'Spoken clip', Icon: AudioLines },
  video: { name: 'Video', label: 'Video clip', Icon: Video },
  image: { name: 'Image', label: 'Image', Icon: ImageIcon },
};

function Requirement({ required, added = false }) {
  return <span className={`qf-media-requirement${required ? ' is-required' : ''}`} aria-hidden="true">
    {required ? 'Required' : 'Optional'}{added ? ' · Added' : ''}
  </span>;
}

export default function MediaEditor({ clips = [], onChange, contextLabel, text = '', active = true }) {
  const id=useId(),valueRef=useRef(clips),changeRef=useRef(onChange),controllers=useRef(new Map()),files=useRef(new Map());
  valueRef.current=clips;changeRef.current=onChange;
  const [limits,setLimits]=useState(null),[notice,setNotice]=useState(''),[progress,setProgress]=useState({});
  const [checking,setChecking]=useState(false);
  const [imageUrl, setImageUrl] = useState('');
  useEffect(() => {
    if (!active) return;
    let closed = false;
    capabilities().then(value => { if (!closed) setLimits(value); }).catch(() => {
      if (!closed) setNotice('Media settings could not load. Check the connection and try again.');
    });
    return () => { closed = true; };
  }, [active]);

  const checkProcessor = async () => {
    setChecking(true);
    try {
      const config = await capabilities();
      setLimits(config);
      setNotice(config.processorReady ? 'Media processing is ready.' : 'Media processing is still unavailable.');
    } catch {
      setNotice('The media service could not be reached. Try again shortly.');
    } finally {
      setChecking(false);
    }
  };
  const emit = next=>{valueRef.current=next;changeRef.current(next);};
  const patch = (kind,values)=>emit(valueRef.current.map(clip=>clip.kind===kind?{...clip,...values}:clip));
  const complete = (kind,target,asset)=>patch(kind,{[target]:asset._id,pendingAssetId:null,uploadState:'',
    ...(target==='assetId' && kind==='video'?{meaningfulAudio:asset.hasAudio===true}:{}),equivalenceReviewed:false});
  const pendingKey=clips.filter(clip=>clip.pendingAssetId && clip.uploadState!=='failed').map(clip=>`${clip.kind}:${clip.pendingAssetId}:${clip.pendingTarget}`).join('|');
  useEffect(()=>{
    let stopped=false;let timer;
    const check=async()=>{
      for(const clip of valueRef.current.filter(item=>item.pendingAssetId && item.uploadState!=='failed')) {
        try {
          const asset=await MediaService.getClip(clip.pendingAssetId);
          if(stopped) return;
          if(valueRef.current.find(item=>item.kind===clip.kind)?.pendingAssetId!==clip.pendingAssetId)continue;
          if(asset.status==='ready')complete(clip.kind,clip.pendingTarget || 'assetId',asset);
          else if(asset.status==='failed')patch(clip.kind,{uploadState:'failed'});
        } catch(error) {
          if(stopped) return;
          if(error.response?.status===404 && valueRef.current.find(item=>item.kind===clip.kind)?.pendingAssetId===clip.pendingAssetId) {
            patch(clip.kind,{uploadState:'failed',pendingAssetId:null});
            setNotice('The pending upload is unavailable. Choose the file again.');
          } else setNotice('Processing status is temporarily unavailable. Checking again shortly.');
        }
      }
      if(!stopped)timer=setTimeout(check,1500);
    };
    if(pendingKey)check();
    return ()=>{stopped=true;clearTimeout(timer);};
  },[pendingKey]);
  useEffect(()=>()=>controllers.current.forEach(controller=>controller.abort()),[]);

  const upload=async(kind,target,source,retry=false)=>{
    if(!source) return;
    const actualKind=target.endsWith('CaptionAssetId') || target==='captionAssetId'?'captions':target==='describedAssetId'?'video':kind;
    const requiresProcessor = ['audio', 'video'].includes(actualKind);
    const linked = typeof source === 'string';
    let config=limits;
    try {if(!config || requiresProcessor && !config.processorReady)config=await capabilities();setLimits(config);} catch {setNotice('Upload limits could not load. Try again.');return;}
    const max = { captions: config.maxCaptionSize, image: config.maxImageSize }[actualKind] ?? config.maxFileSize;
    const limit = max < 1048576 ? `${Math.round(max/1024)} KB` : `${Math.round(max/1048576)} MB`;
    if(!linked && source.size>max){setNotice(`${contextLabel}: this file exceeds the ${limit} limit.`);return;}
    if(requiresProcessor && !config.processorReady){setNotice('Audio and video processing is unavailable. Your existing attachment is kept.');return;}
    const current=valueRef.current.find(clip=>clip.kind===kind);
    if(!current || [...controllers.current.keys()].some(key=>key.startsWith(kind+':'))) return;
    const key=`${kind}:${target}`;
    files.current.set(key,source);
    const controller=new AbortController();controllers.current.set(key,controller);
    const requestId=retry && current.uploadRequestId?current.uploadRequestId:crypto.randomUUID();
    patch(kind,{uploadState:'uploading',uploadRequestId:requestId,pendingTarget:target,pendingAssetId:null,equivalenceReviewed:false});
    if(current.pendingAssetId)MediaService.deleteClip(current.pendingAssetId,true).catch(()=>{});
    setNotice('');setProgress(previous=>({...previous,[kind]:0}));
    try {
      const options = { signal: controller.signal, uploadRequestId: requestId };
      const asset = linked
        ? await MediaService.importClipImage(source, options)
        : await MediaService.uploadClip(source, actualKind, { ...options,
          onUploadProgress: event => setProgress(previous => ({ ...previous, [kind]: Math.min(99, Math.round(event.loaded / (event.total || source.size) * 100)) })),
        });
      if(controller.signal.aborted)return;
      if(asset.status==='ready') {
        complete(kind,target,asset);
        if (linked) setImageUrl('');
      }
      else patch(kind,{pendingAssetId:asset._id,pendingTarget:target,uploadState:'processing'});
    } catch(error) {
      if(!controller.signal.aborted){patch(kind,{uploadState:'failed'});setNotice(error.response?.data?.message || 'Upload failed. Retry or choose the file again. The previous attachment is kept.');}
    } finally {controllers.current.delete(key);}
  };
  const cancel=kind=>{
    const clip=valueRef.current.find(item=>item.kind===kind);
    controllers.current.forEach((controller,key)=>{if(key.startsWith(kind+':'))controller.abort();});
    patch(kind,{pendingAssetId:null,uploadState:''});
    if(clip.pendingAssetId)MediaService.deleteClip(clip.pendingAssetId,true).catch(()=>{});
    setNotice('Replacement cancelled. The previous attachment is kept.');
  };
  const retry=async clip=>{
    if(clip.pendingAssetId){try{await MediaService.retryClip(clip.pendingAssetId);if(valueRef.current.find(item=>item.kind===clip.kind)?.pendingAssetId===clip.pendingAssetId)patch(clip.kind,{uploadState:'processing'});setNotice('Processing retried.');}catch(error){setNotice(error.response?.data?.message || 'Choose the file again to retry.');}}
    else {const file=files.current.get(`${clip.kind}:${clip.pendingTarget||'assetId'}`);if(file)upload(clip.kind,clip.pendingTarget||'assetId',file,true);else setNotice('Choose the original file again to retry this upload.');}
  };
  if (!active) return null;
  return <div className="qf-media-editor">
    <div className="qf-media-editor-body">
      {clips.length === 0 && (
        <div className="qf-media-empty">
          <Video size={26} aria-hidden="true" />
          <strong>Add media</strong>
          <p>Add an image, audio, or video. Review the text alternative before publishing.</p>
        </div>
      )}
      {limits && <ul className="qf-media-limits">
        <li>Formats: MP3, WAV, Ogg, M4A, MP4 or WebM</li>
        <li>Clip limit: {Math.round(limits.maxFileSize / 1048576)} MB and {limits.maxDurationSeconds} seconds</li>
        {limits.maxImageSize && <li>Images: JPEG, PNG, WebP, or GIF, up to {Math.round(limits.maxImageSize / 1048576)} MB. Animations: up to 120 frames.</li>}
        <li>Captions: WebVTT, up to {Math.round(limits.maxCaptionSize / 1024)} KB</li>
      </ul>}
      {!limits?.processorReady && (
        <div className="qf-media-processor">
          <p>{limits ? 'Audio and video processing is unavailable. You can still add images and captions.' : 'Media upload limits are loading.'}</p>
          <button type="button" disabled={checking} onClick={checkProcessor}>{checking ? 'Checking…' : 'Check connection'}</button>
        </div>
      )}
      {clips.map(clip=>{
        const prefix=`${id}-${clip.kind}`;
        const interrupted=clip.uploadState==='uploading' && ![...controllers.current.keys()].some(key=>key.startsWith(clip.kind+':'));
        const status=interrupted?'failed':clip.uploadState;
        const busy=['uploading','processing'].includes(status);
        const revise=values=>patch(clip.kind,{...values,equivalenceReviewed:false});
        const { name, Icon } = mediaTypes[clip.kind];
        const isImage = clip.kind === 'image';
        const alternativeLabel = { image: 'Image description (alt text)', video: 'Descriptive transcript, including relevant visuals, speech and sounds', audio: 'Audio transcript' }[clip.kind];
        const textCanSubstitute = canUseVisibleMediaText(text);
        const usesVisibleText = !clip.transcript?.trim() && textCanSubstitute;
        const captionsRequired = Boolean(clip.meaningfulAudio);
        const descriptionRequired = captionsRequired && clip.essentialVisuals && !clip.integratedDescription;
        const choose=(target,accept,label,Icon)=><label className="qf-media-file">
          {Icon && <Icon size={15} aria-hidden="true" />} {label}
          <input className="qf-media-file-input" type="file" accept={accept} disabled={busy || !limits} aria-label={`${label} for ${contextLabel}`}
            onChange={event=>{const file=event.target.files?.[0];event.target.value='';upload(clip.kind,target,file);}} />
        </label>;
        return <fieldset key={clip.kind} className="qf-media-edit-clip">
          <legend><Icon size={15} aria-hidden="true" /> {name}</legend>
          {clip.assetId && <AccessibleMedia clips={[clip]} text={text} preview />}
          <div className="qf-media-file-actions">
            {choose('assetId',limits?.formats?.[clip.kind]?.join(',') || { audio: '.mp3,.wav,.ogg,.m4a,.webm', video: '.mp4,.webm', image: '.jpg,.jpeg,.png,.webp,.gif' }[clip.kind],
              isImage ? (clip.assetId ? 'Replace image' : 'Upload image') : (clip.assetId ? 'Replace clip' : 'Upload clip'), clip.assetId ? Repeat2 : Plus)}
            <button type="button" className="qf-media-remove" onClick={()=>{cancel(clip.kind);emit(valueRef.current.filter(item=>item.kind!==clip.kind));}}>
              <Trash2 size={15} aria-hidden="true" /> Remove {clip.kind}
            </button>
          </div>
          {isImage && <div className="qf-media-image-link">
            <label htmlFor={`${prefix}-url`}>Or paste a direct HTTPS image link</label>
            <input id={`${prefix}-url`} type="url" value={imageUrl} disabled={busy}
              maxLength={2048} placeholder="https://example.com/image.png" onChange={event=>setImageUrl(event.target.value)} />
            <button type="button" disabled={busy || !limits || !imageUrl.trim()}
              onClick={()=>upload('image','assetId',imageUrl.trim())}>{clip.assetId ? 'Replace from link' : 'Import image link'}</button>
          </div>}
          {status && <div><p role="status">{status==='uploading'?'Uploading…':status==='processing'?'Processing…':'Upload or processing needs attention.'} The existing clip stays active.</p>
            {status==='uploading' && <progress max="100"
              value={typeof files.current.get(`${clip.kind}:${clip.pendingTarget}`) === 'string' ? undefined : progress[clip.kind]||0}
              aria-label={`Uploading ${contextLabel} ${clip.kind}`} />}
            <button type="button" onClick={()=>cancel(clip.kind)}>{clip.assetId?'Cancel replacement':'Cancel upload'}</button>
            {status==='failed' && <button type="button" onClick={()=>retry(clip)}>Retry</button>}
          </div>}
          {clip.assetId && <>
            <div className="qf-media-field-title">
              <label htmlFor={`${prefix}-transcript`}>{alternativeLabel}</label>
              <Requirement required={!textCanSubstitute} />
            </div>
            <textarea id={`${prefix}-transcript`} rows={3} maxLength={8000} value={clip.transcript||''}
              aria-required={!textCanSubstitute} aria-describedby={textCanSubstitute ? `${prefix}-text-help` : undefined}
              onChange={event=>revise({transcript:event.target.value, textEquivalentConfirmed:false})} />
            {textCanSubstitute && <p id={`${prefix}-text-help`}>You can leave this blank if the item text conveys the same information.</p>}
            <label className="qf-media-check">
              <input type="checkbox" aria-required="true" disabled={!usesVisibleText && !clip.transcript?.trim()}
                checked={clip.equivalenceReviewed === true && (!usesVisibleText || clip.textEquivalentConfirmed === true)}
                onChange={event=>patch(clip.kind,{equivalenceReviewed:event.target.checked,textEquivalentConfirmed:usesVisibleText && event.target.checked})} />
              <span className="qf-media-review-copy"><Requirement required />
                {`I reviewed the ${usesVisibleText ? 'visible item text' : 'text alternative'}${clip.captionAssetId ? ' and captions' : ''} for equivalent information and difficulty, without revealing the answer.`}
              </span>
            </label>
            <details className="qf-media-accessibility">
              <summary>Label and language</summary>
              <div className="qf-media-accessibility-fields">
                <div className="qf-media-field-title">
                  <label htmlFor={`${prefix}-label`}>Media label</label><Requirement required />
                </div>
                <input id={`${prefix}-label`} value={clip.label||''} maxLength={120} aria-required="true" onChange={event=>revise({label:event.target.value})} />
                <label>{isImage ? 'Description language (optional)' : 'Spoken language (optional)'}<input value={clip.language||''} maxLength={35} placeholder="e.g. en" onChange={event=>revise({language:event.target.value})} /></label>
              </div>
            </details>
              {clip.kind==='video' && <>
                <details className="qf-media-alternative">
                    <summary>Captions <Requirement required={captionsRequired} added={Boolean(clip.captionAssetId)} />
                      <span className="sr-only">{captionsRequired ? 'Required for this video' : 'Optional for this video'}</span>
                    </summary>
                    <div className="qf-media-alternative-fields">
                    <label className="qf-media-check"><input type="checkbox" checked={clip.meaningfulAudio===true} onChange={event=>revise({meaningfulAudio:event.target.checked})} />This video contains meaningful speech or sounds.</label>
                    {choose('captionAssetId','.vtt',clip.captionAssetId?'Replace WebVTT captions':'Upload WebVTT captions')}
                    {clip.captionAssetId && <button type="button" disabled={busy} onClick={()=>revise({captionAssetId:null})}>Remove captions</button>}
                    <label>Caption language (optional)<input value={clip.captionLanguage||''} maxLength={35} placeholder="e.g. en" onChange={event=>revise({captionLanguage:event.target.value})} /></label>
                    </div>
                </details>
                <details className="qf-media-alternative">
                    <summary>Video purpose and audio description <Requirement required={descriptionRequired} />
                      <span className="sr-only">{descriptionRequired ? 'Audio description required' : 'Audio description optional'}</span>
                    </summary>
                    <div className="qf-media-alternative-fields">
                    <label>Video purpose<select value={clip.purpose||'demonstration'} onChange={event=>revise({purpose:event.target.value})}><option value="demonstration">Demonstration</option><option value="speech">Spoken video</option><option value="gesture">Gesture demonstration</option><option value="signed-language">Signed language</option></select></label>
                    {clip.purpose==='signed-language' && <label>Signed language (optional)<input value={clip.signedLanguage||''} maxLength={100} onChange={event=>revise({signedLanguage:event.target.value})} /></label>}
                    <label className="qf-media-check"><input type="checkbox" checked={clip.essentialVisuals===true} onChange={event=>revise({essentialVisuals:event.target.checked})} />The visuals contain information needed to answer.</label>
                    {clip.meaningfulAudio && clip.essentialVisuals && <label className="qf-media-check"><input type="checkbox" checked={clip.integratedDescription===true} onChange={event=>revise({integratedDescription:event.target.checked})} />The main audio already describes the essential visuals.</label>}
                    {(clip.essentialVisuals || clip.describedAssetId) && choose('describedAssetId','.mp4,.webm',clip.describedAssetId?'Replace audio-described video':'Upload audio-described video')}
                    {clip.describedAssetId && <>
                      <button type="button" disabled={busy} onClick={()=>revise({describedAssetId:null,describedCaptionAssetId:null})}>Remove audio-described video</button>
                      {choose('describedCaptionAssetId','.vtt',clip.describedCaptionAssetId?'Replace captions for described video':'Upload captions for described video')}
                      {clip.describedCaptionAssetId && <button type="button" disabled={busy} onClick={()=>revise({describedCaptionAssetId:null})}>Remove captions for described video</button>}
                    </>}
                    </div>
                </details>
              </>}
          </>}
        </fieldset>;
      })}
      <div className="qf-media-add">
        {Object.entries(mediaTypes).filter(([kind])=>!clips.some(clip=>clip.kind===kind)).map(([kind, { name, label }])=>(
          <button key={kind} type="button" onClick={()=>emit([...valueRef.current,{kind,label,transcript:'',purpose:kind==='audio'?'speech':'demonstration',equivalenceReviewed:false}])}>
            <Plus size={16} aria-hidden="true" /> {name}
          </button>
        ))}
      </div>
      {notice && <p role="status" className="qf-media-editor-notice">{notice}</p>}
    </div>
  </div>;
}
