import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { ClipAccessResponse, ClipCapabilitiesResponse, ClipResponse, SubmissionCalendarResponse } from '../../contracts/dist/v1/domain.js';
import { ApiClient } from '../e2e/helpers/api-client.js';
import { audioQuestion, clip, gestureQuestion, publishSample, readyFixture, uploadFixture } from '../fixtures/media/samples.mjs';

const require = createRequire(new URL('../../services/auth-service/package.json', import.meta.url));
const { MongoClient, ObjectId } = require('mongoose').mongo;
const { utils: xlsxUtils, write: writeXlsx } = createRequire(
  new URL('../../services/parser-service/package.json', import.meta.url)
)('xlsx');
const media = '/api/v1/media/clips';
const check = (res, status) => assert.equal(res.status, status, res.data?.message || '');
const start = (actor, quizId) => actor.post('/api/v1/attempts/start', { quizId }, { expectedStatus: 201 });
const questions = async (actor, id) => (await actor.get(`/api/v1/attempts/${id}/questions`, { expectedStatus: 200 })).data.data.questions;
const grants = (actor, assetIds, context = {}) => actor.post(media + '/access', { assetIds, ...context });
const verifyNoKey = response => {
  assert.doesNotMatch(JSON.stringify(response), /"(correctAnswer|correctOptionId|isCorrect|questionSnapshot|uploadRequestId|pendingAssetId|equivalenceReviewed|originalName|filePath)"\s*:/);
};

