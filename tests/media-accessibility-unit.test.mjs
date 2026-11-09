import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMediaClips, mediaIssues, stableOptionId } from '../services/quiz-service/src/services/questionMediaPolicy.js';
import { parseRange, sanitizeWebVtt, referencedAssets } from '../services/media-service/src/services/clipPolicy.js';
const audio='11111111-1111-4111-8111-111111111111',video='22222222-2222-4222-8222-222222222222',captions='33333333-3333-4333-8333-333333333333';

test('audio/video references are allowlisted and do not carry creator correctness metadata',()=>{
  const [clip]=normalizeMediaClips([{kind:'audio',assetId:audio,label:'Spoken question',transcript:'What is two plus two?',equivalenceReviewed:true,isCorrect:true,filename:'correct-answer.mp3'}]);
  assert.equal(clip.isCorrect,undefined);assert.equal(clip.filename,undefined);
  assert.equal(mediaIssues([{questionText:'',accessibilityMedia:[clip]}],new Map([[audio,{kind:'audio',status:'ready'}]])).length,0);
  assert.throws(()=>normalizeMediaClips([{kind:'audio',assetId:'https://evil.example/clip'}]));
  assert.throws(()=>normalizeMediaClips([{kind:'audio'},{kind:'audio'}]));
  assert.equal(stableOptionId({optionId:audio}),audio);
});
test('publishing points to the exact option with missing alternatives or processing assets',()=>{
  const clip=normalizeMediaClips([{kind:'audio',assetId:audio,label:'Option B audio',pendingAssetId:video}])[0];
  const errors=mediaIssues([{questionText:'Question',options:[{text:'A'},{text:'',accessibilityMedia:[clip]}]}]);
  assert.ok(errors.length>=3);assert.ok(errors.every(error=>error.path==='Question 1, option B, audio'));
});
test('spoken video requires timed captions and an audio description for essential visuals',()=>{
  const clip=normalizeMediaClips([{kind:'video',assetId:video,label:'Demonstration',transcript:'The hand opens as the speaker says hello.',meaningfulAudio:true,essentialVisuals:true,equivalenceReviewed:true}])[0];
  const assets=new Map([[video,{kind:'video',status:'ready',duration:3,hasAudio:true}]]);
  assert.equal(mediaIssues([{accessibilityMedia:[clip]}],assets).length,2);
  clip.captionAssetId=captions;clip.integratedDescription=true;
  assets.set(captions,{kind:'captions',status:'ready',duration:3});
  assert.equal(mediaIssues([{accessibilityMedia:[clip]}],assets).length,0);
});
test('WebVTT validates UTF-8 and timestamps and strips markup',()=>{
  const result=sanitizeWebVtt(Buffer.from('WEBVTT\n\n00:00.000 --> 00:02.000\n<b>Spoken words</b> [door closes]\n'));
  assert.equal(result.duration,2);assert.equal(result.text.includes('<b>'),false);assert.ok(result.text.includes('[door closes]'));
  for(const source of ['not vtt','WEBVTT\n\n00:05.000 --> 00:01.000\nBad','WEBVTT\n\nSTYLE\n::cue { color:red; }'])assert.throws(()=>sanitizeWebVtt(Buffer.from(source)));
});
test('authorized ranges support seeking and reject multiple or unsatisfiable ranges',()=>{
  assert.deepEqual(parseRange('bytes=5-9',100),{start:5,end:9});assert.deepEqual(parseRange('bytes=-10',100),{start:90,end:99});
  assert.deepEqual(parseRange('bytes=95-',100),{start:95,end:99});
  for(const range of ['bytes=100-','bytes=2-1','bytes=0-1,5-9','bytes=-0'])assert.throws(()=>parseRange(range,100));
  const question={accessibilityMedia:[{assetId:audio,pendingAssetId:video}],options:[{accessibilityMedia:[{captionAssetId:captions}]}]};
  assert.deepEqual([...referencedAssets([question])],[audio,captions]);assert.equal(referencedAssets([question],true).has(video),true);
});
