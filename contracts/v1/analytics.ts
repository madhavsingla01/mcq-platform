import { z } from 'zod';
import { ObjectId } from './domain.js';
import { successResponse } from './http.js';

// ==========================================
// 1. BASE EVENT ENVELOPE & EVENT TYPES
// ==========================================

export const wireDate = z.iso.datetime({ offset: true });
export type WireDate = z.infer<typeof wireDate>;

export const AnalyticsEventTypeSchema = z.enum([
  'quiz.started.v1',
  'quiz.completed.v1',
  'quiz.abandoned.v1',
  'quiz.question_answered.v1',
  'challenge.created.v1',
  'challenge.participated.v1',
  'challenge.submitted.v1',
  'marketplace.listing_viewed.v1',
  'marketplace.listing_purchased.v1',
  'marketplace.refund_processed.v1',
  'audience.user_followed.v1',
  'audience.discovery_source_logged.v1',
]);
export type AnalyticsEventType = z.infer<typeof AnalyticsEventTypeSchema>;
export const DomainEventType = AnalyticsEventTypeSchema;
export type DomainEventType = AnalyticsEventType;

export const BaseEventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  version: z.literal('1.0.0'),
  timestamp: wireDate,
  producer: z.string().min(1),
  traceId: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
});
export type BaseEventEnvelopeSchema = z.infer<typeof BaseEventEnvelopeSchema>;

export type BaseEventEnvelope<T = Record<string, unknown>> = {
  eventId: string;
  eventType: string;
  version: '1.0.0';
  timestamp: string;
  producer: string;
  traceId?: string;
  data: T;
};
export const BaseEventEnvelope = BaseEventEnvelopeSchema;

// Internal helper to construct type-safe domain event envelope schemas
function createDomainEnvelope<TType extends string, TData extends z.ZodTypeAny>(
  eventType: TType,
  dataSchema: TData,
  defaultProducer: string,
) {
  return z.object({
    eventId: z.string().uuid(),
    eventType: z.literal(eventType),
    version: z.literal('1.0.0'),
    timestamp: wireDate,
    producer: z.string().min(1).default(defaultProducer),
    traceId: z.string().optional(),
    data: dataSchema,
  });
}

// ==========================================
// 2. 12 DOMAIN EVENT PAYLOADS & ENVELOPES
// ==========================================

// 1. quiz.started.v1
export const QuizStartedPayloadSchema = z.object({
  attemptId: ObjectId,
  quizId: ObjectId,
  creatorId: ObjectId,
  userId: ObjectId.nullable().optional(),
  sessionId: z.string().nullish(),
  startedAt: wireDate,
  isPractice: z.boolean().default(false),
  isChallenge: z.boolean().default(false),
  totalQuestions: z.int().nonnegative(),
});
export type QuizStartedPayload = z.infer<typeof QuizStartedPayloadSchema>;
export const QuizStartedDataSchema = QuizStartedPayloadSchema;
export type QuizStartedData = QuizStartedPayload;
export const QuizStartedEventSchema = createDomainEnvelope(
  'quiz.started.v1',
  QuizStartedPayloadSchema,
  'attempt-service',
);
export type QuizStartedEvent = z.infer<typeof QuizStartedEventSchema>;

// 2. quiz.completed.v1
export const QuizCompletedPayloadSchema = z.object({
  attemptId: ObjectId,
  quizId: ObjectId,
  creatorId: ObjectId,
  userId: ObjectId.nullable().optional(),
  sessionId: z.string().nullish(),
  completedAt: wireDate,
  startedAt: wireDate.optional(),
  score: z.number(),
  totalMarks: z.number().nonnegative(),
  percentage: z.number().min(0).max(100),
  totalQuestions: z.int().nonnegative(),
  answeredCount: z.int().nonnegative().optional(),
  correctCount: z.int().nonnegative(),
  wrongCount: z.int().nonnegative(),
  unansweredCount: z.int().nonnegative().optional(),
  totalTimeSeconds: z.number().nonnegative().optional(),
  totalTimeMs: z.number().nonnegative().optional(),
  isPractice: z.boolean().default(false),
  isChallenge: z.boolean().default(false),
});
export type QuizCompletedPayload = z.infer<typeof QuizCompletedPayloadSchema>;
export const QuizCompletedDataSchema = QuizCompletedPayloadSchema;
export type QuizCompletedData = QuizCompletedPayload;
export const QuizCompletedEventSchema = createDomainEnvelope(
  'quiz.completed.v1',
  QuizCompletedPayloadSchema,
  'attempt-service',
);
export type QuizCompletedEvent = z.infer<typeof QuizCompletedEventSchema>;

