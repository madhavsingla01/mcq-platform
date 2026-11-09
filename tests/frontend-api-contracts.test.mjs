import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../apps/desktop-web/package.json', import.meta.url));
const { build } = require('esbuild');
import { authRedirect } from '../apps/desktop-web/src/utils/authRedirect.js';
import { isCompletePdfQuestion, parsePdfQuestions, toDraftPdfQuestion } from '../apps/desktop-web/src/pages/Create/pdfQuestions.js';
import { rankSearchResults } from '../apps/desktop-web/src/components/search/rankSearchResults.js';

test('normal search ranks exact and partial matches ahead of typos and retains the default order for an empty query', () => {
  const titles = ['Botany', 'Geograpyh', 'Geography practice', 'Geography'];
  assert.deepEqual(rankSearchResults(titles, 'geography', title => [title]), ['Geography', 'Geography practice', 'Geograpyh']);
  assert.deepEqual(rankSearchResults(titles, 'pratice geograpy', title => [title]), ['Geography practice']);
  assert.deepEqual(rankSearchResults(['Algebra', 'Café Quiz'], 'cafe qiz', title => [title]), ['Café Quiz']);
  assert.equal(rankSearchResults(titles, '  ', title => [title]), titles);
});

test('PDF quiz drafts normalize choice labels without changing the correct answer', () => {
  const [question, duplicate, incomplete] = parsePdfQuestions([
    '1. Which number is even?', 'D. Three', 'C. Four', 'Answer: C',
    '2. Which number is odd?', 'A. Three', 'A. Four', 'Answer: A',
    '3. What is two plus two?', 'A. Three', 'B. Four',
  ].join('\n'));
  assert.equal(isCompletePdfQuestion(question), true);
  const draft = toDraftPdfQuestion(question, 0);
  assert.deepEqual(draft.options, [
    { label: 'A', text: 'Three', isCorrect: false },
    { label: 'B', text: 'Four', isCorrect: true },
  ]);
  assert.equal(draft.correctAnswer, 'B');
  assert.equal(isCompletePdfQuestion(duplicate), false);
  assert.equal(isCompletePdfQuestion(incomplete), false);
});

test('desktop auth redirects preserve a local draft route and reject external or looping paths', () => {
  assert.equal(authRedirect('/create/quiz?draft=123#editor'), '/create/quiz?draft=123#editor');
  for (const input of ['https://untrusted.example', '//untrusted.example', '/\\untrusted.example', '/%2Funtrusted.example',
    '/folder/..//untrusted.example', '/login?redirect=/dashboard', '/register/', 'javascript:alert(1)', null]) {
    assert.equal(authRedirect(input), '/dashboard', String(input));
  }
});

test('desktop auth keeps the user signed in when logout cannot be confirmed', async () => {
  const fixture = { errors: [], failLogout: true, user: { _id: 'verified-account' } };
  globalThis.__quizfocusAuthFixture = fixture;
  try {
    const mocks = new Map([
      ['transport', `export const AUTH_SESSION_EXPIRED_EVENT = 'session-expired';
        export default {
          get: async () => {
            await globalThis.__quizfocusAuthFixture.bootstrapDelay;
            return { data: { data: { authenticated: true, user: globalThis.__quizfocusAuthFixture.user } } };
          },
          post: async () => {
            if (globalThis.__quizfocusAuthFixture.failLogout) throw new Error('offline');
          }
        };`],
      ['preferences', 'export const hydrateServerPreferences = () => {}, setServerSessionAuthenticated = () => {}, queueProfileUpdate = () => {};'],
      ['socket', 'export const disconnectSocket = () => {};'],
      ['feedback', 'export const toast = { error: message => globalThis.__quizfocusAuthFixture.errors.push(message) };'],
    ]);
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL('../apps/desktop-web/src/store/authStore.js', import.meta.url))],
      bundle: true, write: false, format: 'esm', platform: 'node',
      plugins: [{
        name: 'auth-contract-dependencies',
        setup(api) {
          api.onResolve({ filter: /api\/axios$/ }, () => ({ path: 'transport', namespace: 'auth-test' }));
          api.onResolve({ filter: /settingsStore$/ }, () => ({ path: 'preferences', namespace: 'auth-test' }));
          api.onResolve({ filter: /socket\.service$/ }, () => ({ path: 'socket', namespace: 'auth-test' }));
          api.onResolve({ filter: /^sonner$/ }, () => ({ path: 'feedback', namespace: 'auth-test' }));
          api.onLoad({ filter: /.*/, namespace: 'auth-test' }, args => ({ contents: mocks.get(args.path), loader: 'js' }));
        },
      }],
    });
    const { useAuthStore } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
    await useAuthStore.getState().checkAuth();
    assert.equal(useAuthStore.getState().user._id, fixture.user._id);
    assert.equal(await useAuthStore.getState().logout(), false);
    assert.equal(useAuthStore.getState().isAuthenticated, true);
    assert.match(fixture.errors[0], /try again/i);
    fixture.failLogout = false;
    let finishBootstrap;
    fixture.bootstrapDelay = new Promise(resolve => { finishBootstrap = resolve; });
    const pendingBootstrap = useAuthStore.getState().checkAuth();
    assert.equal(await useAuthStore.getState().logout(), true);
    finishBootstrap();
    await pendingBootstrap;
    assert.equal(useAuthStore.getState().user, null);
    assert.equal(useAuthStore.getState().isAuthenticated, false);
  } finally {
    delete globalThis.__quizfocusAuthFixture;
  }
});

test('desktop Attempt client keeps progress sync separate from final submission and uses the gateway', async () => {
  const calls=[];
  globalThis.__quizfocusContractCalls=calls;
  try {
    const bundle=await build({entryPoints:[fileURLToPath(new URL('../apps/desktop-web/src/services/attempt.service.js',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',plugins:[{
      name:'mock-http-transport',setup(api){
        api.onResolve({filter:/api\/axios$/},()=>({path:'transport',namespace:'contract-test'}));
        api.onLoad({filter:/.*/,namespace:'contract-test'},()=>({contents:`
          const invoke = (method) => async (...args) => {
            globalThis.__quizfocusContractCalls.push({ method, args });
            return { data: { success: true, data: { attempt: { _id: 'attempt-id' } } } };
          };
          export default { post: invoke('POST'), put: invoke('PUT'), get: invoke('GET') };
        `,loader:'js'}));
      },
    }]});
    const {AttemptService}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
    assert.equal((await AttemptService.startAttempt('quiz-id')).attempt._id,'attempt-id');
    await AttemptService.syncAttemptState('quiz-id','attempt-id',{totalElapsedMs:1000});
    await AttemptService.submitAttempt('quiz-id','attempt-id',{totalElapsedMs:2000});
    await AttemptService.getAttemptResult('attempt-id');
    assert.deepEqual(calls.map(call=>[call.method,call.args[0]]),[
      ['POST','/quiz/quiz-id/attempt'],['PUT','/quiz/quiz-id/attempt/attempt-id/sync-progress'],
      ['PUT','/quiz/quiz-id/attempt/attempt-id'],['GET','/attempts/attempt-id/result'],
    ]);
    assert.equal(calls[1].args[1].finalize,undefined);
    assert.equal(calls[2].args[1].finalize,true);
  } finally { delete globalThis.__quizfocusContractCalls; }
});
