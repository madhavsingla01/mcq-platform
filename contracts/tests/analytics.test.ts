import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { z } from 'zod';
import {
  BaseEventEnvelopeSchema,
  BaseEventEnvelope,
  DomainEventType,
  DomainEventEnvelopeSchema,
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
  IngestEventResponseSchema,
  AnalyticsTimeframeSchema,
  DateRangeFilterSchema,
  PaginationQuerySchema,
  AnalyticsFilterQuerySchema,
  CreatorOverviewResponseSchema,
  QuizAnalyticsListResponseSchema,
  QuizDetailAnalyticsResponseSchema,
  ChallengeAnalyticsListResponseSchema,
  ChallengeDetailAnalyticsResponseSchema,
  MarketplaceAnalyticsResponseSchema,
  AudienceAnalyticsResponseSchema,
  ExportResponseSchema,
  calculateCompletionRate,
  calculateDropOffRate,
  calculateAccuracy,
  calculateConversionRate,
  calculateNetEarnings,
  calculateQuizCompletionRate,
  calculateQuestionDropOffRate,
  calculateQuestionAccuracy,
  calculateMarketplaceConversionRate,
  calculateNetCreatorEarnings,
  roundToDecimals,
} from '../v1/analytics.js';

type Assert<T extends true> = T;
export type AnalyticsTypeChecks = [
  Assert<z.infer<typeof BaseEventEnvelopeSchema>['version'] extends '1.0.0' ? true : false>,
  Assert<z.infer<typeof DomainEventType> extends string ? true : false>,
];

const VALID_OBJECT_ID_1 = '0123456789abcdef01234567';
const VALID_OBJECT_ID_2 = 'abcdef0123456789abcdef01';
const VALID_OBJECT_ID_3 = '507f1f77bcf86cd799439011';
const VALID_UUID = 'a0000000-0000-4000-8000-000000000001';
const VALID_ISO_DATE = '2026-11-14T12:00:00.000Z';

test('BaseEventEnvelopeSchema validates standard event envelope structure and rejects malformed fields', () => {
  const validEnvelope = {
    eventId: VALID_UUID,
    eventType: 'quiz.started.v1',
    version: '1.0.0',
    timestamp: VALID_ISO_DATE,
    producer: 'attempt-service',
    traceId: 'trace-12345',
    data: { key: 'value' },
  };

  const parsed = BaseEventEnvelopeSchema.parse(validEnvelope);
  assert.equal(parsed.eventId, VALID_UUID);
  assert.equal(parsed.version, '1.0.0');

  // Rejects invalid UUID
  assert.equal(BaseEventEnvelopeSchema.safeParse({ ...validEnvelope, eventId: 'not-a-uuid' }).success, false);

  // Rejects invalid timestamp
  assert.equal(BaseEventEnvelopeSchema.safeParse({ ...validEnvelope, timestamp: 'invalid-date' }).success, false);

  // Rejects incorrect version
  assert.equal(BaseEventEnvelopeSchema.safeParse({ ...validEnvelope, version: '2.0.0' }).success, false);

  // Rejects missing producer
  assert.equal(BaseEventEnvelopeSchema.safeParse({ ...validEnvelope, producer: '' }).success, false);
});