// 3. quiz.abandoned.v1
export const QuizAbandonedPayloadSchema = z.object({
  attemptId: ObjectId,
  quizId: ObjectId,
  creatorId: ObjectId,
  userId: ObjectId.nullable().optional(),
  sessionId: z.string().nullish(),
  abandonedAt: wireDate,
  lastQuestionNumber: z.int().nonnegative().optional(),
  lastQuestionIndex: z.int().nonnegative().optional(),
  questionsAnswered: z.int().nonnegative().optional(),
  totalQuestions: z.int().nonnegative(),
  timeSpentSeconds: z.number().nonnegative().optional(),
  timeTakenMs: z.number().nonnegative().optional(),
});
export type QuizAbandonedPayload = z.infer<typeof QuizAbandonedPayloadSchema>;
export const QuizAbandonedDataSchema = QuizAbandonedPayloadSchema;
export type QuizAbandonedData = QuizAbandonedPayload;
export const QuizAbandonedEventSchema = createDomainEnvelope(
  'quiz.abandoned.v1',
  QuizAbandonedPayloadSchema,
  'attempt-service',
);
export type QuizAbandonedEvent = z.infer<typeof QuizAbandonedEventSchema>;

// 4. quiz.question_answered.v1
export const QuizQuestionAnsweredPayloadSchema = z.object({
  attemptId: ObjectId,
  quizId: ObjectId,
  creatorId: ObjectId,
  questionId: ObjectId,
  questionNumber: z.int().positive().optional(),
  questionIndex: z.int().nonnegative().optional(),
  userId: ObjectId.nullable().optional(),
  sessionId: z.string().nullish(),
  isCorrect: z.boolean(),
  selectedOptionId: z.string().nullable().optional(),
  selectedAnswer: z.string().nullable().optional(),
  marksAwarded: z.number().optional(),
  timeTakenMs: z.number().nonnegative().optional(),
  answeredAt: wireDate,
});
export type QuizQuestionAnsweredPayload = z.infer<typeof QuizQuestionAnsweredPayloadSchema>;
export const QuizQuestionAnsweredDataSchema = QuizQuestionAnsweredPayloadSchema;
export type QuizQuestionAnsweredData = QuizQuestionAnsweredPayload;
export const QuizQuestionAnsweredEventSchema = createDomainEnvelope(
  'quiz.question_answered.v1',
  QuizQuestionAnsweredPayloadSchema,
  'attempt-service',
);
export type QuizQuestionAnsweredEvent = z.infer<typeof QuizQuestionAnsweredEventSchema>;

// 5. challenge.created.v1
export const ChallengeCreatedPayloadSchema = z.object({
  challengeId: ObjectId,
  quizId: ObjectId.optional(),
  creatorId: ObjectId,
  title: z.string().trim().min(1),
  category: z.string().trim().default('General'),
  difficulty: z.string().trim().default('Intermediate'),
  durationMinutes: z.int().min(1).max(180),
  deadlineAt: wireDate,
  accessType: z.enum(['public', 'invite_only']).default('public'),
  totalQuestions: z.int().min(1).max(10),
  totalMarks: z.number().nonnegative().optional(),
  tags: z.array(z.string().trim()).max(8).optional(),
  createdAt: wireDate,
});
export type ChallengeCreatedPayload = z.infer<typeof ChallengeCreatedPayloadSchema>;
export const ChallengeCreatedDataSchema = ChallengeCreatedPayloadSchema;
export type ChallengeCreatedData = ChallengeCreatedPayload;
export const ChallengeCreatedEventSchema = createDomainEnvelope(
  'challenge.created.v1',
  ChallengeCreatedPayloadSchema,
  'challenge-service',
);
export type ChallengeCreatedEvent = z.infer<typeof ChallengeCreatedEventSchema>;

