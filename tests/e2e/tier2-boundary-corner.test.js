/**
 * QuizFocus Tier 2: Boundary & Corner Cases E2E Test Suite
 * Strictly OPAQUE-BOX: Evaluates boundary, edge, and corner cases externally via
 * the public API Gateway perimeter (http://127.0.0.1:5000 or process.env.API_GATEWAY_URL).
 *
 * ZERO Mongoose model imports or direct internal database queries.
 * Validates error responses against @quizfocus/contracts Zod GatewayError schema
 * and expected HTTP status codes (400, 401, 403, 404, 413, 429).
 *
 * Covers 8 functional domains with >=5 test cases per domain (40 tests total):
 *   F1: Users & Authentication
 *   F2: Quizzes (Authoring & Catalog)
 *   F3: Challenges (Arenas & Leaderboards)
 *   F4: Attempts (Snapshots & Scoring)
 *   F5: Results & Analytics
 *   F6: Media & Parser Ingestion Defense
 *   F7: Social & Communications
 *   F8: Admin Control Center & Operations
 */

import {
  describe as runnerDescribe,
  it as runnerIt,
  expect as runnerExpect,
} from './helpers/runner-core.js';
import { ApiClient, authenticateTestAdmin } from './helpers/api-client.js';
import { LeaderboardResponse } from '../../contracts/dist/v1/domain.js';
import { GatewayError, readApiFailure } from '../../contracts/dist/v1/http.js';

// Reusable actor fixture cache
let actorsPromise = null;
async function getActors() {
  if (!actorsPromise) {
    actorsPromise = (async () => {
      // Primary regular user
      const userClient = new ApiClient();
      const userReg = await userClient.registerTestUser('t2_usr');

      // Secondary stranger user for cross-user permission boundaries
      const strangerClient = new ApiClient();
      const strangerReg = await strangerClient.registerTestUser('t2_str');

      // Guest / unauthenticated client
      const guestClient = new ApiClient();
      guestClient.clearSession();

      return {
        userClient,
        userReg,
        strangerClient,
        strangerReg,
        guestClient,
      };
    })();
  }
  return actorsPromise;
}