test('DomainEventEnvelopeSchema validates all 12 events through discriminated union', () => {
  // 1. quiz.started.v1
  const quizStarted = {
    eventId: VALID_UUID,
    eventType: 'quiz.started.v1',
    version: '1.0.0',
    timestamp: VALID_ISO_DATE,
    producer: 'attempt-service',
    data: {
      attemptId: VALID_OBJECT_ID_1,
      quizId: VALID_OBJECT_ID_2,
      creatorId: VALID_OBJECT_ID_3,
      userId: VALID_OBJECT_ID_1,
      sessionId: 'session-xyz',
      startedAt: VALID_ISO_DATE,
      isPractice: false,
      isChallenge: false,
      totalQuestions: 10,
    },
  };
  assert.equal(DomainEventEnvelopeSchema.safeParse(quizStarted).success, true);
  assert.equal(QuizStartedEventSchema.safeParse(quizStarted).success, true);

  // Negative: invalid ObjectId in quizId
  assert.equal(
    QuizStartedEventSchema.safeParse({
      ...quizStarted,
      data: { ...quizStarted.data, quizId: 'bad-id' },
    }).success,
    false,
  );

  // Negative: negative totalQuestions
  assert.equal(
    QuizStartedEventSchema.safeParse({
      ...quizStarted,
      data: { ...quizStarted.data, totalQuestions: -1 },
    }).success,
    false,
  );

  // 2. quiz.completed.v1
  const quizCompleted = {
    eventId: VALID_UUID,
    eventType: 'quiz.completed.v1',
    version: '1.0.0',
    timestamp: VALID_ISO_DATE,
    producer: 'attempt-service',
    data: {
      attemptId: VALID_OBJECT_ID_1,
      quizId: VALID_OBJECT_ID_2,
      creatorId: VALID_OBJECT_ID_3,
      completedAt: VALID_ISO_DATE,
      score: 80,
      totalMarks: 100,
      percentage: 80,
      totalQuestions: 10,
      correctCount: 8,
      wrongCount: 2,
    },
  };
  assert.equal(DomainEventEnvelopeSchema.safeParse(quizCompleted).success, true);
  assert.equal(QuizCompletedEventSchema.safeParse(quizCompleted).success, true);

  // Negative: percentage > 100
  assert.equal(
    QuizCompletedEventSchema.safeParse({
      ...quizCompleted,
      data: { ...quizCompleted.data, percentage: 105 },
    }).success,
    false,
  );

  // 3. quiz.abandoned.v1
  const quizAbandoned = {
    eventId: VALID_UUID,
    eventType: 'quiz.abandoned.v1',
    version: '1.0.0',
    timestamp: VALID_ISO_DATE,
    producer: 'attempt-service',
    data: {
      attemptId: VALID_OBJECT_ID_1,
      quizId: VALID_OBJECT_ID_2,
      creatorId: VALID_OBJECT_ID_3,
      abandonedAt: VALID_ISO_DATE,
      lastQuestionNumber: 4,
      questionsAnswered: 3,
      totalQuestions: 10,
      timeSpentSeconds: 120,
    },
  };
  assert.equal(DomainEventEnvelopeSchema.safeParse(quizAbandoned).success, true);
  assert.equal(QuizAbandonedEventSchema.safeParse(quizAbandoned).success, true);

  // Negative: negative questionsAnswered
  assert.equal(
    QuizAbandonedEventSchema.safeParse({
      ...quizAbandoned,
      data: { ...quizAbandoned.data, questionsAnswered: -1 },
    }).success,
    false,
  );

  // 4. quiz.question_answered.v1
  const questionAnswered = {
    eventId: VALID_UUID,
    eventType: 'quiz.question_answered.v1',
    version: '1.0.0',
    timestamp: VALID_ISO_DATE,
    producer: 'attempt-service',
    data: {
      attemptId: VALID_OBJECT_ID_1,
      quizId: VALID_OBJECT_ID_2,
      creatorId: VALID_OBJECT_ID_3,
      questionId: VALID_OBJECT_ID_1,
      questionNumber: 2,
      isCorrect: true,
      selectedAnswer: 'B',
      marksAwarded: 1,
      timeTakenMs: 4500,
      answeredAt: VALID_ISO_DATE,
    },
  };
  assert.equal(DomainEventEnvelopeSchema.safeParse(questionAnswered).success, true);
  assert.equal(QuizQuestionAnsweredEventSchema.safeParse(questionAnswered).success, true);

  // Negative: questionNumber must be positive (> 0)
  assert.equal(
    QuizQuestionAnsweredEventSchema.safeParse({
      ...questionAnswered,
      data: { ...questionAnswered.data, questionNumber: 0 },
    }).success,
    false,
  );

  // 5. challenge.created.v1
  const challengeCreated = {
    eventId: VALID_UUID,
    eventType: 'challenge.created.v1',
    version: '1.0.0',
    timestamp: VALID_ISO_DATE,
    producer: 'challenge-service',
    data: {
      challengeId: VALID_OBJECT_ID_1,
      creatorId: VALID_OBJECT_ID_3,
      title: 'Competitive Algorithmic Contest',
      durationMinutes: 45,
      deadlineAt: VALID_ISO_DATE,
      totalQuestions: 10,
      createdAt: VALID_ISO_DATE,
    },
  };
  assert.equal(DomainEventEnvelopeSchema.safeParse(challengeCreated).success, true);
  assert.equal(ChallengeCreatedEventSchema.safeParse(challengeCreated).success, true);

  // Negative: durationMinutes > 180
  assert.equal(
    ChallengeCreatedEventSchema.safeParse({
      ...challengeCreated,
      data: { ...challengeCreated.data, durationMinutes: 200 },
    }).success,
    false,
  );

  // Negative: totalQuestions > 10 (capped at 10)
  assert.equal(
    ChallengeCreatedEventSchema.safeParse({
      ...challengeCreated,
      data: { ...challengeCreated.data, totalQuestions: 11 },
    }).success,
    false,
  );

  // 6. challenge.participated.v1
  const challengeParticipated = {
    eventId: VALID_UUID,
    eventType: 'challenge.participated.v1',
    version: '1.0.0',
    timestamp: VALID_ISO_DATE,
    producer: 'challenge-service',
    data: {
      challengeId: VALID_OBJECT_ID_1,
      creatorId: VALID_OBJECT_ID_3,
      userId: VALID_OBJECT_ID_2,
      attemptId: VALID_OBJECT_ID_1,
      joinedAt: VALID_ISO_DATE,
    },
  };
  assert.equal(DomainEventEnvelopeSchema.safeParse(challengeParticipated).success, true);
  assert.equal(ChallengeParticipatedEventSchema.safeParse(challengeParticipated).success, true);

  // 7. challenge.submitted.v1
  const challengeSubmitted = {
    eventId: VALID_UUID,
    eventType: 'challenge.submitted.v1',
    version: '1.0.0',
    timestamp: VALID_ISO_DATE,
    producer: 'challenge-service',
    data: {
      challengeId: VALID_OBJECT_ID_1,
      creatorId: VALID_OBJECT_ID_3,
      userId: VALID_OBJECT_ID_2,
      attemptId: VALID_OBJECT_ID_1,
      score: 95,
      totalMarks: 100,
      percentage: 95,
      totalTimeMs: 1800000,
      submittedAt: VALID_ISO_DATE,
      quarantined: true,
    },
  };
  assert.equal(DomainEventEnvelopeSchema.safeParse(challengeSubmitted).success, true);
  assert.equal(ChallengeSubmittedEventSchema.safeParse(challengeSubmitted).success, true);

  // Negative: percentage < 0
  assert.equal(
    ChallengeSubmittedEventSchema.safeParse({
      ...challengeSubmitted,
      data: { ...challengeSubmitted.data, percentage: -5 },
    }).success,
    false,
  );

  // 8. marketplace.listing_viewed.v1
  const listingViewed = {
    eventId: VALID_UUID,
    eventType: 'marketplace.listing_viewed.v1',
    version: '1.0.0',
    timestamp: VALID_ISO_DATE,
    producer: 'marketplace-service',
    data: {
      listingId: VALID_OBJECT_ID_1,
      sellerId: VALID_OBJECT_ID_3,
      viewerId: VALID_OBJECT_ID_2,
      source: 'search',
      viewedAt: VALID_ISO_DATE,
    },
  };
  assert.equal(DomainEventEnvelopeSchema.safeParse(listingViewed).success, true);
  assert.equal(MarketplaceListingViewedEventSchema.safeParse(listingViewed).success, true);

  // 9. marketplace.listing_purchased.v1
  const listingPurchased = {
    eventId: VALID_UUID,
    eventType: 'marketplace.listing_purchased.v1',
    version: '1.0.0',
    timestamp: VALID_ISO_DATE,
    producer: 'marketplace-service',
    data: {
      orderId: VALID_OBJECT_ID_1,
      listingId: VALID_OBJECT_ID_2,
      sellerId: VALID_OBJECT_ID_3,
      buyerId: VALID_OBJECT_ID_1,
      amount: 49.99,
      platformFee: 4.99,
      creatorEarnings: 45.0,
      currency: 'USD',
      purchasedAt: VALID_ISO_DATE,
    },
  };
  assert.equal(DomainEventEnvelopeSchema.safeParse(listingPurchased).success, true);
  assert.equal(MarketplaceListingPurchasedEventSchema.safeParse(listingPurchased).success, true);

  // Negative: negative amount
  assert.equal(
    MarketplaceListingPurchasedEventSchema.safeParse({
      ...listingPurchased,
      data: { ...listingPurchased.data, amount: -10 },
    }).success,
    false,
  );

  // Negative: invalid currency code
  assert.equal(
    MarketplaceListingPurchasedEventSchema.safeParse({
      ...listingPurchased,
      data: { ...listingPurchased.data, currency: 'us-dollar' },
    }).success,
    false,
  );

  // 10. marketplace.refund_processed.v1
  const refundProcessed = {
    eventId: VALID_UUID,
    eventType: 'marketplace.refund_processed.v1',
    version: '1.0.0',
    timestamp: VALID_ISO_DATE,
    producer: 'marketplace-service',
    data: {
      refundId: 'ref_12345',
      orderId: VALID_OBJECT_ID_1,
      listingId: VALID_OBJECT_ID_2,
      sellerId: VALID_OBJECT_ID_3,
      buyerId: VALID_OBJECT_ID_1,
      amount: 49.99,
      currency: 'USD',
      reason: 'accidental purchase',
      refundedAt: VALID_ISO_DATE,
    },
  };
  assert.equal(DomainEventEnvelopeSchema.safeParse(refundProcessed).success, true);
  assert.equal(MarketplaceRefundProcessedEventSchema.safeParse(refundProcessed).success, true);

  // Negative: empty refundId
  assert.equal(
    MarketplaceRefundProcessedEventSchema.safeParse({
      ...refundProcessed,
      data: { ...refundProcessed.data, refundId: '' },
    }).success,
    false,
  );

  // 11. audience.user_followed.v1
  const userFollowed = {
    eventId: VALID_UUID,
    eventType: 'audience.user_followed.v1',
    version: '1.0.0',
    timestamp: VALID_ISO_DATE,
    producer: 'social-service',
    data: {
      creatorId: VALID_OBJECT_ID_3,
      followerId: VALID_OBJECT_ID_1,
      action: 'follow',
      followedAt: VALID_ISO_DATE,
    },
  };
  assert.equal(DomainEventEnvelopeSchema.safeParse(userFollowed).success, true);
  assert.equal(AudienceUserFollowedEventSchema.safeParse(userFollowed).success, true);

  // Negative: invalid action
  assert.equal(
    AudienceUserFollowedEventSchema.safeParse({
      ...userFollowed,
      data: { ...userFollowed.data, action: 'blocked' },
    }).success,
    false,
  );

  // 12. audience.discovery_source_logged.v1
  const discoveryLogged = {
    eventId: VALID_UUID,
    eventType: 'audience.discovery_source_logged.v1',
    version: '1.0.0',
    timestamp: VALID_ISO_DATE,
    producer: 'social-service',
    data: {
      creatorId: VALID_OBJECT_ID_3,
      userId: VALID_OBJECT_ID_1,
      sourceType: 'search',
      searchQuery: 'discrete mathematics',
      loggedAt: VALID_ISO_DATE,
    },
  };
  assert.equal(DomainEventEnvelopeSchema.safeParse(discoveryLogged).success, true);
  assert.equal(AudienceDiscoverySourceLoggedEventSchema.safeParse(discoveryLogged).success, true);

  // Unknown eventType fails discriminated union
  assert.equal(
    DomainEventEnvelopeSchema.safeParse({
      ...quizStarted,
      eventType: 'unknown.event.type.v1',
    }).success,
    false,
  );
});

