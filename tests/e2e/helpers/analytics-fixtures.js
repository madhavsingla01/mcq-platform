/**
 * QuizFocus Studio & Analytics Service Test Fixtures
 *
 * Synthetic event payload generators and test fixtures for:
 * - Domain events:
 *   - quiz.attempt.started.v1
 *   - quiz.attempt.completed.v1
 *   - challenge.submitted.v1
 *   - marketplace.purchase.completed.v1
 *   - marketplace.refund.processed.v1
 *   - creator.followed.v1
 *   - search.query.executed.v1
 * - BaseEventEnvelope generator conforming to PROJECT.md interface contract
 * - Question drop-off funnel fixtures with multi-student simulation
 * - Active vs past contest deadline sealing fixtures
 * - Marketplace financial reconciliation and audit fixtures
 * - Metric calculation formula helpers (completion rate, drop-off rate, accuracy, conversion, net earnings)
 */

import crypto from 'node:crypto';

/**
 * Generates a unique collision-free ID with optional prefix.
 * @param {string} prefix
 * @returns {string}
 */
export function generateUniqueId(prefix = 'id') {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${timestamp}_${randomPart}`;
}

/**
 * Generates a standard UUID v4 string.
 * @returns {string}
 */
export function generateUuid() {
  return crypto.randomUUID();
}

/**
 * Creates a dynamic event envelope conforming to BaseEventEnvelope.
 *
 * interface BaseEventEnvelope<T = unknown> {
 *   eventId: string; // UUID v4
 *   eventType: string; // e.g. "quiz.attempt.completed.v1"
 *   version: "1.0.0";
 *   timestamp: string; // ISO 8601 UTC
 *   producer: string; // e.g. "attempt-service"
 *   traceId?: string;
 *   data: T;
 * }
 *
 * @template T
 * @param {string} eventType
 * @param {T} data
 * @param {Object} [overrides]
 * @returns {Object}
 */
export function createEventEnvelope(eventType, data, overrides = {}) {
  return {
    eventId: overrides.eventId || generateUuid(),
    eventType,
    version: overrides.version || '1.0.0',
    timestamp: overrides.timestamp || new Date().toISOString(),
    producer: overrides.producer || 'e2e-fixture-generator',
    traceId: overrides.traceId || `trace_${generateUuid()}`,
    data,
  };
}

// ============================================================================
// Domain Event Payload Builders
// ============================================================================

/**
 * Builds a `quiz.attempt.started.v1` domain event envelope.
 * @param {Object} [customData]
 * @param {Object} [envelopeOverrides]
 * @returns {Object}
 */
export function buildQuizAttemptStartedEvent(customData = {}, envelopeOverrides = {}) {
  const now = new Date().toISOString();
  const data = {
    attemptId: customData.attemptId || generateUuid(),
    quizId: customData.quizId || generateUuid(),
    creatorId: customData.creatorId || generateUuid(),
    userId: customData.userId || generateUuid(),
    startedAt: customData.startedAt || now,
    ...customData,
  };
  return createEventEnvelope(
    'quiz.attempt.started.v1',
    data,
    { producer: 'attempt-service', ...envelopeOverrides }
  );
}

/**
 * Builds a `quiz.attempt.completed.v1` domain event envelope.
 * @param {Object} [customData]
 * @param {Object} [envelopeOverrides]
 * @returns {Object}
 */
export function buildQuizAttemptCompletedEvent(customData = {}, envelopeOverrides = {}) {
  const startedAt = customData.startedAt || new Date(Date.now() - 300000).toISOString();
  const completedAt = customData.completedAt || new Date().toISOString();
  const totalQuestions = customData.totalQuestions || 5;
  const questionsAnswered = customData.questionsAnswered !== undefined ? customData.questionsAnswered : 5;
  const score = customData.score !== undefined ? customData.score : 80;
  const maxScore = customData.maxScore !== undefined ? customData.maxScore : 100;
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const passed = customData.passed !== undefined ? customData.passed : percentage >= 70;

  // Build default answers array if not provided
  const answers = customData.answers || Array.from({ length: questionsAnswered }, (_, idx) => ({
    questionId: `q_${idx + 1}`,
    questionIndex: idx + 1,
    answered: true,
    correct: idx % 2 === 0, // alternates correct/incorrect
    timeSpentSeconds: 25,
  }));

  const data = {
    attemptId: customData.attemptId || generateUuid(),
    quizId: customData.quizId || generateUuid(),
    creatorId: customData.creatorId || generateUuid(),
    userId: customData.userId || generateUuid(),
    startedAt,
    completedAt,
    score,
    maxScore,
    percentage,
    passed,
    totalQuestions,
    questionsAnswered,
    answers,
    ...customData,
  };

  return createEventEnvelope(
    'quiz.attempt.completed.v1',
    data,
    { producer: 'attempt-service', ...envelopeOverrides }
  );
}

/**
 * Builds a `challenge.submitted.v1` domain event envelope.
 * @param {Object} [customData]
 * @param {Object} [envelopeOverrides]
 * @returns {Object}
 */
export function buildChallengeSubmittedEvent(customData = {}, envelopeOverrides = {}) {
  const now = new Date().toISOString();
  const data = {
    submissionId: customData.submissionId || generateUuid(),
    challengeId: customData.challengeId || generateUuid(),
    creatorId: customData.creatorId || generateUuid(),
    userId: customData.userId || generateUuid(),
    username: customData.username || `challenger_${Math.random().toString(36).substring(2, 6)}`,
    submittedAt: customData.submittedAt || now,
    score: customData.score !== undefined ? customData.score : 85,
    maxScore: customData.maxScore !== undefined ? customData.maxScore : 100,
    timeTakenSeconds: customData.timeTakenSeconds || 145,
    rank: customData.rank || 1,
    answers: customData.answers || [
      { questionId: 'ch_q1', correct: true },
      { questionId: 'ch_q2', correct: true },
      { questionId: 'ch_q3', correct: false },
    ],
    ...customData,
  };

  return createEventEnvelope(
    'challenge.submitted.v1',
    data,
    { producer: 'challenge-service', ...envelopeOverrides }
  );
}

/**
 * Builds a `marketplace.purchase.completed.v1` domain event envelope.
 * @param {Object} [customData]
 * @param {Object} [envelopeOverrides]
 * @returns {Object}
 */
export function buildMarketplacePurchaseCompletedEvent(customData = {}, envelopeOverrides = {}) {
  const amountCents = customData.amountCents !== undefined ? customData.amountCents : 1999;
  const platformFeeCents = customData.platformFeeCents !== undefined
    ? customData.platformFeeCents
    : Math.round(amountCents * 0.10); // default 10% platform fee
  const netEarningsCents = customData.netEarningsCents !== undefined
    ? customData.netEarningsCents
    : amountCents - platformFeeCents;

  const data = {
    orderId: customData.orderId || generateUuid(),
    listingId: customData.listingId || generateUuid(),
    listingTitle: customData.listingTitle || 'Premium React Mastery Study Guide',
    creatorId: customData.creatorId || generateUuid(),
    buyerId: customData.buyerId || generateUuid(),
    amountCents,
    currency: customData.currency || 'USD',
    platformFeeCents,
    netEarningsCents,
    purchasedAt: customData.purchasedAt || new Date().toISOString(),
    ...customData,
  };

  return createEventEnvelope(
    'marketplace.purchase.completed.v1',
    data,
    { producer: 'marketplace-service', ...envelopeOverrides }
  );
}

/**
 * Builds a `marketplace.refund.processed.v1` domain event envelope.
 * @param {Object} [customData]
 * @param {Object} [envelopeOverrides]
 * @returns {Object}
 */
export function buildMarketplaceRefundProcessedEvent(customData = {}, envelopeOverrides = {}) {
  const refundAmountCents = customData.refundAmountCents !== undefined ? customData.refundAmountCents : 1999;
  const platformFeeRefundCents = customData.platformFeeRefundCents !== undefined
    ? customData.platformFeeRefundCents
    : Math.round(refundAmountCents * 0.10);
  const netEarningsDeductionCents = customData.netEarningsDeductionCents !== undefined
    ? customData.netEarningsDeductionCents
    : refundAmountCents - platformFeeRefundCents;

  const data = {
    refundId: customData.refundId || generateUuid(),
    orderId: customData.orderId || generateUuid(),
    listingId: customData.listingId || generateUuid(),
    creatorId: customData.creatorId || generateUuid(),
    buyerId: customData.buyerId || generateUuid(),
    refundAmountCents,
    platformFeeRefundCents,
    netEarningsDeductionCents,
    refundedAt: customData.refundedAt || new Date().toISOString(),
    reason: customData.reason || 'Customer request within 14-day satisfaction guarantee',
    ...customData,
  };

  return createEventEnvelope(
    'marketplace.refund.processed.v1',
    data,
    { producer: 'marketplace-service', ...envelopeOverrides }
  );
}

/**
 * Builds a `creator.followed.v1` domain event envelope.
 * @param {Object} [customData]
 * @param {Object} [envelopeOverrides]
 * @returns {Object}
 */
export function buildCreatorFollowedEvent(customData = {}, envelopeOverrides = {}) {
  const data = {
    followId: customData.followId || generateUuid(),
    creatorId: customData.creatorId || generateUuid(),
    followerId: customData.followerId || generateUuid(),
    action: customData.action || 'follow',
    followedAt: customData.followedAt || new Date().toISOString(),
    ...customData,
  };

  return createEventEnvelope(
    'creator.followed.v1',
    data,
    { producer: 'social-service', ...envelopeOverrides }
  );
}

/**
 * Builds a `search.query.executed.v1` domain event envelope.
 * @param {Object} [customData]
 * @param {Object} [envelopeOverrides]
 * @returns {Object}
 */
export function buildSearchQueryExecutedEvent(customData = {}, envelopeOverrides = {}) {
  const data = {
    queryId: customData.queryId || generateUuid(),
    creatorId: customData.creatorId || generateUuid(),
    searchTerm: customData.searchTerm || 'advanced javascript mcq',
    resultCount: customData.resultCount !== undefined ? customData.resultCount : 5,
    targetType: customData.targetType || 'quiz',
    referrer: customData.referrer || 'direct',
    deviceType: customData.deviceType || 'desktop',
    timestamp: customData.timestamp || new Date().toISOString(),
    ...customData,
  };

  return createEventEnvelope(
    'search.query.executed.v1',
    data,
    { producer: 'search-service', ...envelopeOverrides }
  );
}

// ============================================================================
// High-Level Fixture Helpers
// ============================================================================

/**
 * Builds a realistic question drop-off funnel fixture.
 * Simulates multiple students attempting a quiz with varying depth.
 *
 * Default Scenario (S1 from TEST_INFRA.md):
 * - Quiz with 5 questions
 * - Student 1 completes all 5 questions (reaches Q1, Q2, Q3, Q4, Q5)
 * - Student 2 drops off at Question 3 (reaches Q1, Q2, Q3)
 * - Student 3 drops off at Question 1 (reaches Q1)
 *
 * Mathematical Expectations:
 * - Total starts = 3
 * - Total completions = 1
 * - Overall Completion Rate = (1 / 3) * 100 = 33.33%
 * - Funnel Step Reach:
 *   - Q1: 3 students (100%)
 *   - Q2: 2 students (66.67%) -> Drop-off from Q1: ((3 - 2) / 3) * 100 = 33.33%
 *   - Q3: 2 students (66.67%) -> Drop-off from Q2: ((2 - 2) / 2) * 100 = 0%
 *   - Q4: 1 student  (33.33%) -> Drop-off from Q3: ((2 - 1) / 2) * 100 = 50%
 *   - Q5: 1 student  (33.33%) -> Drop-off from Q4: ((1 - 1) / 1) * 100 = 0%
 *
 * @param {Object} [options]
 * @returns {Object}
 */
export function buildDropoffFunnelFixture(options = {}) {
  const quizId = options.quizId || generateUuid();
  const creatorId = options.creatorId || generateUuid();
  const questionCount = options.questionCount || 5;

  const students = [
    { userId: generateUuid(), maxQuestionReached: 5, completed: true, correctCount: 4 },
    { userId: generateUuid(), maxQuestionReached: 3, completed: false, correctCount: 2 },
    { userId: generateUuid(), maxQuestionReached: 1, completed: false, correctCount: 1 },
  ];

  const events = [];
  const funnelReach = new Array(questionCount).fill(0);
  let totalAnswersGiven = 0;
  let totalCorrectAnswers = 0;

  for (const student of students) {
    const attemptId = generateUuid();
    const startedAt = new Date(Date.now() - 600000).toISOString();

    // Start event
    events.push(buildQuizAttemptStartedEvent({
      attemptId,
      quizId,
      creatorId,
      userId: student.userId,
      startedAt,
    }));

    // Generate answers up to maxQuestionReached
    const studentAnswers = [];
    for (let qIdx = 1; qIdx <= student.maxQuestionReached; qIdx++) {
      funnelReach[qIdx - 1]++;
      totalAnswersGiven++;
      const isCorrect = qIdx <= student.correctCount;
      if (isCorrect) totalCorrectAnswers++;

      studentAnswers.push({
        questionId: `q_${qIdx}`,
        questionIndex: qIdx,
        answered: true,
        correct: isCorrect,
        timeSpentSeconds: 30,
      });
    }

    // If student completed, emit completed event
    if (student.completed) {
      events.push(buildQuizAttemptCompletedEvent({
        attemptId,
        quizId,
        creatorId,
        userId: student.userId,
        startedAt,
        completedAt: new Date().toISOString(),
        score: Math.round((student.correctCount / questionCount) * 100),
        maxScore: 100,
        totalQuestions: questionCount,
        questionsAnswered: student.maxQuestionReached,
        answers: studentAnswers,
      }));
    } else {
      events.push(createEventEnvelope(
        'quiz.attempt.abandoned.v1',
        {
          attemptId,
          quizId,
          creatorId,
          userId: student.userId,
          abandonedAt: new Date().toISOString(),
          lastQuestionIndex: student.maxQuestionReached,
          lastQuestionNumber: student.maxQuestionReached,
          questionsAnswered: student.maxQuestionReached,
          totalQuestions: questionCount,
          answers: studentAnswers,
        },
        { producer: 'attempt-service' }
      ));
    }
  }

  // Calculate funnel step drop-off rates
  const funnelSteps = [];
  for (let i = 0; i < questionCount; i++) {
    const reached = funnelReach[i];
    const nextReached = i + 1 < questionCount ? funnelReach[i + 1] : reached;
    const dropOffCount = reached - nextReached;
    const dropOffRate = reached > 0 ? (dropOffCount / reached) * 100 : 0;

    funnelSteps.push({
      questionIndex: i + 1,
      questionId: `q_${i + 1}`,
      attemptsReached: reached,
      dropOffCount,
      dropOffRate: Number(dropOffRate.toFixed(2)),
    });
  }

  const expectedMetrics = {
    startedAttempts: students.length,
    completedAttempts: students.filter(s => s.completed).length,
    completionRate: Number(((1 / students.length) * 100).toFixed(2)), // 33.33%
    totalAnswersGiven,
    totalCorrectAnswers,
    accuracyRate: Number(((totalCorrectAnswers / totalAnswersGiven) * 100).toFixed(2)),
  };

  return {
    quizId,
    creatorId,
    questionCount,
    students,
    events,
    funnelSteps,
    expectedMetrics,
  };
}

/**
 * Builds a contest deadline fixture (Active vs Past).
 * Verifies participant privacy before deadline and unsealing after deadline.
 *
 * @param {Object} [options]
 * @returns {Object}
 */
export function buildContestDeadlineFixture(options = {}) {
  const challengeId = options.challengeId || generateUuid();
  const creatorId = options.creatorId || generateUuid();
  const state = options.state || 'active'; // 'active' | 'past'
  const participantCount = options.participantCount || 5;

  const now = Date.now();
  const deadlineAt = state === 'active'
    ? new Date(now + 24 * 60 * 60 * 1000).toISOString() // 24 hours into future
    : new Date(now - 60 * 60 * 1000).toISOString(); // 1 hour in past

  const isSealed = state === 'active';

  const participants = Array.from({ length: participantCount }, (_, idx) => ({
    userId: generateUuid(),
    username: `participant_${idx + 1}`,
    score: 60 + idx * 8, // scores: 60, 68, 76, 84, 92
    timeTakenSeconds: 120 + idx * 15,
  }));

  const events = participants.map((p, idx) => buildChallengeSubmittedEvent({
    challengeId,
    creatorId,
    userId: p.userId,
    username: p.username,
    score: p.score,
    rank: participantCount - idx,
    timeTakenSeconds: p.timeTakenSeconds,
    submittedAt: new Date(now - (participantCount - idx) * 60000).toISOString(),
  }));

  return {
    challengeId,
    creatorId,
    state,
    deadlineAt,
    isSealed,
    participantCount,
    participants,
    events,
    expectedStandings: participants.sort((a, b) => b.score - a.score),
  };
}

/**
 * Builds a marketplace financial reconciliation and audit fixture.
 * Reconciles listings, visits, purchases, refunds, and platform fees identically.
 *
 * Default Scenario (S3 from TEST_INFRA.md):
 * - 1 Listing ($19.99 = 1999 cents)
 * - 10 Listing visits
 * - 3 Purchases ($59.97 = 5997 cents)
 * - 1 Refund ($19.99 = 1999 cents)
 * - 10% Platform fee per purchase (200 cents), refund credits fee back (200 cents)
 *
 * Mathematical Expectations:
 * - Gross Revenue: 3 * 1999 = 5997 cents ($59.97)
 * - Refunds: 1 * 1999 = 1999 cents ($19.99)
 * - Net Sales Units: 3 - 1 = 2
 * - Net Platform Fee: (3 * 200) - (1 * 200) = 400 cents ($4.00)
 * - Net Creator Earnings: 5997 - 1999 - 400 = 3598 cents ($35.98)
 * - Purchase Conversion Rate: (3 / 10) * 100 = 30.0%
 *
 * @param {Object} [options]
 * @returns {Object}
 */
export function buildMarketplaceFinancialAuditFixture(options = {}) {
  const listingId = options.listingId || generateUuid();
  const creatorId = options.creatorId || generateUuid();
  const listingTitle = options.listingTitle || 'Comprehensive System Design MCQ Masterclass';
  const priceCents = options.priceCents || 1999;
  const visitCount = options.visitCount !== undefined ? options.visitCount : 10;
  const purchaseCount = options.purchaseCount !== undefined ? options.purchaseCount : 3;
  const refundCount = options.refundCount !== undefined ? options.refundCount : 1;
  const feePercent = options.feePercent !== undefined ? options.feePercent : 10;

  const orders = [];
  const refunds = [];
  const purchaseEvents = [];
  const refundEvents = [];

  for (let i = 0; i < purchaseCount; i++) {
    const orderId = generateUuid();
    const buyerId = generateUuid();
    const platformFeeCents = Math.round((priceCents * feePercent) / 100);
    const netEarningsCents = priceCents - platformFeeCents;

    const order = {
      orderId,
      listingId,
      creatorId,
      buyerId,
      amountCents: priceCents,
      currency: 'USD',
      platformFeeCents,
      netEarningsCents,
      purchasedAt: new Date(Date.now() - (10 - i) * 3600000).toISOString(),
    };
    orders.push(order);
    purchaseEvents.push(buildMarketplacePurchaseCompletedEvent(order));
  }

  for (let j = 0; j < refundCount; j++) {
    const targetOrder = orders[j];
    const refundId = generateUuid();
    const refundAmountCents = targetOrder.amountCents;
    const platformFeeRefundCents = targetOrder.platformFeeCents;
    const netEarningsDeductionCents = targetOrder.netEarningsCents;

    const refund = {
      refundId,
      orderId: targetOrder.orderId,
      listingId,
      creatorId,
      buyerId: targetOrder.buyerId,
      refundAmountCents,
      platformFeeRefundCents,
      netEarningsDeductionCents,
      refundedAt: new Date().toISOString(),
      reason: 'Requested refund within satisfaction guarantee period',
    };
    refunds.push(refund);
    refundEvents.push(buildMarketplaceRefundProcessedEvent(refund));
  }

  const grossSalesCents = purchaseCount * priceCents;
  const totalRefundsCents = refundCount * priceCents;
  const totalFeeCents = (purchaseCount - refundCount) * Math.round((priceCents * feePercent) / 100);
  const netEarningsCents = grossSalesCents - totalRefundsCents - totalFeeCents;
  const conversionRate = visitCount > 0 ? (purchaseCount / visitCount) * 100 : 0;

  const expectedAudit = {
    listingId,
    listingTitle,
    visitCount,
    purchaseCount,
    refundCount,
    grossSalesCents,
    totalRefundsCents,
    totalFeeCents,
    netEarningsCents,
    conversionRate: Number(conversionRate.toFixed(2)),
  };

  return {
    listingId,
    creatorId,
    listingTitle,
    priceCents,
    orders,
    refunds,
    purchaseEvents,
    refundEvents,
    allEvents: [...purchaseEvents, ...refundEvents],
    expectedAudit,
  };
}

// ============================================================================
// Mathematical Formula Verification Helpers
// ============================================================================

/**
 * Calculates Quiz Completion Rate.
 * Formula: (Completed Attempts / Started Attempts) * 100
 * @param {number} completedAttempts
 * @param {number} startedAttempts
 * @returns {number}
 */
export function calculateCompletionRate(completedAttempts, startedAttempts) {
  if (startedAttempts <= 0) return 0;
  return Number(((completedAttempts / startedAttempts) * 100).toFixed(2));
}

/**
 * Calculates Question Drop-Off Rate at Step N.
 * Formula: ((Attempts Reaching N - Attempts Reaching N+1) / Attempts Reaching N) * 100
 * @param {number} attemptsAtN
 * @param {number} attemptsAtNext
 * @returns {number}
 */
export function calculateDropOffRate(attemptsAtN, attemptsAtNext) {
  if (attemptsAtN <= 0) return 0;
  const dropOff = attemptsAtN - attemptsAtNext;
  return Number(((dropOff / attemptsAtN) * 100).toFixed(2));
}

/**
 * Calculates Question Accuracy on Answered.
 * Formula: (Correct Answers / Total Answers Given) * 100
 * @param {number} correctAnswers
 * @param {number} totalAnswersGiven
 * @returns {number}
 */
export function calculateAccuracy(correctAnswers, totalAnswersGiven) {
  if (totalAnswersGiven <= 0) return 0;
  return Number(((correctAnswers / totalAnswersGiven) * 100).toFixed(2));
}

/**
 * Calculates Marketplace Purchase Conversion.
 * Formula: (Completed Purchases / Eligible Listing Visits) * 100
 * @param {number} completedPurchases
 * @param {number} eligibleVisits
 * @returns {number}
 */
export function calculateConversionRate(completedPurchases, eligibleVisits) {
  if (eligibleVisits <= 0) return 0;
  return Number(((completedPurchases / eligibleVisits) * 100).toFixed(2));
}

/**
 * Calculates Net Creator Earnings.
 * Formula: Gross Sales Revenue - Refunds - Platform Fees
 * @param {number} grossSalesCents
 * @param {number} refundsCents
 * @param {number} platformFeesCents
 * @returns {number}
 */
export function calculateNetEarnings(grossSalesCents, refundsCents, platformFeesCents) {
  return grossSalesCents - refundsCents - platformFeesCents;
}
