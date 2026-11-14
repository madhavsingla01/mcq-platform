import { useCallback, useContext, useEffect, useId, useRef, useState, type SyntheticEvent } from 'react';
import { Captions, Image as ImageIcon, RotateCcw, Volume2 } from 'lucide-react';
import { MediaService } from '../../services/media.service';
import { QuizMediaPreferences } from './QuizMediaPreferences';
import './AccessibleMedia.css';

export interface ParticipantClip {
  kind: 'audio' | 'video' | 'image';
  assetId?: string | null;
  captionAssetId?: string | null;
  describedAssetId?: string | null;
  describedCaptionAssetId?: string | null;
  label?: string;
  transcript?: string;
  language?: string;
  captionLanguage?: string;
  purpose?: string;
  signedLanguage?: string;
}

type PlaybackGrants = Awaited<ReturnType<typeof MediaService.clipAccess>>;
type PlaybackGrant = PlaybackGrants[string];

interface ClipProps {
  clip: ParticipantClip;
  failed: boolean | undefined;
  retry: () => void;
  text: string;
}

function ImageAttachment({ clip, grant, failed, retry, text }: ClipProps & { grant: PlaybackGrant | undefined }) {
  const [playing, setPlaying] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const descriptionRef = useRef<HTMLDetailsElement>(null);
  const transcriptCommand = useContext(QuizMediaPreferences)?.transcripts;
  useEffect(() => {
    if (descriptionRef.current && transcriptCommand) descriptionRef.current.open = transcriptCommand.open;
  }, [transcriptCommand]);
  const description = clip.transcript?.trim() || text;
  const unavailable = failed || failedUrl === grant?.url;
  return (
    <figure className="qf-media-clip">
      <figcaption><ImageIcon size={15} aria-hidden="true" /> {clip.label || 'Image'}</figcaption>
      {grant?.animated && !unavailable && <button type="button" className="qf-media-format" onClick={() => setPlaying(value => !value)}>
        {playing ? 'Stop animation' : 'Play animation'}
      </button>}
      {grant && !unavailable && (!grant.animated || playing) && (
        <img className="qf-media-image" src={grant.url} alt={description || clip.label || 'Image'}
          lang={clip.transcript ? clip.language || undefined : undefined}
          loading="lazy" decoding="async" onError={() => setFailedUrl(grant.url)} />
      )}
      {!grant && !unavailable && <p className="qf-media-loading">Loading image…</p>}
      {unavailable && <div className="qf-media-error" role="status">
        Image could not load. <button type="button" onClick={retry}>Retry image</button>
      </div>}
      {description && <details ref={descriptionRef} className="qf-media-equivalent">
        <summary>Image description</summary>
        <p lang={clip.transcript ? clip.language || undefined : undefined}>{description}</p>
      </details>}
    </figure>
  );
}

