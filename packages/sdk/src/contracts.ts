// Generated from AI Integration Service draft contracts. Run npm run sync:contracts to update.
import { z } from 'zod';

export const draftId = z.string().regex(/^[a-f\d]{24}$/i);
export const draftKind = z.enum(['quiz', 'challenge']);
export const idempotencyKey = z.string().regex(/^[A-Za-z0-9._-]{8,128}$/);
const difficulty = z.enum(['Beginner', 'Intermediate', 'Advanced', 'All Levels']);
const asset = z.uuid().nullish();
const clip = z.strictObject({
  kind: z.enum(['image', 'audio', 'video']),
  assetId: asset, captionAssetId: asset, describedAssetId: asset, describedCaptionAssetId: asset,
  label: z.string().max(120).optional(), transcript: z.string().max(8000).optional(),
  language: z.string().max(35).optional(), captionLanguage: z.string().max(35).optional(),
  signedLanguage: z.string().max(100).optional(),
  purpose: z.enum(['speech', 'signed-language', 'gesture', 'demonstration']).optional(),
  textEquivalentConfirmed: z.boolean().optional(), equivalenceReviewed: z.boolean().optional(),
  meaningfulAudio: z.boolean().nullish(), essentialVisuals: z.boolean().optional(),
  integratedDescription: z.boolean().optional(),
});
const option = z.strictObject({
  label: z.string().regex(/^[A-H]$/).optional(),
  optionId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/).optional(),
  text: z.string().trim().max(2000),
  isCorrect: z.boolean().optional(),
  accessibilityMedia: z.array(clip).max(3).optional(),
}).refine(value => value.text || value.accessibilityMedia?.length, 'Provide option text or media');
export const draftQuestion = z.strictObject({
  questionText: z.string().trim().max(4000),
  questionType: z.enum(['multiple_choice', 'dropdown', 'checkboxes', 'short_answer']),
  options: z.array(option).max(8).optional(),
  correctAnswer: z.union([z.string().max(1000), z.array(z.string().max(100)).max(8), z.null()]).optional(),
  explanation: z.string().max(8000).optional(),
  marks: z.number().positive().max(10000).optional(),
  negativeMarks: z.number().nonnegative().max(10000).optional(),
  accessibilityMedia: z.array(clip).max(3).optional(),
}).superRefine((value, ctx) => {
  if (!value.questionText && !value.accessibilityMedia?.length) {
    ctx.addIssue({ code: 'custom', path: ['questionText'], message: 'Provide question text or media' });
  }
  const options = value.options ?? [];
  const labels = options.map((entry, index) => entry.label ?? String.fromCharCode(65 + index));
  if (value.questionType === 'short_answer' ? options.length !== 0 : options.length < 2 || new Set(labels).size !== labels.length) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'Use no choices for short answer or at least two choices with distinct labels' });
  }
});

const fields = {
  title: z.string().trim().min(3).max(70),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  difficulty: difficulty.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  questions: z.array(draftQuestion).max(100).optional(),
};
const contestSettings = {
  durationMinutes: z.number().int().min(1).max(180).nullable().optional(),
  deadlineAt: z.iso.datetime({ offset: true }).nullable().optional(),
};
export const createDraft = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('quiz'), ...fields }),
  z.strictObject({ kind: z.literal('challenge'), ...fields, ...contestSettings, questions: z.array(draftQuestion).max(10).optional() }),
]);
export const patchDraft = z.strictObject({ ...fields, ...contestSettings }).partial()
  .refine(value => Object.keys(value).length > 0, 'Provide at least one field');

export const listDrafts = z.strictObject({
  page: z.string().regex(/^[1-9]\d{0,3}$/).transform(Number).optional(),
  limit: z.string().regex(/^(?:[1-9]\d?|100)$/).transform(Number).optional(),
  search: z.string().trim().max(100).optional(),
  kind: draftKind.optional(),
});

export const draftSummary = z.object({
  id: draftId, kind: draftKind, title: z.string(), description: z.string(), category: z.string(),
  difficulty, tags: z.array(z.string()), questionCount: z.int().nonnegative(),
  visibility: z.literal('private'), status: z.literal('draft'),
  durationMinutes: z.number().nonnegative().nullable(), deadlineAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});
const readClip = clip.strip();
const readOption = z.object({
  label: z.string(), optionId: z.string().optional(), text: z.string(), isCorrect: z.boolean().optional(),
  accessibilityMedia: z.array(readClip).optional(),
});
export const readQuestion = z.object({
  questionText: z.string(), questionType: z.string(), options: z.array(readOption),
  correctAnswer: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
  explanation: z.string().optional(), marks: z.number().optional(), negativeMarks: z.number().optional(),
  accessibilityMedia: z.array(readClip).optional(),
});
export const draftDetail = draftSummary.extend({ questions: z.array(readQuestion) });
export const pagination = z.object({ page: z.int().positive(), limit: z.int().positive(), pages: z.int().positive(), total: z.int().nonnegative() });

export const publishedQuiz = draftSummary.omit({ kind: true, durationMinutes: true, deadlineAt: true, status: true }).extend({
  visibility: z.enum(['private', 'public', 'unlisted']),
  status: z.literal('published'),
});
export const draftPage = z.object({ drafts: z.array(draftSummary), pagination });
export const publishedQuizPage = z.object({ quizzes: z.array(publishedQuiz), pagination });
export const draftValidation = z.discriminatedUnion('valid', [
  z.object({ valid: z.literal(true) }),
  z.object({ valid: z.literal(false), issues: z.array(z.string()).min(1) }),
]);
export type DraftQuestion = z.infer<typeof draftQuestion>;
export type PublishedQuiz = z.infer<typeof publishedQuiz>;
export type PublishedQuizPage = z.infer<typeof publishedQuizPage>;
export type DraftValidation = z.infer<typeof draftValidation>;

export type DraftSummary = z.infer<typeof draftSummary>;
export type DraftDetail = z.infer<typeof draftDetail>;
export type DraftPage = { drafts: DraftSummary[]; pagination: z.infer<typeof pagination> };
export type DraftQuery = z.infer<typeof listDrafts>;
export type CreateDraft = z.infer<typeof createDraft>;
export type PatchDraft = z.infer<typeof patchDraft>;

export const draftError = z.object({
  success: z.literal(false),
  message: z.string(),
  error: z.object({
    code: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
  requestId: z.string(),
});