test('IngestEventResponseSchema validates acknowledgment envelopes', () => {
  const normalResponse = {
    success: true,
    processed: true,
    duplicate: false,
    eventId: VALID_UUID,
  };
  assert.equal(IngestEventResponseSchema.safeParse(normalResponse).success, true);

  const duplicateResponse = {
    success: true,
    processed: true,
    duplicate: true,
    message: 'Event already processed',
  };
  assert.equal(IngestEventResponseSchema.safeParse(duplicateResponse).success, true);

  // Missing required boolean fails
  assert.equal(IngestEventResponseSchema.safeParse({ success: true, processed: true }).success, false);
});

test('Query parameter schemas validate timeframes, date windows, and pagination', () => {
  // Timeframe
  assert.equal(AnalyticsTimeframeSchema.safeParse('7d').success, true);
  assert.equal(AnalyticsTimeframeSchema.safeParse('30d').success, true);
  assert.equal(AnalyticsTimeframeSchema.safeParse('90d').success, true);
  assert.equal(AnalyticsTimeframeSchema.safeParse('1y').success, true);
  assert.equal(AnalyticsTimeframeSchema.safeParse('all').success, true);
  assert.equal(AnalyticsTimeframeSchema.safeParse('2weeks').success, false);

  // DateRangeFilter: valid window (startDate <= endDate)
  assert.equal(
    DateRangeFilterSchema.safeParse({
      startDate: '2026-11-01T00:00:00.000Z',
      endDate: '2026-11-14T00:00:00.000Z',
    }).success,
    true,
  );

  // DateRangeFilter: invalid window (startDate > endDate)
  const invertedRange = DateRangeFilterSchema.safeParse({
    startDate: '2026-11-20T00:00:00.000Z',
    endDate: '2026-11-10T00:00:00.000Z',
  });
  assert.equal(invertedRange.success, false);
  if (!invertedRange.success) {
    assert.match(invertedRange.error.issues[0]?.message ?? '', /startDate must be before or equal to endDate/);
  }

  // PaginationQuery: valid & coercion
  const parsedPagination = PaginationQuerySchema.parse({ page: '2', limit: '50' });
  assert.equal(parsedPagination.page, 2);
  assert.equal(parsedPagination.limit, 50);

  // PaginationQuery: out of bounds
  assert.equal(PaginationQuerySchema.safeParse({ page: 0 }).success, false);
  assert.equal(PaginationQuerySchema.safeParse({ limit: 101 }).success, false);

  // Full AnalyticsFilterQuerySchema
  const parsedQuery = AnalyticsFilterQuerySchema.parse({
    timeframe: '30d',
    search: 'math',
    category: 'STEM',
    page: '1',
    limit: '25',
  });
  assert.equal(parsedQuery.timeframe, '30d');
  assert.equal(parsedQuery.search, 'math');
  assert.equal(parsedQuery.limit, 25);
});