function Clip({ clip, grants, failed, retry, text, preview }: ClipProps & {
  grants: PlaybackGrants | null | undefined;
  preview: boolean;
}) {
  const player = useRef<HTMLMediaElement | null>(null);
  const assignPlayer = useCallback((element: HTMLMediaElement | null) => { player.current = element; }, []);
  const captionTrack = useRef<HTMLTrackElement>(null);
  const transcript = useRef<HTMLDetailsElement>(null);
  const preferences = useContext(QuizMediaPreferences);
  const [format,setFormat] = useState<'main' | 'described'>('main');
  const [playbackError,setPlaybackError] = useState(false);
  const [captionError,setCaptionError] = useState(false);
  const [loaded,setLoaded] = useState(false);
  const [showCaptions,setShowCaptions] = useState(preferences?.captions ?? true);
  const [speed, setSpeed] = useState(preferences?.speed ?? 1);
  const id = useId();
  const assetId = format === 'described' ? clip.describedAssetId : clip.assetId;
  const captionId = format === 'described' ? clip.describedCaptionAssetId : clip.captionAssetId;
  const source = assetId ? grants?.[assetId]?.url : undefined;
  const caption = captionId ? grants?.[captionId]?.url : undefined;
  const transcriptCommand = preferences?.transcripts;
  const defaultCaptions = preferences?.captions;
  const defaultSpeed = preferences?.speed;
  useEffect(() => {
    if (transcript.current && transcriptCommand) transcript.current.open = transcriptCommand.open;
  }, [transcriptCommand]);
  useEffect(() => { if (defaultCaptions !== undefined) setShowCaptions(defaultCaptions); }, [defaultCaptions]);
  useEffect(() => { if (defaultSpeed !== undefined) setSpeed(defaultSpeed); }, [defaultSpeed]);
  useEffect(() => { if (player.current) player.current.playbackRate = speed; }, [source, speed]);
  useEffect(()=>{
    if(captionTrack.current?.track)captionTrack.current.track.mode=showCaptions?'showing':'hidden';
  },[caption,showCaptions]);
  useEffect(()=>setCaptionError(false),[caption]);
  useEffect(()=>{
    setPlaybackError(false);setLoaded(false);
    const element=player.current;
    return ()=>element?.pause();
  },[source]);
  const onPlay = (event: SyntheticEvent<HTMLMediaElement>) => {
    document.querySelectorAll('.qf-media-player').forEach(element => {
      if (element instanceof HTMLMediaElement && element !== event.currentTarget) element.pause();
    });
  };
  const props = { ref:assignPlayer, className:'qf-media-player', controls:true, autoPlay:false, preload:preview?'metadata':'none',
    'aria-label':format==='described' ? `${clip.label || 'Video'} with audio description` : clip.label || `${clip.kind} clip`, 'aria-describedby':`${id}-help`,
    onPlay,
    onLoadedMetadata:()=>setLoaded(true), onError:()=>setPlaybackError(true), src:source || undefined };
  const play = () => player.current?.play().catch(()=>setPlaybackError(true));
  const controls = <div className="qf-media-controls">
    <button type="button" disabled={!loaded} onClick={()=>{if(player.current){player.current.currentTime=0;play();}}} aria-label={`Replay ${clip.label || clip.kind}`}><RotateCcw size={14} aria-hidden="true" /> Replay</button>
    <label>Speed <select aria-label={`Playback speed for ${clip.label || clip.kind}`} value={speed} onChange={event=>setSpeed(Number(event.target.value))}>
      {[0.5,0.75,1,1.25,1.5,2].map(speed=><option key={speed} value={speed}>{speed}×</option>)}
    </select></label>
    {caption && <button type="button" aria-label={`Captions for ${clip.label || clip.kind}`} aria-pressed={showCaptions} onClick={()=>setShowCaptions(value=>!value)}><Captions size={16} aria-hidden="true" /> Captions</button>}
  </div>;
  return <figure className="qf-media-clip">
    <span className="sr-only" id={`${id}-help`}>A transcript and text equivalent follow the playback controls.</span>
    <figcaption><Volume2 size={15} aria-hidden="true" /> {clip.label || `${clip.kind} clip`}{clip.purpose==='signed-language' && <span> · Signed language{clip.signedLanguage?` (${clip.signedLanguage})`:''}</span>}{clip.purpose==='gesture' && <span> · Gesture demonstration</span>}</figcaption>
    {source && (clip.kind==='video' ? <video {...props} playsInline>
      {caption && <track ref={captionTrack} key={caption} kind="captions" src={caption} srcLang={clip.captionLanguage || 'en'} label={clip.captionLanguage || 'Captions'} default onError={()=>setCaptionError(true)} />}
      Your browser cannot play this clip. Use the text equivalent below.
    </video> : <audio {...props}>Your browser cannot play this clip. Use the text equivalent below.</audio>)}
    {source && (preview ? <details className="qf-media-equivalent"><summary>Playback controls</summary>{controls}</details> : controls)}
    {clip.describedAssetId && <button type="button" className="qf-media-format" aria-pressed={format==='described'} onClick={()=>{player.current?.pause();setFormat(value=>value==='main'?'described':'main');}}>{format==='described'?'Use main video':'Use audio-described video'}</button>}
    {(failed || playbackError) && <div className="qf-media-error" role="status">{clip.label || 'The clip'} could not load. Use the text equivalent or <button type="button" onClick={()=>{setPlaybackError(false);retry();}}>retry playback</button>.</div>}
    {captionError && <div className="qf-media-error" role="status">Captions could not load. Use the transcript or <button type="button" onClick={retry}>retry captions</button>.</div>}
    {!source && !failed && <p className="qf-media-loading">Preparing playback controls…</p>}
    <details ref={transcript} className="qf-media-equivalent" id={`${id}-equivalent`}>
      <summary>{clip.kind==='video'?'Transcript and visual description':'Transcript / text equivalent'}</summary>
      <p lang={clip.transcript ? clip.language || undefined : undefined}>{clip.transcript || text || 'The creator has not supplied a text equivalent.'}</p>
    </details>
  </figure>;
}

interface MediaAccess {
  key: string;
  grants: PlaybackGrants | null;
  failed?: boolean;
}

interface AccessibleMediaProps {
  clips?: readonly ParticipantClip[];
  text?: string | undefined;
  quizId?: string | null | undefined;
  attemptId?: string | null | undefined;
  preview?: boolean;
}

export default function AccessibleMedia({ clips = [], text = '', quizId, attemptId, preview = false }: AccessibleMediaProps) {
  const [access, setAccess] = useState<MediaAccess | null>(null);
  const [retry, setRetry] = useState(0);
  const key=JSON.stringify([quizId,attemptId,clips.map(clip=>[clip.assetId,clip.captionAssetId,clip.describedAssetId,clip.describedCaptionAssetId])]);
  useEffect(()=>{
    const ids=[...new Set(clips.flatMap(clip=>[clip.assetId,clip.captionAssetId,clip.describedAssetId,clip.describedCaptionAssetId]).filter((id): id is string => typeof id === 'string' && id.length > 0))];
    if(!ids.length) return;
    const controller=new AbortController();
    MediaService.clipAccess(ids, { quizId: quizId ?? null, attemptId: attemptId ?? null }, controller.signal).then(grants=>{
      if(!controller.signal.aborted)setAccess({key,grants});
    }).catch(()=>{if(!controller.signal.aborted)setAccess(previous=>({key,grants:previous?.key===key?previous.grants:null,failed:true}));});
    return ()=>controller.abort();
  },[key,retry]);
  if(!clips.length) return null;
  const current = access?.key === key ? access : null;
  const retryAccess = () => setRetry(value => value + 1);
  return <div className="qf-accessible-media">{clips.map(clip => clip.kind === 'image'
    ? <ImageAttachment key={clip.assetId} clip={clip} grant={clip.assetId ? current?.grants?.[clip.assetId] : undefined} failed={current?.failed} retry={retryAccess} text={text} />
    : <Clip key={clip.kind} clip={clip} grants={current?.grants} failed={current?.failed} retry={retryAccess} text={text} preview={preview} />
  )}</div>;
}
