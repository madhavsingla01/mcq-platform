import { z } from 'zod';
import { ObjectId, LeaderboardResponse } from './domain.js';
import { QuestionInput } from './quiz.js';

export const ChallengeCreateInput = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  description: z.string().trim().max(2000).default(''),
  category: z.string().trim().max(100).default('General'),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced', 'All Levels']).default('Intermediate'),
  thumbnail: z.string().trim().nullish(),
  durationMinutes: z.int().min(1).max(180, 'Duration must be between 1 and 180 minutes'),
  deadlineAt: z.iso.datetime({ offset: true }).refine(
    (val) => new Date(val).getTime() > Date.now(),
    'Challenge deadline must be in the future',
  ),
  accessType: z.enum(['public', 'invite_only']).default('public'),
  inviteAccessType: z.enum(['invitation', 'approval']).nullish(),
  tags: z.array(z.string().trim().max(40)).max(8).default([]),
  questions: z.array(QuestionInput).min(1).max(10, 'Competitive challenges are strictly capped at 10 questions'),
  isDraft: z.boolean().optional(),
  draftId: ObjectId.optional(),
});
export type ChallengeCreateInput = z.infer<typeof ChallengeCreateInput>;

export const ChallengeStandingsResponse = LeaderboardResponse;
export type ChallengeStandingsResponse = z.infer<typeof ChallengeStandingsResponse>;