// 6. challenge.participated.v1
export const ChallengeParticipatedPayloadSchema = z.object({
  challengeId: ObjectId,
  creatorId: ObjectId,
  userId: ObjectId,
  participantId: ObjectId.optional(),
  attemptId: ObjectId,
  joinedAt: wireDate.optional(),
  participatedAt: wireDate.optional(),
});
export type ChallengeParticipatedPayload = z.infer<typeof ChallengeParticipatedPayloadSchema>;
export const ChallengeParticipatedDataSchema = ChallengeParticipatedPayloadSchema;
export type ChallengeParticipatedData = ChallengeParticipatedPayload;
export const ChallengeParticipatedEventSchema = createDomainEnvelope(
  'challenge.participated.v1',
  ChallengeParticipatedPayloadSchema,
  'challenge-service',
);
export type ChallengeParticipatedEvent = z.infer<typeof ChallengeParticipatedEventSchema>;

// 7. challenge.submitted.v1
export const ChallengeSubmittedPayloadSchema = z.object({
  challengeId: ObjectId,
  creatorId: ObjectId,
  userId: ObjectId,
  participantId: ObjectId.optional(),
  attemptId: ObjectId,
  score: z.number(),
  totalMarks: z.number().nonnegative(),
  percentage: z.number().min(0).max(100),
  totalQuestions: z.int().min(1).max(10).optional(),
  correctCount: z.int().nonnegative().optional(),
  wrongCount: z.int().nonnegative().optional(),
  totalTimeMs: z.number().nonnegative(),
  submittedAt: wireDate,
  quarantined: z.boolean().default(true),
});
export type ChallengeSubmittedPayload = z.infer<typeof ChallengeSubmittedPayloadSchema>;
export const ChallengeSubmittedDataSchema = ChallengeSubmittedPayloadSchema;
export type ChallengeSubmittedData = ChallengeSubmittedPayload;
export const ChallengeSubmittedEventSchema = createDomainEnvelope(
  'challenge.submitted.v1',
  ChallengeSubmittedPayloadSchema,
  'challenge-service',
);
export type ChallengeSubmittedEvent = z.infer<typeof ChallengeSubmittedEventSchema>;

// 8. marketplace.listing_viewed.v1
export const MarketplaceListingViewedPayloadSchema = z.object({
  listingId: ObjectId,
  sellerId: ObjectId,
  creatorId: ObjectId.optional(),
  quizId: ObjectId.optional(),
  viewerId: ObjectId.nullable().optional(),
  sessionId: z.string().nullish(),
  source: z.string().default('direct'),
  referrer: z.string().nullish(),
  viewedAt: wireDate,
});
export type MarketplaceListingViewedPayload = z.infer<typeof MarketplaceListingViewedPayloadSchema>;
export const MarketplaceListingViewedDataSchema = MarketplaceListingViewedPayloadSchema;
export type MarketplaceListingViewedData = MarketplaceListingViewedPayload;
export const MarketplaceListingViewedEventSchema = createDomainEnvelope(
  'marketplace.listing_viewed.v1',
  MarketplaceListingViewedPayloadSchema,
  'marketplace-service',
);
export type MarketplaceListingViewedEvent = z.infer<typeof MarketplaceListingViewedEventSchema>;

// 9. marketplace.listing_purchased.v1
export const MarketplaceListingPurchasedPayloadSchema = z.object({
  orderId: ObjectId,
  listingId: ObjectId,
  sellerId: ObjectId,
  creatorId: ObjectId.optional(),
  quizId: ObjectId.optional(),
  buyerId: ObjectId,
  amount: z.number().nonnegative(),
  platformFee: z.number().nonnegative().default(0),
  creatorEarnings: z.number(),
  netEarnings: z.number().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  licenseType: z.enum(['single_user', 'team', 'institutional', 'subscription']).default('single_user'),
  transactionId: z.string().optional(),
  purchasedAt: wireDate,
});
export type MarketplaceListingPurchasedPayload = z.infer<typeof MarketplaceListingPurchasedPayloadSchema>;
export const MarketplaceListingPurchasedDataSchema = MarketplaceListingPurchasedPayloadSchema;
export type MarketplaceListingPurchasedData = MarketplaceListingPurchasedPayload;
export const MarketplaceListingPurchasedEventSchema = createDomainEnvelope(
  'marketplace.listing_purchased.v1',
  MarketplaceListingPurchasedPayloadSchema,
  'marketplace-service',
);
export type MarketplaceListingPurchasedEvent = z.infer<typeof MarketplaceListingPurchasedEventSchema>;

