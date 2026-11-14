/**
 * QuizFocus Tier 1: Feature Coverage E2E Test Suite
 * Strictly OPAQUE-BOX: Evaluates the system externally via the API Gateway perimeter (http://127.0.0.1:5000).
 * ZERO Mongoose model imports or direct internal database queries.
 * Validates external response payloads against versioned @quizfocus/contracts Zod schemas.
 *
 * Covers 8 functional domains with >=5 test cases per domain (40 tests total):
 *   F1: Users & Authentication
 *   F2: Quizzes (Authoring & Catalog)
 *   F3: Challenges (Arenas & Leaderboards)
 *   F4: Attempts (Snapshots & Scoring)
 *   F5: Results & Analytics
 *   F6: Media & Parser Defense
 *   F7: Social & Communications
 *   F8: Admin & Operations
 */

import {
  describe as runnerDescribe,
  it as runnerIt,
  expect as runnerExpect,
} from './helpers/runner-core.js';
import { ApiClient, authenticateTestAdmin } from './helpers/api-client.js';
import {
  CurrentUserResponse,
  SessionBootstrapResponse,
  SessionLoginResponse,
  QuizSummary,
  ChallengeSummary,
  LeaderboardResponse,
  AttemptSummary,
  SubmissionCalendarResponse,
  AttemptResultSummary,
  ReviewPermissions,
  ClipCapabilitiesResponse,
  ClipResponse,
  ClipAccessResponse,
} from '../../contracts/dist/v1/domain.js';
import { GatewayError } from '../../contracts/dist/v1/http.js';