export function registerTier2Tests({ describe = runnerDescribe, it = runnerIt, expect = runnerExpect } = {}) {
  describe('Tier 2: Boundary & Corner Cases (40 Tests — F1 to F8)', () => {

    // =========================================================================
    // F1: Users & Authentication (5 Tests)
    // =========================================================================
    describe('F1: Users & Authentication', () => {
      it('F1-B1: Empty password registration rejected with HTTP 400 VALIDATION_ERROR', async () => {
        const client = new ApiClient();
        const rand = Math.random().toString(36).substring(2, 6);
        const res = await client.post('/api/v1/auth/register', {
          name: 'Empty Password User',
          username: `nopw_${Date.now()}_${rand}`.toLowerCase(),
          email: `nopw_${Date.now()}_${rand}@example.com`,
          password: '',
        });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
        const failure = readApiFailure({ response: { status: res.status, data: res.data, headers: res.headers } });
        expect(failure.status).toBe(400);
        expect(Array.isArray(res.data.errors)).toBe(true);
      });

      it('F1-B2: Invalid email syntax registration rejected with HTTP 400 VALIDATION_ERROR', async () => {
        const client = new ApiClient();
        const res = await client.post('/api/v1/auth/register', {
          name: 'Invalid Email User',
          username: `badmail_${Date.now()}`.toLowerCase(),
          email: 'not-a-valid-email-address',
          password: 'Password123!',
        });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
        const failure = readApiFailure({ response: { status: res.status, data: res.data, headers: res.headers } });
        expect(failure.status).toBe(400);
      });

      it('F1-B3: Duplicate email registration collision rejected with HTTP 400', async () => {
        const { userReg } = await getActors();
        const client = new ApiClient();
        const res = await client.post('/api/v1/auth/register', {
          name: 'Duplicate Registrant',
          username: `dup_${Date.now()}`.toLowerCase(),
          email: userReg.email,
          password: 'Password123!',
        });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('already registered');
      });

      it('F1-B4: Invalid or expired bearer token rejected with HTTP 401 UNAUTHENTICATED', async () => {
        const client = new ApiClient();
        client.setToken('invalid.jwt.bearer.token.signature');
        const res = await client.get('/api/v1/auth/me');

        expect(res.status).toBe(401);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('Invalid or expired token');
      });

      it('F1-B5: Self-follow attempt strictly rejected with HTTP 400 VALIDATION_ERROR', async () => {
        const { userClient, userReg } = await getActors();
        const res = await userClient.post(`/api/v1/users/${userReg.username}/follow`, {});

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('cannot follow yourself');
      });
    });

    // =========================================================================
    // F2: Quizzes (5 Tests)
    // =========================================================================
    describe('F2: Quizzes', () => {
      it('F2-B1: Quiz creation with whitespace/empty title rejected with HTTP 400 VALIDATION_ERROR', async () => {
        const { userClient } = await getActors();
        const res = await userClient.post('/api/v1/quiz/manual', {
          title: '   ',
          questions: [
            {
              questionText: 'What is 2+2?',
              options: [
                { label: 'A', text: '4', isCorrect: true },
                { label: 'B', text: '5' },
              ],
              correctAnswer: 'A',
            },
          ],
        });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
      });

      it('F2-B2: Multiple-choice question with fewer than 2 options rejected with HTTP 400', async () => {
        const { userClient } = await getActors();
        const res = await userClient.post('/api/v1/quiz/manual', {
          title: 'Single Option Invalid Quiz',
          questions: [
            {
              questionText: 'Question with only one choice?',
              options: [{ label: 'A', text: 'Lonely option', isCorrect: true }],
              correctAnswer: 'A',
            },
          ],
        });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('at least two answer choices');
      });

      it('F2-B3: Non-existent quiz ID lookup returns HTTP 404 RESOURCE_NOT_FOUND', async () => {
        const { userClient } = await getActors();
        const res = await userClient.get('/api/v1/quiz/507f1f77bcf86cd799439011');

        expect(res.status).toBe(404);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('Quiz not found');
      });

      it('F2-B4: Unauthorized quiz modification by non-owner rejected with HTTP 403 FORBIDDEN', async () => {
        const { userClient, strangerClient } = await getActors();

        // Create a valid quiz as user
        const createRes = await userClient.post('/api/v1/quiz/manual', {
          title: 'Quiz for Permission Boundary',
          isDraft: true,
          questions: [
            {
              questionText: 'Is security essential?',
              options: [
                { label: 'A', text: 'Yes', isCorrect: true },
                { label: 'B', text: 'No' },
              ],
              correctAnswer: 'A',
            },
          ],
        });
        expect(createRes.status).toBe(201);
        const quizId = createRes.data.data.quizId;

        // Stranger attempts modification
        const updateRes = await strangerClient.put(`/api/v1/quiz/${quizId}`, {
          title: 'Hacked Title Attempt',
        });

        expect(updateRes.status).toBe(403);
        expect(updateRes.data.success).toBe(false);
        expect(updateRes.data.message).toContain('Not authorized');
      });

      it('F2-B5: Inline data: base64 cover image strictly rejected with HTTP 400 VALIDATION_ERROR', async () => {
        const { userClient } = await getActors();

        const createRes = await userClient.post('/api/v1/quiz/manual', {
          title: 'Quiz for Inline Cover Test',
          isDraft: true,
          questions: [
            {
              questionText: 'Question text?',
              options: [
                { label: 'A', text: '1', isCorrect: true },
                { label: 'B', text: '2' },
              ],
              correctAnswer: 'A',
            },
          ],
        });
        expect(createRes.status).toBe(201);
        const quizId = createRes.data.data.quizId;

        const coverRes = await userClient.post(`/api/v1/quiz/${quizId}/cover`, {
          coverUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        });

        expect(coverRes.status).toBe(400);
        expect(coverRes.data.success).toBe(false);
        expect(coverRes.data.message).toContain('Quiz covers must be uploaded through the media service');
      });
    });

    // =========================================================================
    // F3: Challenges (5 Tests)
    // =========================================================================
    describe('F3: Challenges', () => {
      it('F3-B1: Challenge creation with past deadline rejected with HTTP 400 VALIDATION_ERROR', async () => {
        const { userClient } = await getActors();
        const pastDeadline = new Date(Date.now() - 3600000).toISOString();

        const res = await userClient.post('/api/v1/challenges', {
          title: 'Past Deadline Invalid Challenge',
          durationMinutes: 15,
          deadlineAt: pastDeadline,
          questions: [
            { questionText: 'Q1?', options: ['Option A', 'Option B'], correctOption: 0 },
          ],
        });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('valid timestamp in the future');
      });

      it('F3-B2: Challenge creation with zero duration minutes rejected with HTTP 400 VALIDATION_ERROR', async () => {
        const { userClient } = await getActors();
        const futureDeadline = new Date(Date.now() + 3600000).toISOString();

        const res = await userClient.post('/api/v1/challenges', {
          title: 'Zero Duration Invalid Challenge',
          durationMinutes: 0,
          deadlineAt: futureDeadline,
          questions: [
            { questionText: 'Q1?', options: ['Option A', 'Option B'], correctOption: 0 },
          ],
        });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('valid duration in minutes');
      });

      it('F3-B3: Challenge creation with title < 3 characters rejected with HTTP 400 VALIDATION_ERROR', async () => {
        const { userClient } = await getActors();
        const futureDeadline = new Date(Date.now() + 3600000).toISOString();

        const res = await userClient.post('/api/v1/challenges', {
          title: 'AB',
          durationMinutes: 10,
          deadlineAt: futureDeadline,
          questions: [
            { questionText: 'Q1?', options: ['Option A', 'Option B'], correctOption: 0 },
          ],
        });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('Challenge title must be at least 3 characters');
      });

      it('F3-B4: Non-existent challenge ID lookup rejected with HTTP 404 RESOURCE_NOT_FOUND', async () => {
        const { userClient } = await getActors();
        const res = await userClient.get('/api/v1/challenges/507f1f77bcf86cd799439011');

        expect(res.status).toBe(404);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('Challenge not found');
      });

      it('F3-B5: Active challenge leaderboard enforces quarantine concealing standings (LeaderboardResponse)', async () => {
        const { userClient } = await getActors();
        const futureDeadline = new Date(Date.now() + 7200000).toISOString();

        const chRes = await userClient.post('/api/v1/challenges', {
          title: 'Quarantine Verification Arena',
          durationMinutes: 15,
          deadlineAt: futureDeadline,
          questions: [
            { questionText: 'Question in Quarantine?', options: ['Yes', 'No'], correctOption: 0 },
          ],
        });
        expect(chRes.status).toBe(201);
        const challengeId = chRes.data.data.challengeId;

        const lbRes = await userClient.get(`/api/v1/challenges/${challengeId}/leaderboard`);
        expect(lbRes.status).toBe(200);
        expect(lbRes.data.success).toBe(true);

        // Validate contracts schema
        const parsed = LeaderboardResponse.safeParse(lbRes.data);
        expect(parsed.success).toBe(true);
        expect(lbRes.data.data.quarantined).toBe(true);
        expect(lbRes.data.data.leaderboard.length).toBe(0);
        expect(lbRes.data.data.message).toContain('quarantined');
      });
    });

    // =========================================================================
    // F4: Attempts (5 Tests)
    // =========================================================================
    describe('F4: Attempts', () => {
      it('F4-B1: Mutating answers on completed attempt rejected with HTTP 400', async () => {
        const { userClient, strangerClient } = await getActors();

        // Create and publish a test quiz
        const qRes = await userClient.post('/api/v1/quiz/manual', {
          title: 'Attempt Mutation Test Quiz',
          questions: [
            {
              questionText: '10 + 10?',
              options: [
                { label: 'A', text: '20', isCorrect: true },
                { label: 'B', text: '30' },
              ],
              correctAnswer: 'A',
            },
          ],
        });
        expect(qRes.status).toBe(201);
        const quizId = qRes.data.data.quizId;
        await userClient.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' });

        // Start attempt and submit
        const startRes = await strangerClient.post('/api/v1/attempts/start', { quizId });
        expect(startRes.status).toBe(201);
        const attemptId = startRes.data.data.attempt._id;
        const qId = startRes.data.data.attempt.answers[0].questionId;

        const subRes = await strangerClient.post(`/api/v1/attempts/${attemptId}/submit`, {});
        expect(subRes.status).toBe(200);

        // Attempt to answer after completion
        const answerRes = await strangerClient.post(`/api/v1/attempts/${attemptId}/answer`, {
          questionId: qId,
          selectedOption: 'A',
        });

        expect(answerRes.status).toBe(400);
        expect(answerRes.data.success).toBe(false);
        expect(answerRes.data.message).toContain('Attempt is no longer in progress');
      });

      it('F4-B2: Non-existent quiz attempt start rejected with HTTP 404 RESOURCE_NOT_FOUND', async () => {
        const { userClient } = await getActors();
        const res = await userClient.post('/api/v1/attempts/start', {
          quizId: '507f1f77bcf86cd799439011',
        });

        expect(res.status).toBe(404);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('Quiz not found');
      });

      it('F4-B3: Invalid answer submission missing required questionId rejected with HTTP 400', async () => {
        const { userClient } = await getActors();

        // Create and publish quiz
        const qRes = await userClient.post('/api/v1/quiz/manual', {
          title: 'Invalid Answer Format Test Quiz',
          questions: [
            {
              questionText: 'Test question?',
              options: [
                { label: 'A', text: 'Yes', isCorrect: true },
                { label: 'B', text: 'No' },
              ],
              correctAnswer: 'A',
            },
          ],
        });
        expect(qRes.status).toBe(201);
        const quizId = qRes.data.data.quizId;
        await userClient.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' });

        const startRes = await userClient.post('/api/v1/attempts/start', { quizId });
        expect(startRes.status).toBe(201);
        const attemptId = startRes.data.data.attempt._id;

        // Omit questionId
        const ansRes = await userClient.post(`/api/v1/attempts/${attemptId}/answer`, {
          selectedOption: 'A',
        });

        expect(ansRes.status).toBe(400);
        expect(ansRes.data.success).toBe(false);
        expect(ansRes.data.message).toContain('questionId is required');
      });

      it('F4-B4: Syncing progress on completed attempt rejected with HTTP 400', async () => {
        const { userClient } = await getActors();

        // Create and publish quiz
        const qRes = await userClient.post('/api/v1/quiz/manual', {
          title: 'Sync Progress Boundary Quiz',
          questions: [
            {
              questionText: 'Select option A',
              options: [
                { label: 'A', text: 'Choice A', isCorrect: true },
                { label: 'B', text: 'Choice B' },
              ],
              correctAnswer: 'A',
            },
          ],
        });
        expect(qRes.status).toBe(201);
        const quizId = qRes.data.data.quizId;
        await userClient.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' });

        const startRes = await userClient.post('/api/v1/attempts/start', { quizId });
        expect(startRes.status).toBe(201);
        const attemptId = startRes.data.data.attempt._id;

        // Complete attempt
        await userClient.post(`/api/v1/attempts/${attemptId}/submit`, {});

        // Attempt progress sync
        const syncRes = await userClient.put(`/api/v1/quiz/${quizId}/attempt/${attemptId}/sync-progress`, {
          questionStates: [],
        });

        expect(syncRes.status).toBe(400);
        expect(syncRes.data.success).toBe(false);
        expect(syncRes.data.message).toContain('Attempt is no longer in progress');
      });

      it('F4-B5: Starting attempt on unstarted/draft quiz by stranger rejected with HTTP 403', async () => {
        const { userClient, strangerClient } = await getActors();

        // Create draft quiz (unpublished)
        const draftRes = await userClient.post('/api/v1/quiz/manual', {
          title: 'Unpublished Draft Quiz',
          isDraft: true,
          questions: [
            {
              questionText: 'Private draft question?',
              options: [
                { label: 'A', text: 'Draft A', isCorrect: true },
                { label: 'B', text: 'Draft B' },
              ],
              correctAnswer: 'A',
            },
          ],
        });
        expect(draftRes.status).toBe(201);
        const draftQuizId = draftRes.data.data.quizId;

        // Stranger attempts to start draft attempt
        const startRes = await strangerClient.post('/api/v1/attempts/start', {
          quizId: draftQuizId,
        });

        expect(startRes.status).toBe(403);
        expect(startRes.data.success).toBe(false);
        expect(startRes.data.message).toContain('Not authorized to view this quiz');
      });
    });

    // =========================================================================
    // F5: Results & Analytics (5 Tests)
    // =========================================================================
    describe('F5: Results & Analytics', () => {
      it('F5-B1: Stranger accessing private attempt result rejected with HTTP 403 FORBIDDEN', async () => {
        const { userClient, strangerClient } = await getActors();

        // Create and publish quiz
        const qRes = await userClient.post('/api/v1/quiz/manual', {
          title: 'Result Privacy Quiz',
          questions: [
            {
              questionText: 'Privacy test?',
              options: [
                { label: 'A', text: 'Private', isCorrect: true },
                { label: 'B', text: 'Public' },
              ],
              correctAnswer: 'A',
            },
          ],
        });
        expect(qRes.status).toBe(201);
        const quizId = qRes.data.data.quizId;
        await userClient.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' });

        const startRes = await userClient.post('/api/v1/attempts/start', { quizId });
        expect(startRes.status).toBe(201);
        const attemptId = startRes.data.data.attempt._id;
        await userClient.post(`/api/v1/attempts/${attemptId}/submit`, {});

        // Stranger attempts to view user's attempt result
        const resultRes = await strangerClient.get(`/api/v1/attempts/${attemptId}/result`);

        expect(resultRes.status).toBe(403);
        expect(resultRes.data.success).toBe(false);
        expect(resultRes.data.message).toContain('Not authorized to view this attempt');
      });

      it('F5-B2: Active quarantine conceals challenge answer keys and scores from participants', async () => {
        const { userClient, strangerClient } = await getActors();

        // Create active challenge
        const chRes = await userClient.post('/api/v1/challenges', {
          title: 'Results Quarantine Arena',
          durationMinutes: 10,
          deadlineAt: new Date(Date.now() + 7200000).toISOString(),
          questions: [
            { questionText: 'Quarantined question?', options: ['Option 1', 'Option 2'], correctOption: 0 },
          ],
        });
        expect(chRes.status).toBe(201);
        const challengeId = chRes.data.data.challengeId;

        // Stranger starts and submits challenge attempt
        const startRes = await strangerClient.post('/api/v1/attempts/start', { quizId: challengeId });
        expect(startRes.status).toBe(201);
        const chAttemptId = startRes.data.data.attempt._id;
        await strangerClient.post(`/api/v1/attempts/${chAttemptId}/submit`, {});

        // Query result during active quarantine
        const resultRes = await strangerClient.get(`/api/v1/attempts/${chAttemptId}/result`);
        expect(resultRes.status).toBe(200);
        expect(resultRes.data.success).toBe(true);

        // Score must be sealed (null) and questions list empty
        expect(resultRes.data.data.attempt.score).toBeNull();
        expect(resultRes.data.data.allowReview).toBe(false);
        expect(resultRes.data.data.deadlinePassed).toBe(false);
        expect(resultRes.data.data.questions.length).toBe(0);
      });

      it('F5-B3: Non-existent attempt result lookup rejected with HTTP 404 RESOURCE_NOT_FOUND', async () => {
        const { userClient } = await getActors();
        const res = await userClient.get('/api/v1/attempts/507f1f77bcf86cd799439011/result');

        expect(res.status).toBe(404);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('Attempt not found');
      });

      it('F5-B4: Unauthenticated attempt result access rejected with HTTP 401 UNAUTHENTICATED', async () => {
        const { userClient, guestClient } = await getActors();

        // Create and publish quiz
        const qRes = await userClient.post('/api/v1/quiz/manual', {
          title: 'Guest Result Rejection Quiz',
          questions: [
            {
              questionText: 'Guest access?',
              options: [
                { label: 'A', text: 'No', isCorrect: true },
                { label: 'B', text: 'Yes' },
              ],
              correctAnswer: 'A',
            },
          ],
        });
        expect(qRes.status).toBe(201);
        const quizId = qRes.data.data.quizId;
        await userClient.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' });

        const startRes = await userClient.post('/api/v1/attempts/start', { quizId });
        expect(startRes.status).toBe(201);
        const attemptId = startRes.data.data.attempt._id;
        await userClient.post(`/api/v1/attempts/${attemptId}/submit`, {});

        // Guest attempts to view result
        const guestRes = await guestClient.get(`/api/v1/attempts/${attemptId}/result`);

        expect(guestRes.status).toBe(401);
        expect(guestRes.data.success).toBe(false);
        expect(guestRes.data.message).toContain('Not authorized to view this attempt');
      });

      it('F5-B5: Unauthorized attempt review access rejected with HTTP 403 FORBIDDEN', async () => {
        const { userClient, strangerClient } = await getActors();

        const qRes = await userClient.post('/api/v1/quiz/manual', {
          title: 'Review Protection Quiz',
          questions: [
            {
              questionText: 'Protected review question?',
              options: [
                { label: 'A', text: 'Ans 1', isCorrect: true },
                { label: 'B', text: 'Ans 2' },
              ],
              correctAnswer: 'A',
            },
          ],
        });
        expect(qRes.status).toBe(201);
        const quizId = qRes.data.data.quizId;
        await userClient.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' });

        const startRes = await userClient.post('/api/v1/attempts/start', { quizId });
        expect(startRes.status).toBe(201);
        const attemptId = startRes.data.data.attempt._id;

        const revRes = await strangerClient.get(`/api/v1/attempts/${attemptId}/review`);

        expect(revRes.status).toBe(403);
        expect(revRes.data.success).toBe(false);
        expect(revRes.data.message).toContain('Not authorized to view this attempt');
      });
    });

    // =========================================================================
    // F6: Media & Parser Defense (5 Tests)
    // =========================================================================
    describe('F6: Media & Parser Ingestion Defense', () => {
      it('F6-B1: Asset initiation exceeding storage limit rejected with HTTP 400/403', async () => {
        const { userClient } = await getActors();

        // 10 GB source size exceeds creator quota
        const res = await userClient.post('/api/v1/media/assets/initiate', {
          kind: 'document',
          originalName: 'gigantic-document.pdf',
          sourceMimeType: 'application/pdf',
          sourceSize: 10 * 1024 * 1024 * 1024,
        });

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.data.success).toBe(false);
      });

      it('F6-B2: Path traversal with null byte (%00) in URL trapped by Gateway with HTTP 400 GatewayError', async () => {
        const { guestClient } = await getActors();
        const res = await guestClient.get('/api/v1/upload?filename=%00../../etc/passwd');

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);

        // Validates GatewayError Zod schema contract
        const parsed = GatewayError.safeParse(res.data);
        expect(parsed.success).toBe(true);
        expect(res.data.error.code).toBe('VALIDATION_ERROR');
        expect(res.data.message).toContain('null byte detected in path');
      });

      it('F6-B3: Non-printable control characters in path trapped by Gateway with HTTP 400 GatewayError', async () => {
        const { guestClient } = await getActors();
        const res = await guestClient.get('/api/v1/upload%07');

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);

        // Validates GatewayError Zod schema contract
        const parsed = GatewayError.safeParse(res.data);
        expect(parsed.success).toBe(true);
        expect(res.data.error.code).toBe('VALIDATION_ERROR');
        expect(res.data.message).toContain('control character detected in path');
      });

      it('F6-B4: Empty media image upload without file payload rejected with HTTP 400', async () => {
        const { userClient } = await getActors();
        const res = await userClient.post('/api/v1/media/images', {});

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('Image file is required');
      });

      it('F6-B5: Insecure non-HTTPS URL protocol rejected with HTTP 400 VALIDATION_ERROR', async () => {
        const { userClient } = await getActors();
        const res = await userClient.post('/api/v1/media/validate-url', {
          url: 'file:///etc/passwd',
        });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('public HTTPS image URL');
      });
    });

    // =========================================================================
    // F7: Social & Communications (5 Tests)
    // =========================================================================
    describe('F7: Social & Communications', () => {
      it('F7-B1: Empty comment body on quiz rejected with HTTP 400 VALIDATION_ERROR', async () => {
        const { userClient } = await getActors();

        const qRes = await userClient.post('/api/v1/quiz/manual', {
          title: 'Empty Comment Quiz',
          questions: [
            {
              questionText: 'Comment question?',
              options: [
                { label: 'A', text: '1', isCorrect: true },
                { label: 'B', text: '2' },
              ],
              correctAnswer: 'A',
            },
          ],
        });
        expect(qRes.status).toBe(201);
        const quizId = qRes.data.data.quizId;
        await userClient.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' });

        const res = await userClient.post(`/api/v1/social/quizzes/${quizId}/comments`, {
          content: '   ',
        });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('Comment cannot be empty');
      });

      it('F7-B2: Comment exceeding 1000 characters rejected with HTTP 400 VALIDATION_ERROR', async () => {
        const { userClient } = await getActors();

        const qRes = await userClient.post('/api/v1/quiz/manual', {
          title: 'Long Comment Quiz',
          questions: [
            {
              questionText: 'Long comment question?',
              options: [
                { label: 'A', text: '1', isCorrect: true },
                { label: 'B', text: '2' },
              ],
              correctAnswer: 'A',
            },
          ],
        });
        expect(qRes.status).toBe(201);
        const quizId = qRes.data.data.quizId;
        await userClient.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' });

        const res = await userClient.post(`/api/v1/social/quizzes/${quizId}/comments`, {
          content: 'X'.repeat(1001),
        });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('Comment must be at most 1000 characters');
      });

      it('F7-B3: Direct message to non-existent recipient ID rejected with HTTP 404 RESOURCE_NOT_FOUND', async () => {
        const { userClient } = await getActors();
        const res = await userClient.post('/api/v1/messages/start', {
          recipientId: '507f1f77bcf86cd799439011',
        });

        expect(res.status).toBe(404);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('Recipient user not found');
      });

      it('F7-B4: Liking a non-existent quiz rejected with HTTP 404 RESOURCE_NOT_FOUND', async () => {
        const { userClient } = await getActors();
        const res = await userClient.post('/api/v1/social/quizzes/507f1f77bcf86cd799439011/like', {});

        expect(res.status).toBe(404);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('Quiz not found');
      });

      it('F7-B5: Private profile content concealed from non-followers (requiresFollow enforcement)', async () => {
        const { strangerClient } = await getActors();

        // Register a distinct user whose profile is set to private
        const privClient = new ApiClient();
        const privUser = await privClient.registerTestUser('t2_priv');

        await privClient.patch('/api/v1/auth/me', {
          isProfilePublic: false,
          isPrivate: true,
        });

        // Stranger attempts to view private user's quizzes
        const res = await strangerClient.get(`/api/v1/users/${privUser.username}/quizzes`);

        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.data.quizzes.length).toBe(0);
        expect(res.data.data.isPrivate).toBe(true);
        expect(res.data.data.requiresFollow).toBe(true);
      });
    });

    // =========================================================================
    // F8: Admin Control Center & Operations (5 Tests)
    // =========================================================================
    describe('F8: Admin Control Center & Operations', () => {
      it('F8-B1: Non-admin regular user accessing admin routes rejected with HTTP 403 FORBIDDEN', async () => {
        const { userClient } = await getActors();
        const res = await userClient.get('/api/v1/admin/overview');

        expect(res.status).toBe(403);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('Access denied');
      });

      it('F8-B2: Unauthenticated client accessing admin routes rejected with HTTP 401 UNAUTHENTICATED', async () => {
        const { guestClient } = await getActors();
        const res = await guestClient.get('/api/v1/admin/overview');

        expect(res.status).toBe(401);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('Authentication required');
      });

      it('F8-B3: Moderation report submission with invalid targetType rejected with HTTP 400 VALIDATION_ERROR', async () => {
        const { userClient } = await getActors();
        const res = await userClient.post('/api/v1/admin/reports/submit', {
          targetType: 'unsupported_entity_type',
          targetId: '507f1f77bcf86cd799439011',
          reason: 'Test spam report with invalid target type',
        });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('Invalid targetType');
      });

      it('F8-B4: Resolving non-existent moderation report ID rejected with HTTP 404 RESOURCE_NOT_FOUND', async () => {
        const adminClient = await authenticateTestAdmin();
        const res = await adminClient.post('/api/v1/admin/reports/507f1f77bcf86cd799439011/resolve', {
          status: 'action_taken',
          action: 'none',
          notes: 'Testing non-existent report ID',
        });

        expect(res.status).toBe(404);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('Report not found');
      });

      it('F8-B5: Admin user suspension without mandatory operational reason rejected with HTTP 400 VALIDATION_ERROR', async () => {
        const { userReg } = await getActors();
        const adminClient = await authenticateTestAdmin();
        const res = await adminClient.post(`/api/v1/admin/users/${userReg.userId}/suspend`, {
          reason: '   ',
        });

        expect(res.status).toBe(400);
        expect(res.data.success).toBe(false);
        expect(res.data.message).toContain('valid operational reason is required');
      });
    });

  });
}

// Auto-register when imported by runner.js or executed directly
if (process.argv[1]?.endsWith('tier2-boundary-corner.test.js') || process.argv[1]?.endsWith('runner.js')) {
  registerTier2Tests();
}
