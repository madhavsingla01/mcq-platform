import { z } from 'zod';
import { successResponse } from './http.js';

export const ObjectId = z.string().regex(/^[a-f0-9]{24}$/i);
const count = z.int().nonnegative();
const wireDate = z.iso.datetime({ offset: true });

export const UserRole = z.enum(['user', 'admin']);
export const AuthenticatedUser = z.object({ _id: ObjectId, role: UserRole });
export const CurrentUserResponse = successResponse(z.object({ user: AuthenticatedUser }));
const sessionUser = z.looseObject({
  ...AuthenticatedUser.shape,
  name: z.string().optional(),
  username: z.string().nullish(),
  avatar: z.string().nullish(),
  streak: z.number().optional(),
});
export type SessionUser = z.infer<typeof sessionUser>;

export const SessionBootstrapResponse = successResponse(z.discriminatedUnion('authenticated', [
  z.object({ authenticated: z.literal(false), user: z.null() }),
  z.object({ authenticated: z.literal(true), user: sessionUser }),
]));
const sessionLogin = z.union([
  z.object({ user: sessionUser, token: z.string().optional() }),
  sessionUser.extend({ token: z.string().optional() }).transform(({ token, ...user }) => ({ user, token })),
]);
export const SessionLoginResponse = z.union([
  successResponse(sessionLogin).transform(response => response.data),
  sessionLogin,
]);
export type AuthenticatedUser = z.infer<typeof AuthenticatedUser>;

export const QuizVisibility = z.enum(['public', 'unlisted', 'private']);
export const QuizSummary = z.object({
  _id: ObjectId,
  title: z.string(),
  questionCount: count,
  visibility: QuizVisibility.optional(),
  isChallenge: z.boolean().optional(),
});
export type QuizSummary = z.infer<typeof QuizSummary>;

export const ChallengeSummary = QuizSummary.extend({
  isChallenge: z.literal(true),
  challengeStatus: z.enum(['draft', 'publishing', 'active', 'ended']),
  deadlineAt: wireDate.nullable().optional(),
  durationMinutes: z.number().nonnegative().optional(),
});
export type ChallengeSummary = z.infer<typeof ChallengeSummary>;

const submissionReceipt = z.object({
  attemptId: ObjectId,
  completedAt: wireDate.nullish(),
  kind: z.enum(['ranked', 'practice']),
});
const standingsRow = z.object({
  rank: z.int().positive(),
  attemptId: ObjectId,
  user: z.object({
    _id: ObjectId.nullable(),
    name: z.string(),
    username: z.string(),
    avatar: z.string(),
    isPseudonymized: z.boolean().optional(),
  }),
  score: z.number(),
  totalMarks: z.number(),
  totalTimeMs: z.number().nonnegative(),
  percentage: z.number(),
  completedAt: wireDate.nullish(),
});
const standings = z.object({
  title: z.string(),
  deadlineAt: wireDate.nullish(),
  serverTime: wireDate,
  viewerSubmission: submissionReceipt.nullable(),
  quarantined: z.boolean(),
  finalizing: z.boolean().optional(),
  leaderboard: z.array(standingsRow),
  totalParticipants: count.optional(),
}).refine(data => (!data.quarantined && !data.finalizing) || data.leaderboard.length === 0,
  'Unreleased standings must be empty');
export const LeaderboardResponse = successResponse(standings);
export type Standings = z.infer<typeof standings>;
export type StandingsRow = z.infer<typeof standingsRow>;
export type SubmissionReceipt = z.infer<typeof submissionReceipt>;

export const AttemptStatus = z.enum(['in_progress', 'completed', 'abandoned']);
export const AttemptSummary = z.object({
  _id: ObjectId,
  quizId: z.union([ObjectId, QuizSummary]).nullable(),
  status: AttemptStatus,
  score: z.number().nullable(),
  percentage: z.number().nullable(),
  isPractice: z.boolean().optional(),
  completedAt: wireDate.nullable().optional(),
});
export type AttemptSummary = z.infer<typeof AttemptSummary>;

// Reveal permissions are server decisions, independent from the user's role.
export const ReviewPermissions = z.object({
  allowReview: z.boolean(),
  showExplanation: z.boolean(),
});
export type ReviewPermissions = z.infer<typeof ReviewPermissions>;
export const AttemptResultSummary = ReviewPermissions.extend({
  attempt: AttemptSummary,
  isChallenge: z.boolean(),
  deadlinePassed: z.boolean(),
});
export type AttemptResultSummary = z.infer<typeof AttemptResultSummary>;

export const ClipKind = z.enum(['image', 'audio', 'video', 'captions']);
export type ClipKind = z.infer<typeof ClipKind>;
export const ClipStatus = z.enum([
  'initiated', 'uploaded', 'scanning', 'processing', 'ready',
  'rejected', 'failed', 'quarantined', 'queued', 'cancelled',
]);
export const ClipAsset = z.object({
  _id: z.uuid(),
  kind: ClipKind,
  status: ClipStatus,
  failureCode: z.string(),
  duration: z.number().nonnegative(),
  hasAudio: z.boolean(),
  animated: z.boolean(),
  width: count,
  height: count,
});
export type ClipAsset = z.infer<typeof ClipAsset>;

export const ClipResponse = successResponse(z.object({ asset: ClipAsset }));
export const ClipAccessResponse = successResponse(z.object({
  assets: z.record(z.uuid(), ClipAsset.extend({
    url: z.string().regex(/^\/api\/v1\/media\/clips\//),
  })),
}));
const clipFormats = z.object({ audio: z.array(z.string()), video: z.array(z.string()),
  image: z.array(z.string()), captions: z.array(z.string()) });
export const ClipCapabilitiesResponse = successResponse(z.object({
  maxFileSize: count,
  maxCaptionSize: count,
  maxImageSize: count,
  maxDurationSeconds: z.number().positive(),
  maxPrimaryClipsPerItem: count,
  formats: clipFormats,
  processorReady: z.boolean(),
  output: z.object({ audio: z.string(), video: z.string(), image: z.string(), captions: z.string() }),
}));

export const UploadedImageResponse = successResponse(z.object({
  asset: z.object({
    id: z.uuid(), purpose: z.string(), originalName: z.string(), mimeType: z.string(),
    sourceMimeType: z.string(), sourceSize: count, optimizedSize: count, thumbnailSize: count,
    width: count, height: count, sanitized: z.boolean(), url: z.string(),
    thumbnailUrl: z.string(), createdAt: wireDate.optional(),
  }),
}));

const calendarDay = z.object({ date: z.iso.date(), count: z.int().positive() });

export const SubmissionCalendarResponse = successResponse(z.object({
  start: z.iso.date(),
  end: z.iso.date(),
  days: z.array(calendarDay).max(364),
}).refine(({ start, end, days }) => {
  const span = Date.parse(end) - Date.parse(start);
  return span >= 0 && span <= 363 * 86_400_000 &&
    days.every(({ date }) => date >= start && date <= end);
}, 'Invalid submission calendar range'));
export type SubmissionCalendar = z.infer<typeof SubmissionCalendarResponse>['data'];
