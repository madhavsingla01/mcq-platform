import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
process.env.PORT = '5015';
process.env.CLIENT_URL = 'http://localhost:5173,http://localhost:3000';
process.env.JWT_SECRET = 'quizfocus-local-development-secret-minimum-32-bytes-long';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mcq-platform';

const { app } = await import('../dist/server.js');
const {
  ProcessedEvent,
  AnalyticsEvent,
  DailyQuizMetric,
  DailyCreatorMetric,
  DailyMarketplaceMetric,
  DailyAudienceMetric,
  DailyChallengeMetric,
} = await import('../dist/models/index.js');

describe('Analytics Service — Ingestion Endpoint & Aggregations (M3)', () => {
  let testServer;
  let baseUrl;

  before(async () => {
    testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, resolve));
    const { port } = testServer.address();
    baseUrl = `http://127.0.0.1:${port}`;

    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
  });

  after(async () => {
    if (testServer) {
      await new Promise((resolve) => testServer.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState === 1) {
      await ProcessedEvent.deleteMany({});
      await AnalyticsEvent.deleteMany({});
      await DailyQuizMetric.deleteMany({});
      await DailyCreatorMetric.deleteMany({});
      await DailyMarketplaceMetric.deleteMany({});
      await DailyAudienceMetric.deleteMany({});
      await DailyChallengeMetric.deleteMany({});
    }
  });

  it('T1-ING-01: Ingests valid event unauthenticated and returns 200 with duplicate: false', async () => {
    const eventId = crypto.randomUUID();
    const payload = {
      eventId,
      eventType: 'quiz.attempt.started.v1',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      producer: 'attempt-service',
      data: {
        attemptId: crypto.randomUUID(),
        quizId: '507f1f77bcf86cd799439011',
        creatorId: '507f1f77bcf86cd799439012',
        userId: '507f1f77bcf86cd799439013',
        startedAt: new Date().toISOString(),
        totalQuestions: 5,
      },
    };

    const res = await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.processed, true);
    assert.equal(body.duplicate, false);
    assert.equal(body.eventId, eventId);

    // Verify ProcessedEvent document
    const processed = await ProcessedEvent.findOne({ eventId });
    assert.ok(processed);

    // Verify AnalyticsEvent document
    const raw = await AnalyticsEvent.findOne({ eventId });
    assert.ok(raw);
    assert.equal(raw.eventType, 'quiz.attempt.started.v1');
  });

  it('T1-ING-02: Repeated submission with duplicate eventId returns 200 with duplicate: true', async () => {
    const eventId = crypto.randomUUID();
    const payload = {
      eventId,
      eventType: 'quiz.started.v1',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      producer: 'attempt-service',
      data: {
        attemptId: crypto.randomUUID(),
        quizId: '507f1f77bcf86cd799439011',
        creatorId: '507f1f77bcf86cd799439012',
        startedAt: new Date().toISOString(),
        totalQuestions: 5,
      },
    };

    // First delivery
    const res1 = await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.duplicate, false);

    // Second delivery (duplicate)
    const res2 = await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.success, true);
    assert.equal(body2.processed, true);
    assert.equal(body2.duplicate, true);

    // Verify quiz metrics not double counted
    const metrics = await DailyQuizMetric.find({ quizId: '507f1f77bcf86cd799439011' });
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].starts, 1);
  });

  it('T2-BND-01 to T2-BND-07: Validates envelope boundary requirements', async () => {
    // Missing eventId
    const res1 = await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'quiz.started.v1',
        timestamp: new Date().toISOString(),
        data: { quizId: '123' },
      }),
    });
    assert.equal(res1.status, 400);

    // Malformed non-UUID eventId
    const res2 = await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'not-a-valid-uuid',
        eventType: 'quiz.started.v1',
        timestamp: new Date().toISOString(),
        data: { quizId: '123' },
      }),
    });
    assert.equal(res2.status, 400);

    // Missing eventType
    const res3 = await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        data: { quizId: '123' },
      }),
    });
    assert.equal(res3.status, 400);

    // Missing timestamp
    const res4 = await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        eventType: 'quiz.started.v1',
        data: { quizId: '123' },
      }),
    });
    assert.equal(res4.status, 400);

    // Malformed non-ISO timestamp
    const res5 = await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        eventType: 'quiz.started.v1',
        timestamp: 'not-an-iso-date',
        data: { quizId: '123' },
      }),
    });
    assert.equal(res5.status, 400);

    // Timestamp skewed > 24 hours in the future
    const futureTime = new Date(Date.now() + 25 * 3600 * 1000).toISOString();
    const res6 = await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        eventType: 'quiz.started.v1',
        timestamp: futureTime,
        data: { quizId: '123' },
      }),
    });
    assert.equal(res6.status, 400);

    // Missing data object
    const res7 = await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        eventType: 'quiz.started.v1',
        timestamp: new Date().toISOString(),
      }),
    });
    assert.equal(res7.status, 400);
  });

  it('T3-CMB-07: Concurrently ingests duplicate event deliveries and safely processes exactly 1', async () => {
    const eventId = crypto.randomUUID();
    const payload = {
      eventId,
      eventType: 'quiz.started.v1',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      producer: 'attempt-service',
      data: {
        attemptId: crypto.randomUUID(),
        quizId: '507f1f77bcf86cd799439011',
        creatorId: '507f1f77bcf86cd799439012',
        startedAt: new Date().toISOString(),
      },
    };

    const requests = Array.from({ length: 20 }, () =>
      fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((r) => r.json())
    );

    const responses = await Promise.all(requests);
    const processed = responses.filter((r) => r.duplicate === false);
    const duplicates = responses.filter((r) => r.duplicate === true);

    assert.equal(processed.length, 1);
    assert.equal(duplicates.length, 19);
  });

  it('Aggregates marketplace listing purchases and refunds with financial accuracy', async () => {
    const creatorId = '507f1f77bcf86cd799439012';
    const listingId = '507f1f77bcf86cd799439099';

    // Purchase event
    await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        eventType: 'marketplace.listing_purchased.v1',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        producer: 'marketplace-service',
        data: {
          orderId: crypto.randomUUID(),
          listingId,
          sellerId: creatorId,
          amount: 50.0,
          platformFee: 5.0,
          creatorEarnings: 45.0,
          amountCents: 5000,
          platformFeeCents: 500,
          netEarningsCents: 4500,
          purchasedAt: new Date().toISOString(),
        },
      }),
    });

    const marketMetric = await DailyMarketplaceMetric.findOne({ listingId });
    assert.ok(marketMetric);
    assert.equal(marketMetric.purchases, 1);
    assert.equal(marketMetric.grossRevenueCents, 5000);
    assert.equal(marketMetric.platformFeesCents, 500);
    assert.equal(marketMetric.netEarningsCents, 4500);

    const creatorMetric = await DailyCreatorMetric.findOne({ creatorId });
    assert.ok(creatorMetric);
    assert.equal(creatorMetric.grossRevenueCents, 5000);
    assert.equal(creatorMetric.netEarningsCents, 4500);

    // Refund event
    await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        eventType: 'marketplace.refund_processed.v1',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        producer: 'marketplace-service',
        data: {
          refundId: crypto.randomUUID(),
          orderId: crypto.randomUUID(),
          listingId,
          sellerId: creatorId,
          amount: 50.0,
          platformFeeRefunded: 5.0,
          creatorDeduction: 45.0,
          refundAmountCents: 5000,
          platformFeeRefundCents: 500,
          netEarningsDeductionCents: 4500,
          refundedAt: new Date().toISOString(),
        },
      }),
    });

    const updatedMarket = await DailyMarketplaceMetric.findOne({ listingId });
    assert.equal(updatedMarket.refunds, 1);
    assert.equal(updatedMarket.grossRevenueCents, 0);
    assert.equal(updatedMarket.netEarningsCents, 0);
  });

  it('T1-QZ-03 & Scenario S1: Question drop-off funnel correctly tracks reach and drop-off without double counting Q1', async () => {
    const quizId = '507f1f77bcf86cd799439077';
    const creatorId = '507f1f77bcf86cd799439012';
    const totalQuestions = 5;

    const student1 = '507f1f77bcf86cd799439081';
    const student2 = '507f1f77bcf86cd799439082';
    const student3 = '507f1f77bcf86cd799439083';

    // 1. All 3 students start the quiz
    for (const userId of [student1, student2, student3]) {
      const res = await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: crypto.randomUUID(),
          eventType: 'quiz.attempt.started.v1',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          producer: 'attempt-service',
          data: {
            attemptId: crypto.randomUUID(),
            quizId,
            creatorId,
            userId,
            startedAt: new Date().toISOString(),
            totalQuestions,
          },
        }),
      });
      assert.equal(res.status, 200);
    }

    // Intermediate verification: Q1 reach must equal 3, Q2..Q5 reach must be 0
    let metric = await DailyQuizMetric.findOne({ quizId });
    assert.ok(metric);
    assert.equal(metric.starts, 3);
    assert.equal(metric.questionStats[0].reachedCount, 3);
    assert.equal(metric.questionStats[1].reachedCount, 0);

    // 2. Student 1 completes all 5 questions
    const s1Answers = [1, 2, 3, 4, 5].map((idx) => ({
      questionId: `q_${idx}`,
      questionIndex: idx,
      answered: true,
      correct: idx % 2 === 1,
      timeSpentSeconds: 20,
    }));
    await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        eventType: 'quiz.attempt.completed.v1',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        producer: 'attempt-service',
        data: {
          attemptId: crypto.randomUUID(),
          quizId,
          creatorId,
          userId: student1,
          startedAt: new Date(Date.now() - 300000).toISOString(),
          completedAt: new Date().toISOString(),
          score: 60,
          maxScore: 100,
          totalQuestions,
          questionsAnswered: 5,
          answers: s1Answers,
        },
      }),
    });

    // 3. Student 2 abandons after answering questions 1 to 3
    const s2Answers = [1, 2, 3].map((idx) => ({
      questionId: `q_${idx}`,
      questionIndex: idx,
      answered: true,
      correct: true,
      timeSpentSeconds: 25,
    }));
    await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        eventType: 'quiz.attempt.abandoned.v1',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        producer: 'attempt-service',
        data: {
          attemptId: crypto.randomUUID(),
          quizId,
          creatorId,
          userId: student2,
          abandonedAt: new Date().toISOString(),
          lastQuestionIndex: 3,
          lastQuestionNumber: 3,
          questionsAnswered: 3,
          totalQuestions,
          answers: s2Answers,
        },
      }),
    });

    // 4. Student 3 abandons after answering question 1
    const s3Answers = [
      {
        questionId: 'q_1',
        questionIndex: 1,
        answered: true,
        correct: true,
        timeSpentSeconds: 15,
      },
    ];
    await fetch(`${baseUrl}/api/v1/analytics/events/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        eventType: 'quiz.attempt.abandoned.v1',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        producer: 'attempt-service',
        data: {
          attemptId: crypto.randomUUID(),
          quizId,
          creatorId,
          userId: student3,
          abandonedAt: new Date().toISOString(),
          lastQuestionIndex: 1,
          lastQuestionNumber: 1,
          questionsAnswered: 1,
          totalQuestions,
          answers: s3Answers,
        },
      }),
    });

    // 5. Final assertion: verify exact reach counts and drop-off metrics
    metric = await DailyQuizMetric.findOne({ quizId });
    assert.ok(metric);
    assert.equal(metric.starts, 3);
    assert.equal(metric.completions, 1);
    assert.equal(metric.abandonments, 2);

    // Q1 reach must NOT be double-counted to 6; it must equal 3
    assert.equal(metric.questionStats[0].reachedCount, 3);
    assert.equal(metric.questionStats[1].reachedCount, 2);
    assert.equal(metric.questionStats[2].reachedCount, 2);
    assert.equal(metric.questionStats[3].reachedCount, 1);
    assert.equal(metric.questionStats[4].reachedCount, 1);

    // Drop-off count assertions
    // Q1 -> Q2: 3 reached - 2 reached = 1 dropped off (33.33%)
    assert.equal(metric.questionStats[0].dropOffCount, 1);
    // Q2 -> Q3: 2 reached - 2 reached = 0 dropped off (0%)
    assert.equal(metric.questionStats[1].dropOffCount, 0);
    // Q3 -> Q4: 2 reached - 1 reached = 1 dropped off (50%)
    assert.equal(metric.questionStats[2].dropOffCount, 1);
    // Q4 -> Q5: 1 reached - 1 reached = 0 dropped off (0%)
    assert.equal(metric.questionStats[3].dropOffCount, 0);
    // Q5: 0 dropped off
    assert.equal(metric.questionStats[4].dropOffCount, 0);
  });
});