// 10. marketplace.refund_processed.v1
export const MarketplaceRefundProcessedPayloadSchema = z.object({
  refundId: z.string().min(1),
  orderId: ObjectId,
  listingId: ObjectId,
  sellerId: ObjectId,
  creatorId: ObjectId.optional(),
  buyerId: ObjectId,
  amount: z.number().nonnegative(),
  creatorDeduction: z.number().optional(),
  platformFeeRefunded: z.number().nonnegative().optional(),
  netDeduction: z.number().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  reason: z.string().optional(),
  refundedAt: wireDate,
});
export type MarketplaceRefundProcessedPayload = z.infer<typeof MarketplaceRefundProcessedPayloadSchema>;
export const MarketplaceRefundProcessedDataSchema = MarketplaceRefundProcessedPayloadSchema;
export type MarketplaceRefundProcessedData = MarketplaceRefundProcessedPayload;
export const MarketplaceRefundProcessedEventSchema = createDomainEnvelope(
  'marketplace.refund_processed.v1',
  MarketplaceRefundProcessedPayloadSchema,
  'marketplace-service',
);
export type MarketplaceRefundProcessedEvent = z.infer<typeof MarketplaceRefundProcessedEventSchema>;

// 11. audience.user_followed.v1
export const AudienceUserFollowedPayloadSchema = z.object({
  creatorId: ObjectId,
  followerId: ObjectId,
  action: z.enum(['follow', 'unfollow', 'followed', 'unfollowed']).default('follow'),
  followedAt: wireDate,
});
export type AudienceUserFollowedPayload = z.infer<typeof AudienceUserFollowedPayloadSchema>;
export const AudienceUserFollowedDataSchema = AudienceUserFollowedPayloadSchema;
export type AudienceUserFollowedData = AudienceUserFollowedPayload;
export const AudienceUserFollowedEventSchema = createDomainEnvelope(
  'audience.user_followed.v1',
  AudienceUserFollowedPayloadSchema,
  'social-service',
);
export type AudienceUserFollowedEvent = z.infer<typeof AudienceUserFollowedEventSchema>;

// 12. audience.discovery_source_logged.v1
export const AudienceDiscoverySourceLoggedPayloadSchema = z.object({
  creatorId: ObjectId,
  userId: ObjectId.nullable().optional(),
  sessionId: z.string().nullish(),
  sourceType: z.enum(['search', 'direct', 'referral', 'social', 'social_share', 'feed', 'external', 'other']).default('direct'),
  source: z.string().optional(),
  sourceDetail: z.string().optional(),
  searchQuery: z.string().nullish(),
  referrerUrl: z.string().nullish(),
  targetType: z.enum(['quiz', 'challenge', 'listing', 'creator_profile', 'profile']).optional(),
  targetId: z.string().optional(),
  contentId: ObjectId.nullish(),
  contentType: z.string().nullish(),
  utmSource: z.string().nullish(),
  utmMedium: z.string().nullish(),
  utmCampaign: z.string().nullish(),
  loggedAt: wireDate,
});
export type AudienceDiscoverySourceLoggedPayload = z.infer<typeof AudienceDiscoverySourceLoggedPayloadSchema>;
export const AudienceDiscoverySourceLoggedDataSchema = AudienceDiscoverySourceLoggedPayloadSchema;
export type AudienceDiscoverySourceLoggedData = AudienceDiscoverySourceLoggedPayload;
export const AudienceDiscoverySourceLoggedEventSchema = createDomainEnvelope(
  'audience.discovery_source_logged.v1',
  AudienceDiscoverySourceLoggedPayloadSchema,
  'social-service',
);
export type AudienceDiscoverySourceLoggedEvent = z.infer<typeof AudienceDiscoverySourceLoggedEventSchema>;

// Discriminated union of all 12 domain event envelopes
export const DomainEventEnvelopeSchema = z.discriminatedUnion('eventType', [
  QuizStartedEventSchema,
  QuizCompletedEventSchema,
  QuizAbandonedEventSchema,
  QuizQuestionAnsweredEventSchema,
  ChallengeCreatedEventSchema,
  ChallengeParticipatedEventSchema,
  ChallengeSubmittedEventSchema,
  MarketplaceListingViewedEventSchema,
  MarketplaceListingPurchasedEventSchema,
  MarketplaceRefundProcessedEventSchema,
  AudienceUserFollowedEventSchema,
  AudienceDiscoverySourceLoggedEventSchema,
]);
export type DomainEventEnvelope = z.infer<typeof DomainEventEnvelopeSchema>;