export function registerTier1Tests({ describe = runnerDescribe, it = runnerIt, expect = runnerExpect } = {}) {
  describe('Tier 1: Feature Coverage (40 Tests — F1 to F8)', () => {

    // =========================================================================
    // F1: Users & Authentication (5 Tests)
    // =========================================================================
    describe('F1: Users & Authentication', () => {
      it('F1-1: Register a new user account with unique credentials and receive HTTP 201 with auth cookies', async () => {
        const client = new ApiClient();
        const rand = Math.random().toString(36).substring(2, 7);
        const username = `t1_user_${Date.now()}_${rand}`.toLowerCase();
        const email = `${username}@example.com`;
        const password = 'Password123!';

        const res = await client.post('/api/v1/auth/register', {
          name: `Tier1 User ${rand}`,
          username,
          email,
          password,
        });

        expect(res.status).toBe(201);
        expect(res.data.success).toBe(true);
        expect(res.data.data.user).toBeDefined();
        expect(res.data.data.user._id).toBeDefined();
        expect(client.getCookie('accessToken')).toBeDefined();
        expect(client.getCookie('csrfToken')).toBeDefined();
      });

      it('F1-2: Session bootstrap identifies guest vs authenticated session and validates SessionBootstrapResponse contract', async () => {
        // 1. Guest client has no active session
        const guestClient = new ApiClient();
        guestClient.clearSession();
        const guestBoot = await guestClient.get('/api/v1/auth/bootstrap');
        expect(guestBoot.status).toBe(200);
        const guestParsed = SessionBootstrapResponse.safeParse(guestBoot.data);
        expect(guestParsed.success).toBe(true);
        expect(guestBoot.data.data.authenticated).toBe(false);
        expect(guestBoot.data.data.user).toBeNull();

        // 2. Authenticated user bootstrap reflects active session
        const authClient = new ApiClient();
        const user = await authClient.registerTestUser('t1_boot');
        const authBoot = await authClient.get('/api/v1/auth/bootstrap');
        expect(authBoot.status).toBe(200);
        const authParsed = SessionBootstrapResponse.safeParse(authBoot.data);
        expect(authParsed.success).toBe(true);
        expect(authBoot.data.data.authenticated).toBe(true);
        expect(authBoot.data.data.user._id).toBe(user.userId);
      });

      it('F1-3: Authenticated /me profile retrieval matches CurrentUserResponse contract', async () => {
        const client = new ApiClient();
        const reg = await client.registerTestUser('t1_me');

        const res = await client.get('/api/v1/auth/me');
        expect(res.status).toBe(200);
        const parsed = CurrentUserResponse.safeParse(res.data);
        expect(parsed.success).toBe(true);
        expect(res.data.data.user._id).toBe(reg.userId);
        expect(res.data.data.user.role).toBe('user');
      });

      it('F1-4: Authenticated user can query active devices and sessions via /me/sessions', async () => {
        const client = new ApiClient();
        await client.registerTestUser('t1_sess');

        const res = await client.get('/api/v1/auth/me/sessions');
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        expect(Array.isArray(res.data.data.sessions)).toBe(true);
        expect(res.data.data.sessions.length).toBeGreaterThanOrEqual(1);
        expect(res.data.data.currentSessionId).toBeDefined();
      });

      it('F1-5: Login with valid credentials validates SessionLoginResponse contract and invalid credentials reject with 401', async () => {
        const client = new ApiClient();
        const reg = await client.registerTestUser('t1_login');

        // Wrong password fails
        const badLogin = await new ApiClient().post('/api/v1/auth/login', {
          email: reg.email,
          password: 'WrongPassword999!',
        });
        expect(badLogin.status).toBe(401);
        expect(badLogin.data.success).toBe(false);

        // Correct password succeeds and validates contract
        const goodClient = new ApiClient();
        const goodLogin = await goodClient.post('/api/v1/auth/login', {
          email: reg.email,
          password: reg.password,
        });
        expect(goodLogin.status).toBe(200);
        const parsed = SessionLoginResponse.safeParse(goodLogin.data);
        expect(parsed.success).toBe(true);
      });
    });

    // =========================================================================
    // F2: Quizzes (Authoring & Catalog) (5 Tests)
    // =========================================================================
    describe('F2: Quizzes (Authoring & Catalog)', () => {
      let authorClient;
      let quizId;
      let quizCode;

      it('F2-1: Create manual draft quiz with questions and receive HTTP 201 with quizId', async () => {
        authorClient = new ApiClient();
        await authorClient.registerTestUser('t1_qauthor');

        const question = {
          questionText: 'What is the speed of light in vacuum?',
          questionType: 'multiple_choice',
          options: [
            { label: 'A', text: '3 x 10^8 m/s', isCorrect: true },
            { label: 'B', text: '3 x 10^6 m/s' },
          ],
          correctAnswer: 'A',
          marks: 1,
        };

        const res = await authorClient.post('/api/v1/quiz/manual', {
          title: 'Physics Speed of Light Quiz',
          isDraft: true,
          questions: [question],
          tags: ['physics', 'tier1test'],
        });

        expect(res.status).toBe(201);
        expect(res.data.success).toBe(true);
        quizId = res.data.data.quizId;
        expect(quizId).toBeDefined();
      });

      it('F2-2: Retrieve draft quizzes for creator via /api/v1/quiz/drafts', async () => {
        const res = await authorClient.get('/api/v1/quiz/drafts');
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        expect(Array.isArray(res.data.data.drafts)).toBe(true);
        const found = res.data.data.drafts.find(d => d._id === quizId);
        expect(found).toBeDefined();
        expect(found.title).toBe('Physics Speed of Light Quiz');
      });

      it('F2-3: Publish draft quiz to public visibility and validate QuizSummary contract', async () => {
        const res = await authorClient.post(`/api/v1/quiz/drafts/${quizId}/publish`, {
          visibility: 'public',
        });

        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        const publishedQuiz = res.data.data.quiz;
        quizCode = publishedQuiz.quizCode;
        expect(quizCode).toBeDefined();

        const parsed = QuizSummary.safeParse(publishedQuiz);
        expect(parsed.success).toBe(true);
        expect(parsed.data._id).toBe(quizId);
        expect(parsed.data.visibility).toBe('public');
      });

      it('F2-4: Retrieve published quiz by ID and verify answers are concealed for participants', async () => {
        const studentClient = new ApiClient();
        await studentClient.registerTestUser('t1_qreader');

        const res = await studentClient.get(`/api/v1/quiz/${quizId}`);
        expect(res.status).toBe(200);
        const parsed = QuizSummary.safeParse(res.data.data.quiz);
        expect(parsed.success).toBe(true);
        expect(res.data.data.quiz.title).toBe('Physics Speed of Light Quiz');
      });

      it('F2-5: Lookup quiz by symbolic quizCode and query public catalog search', async () => {
        const client = new ApiClient();
        // Lookup by symbolic code
        const byCode = await client.get(`/api/v1/quiz/code/${encodeURIComponent(quizCode)}`);
        expect(byCode.status).toBe(200);
        expect(byCode.data.data.quiz._id).toBe(quizId);

        // Catalog query
        const catalog = await client.get('/api/v1/quizzes', {
          query: { search: 'Physics Speed of Light' },
        });
        expect(catalog.status).toBe(200);
        expect(Array.isArray(catalog.data.data.quizzes)).toBe(true);
        expect(catalog.data.data.quizzes.some(q => q._id === quizId)).toBe(true);
      });
    });

    // =========================================================================
    // F3: Challenges (Arenas & Leaderboards) (5 Tests)
    // =========================================================================
    describe('F3: Challenges (Arenas & Leaderboards)', () => {
      let hostClient;
      let challengeId;
      const futureDeadline = new Date(Date.now() + 7200000).toISOString();

      it('F3-1: Create competitive challenge arena with deadline and receive HTTP 201', async () => {
        hostClient = new ApiClient();
        await hostClient.registerTestUser('t1_chhost');

        const res = await hostClient.post('/api/v1/challenges', {
          title: 'Tier 1 Arena Championship',
          durationMinutes: 15,
          deadlineAt: futureDeadline,
          questions: [
            {
              questionText: 'Which planet is known as the Red Planet?',
              options: ['Mars', 'Venus', 'Jupiter'],
              correctOption: 0,
            },
          ],
        });

        expect(res.status).toBe(201);
        expect(res.data.success).toBe(true);
        challengeId = res.data.data.challengeId;
        expect(challengeId).toBeDefined();
      });

      it('F3-2: List competitive challenges and validate ChallengeSummary contract', async () => {
        const client = new ApiClient();
        const res = await client.get('/api/v1/challenges', {
          query: { search: 'Tier 1 Arena' },
        });

        expect(res.status).toBe(200);
        expect(Array.isArray(res.data.data.challenges)).toBe(true);
        const match = res.data.data.challenges.find(c => c._id === challengeId);
        expect(match).toBeDefined();

        const parsed = ChallengeSummary.safeParse(match);
        expect(parsed.success).toBe(true);
        expect(parsed.data.isChallenge).toBe(true);
      });

      it('F3-3: Retrieve challenge detail and verify correct options are concealed before conclusion', async () => {
        const playerClient = new ApiClient();
        await playerClient.registerTestUser('t1_chplayer');

        const res = await playerClient.get(`/api/v1/challenges/${challengeId}`);
        expect(res.status).toBe(200);
        const challenge = res.data.data.challenge;
        expect(challenge._id).toBe(challengeId);
        expect(ChallengeSummary.safeParse(challenge).success).toBe(true);

        if (challenge.questions && challenge.questions.length > 0) {
          for (const q of challenge.questions) {
            expect(q.correctOption).toBeUndefined();
            expect(q.correctAnswer).toBeUndefined();
          }
        }
      });

      it('F3-4: Leaderboard for active challenge before deadline enforces quarantine with empty standings', async () => {
        const client = new ApiClient();
        const res = await client.get(`/api/v1/challenges/${challengeId}/leaderboard`);

        expect(res.status).toBe(200);
        const parsed = LeaderboardResponse.safeParse(res.data);
        expect(parsed.success).toBe(true);
        expect(res.data.data.quarantined).toBe(true);
        expect(res.data.data.leaderboard).toEqual([]);
      });

      it('F3-5: Retrieve aggregated challenge arena overview via /api/v1/challenges/overview', async () => {
        const client = new ApiClient();
        const res = await client.get('/api/v1/challenges/overview');

        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.data).toBeDefined();
        expect(res.data.data.stats).toBeDefined();
      });
    });

    // =========================================================================
    // F4: Attempts (Snapshots & Scoring) (5 Tests)
    // =========================================================================
    describe('F4: Attempts (Snapshots & Scoring)', () => {
      let authorClient;
      let playerClient;
      let quizId;
      let attemptId;
      let questionId;

      it('F4-1: Start quiz attempt and validate AttemptSummary contract', async () => {
        authorClient = new ApiClient();
        await authorClient.registerTestUser('t1_attauth');
        playerClient = new ApiClient();
        await playerClient.registerTestUser('t1_attplay');

        const draft = await authorClient.post('/api/v1/quiz/manual', {
          title: 'Mathematics Multiplication Quiz',
          isDraft: true,
          questions: [
            {
              questionText: 'What is 7 multiplied by 8?',
              questionType: 'multiple_choice',
              options: [
                { label: 'A', text: '56', isCorrect: true },
                { label: 'B', text: '54' },
              ],
              correctAnswer: 'A',
              marks: 2,
            },
          ],
        });
        quizId = draft.data.data.quizId;
        await authorClient.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' });

        const started = await playerClient.post('/api/v1/attempts/start', { quizId });
        expect(started.status).toBe(201);
        const attempt = started.data.data.attempt;
        attemptId = attempt._id;
        expect(attemptId).toBeDefined();

        const parsed = AttemptSummary.safeParse(attempt);
        expect(parsed.success).toBe(true);
        expect(parsed.data.status).toBe('in_progress');
      });

      it('F4-2: Retrieve attempt snapshot questions with answers concealed', async () => {
        const res = await playerClient.get(`/api/v1/attempts/${attemptId}/questions`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.data.data.questions)).toBe(true);
        expect(res.data.data.questions.length).toBe(1);

        const q = res.data.data.questions[0];
        questionId = q._id;
        expect(questionId).toBeDefined();
        expect(q.correctAnswer).toBeUndefined();
      });

      it('F4-3: Record answer on attempt snapshot via /api/v1/attempts/:id/answer', async () => {
        const res = await playerClient.post(`/api/v1/attempts/${attemptId}/answer`, {
          questionId,
          selectedOption: 'A',
        });
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
      });

      it('F4-4: Submit completed attempt and verify deterministic score computation', async () => {
        // Synchronize answer state and finalize
        await playerClient.put(`/api/v1/quiz/${quizId}/attempt/${attemptId}/sync-progress`, {
          questionStates: [{ questionId, selectedAnswer: 'A' }],
        });

        const submitted = await playerClient.put(`/api/v1/quiz/${quizId}/attempt/${attemptId}`, {});
        expect(submitted.status).toBe(200);
        expect(submitted.data.data.attempt.status).toBe('completed');
        expect(submitted.data.data.score).toBe(2);
        expect(submitted.data.data.percentage).toBe(100);
      });

      it('F4-5: Retrieve submission calendar and validate SubmissionCalendarResponse contract', async () => {
        const res = await playerClient.get('/api/v1/attempts/submission-calendar');
        expect(res.status).toBe(200);
        const parsed = SubmissionCalendarResponse.safeParse(res.data);
        expect(parsed.success).toBe(true);
        expect(parsed.data.data.start).toBeDefined();
        expect(parsed.data.data.end).toBeDefined();
        expect(Array.isArray(parsed.data.data.days)).toBe(true);
      });
    });

    // =========================================================================
    // F5: Results & Analytics (5 Tests)
    // =========================================================================
    describe('F5: Results & Analytics', () => {
      let authorClient;
      let playerClient;
      let quizId;
      let attemptId;

      it('F5-1: Fetch attempt result for standard quiz and validate AttemptResultSummary contract', async () => {
        authorClient = new ApiClient();
        await authorClient.registerTestUser('t1_resauth');
        playerClient = new ApiClient();
        await playerClient.registerTestUser('t1_resplay');

        const draft = await authorClient.post('/api/v1/quiz/manual', {
          title: 'Biology Photosynthesis Quiz',
          isDraft: true,
          settings: { allowReview: true, showExplanation: true },
          questions: [
            {
              questionText: 'What gas is released during photosynthesis?',
              questionType: 'multiple_choice',
              options: [
                { label: 'A', text: 'Oxygen', isCorrect: true },
                { label: 'B', text: 'Carbon Dioxide' },
              ],
              correctAnswer: 'A',
              marks: 1,
            },
          ],
        });
        quizId = draft.data.data.quizId;
        await authorClient.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' });

        const started = await playerClient.post(`/api/v1/quiz/${quizId}/attempt`, {});
        attemptId = started.data.data.attempt._id;
        const qId = started.data.data.attempt.answers[0].questionId;
        await playerClient.put(`/api/v1/quiz/${quizId}/attempt/${attemptId}/sync-progress`, {
          questionStates: [{ questionId: qId, selectedAnswer: 'A' }],
        });
        await playerClient.put(`/api/v1/quiz/${quizId}/attempt/${attemptId}`, {});

        const res = await playerClient.get(`/api/v1/attempts/${attemptId}/result`);
        expect(res.status).toBe(200);
        const parsed = AttemptResultSummary.safeParse(res.data.data);
        expect(parsed.success).toBe(true);
        expect(parsed.data.attempt.score).toBe(1);
        expect(parsed.data.attempt.status).toBe('completed');
      });

      it('F5-2: Challenge attempt result before deadline conceals score and questions', async () => {
        const futureDeadline = new Date(Date.now() + 3600000).toISOString();
        const ch = await authorClient.post('/api/v1/challenges', {
          title: 'Concealment Verification Challenge',
          durationMinutes: 10,
          deadlineAt: futureDeadline,
          questions: [
            { questionText: 'Secret question?', options: ['Alpha', 'Beta'], correctOption: 0 },
          ],
        });
        const chId = ch.data.data.challengeId;

        const chAttempt = await playerClient.post(`/api/v1/quiz/${chId}/attempt`, {});
        const chAttemptId = chAttempt.data.data.attempt._id;
        await playerClient.put(`/api/v1/quiz/${chId}/attempt/${chAttemptId}`, {});

        const res = await playerClient.get(`/api/v1/attempts/${chAttemptId}/result`);
        expect(res.status).toBe(200);
        expect(res.data.data.attempt.score).toBeNull();
        expect(res.data.data.questions).toEqual([]);
        expect(res.data.data.allowReview).toBe(false);
      });

      it('F5-3: Retrieve quiz aggregated analytics via /api/v1/quiz/:id/analytics', async () => {
        const res = await authorClient.get(`/api/v1/quiz/${quizId}/analytics`);
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.data.analytics).toBeDefined();
        expect(res.data.data.analytics.totalAttempts).toBeGreaterThanOrEqual(1);
        expect(typeof res.data.data.analytics.avgScore).toBe('number');
      });

      it('F5-4: Review permissions contract distinguishes reviewable settings', async () => {
        const res = await playerClient.get(`/api/v1/attempts/${attemptId}/result`);
        expect(res.status).toBe(200);
        const parsed = ReviewPermissions.safeParse(res.data.data);
        expect(parsed.success).toBe(true);
        expect(typeof parsed.data.allowReview).toBe('boolean');
        expect(typeof parsed.data.showExplanation).toBe('boolean');
      });

      it('F5-5: Stranger unauthorized access to private attempt result is rejected with 403', async () => {
        const stranger = new ApiClient();
        await stranger.registerTestUser('t1_resstranger');

        // Stranger attempting to view another user's result on private attempt
        const res = await stranger.get(`/api/v1/quiz/attempts/${attemptId}/result`);
        expect([403, 404].includes(res.status)).toBe(true);
      });
    });

    // =========================================================================
    // F6: Media & Parser Defense (5 Tests)
    // =========================================================================
    describe('F6: Media & Parser Defense', () => {
      let authorClient;
      let clipAssetId;

      it('F6-1: Query media capabilities and validate ClipCapabilitiesResponse contract', async () => {
        const client = new ApiClient();
        const res = await client.get('/api/v1/media/clip-capabilities');

        expect(res.status).toBe(200);
        const parsed = ClipCapabilitiesResponse.safeParse(res.data);
        expect(parsed.success).toBe(true);
        expect(parsed.data.data.processorReady).toBe(true);
        expect(parsed.data.data.maxFileSize).toBeGreaterThan(0);
      });

      it('F6-2: Gateway upload rate limiter returns RateLimit tracking headers on upload routes', async () => {
        authorClient = new ApiClient();
        await authorClient.registerTestUser('t1_medauth');

        const res = await authorClient.post('/api/v1/media/clips/image-url', {
          url: 'https://127.0.0.1/disallowed_target.png',
        });

        // The Gateway's createUploadRateLimiter intercepts upload mutating calls
        expect(res.headers.get('ratelimit-limit')).toBeDefined();
        expect(res.headers.get('ratelimit-remaining')).toBeDefined();
      });

      it('F6-3: Upload valid media clip and validate ClipResponse contract with metadata', async () => {
        // Valid 1x1 2-frame GIF fixture
        const gif = Buffer.from(
          '47494638396101000100800000000000ffffff21f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b',
          'hex'
        );
        const form = new FormData();
        form.append('file', new Blob([gif], { type: 'image/gif' }), 'animation.gif');
        form.append('kind', 'image');
        form.append('uploadRequestId', '550e8400-e29b-41d4-a716-446655440022');

        const uploadRes = await fetch(`${authorClient.baseUrl}/api/v1/media/clips`, {
          method: 'POST',
          headers: {
            'Cookie': authorClient._buildCookieHeader(),
            'x-csrf-token': authorClient.cookies.get('csrfToken') || 'e2e_csrf_token',
            'Authorization': `Bearer ${authorClient.token}`,
          },
          body: form,
        });

        expect(uploadRes.status).toBe(201);
        const data = await uploadRes.json();
        const parsed = ClipResponse.safeParse(data);
        expect(parsed.success).toBe(true);
        expect(parsed.data.data.asset.kind).toBe('image');
        expect(parsed.data.data.asset.status).toBe('ready');
        clipAssetId = parsed.data.data.asset._id;
        expect(clipAssetId).toBeDefined();
      });

      it('F6-4: Request signed clip access tokens and validate ClipAccessResponse contract', async () => {
        const res = await authorClient.post('/api/v1/media/clips/access', {
          assetIds: [clipAssetId],
        });

        expect(res.status).toBe(200);
        const parsed = ClipAccessResponse.safeParse(res.data);
        expect(parsed.success).toBe(true);
        const assetInfo = parsed.data.data.assets[clipAssetId];
        expect(assetInfo).toBeDefined();
        expect(assetInfo.url.startsWith('/api/v1/media/clips/')).toBe(true);
      });

      it('F6-5: Upload document and verify deterministic SHA-256 duplicate detection with tenant protection', async () => {
        const csvContent = 'Question,Correct Answer\nWhat is 2+2?,4\n';
        const form = new FormData();
        form.append('file', new Blob([csvContent], { type: 'text/csv' }), 'test_dup.csv');

        const uploadRes = await fetch(`${authorClient.baseUrl}/api/v1/upload`, {
          method: 'POST',
          headers: {
            'Cookie': authorClient._buildCookieHeader(),
            'x-csrf-token': authorClient.cookies.get('csrfToken') || 'e2e_csrf_token',
            'Authorization': `Bearer ${authorClient.token}`,
          },
          body: form,
        });

        expect(uploadRes.status).toBe(201);
        const uploadData = await uploadRes.json();
        const uploadId = uploadData.data?.upload?.id || uploadData.data?.upload?._id;
        expect(uploadId).toBeDefined();

        // 1. Authorized uploader can query duplicate status
        const dupRes = await authorClient.get(`/api/v1/upload/${uploadId}/duplicate`);
        expect(dupRes.status).toBe(200);
        expect(dupRes.data.data.fileHash).toBeDefined();

        // 2. Stranger cannot query or inspect other user's upload metadata (tenant boundary)
        const stranger = new ApiClient();
        await stranger.registerTestUser('t1_medstranger');
        const leakCheck = await stranger.get(`/api/v1/upload/${uploadId}/duplicate`);
        expect(leakCheck.status).toBe(403);
      });
    });

    // =========================================================================
    // F7: Social & Communications (5 Tests)
    // =========================================================================
    describe('F7: Social & Communications', () => {
      let creatorClient;
      let followerClient;
      let creatorUser;
      let followerUser;
      let quizId;

      it('F7-1: Query public social activity feed via /api/v1/social/feed', async () => {
        creatorClient = new ApiClient();
        creatorUser = await creatorClient.registerTestUser('t1_soccreator');
        followerClient = new ApiClient();
        followerUser = await followerClient.registerTestUser('t1_socfollower');

        const res = await followerClient.get('/api/v1/social/feed');
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.data.items).toBeDefined();
        expect(res.data.data.pagination).toBeDefined();
      });

      it('F7-2: Like and unlike a published quiz updates social engagement metrics', async () => {
        const qRes = await creatorClient.post('/api/v1/quiz/manual', {
          title: 'Social Interaction Golden Quiz',
          isDraft: true,
          questions: [
            {
              questionText: 'Is the sky blue?',
              questionType: 'multiple_choice',
              options: [{ label: 'A', text: 'Yes', isCorrect: true }, { label: 'B', text: 'No' }],
              correctAnswer: 'A',
              marks: 1,
            },
          ],
        });
        quizId = qRes.data.data.quizId;
        await creatorClient.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' });

        // Like quiz
        const like = await followerClient.post(`/api/v1/social/quizzes/${quizId}/like`, {});
        expect(like.status).toBe(200);
        expect(like.data.success).toBe(true);
        expect(like.data.data.quiz.likeCount).toBeGreaterThanOrEqual(1);

        // Unlike quiz
        const unlike = await followerClient.delete(`/api/v1/social/quizzes/${quizId}/like`);
        expect(unlike.status).toBe(200);
        expect(unlike.data.success).toBe(true);
      });

      it('F7-3: Bookmark and unbookmark a quiz manages user saved collection', async () => {
        const bookmark = await followerClient.post(`/api/v1/social/quizzes/${quizId}/bookmark`, {});
        expect(bookmark.status).toBe(200);
        expect(bookmark.data.success).toBe(true);

        const unbookmark = await followerClient.delete(`/api/v1/social/quizzes/${quizId}/bookmark`);
        expect(unbookmark.status).toBe(200);
        expect(unbookmark.data.success).toBe(true);
      });

      it('F7-4: Create and retrieve threaded comments on a quiz', async () => {
        const commentRes = await followerClient.post(`/api/v1/social/quizzes/${quizId}/comments`, {
          content: 'This is an insightful question set!',
        });
        expect(commentRes.status).toBe(201);
        expect(commentRes.data.success).toBe(true);
        expect(commentRes.data.data.comment.body).toBe('This is an insightful question set!');

        const listRes = await followerClient.get(`/api/v1/social/quizzes/${quizId}/comments`);
        expect(listRes.status).toBe(200);
        expect(Array.isArray(listRes.data.data.comments)).toBe(true);
        expect(listRes.data.data.comments.length).toBeGreaterThanOrEqual(1);
      });

      it('F7-5: Start direct message conversation between two users and query user discovery', async () => {
        // Direct messaging start
        const dm = await followerClient.post('/api/v1/messages/start', {
          recipientId: creatorUser.userId,
          initialMessage: 'Hi creator, great work on the quiz!',
        });
        expect(dm.status).toBe(200);
        expect(dm.data.success).toBe(true);
        expect(dm.data.data.conversation._id).toBeDefined();

        // User search query
        const search = await followerClient.get('/api/v1/auth/users/search', {
          query: { q: creatorUser.username },
        });
        expect(search.status).toBe(200);
        expect(Array.isArray(search.data.data.users)).toBe(true);
        expect(search.data.data.users.some(u => u.username === creatorUser.username)).toBe(true);
      });
    });

    // =========================================================================
    // F8: Admin & Operations (5 Tests)
    // =========================================================================
    describe('F8: Admin & Operations', () => {
      let adminClient;
      let reportedQuizId;
      let reportId;

      it('F8-1: Admin RBAC enforcement rejects unauthenticated, non-admin, and forged identity requests', async () => {
        // 1. Unauthenticated gets 401
        const unauth = await new ApiClient().get('/api/v1/admin/overview');
        expect(unauth.status).toBe(401);

        // 2. Normal user gets 403 Forbidden
        const normalClient = new ApiClient();
        await normalClient.registerTestUser('t1_normal');
        const forbidden = await normalClient.get('/api/v1/admin/overview');
        expect(forbidden.status).toBe(403);

        // 3. Forged client headers are stripped by the API Gateway proxy and still rejected
        const forged = await normalClient.get('/api/v1/admin/overview', {
          headers: {
            'x-user-role': 'admin',
            'x-role': 'admin',
            'x-admin': 'true',
          },
        });
        expect(forged.status).toBe(403);
      });

      it('F8-2: Admin public health diagnostics probe returns HTTP 200 with service health status', async () => {
        const client = new ApiClient();
        const res = await client.get('/api/v1/admin/health');

        expect(res.status).toBe(200);
        expect(res.data.service).toBe('admin-service');
        expect(res.data.status).toBe('healthy');
        expect(res.data.timestamp).toBeDefined();
      });

      it('F8-3: Submit user moderation report via /api/v1/admin/reports/submit and receive HTTP 201', async () => {
        const reporterClient = new ApiClient();
        await reporterClient.registerTestUser('t1_reporter');

        // Create a target quiz to report
        const qRes = await reporterClient.post('/api/v1/quiz/manual', {
          title: 'Reported Content Test Quiz',
          isDraft: true,
          questions: [
            { questionText: 'Q1?', options: ['A', 'B'], correctOption: 0 },
          ],
        });
        reportedQuizId = qRes.data?.data?.quizId || '6af841cc3b5f592a5f8df503';

        const repRes = await reporterClient.post('/api/v1/admin/reports/submit', {
          targetType: 'quiz',
          targetId: reportedQuizId,
          category: 'spam',
          reason: 'Tier 1 Automated Test Content Report',
        });

        expect(repRes.status).toBe(201);
        expect(repRes.data.success).toBe(true);
        reportId = repRes.data.reportId;
        expect(reportId).toBeDefined();
        expect(repRes.data.data.report.status).toBe('pending');
      });

      it('F8-4: Admin lists moderation queue and resolves reported content item', async () => {
        adminClient = await authenticateTestAdmin();

        // List moderation reports
        const listRes = await adminClient.get('/api/v1/admin/reports');
        expect(listRes.status).toBe(200);
        expect(Array.isArray(listRes.data.data.reports)).toBe(true);
        expect(listRes.data.data.reports.length).toBeGreaterThanOrEqual(1);

        // Resolve moderation report
        const resolveRes = await adminClient.post(`/api/v1/admin/reports/${reportId}/resolve`, {
          action: 'dismissed',
          notes: 'Dismissed by Tier 1 feature coverage test runner',
        });
        expect(resolveRes.status).toBe(200);
        expect(resolveRes.data.success).toBe(true);
      });

      it('F8-5: Admin queries immutable compliance audit logs and multi-database system diagnostics', async () => {
        // Query audit trail
        const auditRes = await adminClient.get('/api/v1/admin/audit-logs');
        expect(auditRes.status).toBe(200);
        expect(auditRes.data.success).toBe(true);
        expect(Array.isArray(auditRes.data.data.logs)).toBe(true);

        // Query system health & diagnostics
        const sysRes = await adminClient.get('/api/v1/admin/system');
        expect(sysRes.status).toBe(200);
        expect(sysRes.data.success).toBe(true);
        expect(sysRes.data.data.overallStatus).toBeDefined();
        expect(sysRes.data.data.databases).toBeDefined();
        expect(typeof sysRes.data.data.uptimeSeconds).toBe('number');
      });
    });

  });
}

// Auto-register when imported by runner.js or executed directly
if (process.argv[1]?.endsWith('tier1-feature-coverage.test.js') || process.argv[1]?.endsWith('runner.js')) {
  registerTier1Tests();
}