test('Studio response schemas validate creator overview, quiz details, and drop-off funnel', () => {
  // Creator Overview
  const overviewResponse = {
    success: true,
    data: {
      totalQuizzes: 12,
      totalStarts: 3450,
      totalCompletions: 2980,
      averageCompletionRate: 86.38,
      averageAccuracy: 74.2,
      activeChallenges: 2,
      totalChallengeParticipants: 450,
      grossRevenue: 1540.5,
      netEarnings: 1386.45,
      totalFollowers: 820,
      followerGrowth: 15.2,
      activityTrend: [
        { date: '2026-11-13', completions: 120, revenue: 50.0 },
        { date: '2026-11-14', completions: 145, revenue: 75.0 },
      ],
    },
  };
  assert.equal(CreatorOverviewResponseSchema.safeParse(overviewResponse).success, true);

  // Quiz Analytics List
  const quizListResponse = {
    success: true,
    data: {
      items: [
        {
          quizId: VALID_OBJECT_ID_1,
          title: 'Calculus I Midterm Prep',
          category: 'Mathematics',
          difficulty: 'Intermediate',
          totalStarts: 1200,
          totalCompletions: 1050,
          completionRate: 87.5,
          averageAccuracy: 81.4,
          averageTimeSeconds: 420,
        },
      ],
      pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
    },
  };
  assert.equal(QuizAnalyticsListResponseSchema.safeParse(quizListResponse).success, true);

  // Quiz Detail Analytics with Drop-Off Funnel
  const quizDetailResponse = {
    success: true,
    data: {
      quizId: VALID_OBJECT_ID_1,
      title: 'Calculus I Midterm Prep',
      questionCount: 3,
      totalStarts: 100,
      totalCompletions: 70,
      totalAbandoned: 30,
      completionRate: 70.0,
      averageAccuracy: 75.0,
      averageScore: 7.5,
      averageTimeSeconds: 360,
      dropOffFunnel: [
        {
          questionId: VALID_OBJECT_ID_1,
          questionNumber: 1,
          questionText: 'Evaluate limit as x approaches 0...',
          reachedCount: 100,
          dropOffCount: 10,
          dropOffRate: 10.0,
          correctCount: 85,
          totalAnswered: 90,
          accuracyRate: 94.44,
          averageTimeMs: 45000,
        },
        {
          questionId: VALID_OBJECT_ID_2,
          questionNumber: 2,
          questionText: 'Differentiate sin(x^2)...',
          reachedCount: 90,
          dropOffCount: 20,
          dropOffRate: 22.22,
          correctCount: 65,
          totalAnswered: 70,
          accuracyRate: 92.86,
          averageTimeMs: 65000,
        },
      ],
      trend: [{ date: '2026-11-14', starts: 100, completions: 70 }],
    },
  };
  assert.equal(QuizDetailAnalyticsResponseSchema.safeParse(quizDetailResponse).success, true);
});