// ==========================================
// 3. INGESTION RESPONSE SCHEMA
// ==========================================

export const IngestEventResponseSchema = z.object({
  success: z.boolean(),
  processed: z.boolean(),
  duplicate: z.boolean(),
  eventId: z.string().optional(),
  message: z.string().optional(),
});
export type IngestEventResponse = z.infer<typeof IngestEventResponseSchema>;
export const EventIngestResponseSchema = IngestEventResponseSchema;
export type EventIngestResponse = IngestEventResponse;

export const EventIngestInputSchema = DomainEventEnvelopeSchema.or(BaseEventEnvelopeSchema);
export type EventIngestInput = z.infer<typeof EventIngestInputSchema>;

// ==========================================
// 4. QUERY PARAMETER SCHEMAS
// ==========================================

export const AnalyticsTimeframeSchema = z.enum(['7d', '30d', '90d', '1y', 'all']).default('30d');
export type AnalyticsTimeframe = z.infer<typeof AnalyticsTimeframeSchema>;
export const TimeframeEnum = AnalyticsTimeframeSchema;
export type Timeframe = AnalyticsTimeframe;

export const DateRangeFilterSchema = z.object({
  startDate: wireDate.optional(),
  endDate: wireDate.optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate).getTime() <= new Date(data.endDate).getTime();
    }
    return true;
  },
  {
    message: 'startDate must be before or equal to endDate',
  },
);
export type DateRangeFilter = z.infer<typeof DateRangeFilterSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const AnalyticsFilterQuerySchema = PaginationQuerySchema.extend({
  timeframe: AnalyticsTimeframeSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  category: z.string().optional(),
});
export type AnalyticsFilterQuery = z.infer<typeof AnalyticsFilterQuerySchema>;

// ==========================================
// 5. STUDIO RESPONSE SCHEMAS
// ==========================================

// --- Creator Overview ---
export const DailyActivityPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must follow YYYY-MM-DD format'),
  starts: z.int().nonnegative().optional(),
  attempts: z.int().nonnegative().optional(),
  completions: z.int().nonnegative(),
  revenue: z.number().nonnegative(),
});
export type DailyActivityPoint = z.infer<typeof DailyActivityPointSchema>;

export const CreatorOverviewDataSchema = z.object({
  totalQuizzes: z.int().nonnegative(),
  totalStarts: z.int().nonnegative(),
  totalCompletions: z.int().nonnegative(),
  averageCompletionRate: z.number().min(0).max(100),
  averageAccuracy: z.number().min(0).max(100),
  activeChallenges: z.int().nonnegative(),
  totalChallengeParticipants: z.int().nonnegative(),
  grossRevenue: z.number().nonnegative(),
  netEarnings: z.number(),
  totalFollowers: z.int().nonnegative(),
  followerGrowth: z.number(),
  activityTrend: z.array(DailyActivityPointSchema),
});
export type CreatorOverviewData = z.infer<typeof CreatorOverviewDataSchema>;

export const CreatorOverviewResponseSchema = successResponse(CreatorOverviewDataSchema);
export type CreatorOverviewResponse = z.infer<typeof CreatorOverviewResponseSchema>;
export const AnalyticsOverviewResponseSchema = CreatorOverviewResponseSchema;
export type AnalyticsOverviewResponse = CreatorOverviewResponse;

// --- Quiz Analytics List ---
export const QuizAnalyticsSummaryItemSchema = z.object({
  quizId: ObjectId,
  title: z.string(),
  category: z.string().optional().default('General'),
  difficulty: z.string().optional().default('Intermediate'),
  totalStarts: z.int().nonnegative(),
  totalCompletions: z.int().nonnegative(),
  completionRate: z.number().min(0).max(100),
  averageAccuracy: z.number().min(0).max(100),
  averageTimeSeconds: z.number().nonnegative(),
  updatedAt: z.string().optional(),
});
export type QuizAnalyticsSummaryItem = z.infer<typeof QuizAnalyticsSummaryItemSchema>;
export const QuizAnalyticsListItemSchema = QuizAnalyticsSummaryItemSchema;
export type QuizAnalyticsListItem = QuizAnalyticsSummaryItem;

