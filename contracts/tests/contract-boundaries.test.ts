import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { z } from 'zod';
import {
  ClipAccessResponse, ClipResponse, CurrentUserResponse, LeaderboardResponse,
  SessionLoginResponse, SubmissionCalendarResponse,
  type ClipAsset, type ReviewPermissions,
} from '../v1/domain.js';
import { GatewayError, readApiFailure } from '../v1/http.js';
import { validateRequest } from '../v1/middleware.js';
import { QuizCreateInput, QuestionInput } from '../v1/quiz.js';
import { AttemptStartInput, AttemptSubmitInput } from '../v1/attempt.js';
import { ChallengeCreateInput } from '../v1/challenge.js';
import { CommentCreateInput, MessageSendInput, UserPreferencesInput } from '../v1/social.js';
import { ReportSubmitInput, ReportSubmitResponse } from '../v1/admin.js';

type Assert<T extends true> = T;
export type ContractTypeChecks = [
  Assert<z.infer<typeof ClipResponse>['data']['asset'] extends ClipAsset ? true : false>,
  Assert<'answer' extends keyof ClipAsset ? false : true>,
  Assert<'showExplanation' extends keyof ReviewPermissions ? true : false>,
];

const clip = {
  _id: 'e31fda34-ecb5-4f80-aa90-4a18bc2a5bee',
  kind: 'audio', status: 'ready', failureCode: '', duration: 2.5,
  hasAudio: true, animated: false, width: 0, height: 0,
} satisfies ClipAsset;

test('clip responses validate media metadata and omit internal fields', () => {
  const result = ClipResponse.parse({ success: true, data: { asset: { ...clip, sourcePath: 'private-path' } } });
  assert.deepEqual(result.data.asset, clip);
  assert.equal(ClipResponse.safeParse({ success: true, data: { asset: { ...clip, duration: -1 } } }).success, false);
  assert.equal(ClipAccessResponse.safeParse({ success: true, data: { assets: {
    [clip._id]: { ...clip, url: 'https://example.test/content' },
  } } }).success, false);
});

test('submission calendars reject invalid date ranges and out-of-period counts', () => {
  const days = [{ date: '2026-11-13', count: 2 }];
  assert.equal(SubmissionCalendarResponse.safeParse({
    success: true, data: { start: '2026-11-10', end: '2026-11-14', days },
  }).success, true);
  for (const [start, end] of [['2000-01-01', '2026-11-14'], ['2026-11-14', '2026-11-10'], ['2026-11-14', '2026-11-14']]) {
    assert.equal(SubmissionCalendarResponse.safeParse({ success: true, data: { start, end, days } }).success, false);
  }
});

test('current-user contract checks identity and role', () => {
  const user = { _id: '0123456789abcdef01234567', role: 'user' };
  assert.equal(CurrentUserResponse.safeParse({ success: true, data: { user } }).success, true);
  assert.equal(CurrentUserResponse.safeParse({ success: true, data: { user: { ...user, role: 'owner' } } }).success, false);
});

test('login accepts the current envelope and preserves the legacy bearer-token shape', () => {
  const user = { _id: '0123456789abcdef01234567', role: 'user', name: 'Test User' };
  const session = SessionLoginResponse.parse({ success: true, data: { user } });
  assert.deepEqual(session.user, user);
  assert.deepEqual(SessionLoginResponse.parse({ ...user, token: 'test-token' }), { user, token: 'test-token' });
});

test('unreleased standings reject ranked rows', () => {
  const row = {
    rank: 1, attemptId: '0123456789abcdef01234567', score: 1, totalMarks: 1, percentage: 100, totalTimeMs: 20,
    user: { _id: null, name: 'Anonymous Learner', username: 'anonymous', avatar: '' },
  };
  const response = { title: 'Competition', serverTime: '2026-11-14T12:00:00Z', viewerSubmission: null, leaderboard: [row] };
  for (const status of [{ quarantined: true }, { quarantined: false, finalizing: true }]) {
    assert.equal(LeaderboardResponse.safeParse({ success: true, data: { ...response, ...status } }).success, false);
  }
  assert.equal(LeaderboardResponse.safeParse({
    success: true, data: { ...response, quarantined: false },
  }).success, true);
});