test('Challenge response schemas enforce quarantine isolation on active contests', () => {
  // Quarantined Challenge Detail (active contest - score details masked/omitted)
  const quarantinedResponse = {
    success: true,
    data: {
      challengeId: VALID_OBJECT_ID_1,
      title: 'Active Hackathon Round',
      status: 'active',
      deadlineAt: '2026-11-20T18:00:00.000Z',
      isQuarantined: true,
      totalParticipants: 85,
      totalSubmissions: 42,
      averageScore: null,
      medianScore: null,
      highestScore: null,
    },
  };
  assert.equal(ChallengeDetailAnalyticsResponseSchema.safeParse(quarantinedResponse).success, true);

  // Finalized / Ended Challenge Detail (quarantine released - full score histogram available)
  const finalizedResponse = {
    success: true,
    data: {
      challengeId: VALID_OBJECT_ID_1,
      title: 'Finalized Hackathon Round',
      status: 'ended',
      deadlineAt: '2026-11-10T18:00:00.000Z',
      isQuarantined: false,
      totalParticipants: 100,
      totalSubmissions: 95,
      averageScore: 78.5,
      medianScore: 80.0,
      highestScore: 100.0,
      scoreDistribution: [
        { range: '0-50', count: 10 },
        { range: '51-80', count: 45 },
        { range: '81-100', count: 40 },
      ],
    },
  };
  assert.equal(ChallengeDetailAnalyticsResponseSchema.safeParse(finalizedResponse).success, true);

  // Challenge List
  const challengeListResponse = {
    success: true,
    data: {
      items: [
        {
          challengeId: VALID_OBJECT_ID_1,
          title: 'Active Hackathon Round',
          challengeStatus: 'active',
          deadlineAt: '2026-11-20T18:00:00.000Z',
          totalParticipants: 85,
          totalSubmissions: 42,
          isQuarantined: true,
        },
      ],
      pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
    },
  };
  assert.equal(ChallengeAnalyticsListResponseSchema.safeParse(challengeListResponse).success, true);
});