export const QuizAnalyticsListDataSchema = z.object({
  items: z.array(QuizAnalyticsSummaryItemSchema),
  pagination: z.object({
    total: z.int().nonnegative(),
    page: z.int().positive(),
    limit: z.int().positive(),
    totalPages: z.int().nonnegative(),
  }),
});
export type QuizAnalyticsListData = z.infer<typeof QuizAnalyticsListDataSchema>;

export const QuizAnalyticsListResponseSchema = successResponse(QuizAnalyticsListDataSchema);
export type QuizAnalyticsListResponse = z.infer<typeof QuizAnalyticsListResponseSchema>;

// --- Quiz Detail Analytics & Funnel ---
export const QuestionDropOffStepSchema = z.object({
  questionId: ObjectId,
  questionNumber: z.int().positive(),
  questionText: z.string(),
  reachedCount: z.int().nonnegative(),
  dropOffCount: z.int().nonnegative(),
  dropOffRate: z.number().min(0).max(100),
  correctCount: z.int().nonnegative(),
  totalAnswered: z.int().nonnegative(),
  accuracyRate: z.number().min(0).max(100),
  averageTimeMs: z.number().nonnegative(),
});
export type QuestionDropOffStep = z.infer<typeof QuestionDropOffStepSchema>;
export const QuestionFunnelStepSchema = QuestionDropOffStepSchema;
export type QuestionFunnelStep = QuestionDropOffStep;

export const QuizDetailAnalyticsDataSchema = z.object({
  quizId: ObjectId,
  title: z.string(),
  category: z.string().optional().default('General'),
  difficulty: z.string().optional().default('Intermediate'),
  questionCount: z.int().nonnegative(),
  totalStarts: z.int().nonnegative(),
  totalCompletions: z.int().nonnegative(),
  totalAbandoned: z.int().nonnegative(),
  completionRate: z.number().min(0).max(100),
  averageAccuracy: z.number().min(0).max(100),
  averageScore: z.number().nonnegative(),
  averageTimeSeconds: z.number().nonnegative(),
  dropOffFunnel: z.array(QuestionDropOffStepSchema),
  trend: z.array(
    z.object({
      date: z.string(),
      starts: z.int().nonnegative(),
      completions: z.int().nonnegative(),
    }),
  ).optional().default([]),
});
export type QuizDetailAnalyticsData = z.infer<typeof QuizDetailAnalyticsDataSchema>;

export const QuizDetailAnalyticsResponseSchema = successResponse(QuizDetailAnalyticsDataSchema);
export type QuizDetailAnalyticsResponse = z.infer<typeof QuizDetailAnalyticsResponseSchema>;
export const QuizAnalyticsDetailResponseSchema = QuizDetailAnalyticsResponseSchema;
export type QuizAnalyticsDetailResponse = QuizDetailAnalyticsResponse;

// --- Challenge Analytics List ---
export const ChallengeAnalyticsSummaryItemSchema = z.object({
  challengeId: ObjectId,
  title: z.string(),
  challengeStatus: z.enum(['draft', 'publishing', 'active', 'ended']),
  deadlineAt: wireDate.nullable().optional(),
  totalParticipants: z.int().nonnegative(),
  totalSubmissions: z.int().nonnegative(),
  isQuarantined: z.boolean(),
});
export type ChallengeAnalyticsSummaryItem = z.infer<typeof ChallengeAnalyticsSummaryItemSchema>;
export const ChallengeAnalyticsListItemSchema = ChallengeAnalyticsSummaryItemSchema;
export type ChallengeAnalyticsListItem = ChallengeAnalyticsSummaryItem;

export const ChallengeAnalyticsListDataSchema = z.object({
  items: z.array(ChallengeAnalyticsSummaryItemSchema),
  pagination: z.object({
    total: z.int().nonnegative(),
    page: z.int().positive(),
    limit: z.int().positive(),
    totalPages: z.int().nonnegative(),
  }),
});
export type ChallengeAnalyticsListData = z.infer<typeof ChallengeAnalyticsListDataSchema>;

export const ChallengeAnalyticsListResponseSchema = successResponse(ChallengeAnalyticsListDataSchema);
export type ChallengeAnalyticsListResponse = z.infer<typeof ChallengeAnalyticsListResponseSchema>;

// --- Challenge Detail Analytics (with active challenge quarantine support) ---
export const ScoreDistributionBucketSchema = z.object({
  range: z.string(),
  count: z.int().nonnegative(),
});
export type ScoreDistributionBucket = z.infer<typeof ScoreDistributionBucketSchema>;
export const ScoreBucketSchema = ScoreDistributionBucketSchema;
export type ScoreBucket = ScoreDistributionBucket;

