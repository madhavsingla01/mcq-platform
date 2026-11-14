import { z } from 'zod';
import { ObjectId, AttemptStatus, AttemptSummary, ReviewPermissions } from './domain.js';
import { successResponse } from './http.js';

export const AttemptStartInput = z.object({
  quizId: ObjectId.optional(),
  forceNew: z.boolean().optional(),
  sessionId: z.string().optional(),
});
export type AttemptStartInput = z.infer<typeof AttemptStartInput>;

export const AnswerSubmissionItem = z.object({
  questionId: ObjectId,
  selectedAnswer: z.string().nullable().optional(),
  selectedOptionId: z.string().nullable().optional(),
  timeTaken: z.number().nonnegative().optional(),
  timeTakenMs: z.number().nonnegative().optional(),
  isLocked: z.boolean().optional(),
});
export type AnswerSubmissionItem = z.infer<typeof AnswerSubmissionItem>;

export const AttemptSubmitInput = z.object({
  answers: z.array(AnswerSubmissionItem).optional(),
  questionStates: z.array(AnswerSubmissionItem).optional(),
  totalTime: z.number().nonnegative().optional(),
  totalTimeMs: z.number().nonnegative().optional(),
  totalElapsedMs: z.number().nonnegative().optional(),
  stateVersion: z.number().optional(),
  clientTimestamp: z.iso.datetime({ offset: true }).or(z.string()).optional(),
  currentQuestionId: ObjectId.optional(),
  markedForReview: z.array(ObjectId).optional(),
  finalize: z.boolean().optional(),
});
export type AttemptSubmitInput = z.infer<typeof AttemptSubmitInput>;

export const AttemptDetail = AttemptSummary.extend({
  totalQuestions: z.int().nonnegative().optional(),
  totalTime: z.number().nonnegative().optional(),
  totalTimeMs: z.number().nonnegative().optional(),
  answers: z.array(z.looseObject({
    questionId: ObjectId,
    selectedAnswer: z.string().nullable().optional(),
    isCorrect: z.boolean().optional(),
    marksAwarded: z.number().optional(),
  })).optional(),
});
export type AttemptDetail = z.infer<typeof AttemptDetail>;

export const AttemptDetailResponse = successResponse(z.object({
  attempt: AttemptDetail,
  permissions: ReviewPermissions.optional(),
}));
export type AttemptDetailResponse = z.infer<typeof AttemptDetailResponse>;
