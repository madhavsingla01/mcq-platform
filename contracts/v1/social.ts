import { z } from 'zod';
import { ObjectId } from './domain.js';

export const MessageType = z.enum([
  'text', 'image', 'audio', 'document', 'quiz_share', 'comment_share', 'challenge_invite', 'link',
]);
export type MessageType = z.infer<typeof MessageType>;

export const MessageMediaInput = z.object({
  url: z.string(),
  thumbnailUrl: z.string().optional(),
  fileName: z.string().max(255).optional(),
  mimeType: z.string().max(100).optional(),
  fileSize: z.number().nonnegative().max(15 * 1024 * 1024, 'File size must not exceed 15MB').optional(),
  duration: z.number().nonnegative().optional(),
});
export type MessageMediaInput = z.infer<typeof MessageMediaInput>;

export const MessageSendInput = z.object({
  text: z.string().max(5000).optional(),
  type: MessageType.default('text'),
  clientMessageId: z.string().max(100).optional(),
  quizId: ObjectId.optional(),
  commentId: ObjectId.optional(),
  link: z.string().optional(),
  media: MessageMediaInput.optional(),
  replyTo: ObjectId.optional(),
});
export type MessageSendInput = z.infer<typeof MessageSendInput>;

export const CommentCreateInput = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(1000, 'Comment must be at most 1000 characters'),
  parentComment: ObjectId.optional(),
  replyToUser: ObjectId.optional(),
});
export type CommentCreateInput = z.infer<typeof CommentCreateInput>;

const difficultyEnum = z.enum(['All Levels', 'Beginner', 'Intermediate', 'Advanced']);

export const UserPreferencesInput = z.object({
  theme: z.enum(['dark', 'oled', 'light']).optional(),
  fontSize: z.enum(['sm', 'md', 'lg']).optional(),
  density: z.enum(['comfortable', 'compact']).optional(),
  timerVisibility: z.enum(['visible', 'hidden']).optional(),
  isNavigatorCollapsed: z.boolean().optional(),
  isAICollapsed: z.boolean().optional(),
  showCorrectAnswerInstantly: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  focusMode: z.boolean().optional(),
  keyboardShortcutsEnabled: z.boolean().optional(),
  aiExplanations: z.boolean().optional(),
  aiPersonality: z.enum(['Encouraging', 'Concise', 'Socratic', 'Detailed']).optional(),
  soundCues: z.boolean().optional(),
  autoAdvance: z.boolean().optional(),
  quizTimer: z.boolean().optional(),
  shuffleQuestions: z.boolean().optional(),
  searchDiscovery: z.boolean().optional(),
  allowMessagesFrom: z.enum(['everyone', 'followers', 'following', 'none']).optional(),
  messagingSendOnEnter: z.boolean().optional(),
  messagingReadReceipts: z.boolean().optional(),
  messagingTypingIndicators: z.boolean().optional(),
  showOnLeaderboard: z.boolean().optional(),
  showRankOnProfile: z.boolean().optional(),
  defaultDifficulty: difficultyEnum.optional(),
  primaryCategory: z.string().min(1).max(80).optional(),
  hideCompletedQuizzes: z.boolean().optional(),
  filterUnverified: z.boolean().optional(),
  panelWidths: z.object({
    navigator: z.number().min(0).max(100).optional(),
    workspace: z.number().min(0).max(100).optional(),
    ai: z.number().min(0).max(100).optional(),
  }).optional(),
  notifications: z.object({
    challengeInvites: z.boolean().optional(),
    quizResults: z.boolean().optional(),
    leaderboardUpdates: z.boolean().optional(),
    newFollowers: z.boolean().optional(),
    commentsAndReplies: z.boolean().optional(),
    directMessages: z.boolean().optional(),
    emailDigest: z.enum(['weekly', 'monthly', 'off']).optional(),
  }).optional(),
  challenges: z.object({
    accept: z.enum(['always', 'followers', 'never']).optional(),
    timeLimit: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)]).optional(),
    showOnLeaderboards: z.boolean().optional(),
    showRankOnProfile: z.boolean().optional(),
  }).optional(),
  feed: z.object({
    defaultDifficulty: difficultyEnum.optional(),
    preferredCategory: z.string().min(1).max(80).optional(),
    hideCompletedQuizzes: z.boolean().optional(),
    filterUnverified: z.boolean().optional(),
  }).optional(),
});
export type UserPreferencesInput = z.infer<typeof UserPreferencesInput>;