export const ChallengeDetailAnalyticsDataSchema = z.object({
  challengeId: ObjectId,
  title: z.string(),
  status: z.enum(['draft', 'publishing', 'active', 'ended']),
  deadlineAt: wireDate.nullable().optional(),
  isQuarantined: z.boolean(),
  totalParticipants: z.int().nonnegative(),
  totalSubmissions: z.int().nonnegative(),
  // Masked or omitted when isQuarantined is true
  averageScore: z.number().nullable().optional(),
  medianScore: z.number().nullable().optional(),
  highestScore: z.number().nullable().optional(),
  averageTimeMs: z.number().nullable().optional(),
  scoreDistribution: z.array(ScoreDistributionBucketSchema).optional(),
  submissionTimeline: z.array(
    z.object({
      timestamp: z.string(),
      submissionsCount: z.int().nonnegative(),
    }),
  ).optional(),
});
export type ChallengeDetailAnalyticsData = z.infer<typeof ChallengeDetailAnalyticsDataSchema>;

export const ChallengeDetailAnalyticsResponseSchema = successResponse(ChallengeDetailAnalyticsDataSchema);
export type ChallengeDetailAnalyticsResponse = z.infer<typeof ChallengeDetailAnalyticsResponseSchema>;
export const ChallengeAnalyticsDetailResponseSchema = ChallengeDetailAnalyticsResponseSchema;
export type ChallengeAnalyticsDetailResponse = ChallengeDetailAnalyticsResponse;

// --- Marketplace Analytics ---
export const MarketplaceListingPerformanceSchema = z.object({
  listingId: ObjectId,
  title: z.string(),
  views: z.int().nonnegative(),
  purchases: z.int().nonnegative(),
  conversionRate: z.number().min(0).max(100),
  grossRevenue: z.number().nonnegative(),
  netEarnings: z.number(),
  refundCount: z.int().nonnegative().optional().default(0),
});
export type MarketplaceListingPerformance = z.infer<typeof MarketplaceListingPerformanceSchema>;
export const MarketplaceTopListingSchema = MarketplaceListingPerformanceSchema;
export type MarketplaceTopListing = MarketplaceListingPerformance;

export const MarketplaceAnalyticsDataSchema = z.object({
  grossRevenue: z.number().nonnegative(),
  refunds: z.number().nonnegative(),
  platformFees: z.number().nonnegative(),
  netEarnings: z.number(),
  totalListingViews: z.int().nonnegative(),
  totalPurchases: z.int().nonnegative(),
  conversionRate: z.number().min(0).max(100),
  currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  listings: z.array(MarketplaceListingPerformanceSchema),
  revenueTrend: z.array(
    z.object({
      date: z.string(),
      gross: z.number().nonnegative(),
      net: z.number(),
      orders: z.int().nonnegative(),
    }),
  ).optional().default([]),
});
export type MarketplaceAnalyticsData = z.infer<typeof MarketplaceAnalyticsDataSchema>;

export const MarketplaceAnalyticsResponseSchema = successResponse(MarketplaceAnalyticsDataSchema);
export type MarketplaceAnalyticsResponse = z.infer<typeof MarketplaceAnalyticsResponseSchema>;

// --- Audience Analytics ---
export const SearchQueryStatSchema = z.object({
  query: z.string(),
  count: z.int().nonnegative(),
});
export type SearchQueryStat = z.infer<typeof SearchQueryStatSchema>;

export const ReferralSourceStatSchema = z.object({
  source: z.string(),
  count: z.int().nonnegative(),
  percentage: z.number().min(0).max(100),
});
export type ReferralSourceStat = z.infer<typeof ReferralSourceStatSchema>;
export const DiscoverySourceStatSchema = ReferralSourceStatSchema;
export type DiscoverySourceStat = ReferralSourceStat;

export const AudienceAnalyticsDataSchema = z.object({
  totalFollowers: z.int().nonnegative(),
  followerGrowth: z.number(),
  newLearners: z.int().nonnegative(),
  returningLearners: z.int().nonnegative(),
  retentionRate: z.number().min(0).max(100),
  searchQueries: z.array(SearchQueryStatSchema),
  referralSources: z.array(ReferralSourceStatSchema),
  followerTrend: z.array(
    z.object({
      date: z.string(),
      netFollowers: z.number(),
      newFollowers: z.int().nonnegative(),
      unfollows: z.int().nonnegative(),
    }),
  ).optional().default([]),
});
export type AudienceAnalyticsData = z.infer<typeof AudienceAnalyticsDataSchema>;

