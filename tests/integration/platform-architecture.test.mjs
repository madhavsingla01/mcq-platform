import { AttemptResultSummary, ChallengeSummary, CurrentUserResponse, LeaderboardResponse, QuizSummary, SessionBootstrapResponse, SessionLoginResponse } from '../../contracts/dist/v1/domain.js';
import { SystemHealthResponse } from '../../contracts/dist/v1/admin.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ApiClient } from '../e2e/helpers/api-client.js';
import { finalizeExpiredAttempts } from '../../services/attempt-service/dist/jobs/finalization.worker.js';

const authRequire = createRequire(new URL('../../services/auth-service/package.json', import.meta.url));
const attemptRequire = createRequire(new URL('../../services/attempt-service/package.json', import.meta.url));
const { MongoClient, ObjectId } = authRequire('mongoose').mongo;
const attemptMongoose = attemptRequire('mongoose');
const check = (response, status) => assert.equal(response.status, status, JSON.stringify(response.data));

test('Step 02 gateway, domain ownership and real product lifecycle contracts', async t => {
  assert.match(process.env.MONGO_URI || '', /^mongodb:\/\/127\.0\.0\.1:\d+\/quizfocus_verification$/);
  const mongo = new MongoClient(process.env.MONGO_URI); await mongo.connect();
  await attemptMongoose.connect(process.env.MONGO_URI);
  const db = mongo.db();
  t.after(async () => { await attemptMongoose.disconnect(); await mongo.close(); });
  const author = new ApiClient(), player = new ApiClient(), stranger = new ApiClient();
  const [a,p] = await Promise.all([author.registerTestUser('architect'),player.registerTestUser('participant'),stranger.registerTestUser('outsider')]);
  const directQuiz = new ApiClient(process.env.QUIZ_SERVICE_URL); directQuiz.setToken(player.token);
  const directAttempt = new ApiClient(process.env.ATTEMPT_SERVICE_URL); directAttempt.setToken(player.token);
  let quizId, quizCode, attemptId, challengeId;
  const question = {questionText:'What is 2 plus 2?',questionType:'multiple_choice',options:[{label:'A',text:'4',isCorrect:true},{label:'B',text:'5'}],correctAnswer:'A',marks:1};

  await t.test('create, publish and discover a real quiz', async () => {
    const draft = await author.post('/api/v1/quiz/manual',{title:'Architecture golden quiz',isDraft:true,questions:[question],tags:['architectureverification']});
    check(draft,201); quizId=draft.data.data.quizId;
    check(await player.get(`/api/v1/quiz/${quizId}`),403);
    const publish=await author.post(`/api/v1/quiz/drafts/${quizId}/publish`,{visibility:'public'});check(publish,200);
    quizCode=publish.data.data.quiz.quizCode;
    assert.equal(QuizSummary.parse(publish.data.data.quiz)._id, quizId);
    const search=await player.get('/api/v1/search/universal',{query:{q:'Architecture golden quiz'}});check(search,200);
    assert.ok(search.data.data.quizzes.some(q=>q._id===quizId));
  });

  await t.test('plain Explore search ranks closest public quizzes before paginating', async () => {
    for (const [title, visibility] of [['Geography', 'public'], ['Geography practice', 'public'], ['Geograpyh', 'public'], ['Geography private', 'private']]) {
      const draft = await author.post('/api/v1/quiz/manual', { title, isDraft: true, questions: [question] });
      check(draft,201);
      check(await author.post(`/api/v1/quiz/drafts/${draft.data.data.quizId}/publish`, { visibility }),200);
    }
    const search = async (query) => {
      const response = await player.get('/api/v1/social/explore', { query: { match: 'closest', mode: 'newest', ...query } });
      check(response,200);
      return response.data.data;
    };
    const first = await search({ q: 'Geography', limit: 2 });
    assert.deepEqual(first.quizzes.map(quiz => quiz.title), ['Geography', 'Geography practice']);
    assert.equal(first.pagination.total,3);
    const second = await search({ q: 'Geography', limit: 2, page: 2 });
    assert.deepEqual(second.quizzes.map(quiz => quiz.title), ['Geograpyh']);
    assert.ok((await search({ q: 'Geograpy' })).quizzes.some(quiz => quiz.title === 'Geography'));
  });

  await t.test('legacy Quiz routes and canonical Attempt routes share one in-progress attempt', async () => {
    const started=await player.post(`/api/v1/quiz/${quizId}/attempt`,{});check(started,201);attemptId=started.data.data.attempt._id;
    const recovered=await directAttempt.post('/api/v1/attempts/start',{quizId});check(recovered,200);
    assert.equal(recovered.data.data.attempt._id,attemptId);
    const symbolic=await directQuiz.get(`/api/v1/quiz/${encodeURIComponent(quizCode)}/attempt/active`);check(symbolic,200);
    assert.equal(symbolic.data.data.attempt._id,attemptId);
    const questionId=started.data.data.attempt.answers[0].questionId;
    const synced=await directQuiz.put(`/api/v1/quiz/${quizId}/attempt/${attemptId}/sync-progress`,{totalElapsedMs:1000,questionStates:[{questionId,selectedAnswer:'A'}]});check(synced,200);
    assert.equal(synced.data.data.attempt.status,'in_progress');
    const stored=await db.collection('attempts').findOne({_id:new ObjectId(attemptId)});
    assert.equal(stored.status,'in_progress');
    check(await stranger.put(`/api/v1/quiz/${quizId}/attempt/${attemptId}`,{}),403);
    const result=await player.put(`/api/v1/quiz/${quizId}/attempt/${attemptId}`,{});check(result,200);
    assert.equal(result.data.data.attempt.status,'completed');
    assert.equal(result.data.data.score,1);
    const canonical=await player.get(`/api/v1/attempts/${attemptId}/result`);check(canonical,200);
    const legacy=await player.get(`/api/v1/quiz/attempts/${attemptId}/result`);check(legacy,200);
    assert.equal(legacy.data.data.attempt._id,canonical.data.data.attempt._id);
  });

  await t.test('challenge attempts remain quarantined and ranked after the deadline with creator practice excluded', async () => {
    const created=await author.post('/api/v1/challenges',{title:'Architecture competition',durationMinutes:5,deadlineAt:new Date(Date.now()+600000).toISOString(),questions:[{questionText:'2 plus 2?',options:['4','5'],correctOption:0}]});
    check(created,201);challengeId=created.data.data.challengeId;
    const concurrentStarts = await Promise.all(
      Array.from({ length: 3 }, () => player.post(`/api/v1/quiz/${challengeId}/attempt`, {})),
    );
    assert.ok(
      concurrentStarts.every(response => [200, 201, 403].includes(response.status)),
      JSON.stringify(concurrentStarts.map(response => ({ status: response.status, data: response.data }))),
    );
    const startedIds = new Set(
      concurrentStarts
        .filter(response => [200, 201].includes(response.status))
        .map(response => response.data.data.attempt._id),
    );
    assert.equal(startedIds.size, 1, 'concurrent challenge starts must resolve to one ranked attempt');
    const id = [...startedIds][0];
    assert.equal(
      await db.collection('attempts').countDocuments({
        quizId: new ObjectId(challengeId),
        userId: new ObjectId(p.userId),
        challengeAttempt: true,
      }),
      1,
      'the unique database invariant must persist exactly one ranked attempt',
    );
    const practice=await author.post(`/api/v1/quiz/${challengeId}/attempt`,{});check(practice,201);
    assert.equal(practice.data.data.attempt.isPractice,true);
    const practiceId = practice.data.data.attempt._id;
    check(await author.put(`/api/v1/quiz/${challengeId}/attempt/${practiceId}`, {}), 200);
    const submitted=await player.put(`/api/v1/quiz/${challengeId}/attempt/${id}`,{});check(submitted,200);
    assert.equal(submitted.data.data.score,null);
    const repeatedSubmission = await player.put(`/api/v1/quiz/${challengeId}/attempt/${id}`, {});
    check(repeatedSubmission, 200);
    assert.equal(repeatedSubmission.data.data.attempt._id, id);
    assert.equal(repeatedSubmission.data.data.attempt.completedAt, submitted.data.data.attempt.completedAt);
    const sealed=await player.get(`/api/v1/challenges/${challengeId}/leaderboard`);check(sealed,200);
    assert.equal(sealed.data.data.quarantined,true);assert.deepEqual(sealed.data.data.leaderboard,[]);
    assert.equal(sealed.data.data.title, 'Architecture competition');
    assert.deepEqual(Object.keys(sealed.data.data.viewerSubmission).sort(), ['attemptId', 'completedAt', 'kind']);
    assert.equal(sealed.data.data.viewerSubmission.attemptId, id);
    assert.equal(sealed.data.data.viewerSubmission.kind, 'ranked');
    assert.match(sealed.headers.get('cache-control'), /no-store/);
    const hostStandings = await author.get(`/api/v1/challenges/${challengeId}/leaderboard`, { expectedStatus: 200 });
    assert.equal(hostStandings.data.data.viewerSubmission.attemptId, practiceId);
    assert.equal(hostStandings.data.data.viewerSubmission.kind, 'practice');
    const outsideStandings = await stranger.get(`/api/v1/challenges/${challengeId}/leaderboard`, { expectedStatus: 200 });
    assert.equal(outsideStandings.data.data.viewerSubmission, null);
    const review=await player.get(`/api/v1/attempts/${id}/result`);check(review,200);
    assert.deepEqual(review.data.data.questions,[]);
    const result = AttemptResultSummary.parse(review.data.data);
    assert.equal(result.attempt.score, null);
    assert.equal(result.allowReview, false);
    check(await author.get(`/api/v1/quiz/${challengeId}/analytics`),403);
    check(await player.get(`/api/v1/quiz/${challengeId}/analytics`),403);
    for (const base of ['quiz', 'quizzes']) {
      const history = await author.get(`/api/v1/${base}/${challengeId}/attempts?sortBy=highest`);
      check(history,200);
      assert.equal(history.data.data.quarantined,true);
      assert.deepEqual(history.data.data.attempts,[]);
    }
    check(await author.get(`/api/v1/attempts/${id}/result`),403);
    check(await author.get(`/api/v1/quiz/attempts/${id}/result`),403);
    const overview = await player.get('/api/v1/social/challenges-overview');
    check(overview,200);
    assert.equal(overview.data.data.stats.quizzesDone,0);
    check(await player.post(`/api/v1/social/quizzes/${challengeId}/bookmark`,{}),200);
    const list = await player.get('/api/v1/challenges', { query: { difficulty: 'Intermediate' } });
    check(list,200);
    const listed = list.data.data.challenges.find(item => item._id === challengeId);
    assert.equal(listed?.isBookmarked,true);
    assert.equal(listed?.questions,undefined);
    const filtered = await player.get('/api/v1/challenges', { query: { difficulty: 'Beginner' } });
    check(filtered,200);
    assert.ok(!filtered.data.data.challenges.some(item => item._id === challengeId));
    await db.collection('quizzes').updateOne({_id:new ObjectId(challengeId)},{$set:{avgScore:100}});
    const quizDetail = await player.get(`/api/v1/quiz/${challengeId}`);
    const challengeDetail = await player.get(`/api/v1/challenges/${challengeId}`);
    check(quizDetail,200); check(challengeDetail,200);
    assert.equal(quizDetail.data.data.quiz.avgScore,0);
    assert.equal(quizDetail.data.data.quiz.questions, undefined);
    assert.equal(challengeDetail.data.data.challenge.avgScore,0);
    assert.equal(ChallengeSummary.parse(challengeDetail.data.data.challenge)._id, challengeId);
    await db.collection('quizzes').updateOne({_id:new ObjectId(quizId)},{$set:{avgScore:50}});
    for (const path of ['/api/v1/quizzes', '/api/v1/social/explore', '/api/v1/social/feed']) {
      const rankedList = await player.get(path, { query: { sort: 'top', q: 'Architecture' } });
      check(rankedList, 200);
      const quizzes = rankedList.data.data.quizzes || rankedList.data.data.items.map(item => item.quiz);
      const ids = quizzes.map(quiz => quiz._id);
      assert.ok(ids.includes(quizId) && ids.includes(challengeId), path);
      assert.ok(ids.indexOf(quizId) < ids.indexOf(challengeId), path);
      assert.equal(quizzes.find(quiz => quiz._id === challengeId).questions, undefined, path);
    }
    const found = await player.get('/api/v1/search/universal', { query: { q: 'Architecture competition' } });
    check(found,200);
    const searchHit = found.data.data.quizzes.find(quiz => quiz._id === challengeId);
    assert.ok(searchHit);
    assert.equal(searchHit.questions, undefined);
    assert.equal(searchHit.avgScore, 0);
    await db.collection('quizzes').updateOne({_id:new ObjectId(challengeId)},{$set:{deadlineAt:new Date(Date.now()-1000)}});
    await finalizeExpiredAttempts();
    const ranked=await player.get(`/api/v1/challenges/${challengeId}/leaderboard`);check(ranked,200);
    assert.equal(ranked.data.data.quarantined,false);
    assert.equal(ranked.data.data.leaderboard.length,1);
    assert.equal(LeaderboardResponse.parse(ranked.data).data.leaderboard[0]?.attemptId, id);
    const hostRanked = await author.get(`/api/v1/challenges/${challengeId}/leaderboard`, { expectedStatus: 200 });
    assert.equal(hostRanked.data.data.viewerSubmission.attemptId, practiceId);
    assert.equal(hostRanked.data.data.totalParticipants, 1);
    const released = await player.get('/api/v1/social/challenges-overview');
    check(released,200);
    assert.equal(released.data.data.stats.quizzesDone,1);
    check(await author.get(`/api/v1/quiz/${challengeId}/analytics`),200);
    check(await author.get(`/api/v1/attempts/${id}/result`),200);
    assert.equal(await db.collection('attempts').countDocuments({quizId:new ObjectId(challengeId),status:'in_progress'}),0);
    await finalizeExpiredAttempts(); // Repeated timer ticks preserve completed state.
    assert.equal((await db.collection('attempts').findOne({_id:new ObjectId(id)})).status,'completed');
  });

  await t.test('standings report timed attempts still being finalized instead of an empty leaderboard', async () => {
    const created = await author.post('/api/v1/challenges', {
      title: 'Timed standings', durationMinutes: 5, deadlineAt: new Date(Date.now() + 600000).toISOString(),
      questions: [{ questionText: '2 plus 2?', options: ['4', '5'], correctOption: 0 }],
    }, { expectedStatus: 201 });
    const id = created.data.data.challengeId;
    const attempt = await stranger.post(`/api/v1/quiz/${id}/attempt`, {}, { expectedStatus: 201 });
    const path = `/api/v1/challenges/${id}/leaderboard`;
    await db.collection('quizzes').updateOne({ _id: new ObjectId(id) }, { $set: { deadlineAt: new Date(Date.now() - 1000) } });
    const pending = (await stranger.get(path, { expectedStatus: 200 })).data.data;
    assert.equal(pending.finalizing, true);
    assert.equal(pending.viewerSubmission, null);
    assert.deepEqual(pending.leaderboard, []);
    await finalizeExpiredAttempts();
    const settled = (await stranger.get(path, { expectedStatus: 200 })).data.data;
    assert.equal(Boolean(settled.finalizing), false);
    assert.equal(settled.leaderboard[0].attemptId, attempt.data.data.attempt._id);
    assert.equal(settled.viewerSubmission.attemptId, attempt.data.data.attempt._id);
  });

  await t.test('challenge drafts resume and publish mixed question types without revealing answers', async () => {
    const questions = [
      { questionType: 'checkboxes', questionText: 'Select the even numbers.', options: [
        { text: '2', isCorrect: true }, { text: '3' }, { text: '4', isCorrect: true },
      ] },
      { questionType: 'dropdown', questionText: 'Select the odd number.', options: ['3', '4'], correctOption: 0 },
      { questionType: 'short_answer', questionText: 'What is the capital of France?', correctAnswer: 'Paris' },
    ];
    const payload = { title: 'Mixed format draft', durationMinutes: 5, deadlineAt: new Date(Date.now() + 600000).toISOString(), questions };
    const draft = await author.post('/api/v1/challenges', { ...payload, isDraft: true });
    check(draft,201);
    const draftId = draft.data.data.challengeId;
    const drafts = await author.get('/api/v1/quiz/drafts', { query: { search: 'Mixed format' } });
    check(drafts,200);
    assert.equal(drafts.data.data.drafts.find(item => item._id === draftId)?.questionCount,3);
    check(await stranger.get(`/api/v1/quiz/drafts/${draftId}`),404);
    await db.collection('quizzes').updateOne({_id:new ObjectId(draftId)}, {
      $set:{challengeStatus:'active','metadata.savedAsDraft':true},
    });
    const updated = await author.post('/api/v1/challenges', { ...payload, draftId, isDraft: true, difficulty: 'Advanced' });
    check(updated,200);
    const resumed = await author.get(`/api/v1/quiz/drafts/${draftId}`); check(resumed,200);
    assert.equal(resumed.data.data.draft.difficulty,'Advanced');
    assert.deepEqual(resumed.data.data.draft.questions.map(item => item.questionType), questions.map(item => item.questionType));
    const published = await author.post('/api/v1/challenges', { draftId });
    check(published,201);
    assert.equal(published.data.data.challengeId,draftId);
    assert.equal((await db.collection('quizzes').findOne({_id:new ObjectId(draftId)})).metadata.savedAsDraft,false);
    const detail = await player.get(`/api/v1/challenges/${draftId}`); check(detail,200);
    for (const item of detail.data.data.challenge.questions) {
      assert.equal(item.correctAnswer,undefined);
      assert.equal(item.correctOption,undefined);
      assert.ok(item.options.every(option => option?.isCorrect === undefined));
    }
    const started = await player.post(`/api/v1/quiz/${draftId}/attempt`,{}); check(started,201);
    const attempt = started.data.data.attempt;
    const questionStates = ['C,A','A','paris'].map((selectedAnswer,index) => ({
      questionId: attempt.answers[index].questionId, selectedAnswer,
    }));
    check(await player.put(`/api/v1/quiz/${draftId}/attempt/${attempt._id}/sync-progress`, { questionStates }),200);
    const submission = await player.put(`/api/v1/quiz/${draftId}/attempt/${attempt._id}`,{}); check(submission,200);
    assert.equal(submission.data.data.score,null);
    const before = await player.get(`/api/v1/attempts/${attempt._id}/result`); check(before,200);
    assert.deepEqual(before.data.data.questions,[]);
    await db.collection('quizzes').updateOne({_id:new ObjectId(draftId)},{$set:{deadlineAt:new Date(Date.now()-1000)}});
    const released = await player.get(`/api/v1/attempts/${attempt._id}/result`); check(released,200);
    assert.equal(released.data.data.attempt.score,3);
    assert.deepEqual(released.data.data.questions[0].correctAnswer,['A','C']);
    assert.equal(released.data.data.questions[2].correctAnswer,'Paris');
  });

  await t.test('social follows and authorized quiz interactions preserve gateway aliases', async () => {
    check(await player.post(`/api/v1/social/users/${a.username}/follow`,{}),200);
    check(await player.post(`/api/v1/social/quizzes/${quizId}/like`,{}),200);
    const notifications=await author.get('/api/v1/notifications');check(notifications,200);
    assert.ok(notifications.data.data.notifications.some(item => item.verb === 'followed'));
    const started=await player.post('/api/v1/messages/start',{recipientId:a.userId,initialMessage:'Architecture contract check'});check(started,200);
    const history=await author.get(`/api/v1/messages/conversations/${started.data.data.conversation._id}`);check(history,200);
    assert.equal(history.data.data.messages.at(-1).text,'Architecture contract check');
  });

  await t.test('member discovery and follower notification preferences apply across services', async () => {
    const discover = () => stranger.get('/api/v1/search/universal', { query: { q: `@${a.username}` } });
    const visible = await discover(); check(visible,200);
    assert.ok(visible.data.data.creators.some(item => item.username === a.username));
    check(await author.patch('/api/v1/auth/me', { preferences: { searchDiscovery: false, notifications: { newFollowers: false } } }),200);
    const hidden = await discover(); check(hidden,200);
    assert.ok(!hidden.data.data.creators.some(item => item.username === a.username));
    check(await stranger.post(`/api/v1/social/users/${a.username}/follow`,{}),200);
    const muted = await author.get('/api/v1/notifications'); check(muted,200);
    assert.ok(!muted.data.data.notifications.some(item => item.verb === 'followed'));
    check(await author.patch('/api/v1/auth/me', { preferences: { searchDiscovery: true, notifications: { newFollowers: true } } }),200);
    const restored = await author.get('/api/v1/notifications'); check(restored,200);
    assert.equal(restored.data.data.notifications.filter(item => item.verb === 'followed').length,1);
  });

  await t.test('configured email and forged identity headers cannot grant administrative privileges', async () => {
    const candidate = new ApiClient();
    check(await candidate.post('/api/v1/auth/register',{name:'Unprivileged email candidate',email:'verification@example.test',password:'Verification-Only-Password-2026!'}),201);
    check(await candidate.get('/api/v1/admin/overview',{headers:{'x-user-role':'admin','x-internal-token':'forged'}}),403);
    assert.equal(await db.collection('adminmemberships').countDocuments({userEmail:'verification@example.test'}),0);
    check(await new ApiClient().get('/api/v1/admin/overview',{headers:{'x-user-id':a.userId,'x-role':'admin'}}),401);
    await db.collection('users').updateOne({_id:new ObjectId(a.userId)},{$set:{role:'admin'}});
    check(await author.get('/api/v1/admin/overview'),200);

    check(await candidate.get('/api/v1/admin/system'),403);
    const diagnostics = await author.get('/api/v1/admin/system');
    check(diagnostics,200);
    const health = SystemHealthResponse.parse(diagnostics.data).data;
    assert.equal(health.databases.length,4);
    assert.ok(health.services.some(service => service.self && service.name === 'admin-service'));
    for (const database of diagnostics.data.data.databases) assert.equal(Object.hasOwn(database, 'uri'), false);

    const account = await author.get(`/api/v1/admin/users/${p.userId}`);
    check(account,200);
    assert.ok(account.data.data.user.sessions.length);
    assert.ok(account.data.data.user.sessions.every(session => !Object.hasOwn(session, 'refreshToken')));
  });

  await t.test('Competition and Admin rank nearby matches within existing access and list filters', async () => {
    for (const [title, accessType] of [['Biochemistry', 'public'], ['Biochemistry practice', 'public'], ['Biochemstry', 'public'], ['Biochemistry private', 'invite_only']]) {
      const created = await author.post('/api/v1/challenges', {
        title, accessType, ...(accessType === 'invite_only' && { inviteAccessType: 'approval' }),
        durationMinutes: 5, deadlineAt: new Date(Date.now() + 600000).toISOString(),
        questions: [{ questionText: '2 plus 2?', options: ['4','5'], correctOption: 0 }],
      });
      check(created,201);
    }
    const competitionQuery = { search: 'Biochemistry', match: 'closest', limit: 2 };
    const competition = await player.get('/api/v1/challenges', { query: competitionQuery });
    check(competition,200);
    assert.deepEqual(competition.data.data.challenges.map(item => item.title), ['Biochemistry', 'Biochemistry practice']);
    assert.equal(competition.data.data.pagination.total,3);
    const next = await player.get('/api/v1/challenges', { query: { ...competitionQuery, page: 2 } });
    check(next,200);
    assert.equal(next.data.data.challenges[0].title,'Biochemstry');
    assert.equal(next.data.data.challenges[0].questions,undefined);

    await db.collection('users').updateOne({_id:new ObjectId(p.userId)},{$set:{name:'Geography Member'}});
    const users = await author.get('/api/v1/admin/users', { query: { search: 'geograpy', match: 'closest', status: 'active' } });
    check(users,200);
    assert.ok(users.data.data.users.some(user => user._id === p.userId));
    const content = await author.get('/api/v1/admin/content', { query: { search: 'Geography', match: 'closest', visibility: 'public', limit: 2 } });
    check(content,200);
    assert.deepEqual(content.data.data.content.map(item => item.title), ['Geography', 'Geography practice']);
    assert.equal(content.data.data.pagination.total,3);
    check(await player.get('/api/v1/admin/users', { query: { search: 'geograpy', match: 'closest' } }),403);
  });

  await t.test('Admin restrictions take effect across cached quiz details, discovery, profiles and attempts', async () => {
    const guest=new ApiClient();
    check(await guest.get(`/api/v1/quiz/${quizId}`),200);
    check(await guest.get('/api/v1/search/trending-tags'),200);
    check(await author.post(`/api/v1/admin/content/${quizId}/restrict`,{reason:'Disposable architecture test'}),200);
    check(await guest.get(`/api/v1/quiz/${quizId}`),401);
    check(await player.post(`/api/v1/quiz/${quizId}/attempt`,{}),403);
    for(const path of ['/api/v1/search/tags/architectureverification','/api/v1/social/explore',`/api/v1/social/users/${a.username}/quizzes`]) {
      const response=await guest.get(path);check(response,200);
      assert.equal((response.data.data.quizzes||[]).some(q=>q._id===quizId),false,path);
    }
    const tags=await guest.get('/api/v1/search/trending-tags');check(tags,200);
    assert.equal(tags.data.data.tags.some(tag=>tag.tag==='architectureverification'),false);
    assert.ok(await db.collection('adminauditlogs').countDocuments({})>0);
  });

  await t.test('login, protected API, session validation and logout remain compatible', async () => {
    const identity=new ApiClient();
    const login = await identity.post('/api/v1/auth/login',{email:p.email,password:p.password});
    check(login,200);
    assert.ok(SessionLoginResponse.safeParse(login.data).success);
    const currentUser = await identity.get('/api/v1/auth/me');
    check(currentUser,200);
    assert.ok(CurrentUserResponse.parse(currentUser.data).data.user._id);
    const bootstrap=await identity.get('/api/v1/auth/bootstrap');check(bootstrap,200);assert.equal(SessionBootstrapResponse.parse(bootstrap.data).data.authenticated,true);
    check(await identity.post('/api/v1/auth/logout',{}),200);
    identity.clearSession();check(await identity.get('/api/v1/messages/conversations'),401);
  });


});