test('Accessible clips through the Gateway with isolated creator and participant accounts', async t => {
  assert.match(process.env.MONGO_URI || '', /^mongodb:\/\/127\.0\.0\.1:\d+\/quizfocus_verification$/);
  const mongo = new MongoClient(process.env.MONGO_URI);
  await mongo.connect();
  t.after(() => mongo.close());
  const db = mongo.db();
  const author = new ApiClient(), player = new ApiClient(), stranger = new ApiClient();
  await Promise.all([author.registerTestUser('clipauthor'), player.registerTestUser('clipviewer'), stranger.registerTestUser('clipstranger')]);
  const capabilities = await author.get('/api/v1/media/clip-capabilities', { expectedStatus: 200 });
  assert.equal(ClipCapabilitiesResponse.parse(capabilities.data).data.processorReady, true, 'Configure FFmpeg and FFprobe before running test:media');

  await t.test('publish and score mixed quiz types and count the completed submission privately', async () => {
    const calendar = '/api/v1/attempts/submission-calendar';
    const before = SubmissionCalendarResponse.parse((await player.get(calendar, { expectedStatus: 200 })).data).data;
    const count = data => data.days.reduce((total, day) => total + day.count, 0);
    check(await new ApiClient().get(calendar), 401);
    const body = {
      title: 'Mixed quiz questions',
      settings: { allowReview: true, shuffleOptions: true },
      questions: [
        { questionType: 'checkboxes', questionText: 'Select the even numbers.', options: [
          { label: 'A', text: '2', isCorrect: true }, { label: 'B', text: '3' }, { label: 'C', text: '4', isCorrect: true },
        ], correctAnswer: ['A', 'C'] },
        { questionType: 'short_answer', questionText: 'Name the closest planet to the Sun.', correctAnswer: 'Mercury' },
        { questionType: 'multiple_choice', questionText: 'True or false: Earth has a moon.', options: [
          { label: 'A', text: 'True', isCorrect: true }, { label: 'B', text: 'False' },
        ], correctAnswer: 'A' },
      ],
    };
    const missingAnswer = { ...body, questions: [body.questions[0], { ...body.questions[1], correctAnswer: ' ' }] };
    const rejected = await author.post('/api/v1/quiz/manual', missingAnswer);
    check(rejected, 400);
    assert.match(rejected.data.message, /Question 2: enter the expected answer/);
    const quizId = (await author.post('/api/v1/quiz/manual', body, { expectedStatus: 201 })).data.data.quizId;
    const attempt = (await start(player, quizId)).data.data.attempt;
    assert.equal(count((await player.get(calendar, { expectedStatus: 200 })).data.data), count(before));
    const items = await questions(player, attempt._id);
    verifyNoKey(items);
    assert.deepEqual(items.map(item => item.questionType), ['checkboxes', 'short_answer', 'multiple_choice']);
    const result = await player.put(`/api/v1/quiz/${quizId}/attempt/${attempt._id}`, {
      questionStates: items.map((item, index) => ({ questionId: item._id, selectedAnswer: ['C,A', '  mercury  ', 'A'][index] })),
    }, { expectedStatus: 200 });
    assert.equal(result.data.data.score, 3);
    const review = (await player.get(`/api/v1/attempts/${attempt._id}/result`, { expectedStatus: 200 })).data.data;
    assert.deepEqual(review.questions.map(item => item.correctAnswer), [['A', 'C'], 'Mercury', 'A']);
    assert.equal(count((await player.get(calendar, { expectedStatus: 200 })).data.data), count(before) + 1);
    assert.equal(count((await stranger.get(calendar, { expectedStatus: 200 })).data.data), 0);
  });

  await t.test('private question images and animations share the existing authorization policy', async () => {
    // A two-frame 1×1 GIF with two distinct pixels and a delay per frame.
    const gif = Buffer.from('47494638396101000100800000000000ffffff21f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b', 'hex');
    check(await uploadFixture(author, 'forged.gif', { kind: 'image', bytes: Buffer.from('not an image') }), 400);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    check(await uploadFixture(author, 'vector.svg', { kind: 'image', bytes: svg }), 415);
    const uploaded = await uploadFixture(author, 'motion.gif', { kind: 'image', bytes: gif });
    check(uploaded, 201);
    const asset = ClipResponse.parse(uploaded.data).data.asset;
    assert.equal(asset.kind, 'image');
    assert.equal(asset.animated, true);
    check(await author.get(`/api/v1/media/assets/${asset._id}`), 404);
    check(await stranger.get(`${media}/${asset._id}`), 404);
    check(await author.post(media + '/image-url', { url: 'https://127.0.0.1/image.png' }), 400);
    check(await author.post(media + '/image-url', { url: 'https://example.com:8443/image.png' }), 400);
    const question = { questionText: 'What pattern is shown?', options: [
      { label: 'A', text: 'Alternating shades', isCorrect: true },
      { label: 'B', text: 'One shade' },
    ], correctAnswer: 'A', accessibilityMedia: [clip('image', asset._id, 'Sample pattern', 'A light square and a dark square appear in turn.')] };
    const privateQuiz = await author.post('/api/v1/quiz/manual', {
      title: 'Private image quiz', visibility: 'private', questions: [question],
    }, { expectedStatus: 201 });
    const quizId = privateQuiz.data.data.quizId;
    check(await grants(stranger, [asset._id], { quizId }), 403);
    const ownerAccess = await grants(author, [asset._id], { quizId });
    check(ownerAccess, 200);
    const url = ClipAccessResponse.parse(ownerAccess.data).data.assets[asset._id]?.url;
    assert.ok(url);
    check(await stranger.get(url), 403);
    assert.match((await author.request('HEAD', url, { expectedStatus: 200 })).headers.get('content-type'), /^image\/webp/);
    check(await author.put(`/api/v1/quiz/${quizId}`, { visibility: 'public' }), 200);
    const attempt = (await start(player, quizId)).data.data.attempt;
    const [item] = await questions(player, attempt._id);
    verifyNoKey(item);
    assert.equal(item.accessibilityMedia[0].transcript, question.accessibilityMedia[0].transcript);
    check(await grants(player, [asset._id], { attemptId: attempt._id }), 200);
  });

  await t.test('reject corrupt bytes, retry an interrupted request safely and protect owner assets', async () => {
    const key = randomUUID();
    check(await uploadFixture(author, 'spoken-question.wav', { kind:'audio', key, bytes: Buffer.from('fake media') }), 415);
    const requests = await Promise.all([1, 2].map(() => uploadFixture(author, 'spoken-question.wav', { kind:'audio', key })));
    assert.ok(requests.every(response => [201,202].includes(response.status)), JSON.stringify(requests));
    const id = requests[0].data.data.asset._id;
    assert.equal(requests[1].data.data.asset._id, id);
    check(await stranger.get(`${media}/${id}`), 404);
    check(await stranger.delete(`${media}/${id}`), 404);
    check(await stranger.post(`${media}/${id}/retry`, {}), 404);
    check(await author.get(`/api/v1/media/assets/${id}`), 404);
    verifyNoKey(requests);
  });

  await t.test('spoken prompt and four choices survive draft recovery, replacement, reorder, submission and review', async () => {
    const question = await audioQuestion(author);
    const first = question.options[0], correct = question.options[1];
    const oldAsset = first.accessibilityMedia[0].assetId;
    question.options[1].accessibilityMedia[0].transcript = '';
    const input = { title:'Sample · Spoken arithmetic', isDraft:true, settings:{shuffleOptions:true, allowReview:true}, questions:[question] };
    const draft = await author.post('/api/v1/quiz/manual', input, {expectedStatus:201});
    const quizId = draft.data.data.quizId;
    const path = `/api/v1/quiz/drafts/${quizId}`;
    const saved = (await author.get(path, {expectedStatus:200})).data.data.draft.questions[0];
    assert.equal(saved.options[1].optionId, correct.optionId);
    assert.equal(saved.options[1].text,'');
    const denied = await author.post(path+'/publish', {visibility:'public'});
    check(denied,422);
    assert.match(JSON.stringify(denied.data), /Question 1, option B, audio/);
    check(await grants(stranger,[oldAsset],{quizId}),403);
    const replacement = await readyFixture(author,'choice-a.wav','audio');
    correct.accessibilityMedia[0].transcript = 'Four.';
    first.accessibilityMedia[0].pendingAssetId = replacement._id;
    first.accessibilityMedia[0].uploadState = 'processing';
    check(await author.post('/api/v1/quiz/manual',{...input,draftId:quizId}),200);
    const pending = (await author.get(path,{expectedStatus:200})).data.data.draft.questions[0].options[0];
    assert.equal(pending.accessibilityMedia[0].assetId,oldAsset);
    assert.equal(pending.accessibilityMedia[0].pendingAssetId,replacement._id);
    check(await author.post(path+'/publish',{visibility:'public'}),422);
    first.accessibilityMedia[0].assetId = replacement._id;
    first.accessibilityMedia[0].pendingAssetId = null;
    first.accessibilityMedia[0].uploadState = '';
    question.options = [correct,first,...question.options.slice(2)].map((option,index)=>({...option,label:String.fromCharCode(65+index)}));
    question.correctAnswer = 'A';
    check(await author.post('/api/v1/quiz/manual',{...input,draftId:quizId}),200);
    check(await author.post(path+'/publish',{visibility:'public'}),200);
    const attempt = (await start(player,quizId)).data.data.attempt;
    const [frozen] = await questions(player,attempt._id);
    verifyNoKey(frozen);
    check(await stranger.get(`/api/v1/attempts/${attempt._id}/questions`),403);
    assert.equal(frozen.options.find(option=>option.optionId===first.optionId).accessibilityMedia[0].assetId,replacement._id);
    const answer = frozen.options.find(option=>option.optionId===correct.optionId);
    assert.equal(answer.accessibilityMedia[0].transcript,'Four.');
    const early = await player.get(`/api/v1/attempts/${attempt._id}/result`,{expectedStatus:200});
    assert.deepEqual(early.data.data.questions,[]);
    assert.equal(early.data.data.allowReview,false);
    const context = { attemptId:attempt._id };
    const clipId = frozen.accessibilityMedia[0].assetId;
    const access = await grants(player,[clipId,replacement._id],context);
    check(access,200);verifyNoKey(access.data);
    const url = access.data.data.assets[clipId].url;
    check(await new ApiClient().get(url),403);
    check(await stranger.get(url),403);
    check(await player.get(url.replace(/access=.*/,'access=expired')),401);
    const range = await player.get(url,{headers:{Range:'bytes=0-31'}});
    check(range,206);
    assert.match(range.headers.get('content-range'),/^bytes 0-31\//);
    assert.match(range.headers.get('content-type'),/^audio\/mp4/);
    check(await player.get(url,{headers:{Range:'bytes=99999999-'}}),416);
    check(await author.put(`/api/v1/quiz/${quizId}`,{title:'Spoken arithmetic after an author edit'}),200);
    // Simulate an independent content writer against the disposable DB.
    // The regular edit endpoint already prevents question edits after attempts.
    await db.collection('questions').updateOne({_id:new ObjectId(frozen._id)},{$set:{questionText:'Later version', 'accessibilityMedia.0.assetId':oldAsset}});
    assert.deepEqual(await questions(player,attempt._id),[frozen]);
    check(await grants(player,[clipId],context),200);
    await db.collection('mediaassets').updateOne({_id:clipId},{$set:{referenceLeaseUntil:new Date(Date.now()-1000)}});
    const retained = await author.delete(`${media}/${clipId}`);
    check(retained,409);
    assert.match(retained.data.message,/retained by a draft, published quiz or attempt/);
    check(await player.get(url,{headers:{Range:'bytes=0-31'}}),206);
    const submitted = await player.put(`/api/v1/quiz/${quizId}/attempt/${attempt._id}`,{
      questionStates:[{questionId:frozen._id,selectedAnswer:answer.label}],
    });
    check(submitted,200);
    assert.equal(submitted.data.data.score,1);
    const review = (await player.get(`/api/v1/attempts/${attempt._id}/result`,{expectedStatus:200})).data.data;
    assert.equal(review.questions[0].correctAnswer,answer.label);
    assert.equal(review.questions[0].accessibilityMedia[0].assetId,clipId);
  });

  await t.test('gesture videos stay attached to distinct options and descriptions support a text path', async () => {
    const question = await gestureQuestion(author);
    const quizId = await publishSample(author,'Sample · Match a hand motion',question);
    const attempt = (await start(player,quizId)).data.data.attempt;
    const [frozen] = await questions(player,attempt._id);
    verifyNoKey(frozen);
    const ids = frozen.options.map(option=>option.accessibilityMedia[0].assetId);
    assert.equal(new Set(ids).size,4);
    const answer = frozen.options.find(option=>option.accessibilityMedia[0].transcript===frozen.accessibilityMedia[0].transcript);
    assert.equal(answer.label,'B');
    const access = await grants(player,ids,{attemptId:attempt._id});
    check(access,200);
    assert.match((await player.request('HEAD',access.data.data.assets[ids[0]].url,{expectedStatus:200})).headers.get('content-type'),/^video\/mp4/);
    const submitted = await player.put(`/api/v1/quiz/${quizId}/attempt/${attempt._id}`,{questionStates:[{questionId:frozen._id,selectedAnswer:answer.label}]});
    check(submitted,200);assert.equal(submitted.data.data.score,1);
  });

  await t.test('validate video captions and description and keep private tracks behind the quiz policy', async () => {
    const video = await readyFixture(author,'spoken-video.mp4','video');
    const captions = await readyFixture(author,'spoken-video.vtt','captions');
    const described = await readyFixture(author,'spoken-video-described.mp4','video');
    const describedCaptions = await readyFixture(author,'spoken-video-described.vtt','captions');
    const item = clip('video',video._id,'Spoken video question','A white circle is shown. The speaker asks what is two plus two.',{meaningfulAudio:true,essentialVisuals:true});
    const question = {questionText:'', options:[{label:'A',text:'4',isCorrect:true},{label:'B',text:'5'}],correctAnswer:'A',accessibilityMedia:[item]};
    const body = {title:'Private captioned video',questions:[question],visibility:'private'};
    const denied = await author.post('/api/v1/quiz/manual',body);
    check(denied,422);assert.match(JSON.stringify(denied.data),/WebVTT/);
    Object.assign(item,{captionAssetId:captions._id,describedAssetId:described._id,describedCaptionAssetId:describedCaptions._id});
    const created = await author.post('/api/v1/quiz/manual',body,{expectedStatus:201});
    const quizId = created.data.data.quizId, ids = [video,captions,described,describedCaptions].map(asset=>asset._id);
    check(await grants(stranger,ids,{quizId}),403);
    check(await stranger.post('/api/v1/quiz/manual',body),403);
    const owner = await grants(author,ids,{quizId});
    check(owner,200);verifyNoKey(owner.data);
    for (const asset of [captions,describedCaptions]) {
      const url=owner.data.data.assets[asset._id].url;
      check(await stranger.get(url),403);
      const track = await author.get(url,{expectedStatus:200});
      assert.match(track.data,/^WEBVTT/);
    }
    check(await stranger.get(owner.data.data.assets[described._id].url),403);
    check(await author.put(`/api/v1/quiz/${quizId}`,{visibility:'public'}),200);
    const attempt = (await start(player,quizId)).data.data.attempt;
    const [frozen] = await questions(player,attempt._id);
    assert.match(frozen.accessibilityMedia[0].transcript,/two plus two/);
    const response = await player.put(`/api/v1/quiz/${quizId}/attempt/${attempt._id}`,{questionStates:[{questionId:frozen._id,selectedAnswer:'A'}]});
    check(response,200);
    assert.equal(response.data.data.score,1);
  });

  await t.test('challenge draft recovery preserves media and deadline controls answer review', async () => {
    const asset = await readyFixture(author,'spoken-question.wav','audio');
    const question = {
      questionText:'', correctAnswer:'A', accessibilityMedia:[clip('audio',asset._id,'Spoken prompt','What is two plus two?')],
      options:[{label:'A',text:'4',isCorrect:true},{label:'B',text:'5'}],
    };
    const path = '/api/v1/challenges';
    const input = {title:'Accessible contest', durationMinutes:5, deadlineAt:new Date(Date.now()+600000).toISOString(), questions:[question]};
    const draft = await author.post(path,{...input,isDraft:true},{expectedStatus:201});
    const id = draft.data.data.challengeId;
    const saved = (await author.get(`/api/v1/quiz/drafts/${id}`,{expectedStatus:200})).data.data.draft.questions[0];
    assert.equal(saved.accessibilityMedia[0].assetId,asset._id);
    check(await author.post(path,{draftId:id,isDraft:false}),201);
    const attempt = (await start(player,id)).data.data.attempt;
    assert.equal(attempt.timerMode,'strict');
    assert.ok(Date.parse(attempt.deadlineAt)>Date.now());
    const [frozen] = await questions(player,attempt._id);
    verifyNoKey(frozen);
    check(await grants(player,[asset._id],{attemptId:attempt._id}),200);
    const submitted = await player.put(`/api/v1/quiz/${id}/attempt/${attempt._id}`,{questionStates:[{questionId:frozen._id,selectedAnswer:'A'}]});
    check(submitted,200);
    assert.equal(submitted.data.data.score,null);
    const result = `/api/v1/attempts/${attempt._id}/result`;
    const early = (await player.get(result,{expectedStatus:200})).data.data;
    assert.deepEqual(early.questions,[]);
    await db.collection('quizzes').updateOne({_id:new ObjectId(id)},{$set:{deadlineAt:new Date(Date.now()-1000)}});
    const review = (await player.get(result,{expectedStatus:200})).data.data;
    assert.equal(review.allowReview,true);
    assert.equal(review.questions[0].correctAnswer,'A');
    assert.equal(review.questions[0].accessibilityMedia[0].assetId,asset._id);
  });

  await t.test('imported CSV still maps, scores and shows text review', async subtest => {
    const upload = await uploadFixture(author,'verification.csv',{
      endpoint:'/api/v1/upload', bytes:Buffer.from('Question,Option A,Option B,Correct Answer\nWhat is three plus two?,5,6,A\n'),
    });
    check(upload,201);
    const uploadId = upload.data.data.upload.id;
    subtest.after(() => author.delete(`/api/v1/upload/${uploadId}`, {expectedStatus:200}));
    check(await author.post(`/api/v1/parser/parse/${uploadId}`,{}),200);
    check(await author.post(`/api/v1/parser/map/${uploadId}`,{question:'Question',options:['Option A','Option B'],answer:'Correct Answer'}),200);
    const quiz = await author.post('/api/v1/quiz/generate',{uploadId,title:'Imported arithmetic',visibility:'public'},{expectedStatus:201});
    const quizId = quiz.data.data.quiz?._id || quiz.data.data.quizId;
    const attempt = (await start(player,quizId)).data.data.attempt;
    const [question] = await questions(player,attempt._id);
    assert.equal(question.questionText,'What is three plus two?');
    const submitted = await player.put(`/api/v1/quiz/${quizId}/attempt/${attempt._id}`,{questionStates:[{questionId:question._id,selectedAnswer:'A'}]});
    check(submitted,200);assert.equal(submitted.data.data.score,1);
    const review = (await player.get(`/api/v1/attempts/${attempt._id}/result`,{expectedStatus:200})).data.data;
    assert.equal(review.questions[0].correctAnswer,'A');
  });

  await t.test('CSV duplicate suggestions and generation results stay owner-scoped', async subtest => {
    const bytes = Buffer.from('Question,Option A,Option B,Correct Answer\nIs the sky blue?,Yes,No,A\n');
    const ownedUpload = await uploadFixture(author, 'private-duplicate.csv', {
      endpoint: '/api/v1/upload',
      bytes,
    });
    check(ownedUpload, 201);
    const ownedUploadId = ownedUpload.data.data.upload.id;
    subtest.after(() => author.delete(`/api/v1/upload/${ownedUploadId}`, { expectedStatus: 200 }));

    check(await author.post(`/api/v1/parser/parse/${ownedUploadId}`, {}), 200);
    check(await author.post(`/api/v1/parser/map/${ownedUploadId}`, {
      question: 'Question',
      options: ['Option A', 'Option B'],
      answer: 'missing-header',
    }), 400);
    check(await author.post(`/api/v1/parser/map/${ownedUploadId}`, {
      question: 'Question',
      options: ['Option A', 'Option B'],
      answer: 'Correct Answer',
    }), 200);

    const ownedQuizResponse = await author.post('/api/v1/quiz/generate', {
      uploadId: ownedUploadId,
      title: 'Private imported quiz',
      visibility: 'private',
    }, { expectedStatus: 201 });
    const ownedQuizId = ownedQuizResponse.data.data.quiz._id;

    const sameOwnerUpload = await uploadFixture(author, 'same-owner-duplicate.csv', {
      endpoint: '/api/v1/upload',
      bytes,
    });
    check(sameOwnerUpload, 201);
    const sameOwnerUploadId = sameOwnerUpload.data.data.upload.id;
    subtest.after(() => author.delete(`/api/v1/upload/${sameOwnerUploadId}`, { expectedStatus: 200 }));
    assert.equal(sameOwnerUpload.data.data.duplicateQuiz.id, ownedQuizId);

    const otherOwnerUpload = await uploadFixture(stranger, 'other-owner-duplicate.csv', {
      endpoint: '/api/v1/upload',
      bytes,
    });
    check(otherOwnerUpload, 201);
    const otherOwnerUploadId = otherOwnerUpload.data.data.upload.id;
    subtest.after(() => stranger.delete(`/api/v1/upload/${otherOwnerUploadId}`, { expectedStatus: 200 }));
    assert.equal(otherOwnerUpload.data.data.duplicateQuiz, null);
    check(await stranger.post(`/api/v1/parser/parse/${otherOwnerUploadId}`, {}), 200);
    check(await stranger.post(`/api/v1/parser/map/${otherOwnerUploadId}`, {
      question: 'Question',
      options: ['Option A', 'Option B'],
      answer: 'Correct Answer',
    }), 200);

    const otherOwnerQuizResponse = await stranger.post('/api/v1/quiz/generate', {
      uploadId: otherOwnerUploadId,
      title: 'Other owner imported quiz',
      visibility: 'private',
    }, { expectedStatus: 201 });
    const otherOwnerQuizId = otherOwnerQuizResponse.data.data.quiz._id;
    assert.notEqual(otherOwnerQuizId, ownedQuizId);
    check(await stranger.get(`/api/v1/quiz/${ownedQuizId}`), 403);
  });

  await t.test('JSON and Excel uploads parse, map, generate and score through the service APIs', async subtest => {
    const workbook = xlsxUtils.book_new();
    xlsxUtils.book_append_sheet(workbook, xlsxUtils.aoa_to_sheet([
      ['Question', 'Option A', 'Option B', 'Correct Answer'],
      ['Which planet is nearest the Sun?', 'Earth', 'Mercury', 'B'],
    ]), 'Questions');
    const imports = [
      {
        name: 'questions.json',
        bytes: Buffer.from(JSON.stringify({
          questions: [{
            Question: 'Which planet is nearest the Sun?',
            'Option A': 'Earth',
            'Option B': 'Mercury',
            'Correct Answer': 'B',
          }],
        })),
      },
      {
        name: 'questions.xlsx',
        bytes: writeXlsx(workbook, { type: 'buffer', bookType: 'xlsx' }),
      },
    ];

    for (const fixture of imports) {
      await subtest.test(`${fixture.name} completes the import lifecycle`, async importTest => {
        const uploaded = await uploadFixture(author, fixture.name, {
          endpoint: '/api/v1/upload',
          bytes: fixture.bytes,
        });
        check(uploaded, 201);
        const uploadId = uploaded.data.data.upload.id;
        importTest.after(() => author.delete(`/api/v1/upload/${uploadId}`, { expectedStatus: 200 }));

        const parsed = await author.post(`/api/v1/parser/parse/${uploadId}`, {}, { expectedStatus: 200 });
        assert.deepEqual(parsed.data.data.headers, ['Question', 'Option A', 'Option B', 'Correct Answer']);
        assert.equal(parsed.data.data.rowCount, 1);
        check(await author.post(`/api/v1/parser/map/${uploadId}`, {
          question: 'Question',
          options: ['Option A', 'Option B'],
          answer: 'Correct Answer',
        }), 200);

        const generated = await author.post('/api/v1/quiz/generate', {
          uploadId,
          title: `Imported ${fixture.name}`,
          visibility: 'public',
        }, { expectedStatus: 201 });
        const quizId = generated.data.data.quiz._id;
        assert.equal(generated.data.data.questionCount, 1);

        const attempt = (await start(player, quizId)).data.data.attempt;
        const [question] = await questions(player, attempt._id);
        assert.equal(question.questionText, 'Which planet is nearest the Sun?');
        const submitted = await player.put(`/api/v1/quiz/${quizId}/attempt/${attempt._id}`, {
          questionStates: [{ questionId: question._id, selectedAnswer: 'B' }],
        });
        check(submitted, 200);
        assert.equal(submitted.data.data.score, 1);

      });
    }
  });
});
