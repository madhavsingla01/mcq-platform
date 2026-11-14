/**
 * QuizFocus E2E Test Suite — Tier 3: Cross-Feature Combinations (Pairwise Integration)
 * Strictly OPAQUE-BOX: Interacts exclusively via public HTTP/REST endpoints against API Gateway.
 * Zero internal Mongoose model imports or database queries.
 * Validates external payloads against @quizfocus/contracts Zod schemas.
 * Authoritative source: ORIGINAL_REQUEST.md, PROJECT.md, and TEST_INFRA.md.
 */

import {
  describe as runnerDescribe,
  it as runnerIt,
  expect as runnerExpect,
} from './helpers/runner-core.js';
import { ApiClient, authenticateTestAdmin } from './helpers/api-client.js';
import {
  QuizSummary,
  ChallengeSummary,
  AttemptSummary,
  AttemptResultSummary,
  LeaderboardResponse,
  CurrentUserResponse,
} from '../../contracts/dist/v1/domain.js';
import { ValidatedImageUrlResponse } from '../../contracts/dist/v1/media.js';

import { clip, uploadFixture } from '../fixtures/media/samples.mjs';

export function registerTier3Tests({
  describe = runnerDescribe,
  it = runnerIt,
  expect = runnerExpect,
} = {}) {
  describe('Tier 3: Cross-Feature Combinations (Pairwise Integration)', () => {

    // =========================================================================
    // T3-1: Auth <-> Quiz Integration
    // =========================================================================
    it('T3-1: Auth <-> Quiz (register creator -> create & publish quiz -> verify profile shows quiz)', async () => {
      const creator = new ApiClient();
      const c = await creator.registerTestUser('t3_1_creator');
      expect(c.userId).toBeDefined();

      // Verify Authenticated User Contract
      const meRes = await creator.get('/api/v1/auth/me');
      expect(meRes.status).toBe(200);
      const parsedUser = CurrentUserResponse.safeParse(meRes.data);
      expect(parsedUser.success).toBe(true);

      // Create Quiz Draft
      const draftRes = await creator.post('/api/v1/quiz/manual', {
        title: 'T3-1 Auth-Quiz Linked Test',
        isDraft: true,
        questions: [
          {
            questionText: 'What is the base currency for transactions?',
            questionType: 'multiple_choice',
            options: [
              { label: 'A', text: 'Credits', isCorrect: true },
              { label: 'B', text: 'Points' },
            ],
            correctAnswer: 'A',
            marks: 1,
          },
        ],
      });
      expect(draftRes.status).toBe(201);
      const quizId = draftRes.data.data.quizId;
      expect(quizId).toBeDefined();

      // Publish Quiz
      const pubRes = await creator.post(`/api/v1/quiz/drafts/${quizId}/publish`, {
        visibility: 'public',
      });
      expect(pubRes.status).toBe(200);
      const parsedQuiz = QuizSummary.safeParse(pubRes.data.data.quiz);
      expect(parsedQuiz.success).toBe(true);
      expect(parsedQuiz.data._id).toBe(quizId);

      // Verify Creator Public Profile lists published quiz
      const profileQuizzes = await creator.get(`/api/v1/users/${c.username}/quizzes`);
      expect(profileQuizzes.status).toBe(200);
      expect(profileQuizzes.data.success).toBe(true);
      const quizzesList = profileQuizzes.data.data.quizzes || [];
      const found = quizzesList.some((q) => q._id === quizId);
      expect(found).toBe(true);
    });

    // =========================================================================
    // T3-2: Auth <-> Attempt Integration
    // =========================================================================
    it('T3-2: Auth <-> Attempt (register student -> start attempt -> verify student ID and user metadata correctly linked)', async () => {
      const creator = new ApiClient();
      await creator.registerTestUser('t3_2_creator');

      const draftRes = await creator.post('/api/v1/quiz/manual', {
        title: 'T3-2 Attempt Metadata Quiz',
        isDraft: true,
        questions: [
          {
            questionText: 'Is QuizFocus built with TypeScript?',
            questionType: 'multiple_choice',
            options: [
              { label: 'A', text: 'Yes', isCorrect: true },
              { label: 'B', text: 'No' },
            ],
            correctAnswer: 'A',
            marks: 1,
          },
        ],
      });
      const quizId = draftRes.data.data.quizId;
      await creator.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' });

      // Register independent student
      const student = new ApiClient();
      const s = await student.registerTestUser('t3_2_student');

      // Start Attempt
      const startRes = await student.post('/api/v1/attempts/start', { quizId });
      expect(startRes.status).toBe(201);
      const attempt = startRes.data.data.attempt;

      // Validate AttemptSummary schema
      const parsedAttempt = AttemptSummary.safeParse(attempt);
      expect(parsedAttempt.success).toBe(true);
      expect(attempt.userId).toBe(s.userId);
      expect(attempt.status).toBe('in_progress');
      expect(attempt.answers.length).toBe(1);
    });

    // =========================================================================
    // T3-3: Quiz <-> Attempt <-> Scoring Integration
    // =========================================================================
    it('T3-3: Quiz <-> Attempt <-> Scoring (create quiz -> student answers correct/incorrect -> verify calculated score matches percentage)', async () => {
      const creator = new ApiClient();
      await creator.registerTestUser('t3_3_creator');

      // Create a 2-question quiz (2 marks each, total 4 marks)
      const draftRes = await creator.post('/api/v1/quiz/manual', {
        title: 'T3-3 Scoring Verification Quiz',
        isDraft: true,
        questions: [
          {
            questionText: 'Select Option Alpha',
            questionType: 'multiple_choice',
            options: [
              { label: 'A', text: 'Alpha', isCorrect: true },
              { label: 'B', text: 'Beta' },
            ],
            correctAnswer: 'A',
            marks: 2,
          },
          {
            questionText: 'Select Option Delta',
            questionType: 'multiple_choice',
            options: [
              { label: 'A', text: 'Gamma' },
              { label: 'B', text: 'Delta', isCorrect: true },
            ],
            correctAnswer: 'B',
            marks: 2,
          },
        ],
      });
      const quizId = draftRes.data.data.quizId;
      await creator.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' });

      const student = new ApiClient();
      await student.registerTestUser('t3_3_student');

      const startRes = await student.post('/api/v1/attempts/start', { quizId });
      const attempt = startRes.data.data.attempt;
      const q1Id = attempt.answers[0].questionId;
      const q2Id = attempt.answers[1].questionId;

      // Answer Q1 correctly ('A') and Q2 incorrectly ('A')
      const syncRes = await student.put(
        `/api/v1/quiz/${quizId}/attempt/${attempt._id}/sync-progress`,
        {
          questionStates: [
            { questionId: q1Id, selectedAnswer: 'A' },
            { questionId: q2Id, selectedAnswer: 'A' },
          ],
        }
      );
      expect(syncRes.status).toBe(200);

      // Submit attempt
      const submitRes = await student.put(
        `/api/v1/quiz/${quizId}/attempt/${attempt._id}`,
        {}
      );
      expect(submitRes.status).toBe(200);
      const submittedAttempt = submitRes.data.data.attempt;

      expect(submittedAttempt.status).toBe('completed');
      expect(submittedAttempt.score).toBe(2);
      expect(submittedAttempt.totalMarks).toBe(4);
      expect(submittedAttempt.percentage).toBe(50);
      expect(submittedAttempt.correctCount).toBe(1);
      expect(submittedAttempt.wrongCount).toBe(1);

      // Verify Score Immutability Invariant: repeated submission retains original score
      const resubmitRes = await student.put(
        `/api/v1/quiz/${quizId}/attempt/${attempt._id}`,
        {}
      );
      expect(resubmitRes.status).toBe(200);
      expect(resubmitRes.data.data.score).toBe(2);
    });

    // =========================================================================
    // T3-4: Challenge <-> Attempt <-> Leaderboard Integration
    // =========================================================================
    it('T3-4: Challenge <-> Attempt <-> Leaderboard (create challenge -> multiple students attempt -> verify leaderboard ranks higher score / faster time)', async () => {
      const host = new ApiClient();
      await host.registerTestUser('t3_4_host');

      // Pre-register both competitors to avoid race conditions against deadline
      const s1 = new ApiClient();
      await s1.registerTestUser('t3_4_s1');
      const s2 = new ApiClient();
      await s2.registerTestUser('t3_4_s2');

      // Create challenge with near deadline (3.5 seconds)
      const deadlineIso = new Date(Date.now() + 3500).toISOString();
      const chRes = await host.post('/api/v1/challenges', {
        title: 'T3-4 Speed & Score Arena',
        durationMinutes: 5,
        deadlineAt: deadlineIso,
        questions: [
          { questionText: 'Is 10 greater than 5?', options: ['Yes', 'No'], correctOption: 0 },
        ],
      });
      expect(chRes.status).toBe(201);
      const challengeId = chRes.data.data.challengeId;

      // Student 1 (Correct answer)
      const a1 = await s1.post(`/api/v1/quiz/${challengeId}/attempt`, {});
      expect(a1.status).toBe(201);
      const a1Id = a1.data.data.attempt._id;
      const q1Id = a1.data.data.attempt.answers[0].questionId;
      await s1.put(`/api/v1/quiz/${challengeId}/attempt/${a1Id}/sync-progress`, {
        questionStates: [{ questionId: q1Id, selectedAnswer: 'Yes' }],
      });
      await s1.put(`/api/v1/quiz/${challengeId}/attempt/${a1Id}`, {});

      // Student 2 (Incorrect answer)
      const a2 = await s2.post(`/api/v1/quiz/${challengeId}/attempt`, {});
      expect(a2.status).toBe(201);
      const a2Id = a2.data.data.attempt._id;
      const q2Id = a2.data.data.attempt.answers[0].questionId;
      await s2.put(`/api/v1/quiz/${challengeId}/attempt/${a2Id}/sync-progress`, {
        questionStates: [{ questionId: q2Id, selectedAnswer: 'No' }],
      });
      await s2.put(`/api/v1/quiz/${challengeId}/attempt/${a2Id}`, {});

      // Wait for deadline to elapse
      const waitMs = Math.max(500, new Date(deadlineIso).getTime() - Date.now() + 500);
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      // Leaderboard inspection
      const lbRes = await s1.get(`/api/v1/challenges/${challengeId}/leaderboard`);
      expect(lbRes.status).toBe(200);
      const parsedLb = LeaderboardResponse.safeParse(lbRes.data);
      expect(parsedLb.success).toBe(true);
      expect(lbRes.data.data.quarantined).toBe(false);

      const rows = lbRes.data.data.leaderboard;
      expect(rows.length).toBeGreaterThanOrEqual(2);

      const r1 = rows.find((r) => r.rank === 1);
      const r2 = rows.find((r) => r.rank === 2);
      expect(r1).toBeDefined();
      expect(r2).toBeDefined();
      expect(r1.score >= r2.score).toBe(true);
    });

    // =========================================================================
    // T3-5: Challenge <-> Quarantine <-> Results Integration
    // =========================================================================
    it('T3-5: Challenge <-> Quarantine <-> Results (challenge before deadline -> attempt results hide answers & explanations -> verify quarantined flag)', async () => {
      const host = new ApiClient();
      await host.registerTestUser('t3_5_host');

      // Create challenge with far future deadline (10 minutes)
      const farDeadline = new Date(Date.now() + 600000).toISOString();
      const chRes = await host.post('/api/v1/challenges', {
        title: 'T3-5 Active Quarantine Arena',
        durationMinutes: 10,
        deadlineAt: farDeadline,
        questions: [
          { questionText: 'Secret competition question', options: ['A', 'B'], correctOption: 0 },
        ],
      });
      const challengeId = chRes.data.data.challengeId;

      const student = new ApiClient();
      await student.registerTestUser('t3_5_student');

      const startRes = await student.post(`/api/v1/quiz/${challengeId}/attempt`, {});
      const attemptId = startRes.data.data.attempt._id;
      const qId = startRes.data.data.attempt.answers[0].questionId;

      await student.put(`/api/v1/quiz/${challengeId}/attempt/${attemptId}/sync-progress`, {
        questionStates: [{ questionId: qId, selectedAnswer: 'A' }],
      });
      const submitRes = await student.put(`/api/v1/quiz/${challengeId}/attempt/${attemptId}`, {});
      expect(submitRes.status).toBe(200);
      expect(submitRes.data.data.score).toBeNull();

      // Verify Quarantine on Leaderboard
      const lbRes = await student.get(`/api/v1/challenges/${challengeId}/leaderboard`);
      expect(lbRes.status).toBe(200);
      expect(lbRes.data.data.quarantined).toBe(true);
      expect(lbRes.data.data.leaderboard.length).toBe(0);
      expect(lbRes.data.data.viewerSubmission.kind).toBe('ranked');

      // Verify Attempt Results Concealment
      const resultRes = await student.get(`/api/v1/attempts/${attemptId}/result`);
      expect(resultRes.status).toBe(200);
      const parsedResult = AttemptResultSummary.safeParse(resultRes.data.data);
      expect(parsedResult.success).toBe(true);
      expect(resultRes.data.data.isChallenge).toBe(true);
      expect(resultRes.data.data.deadlinePassed).toBe(false);
      expect(resultRes.data.data.allowReview).toBe(false);
      expect(resultRes.data.data.attempt.score).toBeNull();
    });

    // =========================================================================
    // T3-6: Media <-> Quiz Integration
    // =========================================================================
    it('T3-6: Media <-> Quiz (upload media asset -> link asset in question -> retrieve quiz and verify asset format)', async () => {
      const educator = new ApiClient();
      await educator.registerTestUser('t3_6_educator');

      // Step 1: Validate Secure Remote Diagram Asset URL
      const mediaRes = await educator.post('/api/v1/media/validate-url', {
        url: 'https://example.com/diagrams/cell-mitosis.png',
      });
      expect(mediaRes.status).toBe(200);
      const parsedMedia = ValidatedImageUrlResponse.safeParse(mediaRes.data);
      expect(parsedMedia.success).toBe(true);
      expect(parsedMedia.data.data.valid).toBe(true);

      // Step 2: Educational Asset Ingestion Initialization
      const initRes = await educator.post('/api/v1/media/assets/initiate', {
        filename: 'mitosis-guide.pdf',
        mimeType: 'application/pdf',
        fileSize: 4096,
        purpose: 'educational-resource',
      });
      expect(initRes.status).toBe(201);
      expect(initRes.data.data.assetId).toBeDefined();

      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQokWP4n81AEmIY1ZA9Gkr/h2vSAABylWoQ952ytgAAAABJRU5ErkJggg==', 'base64');
      const asset = await uploadFixture(educator, 'diagram.png', { kind: 'image', bytes: png });
      expect(asset.status).toBe(201);

      // Step 3: Author a quiz with a service-owned asset and a text alternative.
      const draftRes = await educator.post('/api/v1/quiz/manual', {
        title: 'T3-6 Biology Media Quiz',
        isDraft: true,
        questions: [
          {
            questionText: 'Identify the cell phase shown in the linked reference.',
            questionType: 'multiple_choice',
            options: [
              { label: 'A', text: 'Anaphase', isCorrect: true },
              { label: 'B', text: 'Telophase' },
            ],
            correctAnswer: 'A',
            marks: 1,
            accessibilityMedia: [
              clip('image', asset.data.data.asset._id, 'Cell diagram', 'A diagram illustrating cell division.'),
            ],
          },
        ],
      });
      expect(draftRes.status).toBe(201);
      const quizId = draftRes.data.data.quizId;
      await educator.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' }, { expectedStatus: 200 });

      // Step 4: Retrieve Quiz and Verify Domain Contract
      const getRes = await educator.get(`/api/v1/quiz/${quizId}`);
      expect(getRes.status).toBe(200);
      const parsedQuiz = QuizSummary.safeParse(getRes.data.data.quiz);
      expect(parsedQuiz.success).toBe(true);
    });

    // =========================================================================
    // T3-7: Social <-> Quiz Integration
    // =========================================================================
    it('T3-7: Social <-> Quiz (publish quiz -> student bookmarks/likes quiz -> verify social count & bookmark list)', async () => {
      const author = new ApiClient();
      await author.registerTestUser('t3_7_author');

      const draftRes = await author.post('/api/v1/quiz/manual', {
        title: 'T3-7 Social Engagement Quiz',
        isDraft: true,
        questions: [
          {
            questionText: 'Do bookmarks persist across sessions?',
            questionType: 'multiple_choice',
            options: [
              { label: 'A', text: 'Yes', isCorrect: true },
              { label: 'B', text: 'No' },
            ],
            correctAnswer: 'A',
            marks: 1,
          },
        ],
      });
      const quizId = draftRes.data.data.quizId;
      await author.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' });

      const student = new ApiClient();
      await student.registerTestUser('t3_7_student');

      // Bookmark Quiz
      const bmRes = await student.post(`/api/v1/social/quizzes/${quizId}/bookmark`, {});
      expect(bmRes.status).toBe(200);
      expect(bmRes.data.data.quiz.bookmarkCount).toBe(1);

      // Like Quiz
      const likeRes = await student.post(`/api/v1/social/quizzes/${quizId}/like`, {});
      expect(likeRes.status).toBe(200);
      expect(likeRes.data.data.quiz.likeCount).toBe(1);

      // Verify Querying Bookmarks includes the quiz
      const bookmarksRes = await student.get('/api/v1/social/bookmarks');
      expect(bookmarksRes.status).toBe(200);
      const quizzes = bookmarksRes.data.data.quizzes || [];
      const found = quizzes.some((q) => q._id === quizId);
      expect(found).toBe(true);
    });

    // =========================================================================
    // T3-8: Social <-> Admin Moderation Integration
    // =========================================================================
    it('T3-8: Social <-> Admin (create post/comment -> second user flags moderation report -> admin resolves -> post is hidden/removed)', async () => {
      const creator = new ApiClient();
      await creator.registerTestUser('t3_8_creator');

      const draftRes = await creator.post('/api/v1/quiz/manual', {
        title: 'T3-8 Moderation Content Quiz',
        isDraft: true,
        questions: [
          {
            questionText: 'Content under community review',
            questionType: 'multiple_choice',
            options: [
              { label: 'A', text: 'Acceptable', isCorrect: true },
              { label: 'B', text: 'Flagged' },
            ],
            correctAnswer: 'A',
            marks: 1,
          },
        ],
      });
      const quizId = draftRes.data.data.quizId;
      await creator.post(`/api/v1/quiz/drafts/${quizId}/publish`, { visibility: 'public' });

      // Second user reports the quiz
      const reporter = new ApiClient();
      await reporter.registerTestUser('t3_8_reporter');

      const reportRes = await reporter.post('/api/v1/admin/reports/submit', {
        targetType: 'quiz',
        targetId: quizId,
        reason: 'Violates platform community standards',
        category: 'inappropriate',
      });
      expect(reportRes.status).toBe(201);
      const reportId = reportRes.data.reportId;
      expect(reportId).toBeDefined();

      // Admin logs in and resolves report
      const admin = await authenticateTestAdmin();
      const resolveRes = await admin.post(`/api/v1/admin/reports/${reportId}/resolve`, {
        status: 'action_taken',
        action: 'restricted',
        notes: 'Restricted following community flag review',
      });
      expect(resolveRes.status).toBe(200);
      expect(resolveRes.data.data.report.status).toBe('action_taken');

      // Verify content is restricted from public access
      const accessRes = await reporter.get(`/api/v1/quiz/${quizId}`);
      expect([403, 404].includes(accessRes.status)).toBe(true);

      // Verify Audit Log entry
      const auditRes = await admin.get('/api/v1/admin/audit-logs');
      expect(auditRes.status).toBe(200);
      const logs = auditRes.data.data.logs || [];
      const hasLog = logs.some((l) => l.metadata?.reportId === reportId);
      expect(hasLog).toBe(true);
    });

  });
}

// Auto-register when imported by runner.js or executed directly
registerTier3Tests();