test('Marketplace, Audience, and Export response schemas validate financial and engagement metrics', () => {
  // Marketplace Analytics Response
  const marketplaceResponse = {
    success: true,
    data: {
      grossRevenue: 5000.0,
      refunds: 250.0,
      platformFees: 500.0,
      netEarnings: 4250.0,
      totalListingViews: 12500,
      totalPurchases: 250,
      conversionRate: 2.0,
      currency: 'USD',
      listings: [
        {
          listingId: VALID_OBJECT_ID_1,
          title: 'Complete MCAT Physics Question Bank',
          views: 3000,
          purchases: 90,
          conversionRate: 3.0,
          grossRevenue: 1800.0,
          netEarnings: 1530.0,
        },
      ],
    },
  };
  assert.equal(MarketplaceAnalyticsResponseSchema.safeParse(marketplaceResponse).success, true);

  // Audience Analytics Response
  const audienceResponse = {
    success: true,
    data: {
      totalFollowers: 1240,
      followerGrowth: 18.5,
      newLearners: 450,
      returningLearners: 790,
      retentionRate: 63.71,
      searchQueries: [
        { query: 'organic chemistry', count: 320 },
        { query: 'biochemistry pathways', count: 180 },
      ],
      referralSources: [
        { source: 'search', count: 450, percentage: 36.29 },
        { source: 'direct', count: 350, percentage: 28.23 },
      ],
    },
  };
  assert.equal(AudienceAnalyticsResponseSchema.safeParse(audienceResponse).success, true);

  // Export Response
  const exportResponse = {
    success: true,
    data: {
      exportFormat: 'csv',
      dataset: 'quizzes',
      generatedAt: VALID_ISO_DATE,
      rowCount: 50,
      downloadUrl: 'https://cdn.quizfocus.com/exports/quizzes-2026.csv',
    },
  };
  assert.equal(ExportResponseSchema.safeParse(exportResponse).success, true);
});