export const AudienceAnalyticsResponseSchema = successResponse(AudienceAnalyticsDataSchema);
export type AudienceAnalyticsResponse = z.infer<typeof AudienceAnalyticsResponseSchema>;

// --- Data Export ---
export const ExportResponseDataSchema = z.object({
  exportFormat: z.enum(['csv', 'json']),
  dataset: z.enum(['quizzes', 'challenges', 'marketplace', 'audience', 'overview']),
  generatedAt: wireDate,
  rowCount: z.int().nonnegative(),
  downloadUrl: z.string().optional(),
  data: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]).optional(),
});
export type ExportResponseData = z.infer<typeof ExportResponseDataSchema>;

export const ExportResponseSchema = successResponse(ExportResponseDataSchema);
export type ExportResponse = z.infer<typeof ExportResponseSchema>;

// ==========================================
// 6. AUTHORITATIVE PURE METRIC FORMULAS
// ==========================================

export function roundToDecimals(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
}

/**
 * Quiz Completion Rate: (Completed attempts / Started attempts) * 100
 * Clamped to [0, 100], defensive against division by zero, non-finite, or negative inputs.
 */
export function calculateCompletionRate(completed: number, started: number): number {
  if (!Number.isFinite(completed) || !Number.isFinite(started) || started <= 0 || completed <= 0) {
    return 0;
  }
  const rate = (Math.min(completed, started) / started) * 100;
  return roundToDecimals(rate, 2);
}
export const calculateQuizCompletionRate = calculateCompletionRate;

/**
 * Question Drop-Off Rate: ((Reached N - Reached N+1) / Reached N) * 100
 * Clamped to [0, 100], returns 0 if next >= current or current <= 0.
 */
export function calculateDropOffRate(reachedCurrent: number, reachedNext: number): number {
  if (!Number.isFinite(reachedCurrent) || !Number.isFinite(reachedNext) || reachedCurrent <= 0) {
    return 0;
  }
  const validNext = Math.max(0, reachedNext);
  if (validNext >= reachedCurrent) {
    return 0;
  }
  const dropOff = ((reachedCurrent - validNext) / reachedCurrent) * 100;
  return roundToDecimals(dropOff, 2);
}
export const calculateQuestionDropOffRate = calculateDropOffRate;

/**
 * Question Accuracy: (Correct Answers / Total Answers Given) * 100
 * Clamped to [0, 100], defensive against division by zero and negative inputs.
 */
export function calculateAccuracy(correct: number, total: number): number {
  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0 || correct <= 0) {
    return 0;
  }
  const rate = (Math.min(correct, total) / total) * 100;
  return roundToDecimals(rate, 2);
}
export const calculateQuestionAccuracy = calculateAccuracy;

/**
 * Marketplace Purchase Conversion Rate: (Completed Purchases / Eligible Listing Visits) * 100
 * Clamped to [0, 100], defensive against division by zero and negative inputs.
 */
export function calculateConversionRate(purchases: number, views: number): number {
  if (!Number.isFinite(purchases) || !Number.isFinite(views) || views <= 0 || purchases <= 0) {
    return 0;
  }
  const rate = (Math.min(purchases, views) / views) * 100;
  return roundToDecimals(rate, 2);
}
export const calculateMarketplaceConversionRate = calculateConversionRate;

/**
 * Net Creator Earnings: Gross Sales Revenue - Refunds - Platform Fees
 * Preserves signed balance (can be negative if period refunds exceed sales).
 * Sanitizes non-finite inputs to 0. Rounded to 2 decimal places.
 */
export function calculateNetEarnings(gross: number, refunds: number, platformFee: number): number {
  const g = Number.isFinite(gross) ? Math.max(0, gross) : 0;
  const r = Number.isFinite(refunds) ? Math.max(0, refunds) : 0;
  const f = Number.isFinite(platformFee) ? Math.max(0, platformFee) : 0;
  return roundToDecimals(g - r - f, 2);
}
export const calculateNetCreatorEarnings = calculateNetEarnings;