test('Gateway errors validate and legacy error bodies remain readable', () => {
  assert.equal(GatewayError.safeParse({
    success: false, message: 'Unavailable', data: null, error: { code: 'UNAVAILABLE', message: 'Unavailable' }, requestId: 'request-1234',
  }).success, true);
  const error = Object.assign(new Error('legacy'), {
    response: { status: 403, data: { message: 'Denied', error: { code: 42 } }, headers: { 'x-request-id': 'request-1234' } },
  });
  assert.deepEqual(readApiFailure(error), { status: 403, message: 'Denied', code: null, requestId: 'request-1234' });
  assert.equal(readApiFailure(null).status, 0);
});

test('validateRequest passes valid body and updates req.body', () => {
  const mw = validateRequest({ body: CommentCreateInput });
  const req = { body: { body: '  Great question explanation!  ' }, headers: { 'x-request-id': 'req-test-1234' } };
  let statusCode = 0;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(_data: unknown) { return this; },
  };
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(statusCode, 0);
  assert.deepEqual(req.body, { body: 'Great question explanation!' });
});

test('validateRequest rejects invalid body and returns 400 GatewayError envelope', () => {
  const mw = validateRequest({ body: CommentCreateInput });
  const req = { body: { body: '' }, headers: { 'x-request-id': 'req-test-1234' } };
  let statusCode = 0;
  let responseData: unknown = null;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(data: unknown) { responseData = data; return this; },
  };
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(statusCode, 400);
  const parsed = GatewayError.safeParse(responseData);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.error.code, 'VALIDATION_ERROR');
    assert.equal(parsed.data.requestId, 'req-test-1234');
  }
});

test('validateRequest validates query and params', () => {
  const mw = validateRequest({
    params: ReportSubmitInput.pick({ targetType: true }),
    query: UserPreferencesInput.pick({ theme: true }),
  });
  const req = {
    params: { targetType: 'quiz' },
    query: { theme: 'dark' },
    headers: { 'x-request-id': 'req-query-test' },
  };
  let statusCode = 0;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(_data: unknown) { return this; },
  };
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(statusCode, 0);

  // Invalid query parameter fails
  const invalidReq = {
    params: { targetType: 'quiz' },
    query: { theme: 'nonexistent-theme' },
    headers: { 'x-request-id': 'req-query-test' },
  };
  let invalidStatus = 0;
  let invalidResponse: unknown = null;
  const invalidRes = {
    status(code: number) { invalidStatus = code; return this; },
    json(data: unknown) { invalidResponse = data; return this; },
  };
  let invalidNextCalled = false;
  mw(invalidReq, invalidRes, () => { invalidNextCalled = true; });

  assert.equal(invalidNextCalled, false);
  assert.equal(invalidStatus, 400);
  assert.equal(GatewayError.safeParse(invalidResponse).success, true);
});

test('QuizCreateInput requires at least one question and applies defaults', () => {
  const validQuestion = {
    questionText: 'What is TypeScript?',
    options: [
      { label: 'A', text: 'Typed superset of JavaScript', isCorrect: true },
      { label: 'B', text: 'A database query language' },
    ],
  };
  const validQuiz = {
    title: 'TypeScript Basics',
    questions: [validQuestion],
  };
  const parsed = QuizCreateInput.parse(validQuiz);
  assert.equal(parsed.title, 'TypeScript Basics');
  assert.equal(parsed.visibility, 'private');
  assert.equal(parsed.settings.instantFeedback, false);
  assert.equal(parsed.questions.length, 1);

  // Rejects empty questions array
  assert.equal(QuizCreateInput.safeParse({ ...validQuiz, questions: [] }).success, false);
  // Rejects empty title
  assert.equal(QuizCreateInput.safeParse({ ...validQuiz, title: '   ' }).success, false);
  // Rejects question without text
  assert.equal(QuestionInput.safeParse({ questionText: '' }).success, false);
});