test('calculateCompletionRate computes rate correctly and defensively handles edge cases', () => {
  // Normal cases
  assert.equal(calculateCompletionRate(50, 100), 50.0);
  assert.equal(calculateCompletionRate(1, 3), 33.33);
  assert.equal(calculateCompletionRate(100, 100), 100.0);

  // Zero denominator / zero start
  assert.equal(calculateCompletionRate(0, 0), 0.0);
  assert.equal(calculateCompletionRate(5, 0), 0.0);

  // Negative inputs
  assert.equal(calculateCompletionRate(-5, 10), 0.0);
  assert.equal(calculateCompletionRate(5, -10), 0.0);
  assert.equal(calculateCompletionRate(-5, -10), 0.0);

  // Clamped when completed exceeds started
  assert.equal(calculateCompletionRate(15, 10), 100.0);

  // Non-finite values
  assert.equal(calculateCompletionRate(NaN, 10), 0.0);
  assert.equal(calculateCompletionRate(10, Infinity), 0.0);
  assert.equal(calculateCompletionRate(Infinity, 10), 0.0);

  // Alias equivalence
  assert.equal(calculateQuizCompletionRate(50, 100), 50.0);
});

test('calculateDropOffRate computes step drop-off percentage with safety bounds', () => {
  // Normal cases
  assert.equal(calculateDropOffRate(100, 70), 30.0);
  assert.equal(calculateDropOffRate(100, 100), 0.0);
  assert.equal(calculateDropOffRate(3, 2), 33.33);

  // Current question reached is 0
  assert.equal(calculateDropOffRate(0, 0), 0.0);
  assert.equal(calculateDropOffRate(0, 5), 0.0);

  // Next exceeds current (anomalous data - must not yield negative drop-off)
  assert.equal(calculateDropOffRate(10, 12), 0.0);

  // Next is negative (clamped to 0, representing 100% drop-off)
  assert.equal(calculateDropOffRate(10, -2), 100.0);

  // Non-finite values
  assert.equal(calculateDropOffRate(NaN, 10), 0.0);
  assert.equal(calculateDropOffRate(10, NaN), 0.0);
  assert.equal(calculateDropOffRate(Infinity, 10), 0.0);

  // Alias equivalence
  assert.equal(calculateQuestionDropOffRate(100, 70), 30.0);
});

