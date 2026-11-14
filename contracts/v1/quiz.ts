import { z } from 'zod';
import { ObjectId, QuizVisibility } from './domain.js';
import { successResponse } from './http.js';

export const QuestionType = z.enum([
  'short_answer', 'paragraph', 'multiple_choice', 'checkboxes', 'dropdown',
  'file_upload', 'linear_scale', 'rating', 'multiple_choice_grid', 'tick_box_grid',
  'date', 'time', 'code', 'coding_link', 'true_false',
]);
export type QuestionType = z.infer<typeof QuestionType>;

export const QuestionOptionInput = z.object({
  label: z.string().trim().min(1),
  text: z.string().trim().min(1),
  isCorrect: z.boolean().optional(),
  optionId: z.string().optional(),
  accessibilityMedia: z.array(z.unknown()).optional(),
});
export type QuestionOptionInput = z.infer<typeof QuestionOptionInput>;

export const QuestionInput = z.object({
  questionText: z.string().trim().min(1, 'Question text is required'),
  questionType: QuestionType.default('multiple_choice'),
  options: z.array(QuestionOptionInput).optional(),
  correctAnswer: z.union([z.string(), z.array(z.string()), z.number()]).optional(),
  correctOption: z.union([z.number(), z.string()]).optional(),
  explanation: z.string().trim().default(''),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced', 'All Levels']).default('All Levels'),
  category: z.string().trim().default('General'),
  marks: z.number().positive().default(1),
  negativeMarks: z.number().nonnegative().default(0),
  accessibilityMedia: z.array(z.unknown()).optional(),
});
export type QuestionInput = z.infer<typeof QuestionInput>;

export const QuizSettingsInput = z.object({
  timeLimit: z.number().nonnegative().default(0),
  timerMode: z.enum(['none', 'soft', 'strict']).default('none'),
  instantFeedback: z.boolean().default(false),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  showExplanation: z.boolean().default(true),
  allowReview: z.boolean().default(true),
});
export type QuizSettingsInput = z.infer<typeof QuizSettingsInput>;

export const QuizCreateInput = z.object({
  title: z.string().trim().min(1, 'Quiz title is required').max(120),
  description: z.string().trim().max(1000).default(''),
  category: z.string().trim().max(100).default('General'),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced', 'All Levels']).default('All Levels'),
  visibility: QuizVisibility.default('private'),
  contentKind: z.enum(['quiz', 'form', 'coding', 'upload', 'rating', 'survey', 'universal']).default('quiz'),
  builderMode: z.string().trim().default('exam'),
  thumbnail: z.string().trim().nullish(),
  settings: QuizSettingsInput.default(() => QuizSettingsInput.parse({})),
  tags: z.array(z.string().trim().max(40)).max(10).default([]),
  questions: z.array(QuestionInput).min(1, 'At least one question is required'),
  isChallenge: z.boolean().default(false),
  durationMinutes: z.number().nonnegative().optional(),
  deadlineAt: z.iso.datetime({ offset: true }).nullish(),
  accessType: z.enum(['public', 'invite_only']).default('public'),
  inviteAccessType: z.enum(['invitation', 'approval']).nullish(),
});
export type QuizCreateInput = z.infer<typeof QuizCreateInput>;

export const QuizUpdateInput = QuizCreateInput.partial().extend({
  questions: z.array(QuestionInput).optional(),
});
export type QuizUpdateInput = z.infer<typeof QuizUpdateInput>;

export const QuizDetailResponse = successResponse(z.object({
  quiz: z.looseObject({
    _id: ObjectId,
    title: z.string(),
    category: z.string(),
    difficulty: z.string(),
    questionCount: z.int().nonnegative(),
    totalMarks: z.number().nonnegative(),
    visibility: QuizVisibility,
    settings: QuizSettingsInput.optional(),
    uploader: z.unknown().optional(),
  }),
}));
export type QuizDetailResponse = z.infer<typeof QuizDetailResponse>;