test('AttemptStartInput and AttemptSubmitInput validate attempt tracking payloads', () => {
  const validStart = { quizId: '0123456789abcdef01234567', forceNew: true };
  assert.equal(AttemptStartInput.safeParse(validStart).success, true);
  assert.equal(AttemptStartInput.safeParse({ quizId: 'invalid-id' }).success, false);

  const validSubmit = {
    answers: [{
      questionId: '0123456789abcdef01234567',
      selectedAnswer: 'A',
      timeTaken: 12,
    }],
    totalTimeMs: 12000,
    finalize: true,
  };
  assert.equal(AttemptSubmitInput.safeParse(validSubmit).success, true);
  assert.equal(AttemptSubmitInput.safeParse({ totalTimeMs: -5 }).success, false);
});

test('ChallengeCreateInput enforces 10 question maximum, duration limits, and future deadline', () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const validQuestion = {
    questionText: 'What is TypeScript?',
    options: [{ label: 'A', text: 'Superset of JS', isCorrect: true }, { label: 'B', text: 'Database' }],
  };
  const valid = {
    title: 'TypeScript Challenge',
    durationMinutes: 30,
    deadlineAt: future,
    questions: [validQuestion],
  };
  assert.equal(ChallengeCreateInput.safeParse(valid).success, true);

  // 11 questions fails
  const elevenQuestions = Array.from({ length: 11 }, () => validQuestion);
  assert.equal(ChallengeCreateInput.safeParse({ ...valid, questions: elevenQuestions }).success, false);

  // Past deadline fails
  const past = new Date(Date.now() - 86400000).toISOString();
  assert.equal(ChallengeCreateInput.safeParse({ ...valid, deadlineAt: past }).success, false);

  // Duration out of bounds (0 or 181) fails
  assert.equal(ChallengeCreateInput.safeParse({ ...valid, durationMinutes: 0 }).success, false);
  assert.equal(ChallengeCreateInput.safeParse({ ...valid, durationMinutes: 181 }).success, false);
});

test('CommentCreateInput and UserPreferencesInput validate social payloads', () => {
  assert.equal(CommentCreateInput.safeParse({ body: 'Nice work!' }).success, true);
  assert.equal(CommentCreateInput.safeParse({ body: '   ' }).success, false);
  assert.equal(CommentCreateInput.safeParse({ body: 'a'.repeat(1001) }).success, false);

  const validPrefs = {
    theme: 'oled',
    fontSize: 'lg',
    aiPersonality: 'Socratic',
    notifications: { challengeInvites: true },
  };
  assert.equal(UserPreferencesInput.safeParse(validPrefs).success, true);
  assert.equal(UserPreferencesInput.safeParse({ theme: 'neon' }).success, false);

  const validMessage = {
    text: 'Hello there',
    type: 'text',
    media: { url: 'https://example.com/asset.png', fileSize: 1024 },
  };
  assert.equal(MessageSendInput.safeParse(validMessage).success, true);
  assert.equal(MessageSendInput.safeParse({
    media: { url: 'https://example.com/huge.bin', fileSize: 20 * 1024 * 1024 },
  }).success, false);
});

test('ReportSubmitInput and ReportSubmitResponse validate moderation contracts', () => {
  const validReport = {
    targetType: 'quiz',
    targetId: '0123456789abcdef01234567',
    reason: 'Contains offensive content',
    category: 'inappropriate',
  };
  assert.equal(ReportSubmitInput.safeParse(validReport).success, true);
  assert.equal(ReportSubmitInput.safeParse({ ...validReport, targetType: 'invalid-type' }).success, false);

  const validReportResponse = {
    success: true,
    message: 'Report submitted successfully',
    reportId: 'rep_12345',
    data: {
      report: {
        _id: '0123456789abcdef01234567',
        targetType: 'quiz',
        targetId: '0123456789abcdef01234567',
        category: 'inappropriate',
        reason: 'Contains offensive content',
        status: 'pending',
      },
    },
  };
  assert.equal(ReportSubmitResponse.safeParse(validReportResponse).success, true);
});