test('calculateAccuracy computes question accuracy percentage and guards against divide-by-zero', () => {
  // Normal cases
  assert.equal(calculateAccuracy(7, 10), 70.0);
  assert.equal(calculateAccuracy(1, 3), 33.33);
  assert.equal(calculateAccuracy(10, 10), 100.0);

  // Zero total
  assert.equal(calculateAccuracy(0, 0), 0.0);
  assert.equal(calculateAccuracy(5, 0), 0.0);

  // Negative inputs
  assert.equal(calculateAccuracy(-2, 10), 0.0);
  assert.equal(calculateAccuracy(5, -10), 0.0);

  // Correct > total (clamped to 100)
  assert.equal(calculateAccuracy(12, 10), 100.0);

  // Non-finite values
  assert.equal(calculateAccuracy(NaN, 10), 0.0);
  assert.equal(calculateAccuracy(10, NaN), 0.0);

  // Alias equivalence
  assert.equal(calculateQuestionAccuracy(7, 10), 70.0);
});

test('calculateConversionRate computes purchase conversion percentage and guards against divide-by-zero', () => {
  // Normal cases
  assert.equal(calculateConversionRate(5, 20), 25.0);
  assert.equal(calculateConversionRate(1, 300), 0.33);

  // Zero views
  assert.equal(calculateConversionRate(0, 0), 0.0);
  assert.equal(calculateConversionRate(10, 0), 0.0);

  // Purchases > views (clamped to 100)
  assert.equal(calculateConversionRate(100, 50), 100.0);

  // Negative purchases
  assert.equal(calculateConversionRate(-5, 50), 0.0);

  // Non-finite values
  assert.equal(calculateConversionRate(NaN, 50), 0.0);
  assert.equal(calculateConversionRate(5, NaN), 0.0);

  // Alias equivalence
  assert.equal(calculateMarketplaceConversionRate(5, 20), 25.0);
});

test('calculateNetEarnings reconciles revenue, refunds, and platform fees with 2-decimal precision', () => {
  // Normal cases
  assert.equal(calculateNetEarnings(100, 10, 5), 85.0);
  assert.equal(calculateNetEarnings(100.555, 10.111, 5.222), 85.22);

  // Net negative balance (refunds exceed sales)
  assert.equal(calculateNetEarnings(0, 25.5, 0), -25.5);
  assert.equal(calculateNetEarnings(10, 30, 2), -22.0);

  // Non-finite / missing parameters sanitized to 0
  assert.equal(calculateNetEarnings(NaN, 10, 5), -15.0);
  assert.equal(calculateNetEarnings(100, NaN, 5), 95.0);
  assert.equal(calculateNetEarnings(NaN, NaN, NaN), 0.0);

  // Helper roundToDecimals
  assert.equal(roundToDecimals(12.3456, 2), 12.35);
  assert.equal(roundToDecimals(NaN), 0);

  // Alias equivalence
  assert.equal(calculateNetCreatorEarnings(100, 10, 5), 85.0);
});
