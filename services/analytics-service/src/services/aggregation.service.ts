import {
  DailyQuizMetric,
  DailyCreatorMetric,
  DailyMarketplaceMetric,
  DailyAudienceMetric,
  DailyChallengeMetric,
  type IDailyQuizMetric,
  type IQuestionStat,
  type IScoreDistributionEntry,
} from '../models/index.js';
import type { IngestionEnvelope } from '../validators/events.validator.js';
import logger from '../utils/logger.js';

function extractDate(timestamp: string): string {
  if (!timestamp) return new Date().toISOString().slice(0, 10);
  return timestamp.slice(0, 10);
}

function computeScoreDistribution(scores: { percentage: number }[]): IScoreDistributionEntry[] {
  const buckets = [
    { range: '0-20', min: 0, max: 20, count: 0 },
    { range: '21-40', min: 21, max: 40, count: 0 },
    { range: '41-60', min: 41, max: 60, count: 0 },
    { range: '61-80', min: 61, max: 80, count: 0 },
    { range: '81-100', min: 81, max: 100, count: 0 },
  ];

  for (const item of scores) {
    const pct = Math.round(item.percentage);
    const bucket = buckets.find((b) => pct >= b.min && pct <= b.max) || buckets[buckets.length - 1];
    if (bucket) {
      bucket.count++;
    }
  }

  return buckets.map((b) => ({ range: b.range, count: b.count }));
}

export class AggregationService {
  public async processEvent(event: IngestionEnvelope): Promise<void> {
    const { eventType, timestamp, data } = event;
    const date = extractDate(timestamp);

    switch (eventType) {
      case 'quiz.started.v1':
      case 'quiz.attempt.started.v1':
        await this.handleQuizStarted(date, data);
        break;

      case 'quiz.completed.v1':
      case 'quiz.attempt.completed.v1':
        await this.handleQuizCompleted(date, data);
        break;

      case 'quiz.abandoned.v1':
      case 'quiz.attempt.abandoned.v1':
        await this.handleQuizAbandoned(date, data);
        break;

      case 'quiz.question_answered.v1':
        await this.handleQuizQuestionAnswered(date, data);
        break;

      case 'challenge.created.v1':
        await this.handleChallengeCreated(date, data);
        break;

      case 'challenge.participated.v1':
        await this.handleChallengeParticipated(date, data);
        break;

      case 'challenge.submitted.v1':
        await this.handleChallengeSubmitted(date, data);
        break;

      case 'marketplace.listing_viewed.v1':
        await this.handleMarketplaceListingViewed(date, data);
        break;

      case 'marketplace.listing_purchased.v1':
      case 'marketplace.purchase.completed.v1':
        await this.handleMarketplaceListingPurchased(date, data);
        break;

      case 'marketplace.refund_processed.v1':
      case 'marketplace.refund.processed.v1':
        await this.handleMarketplaceRefundProcessed(date, data);
        break;

      case 'audience.user_followed.v1':
      case 'creator.followed.v1':
        await this.handleAudienceUserFollowed(date, data);
        break;

      case 'audience.discovery_source_logged.v1':
      case 'search.query.executed.v1':
        await this.handleAudienceDiscoverySourceLogged(date, data);
        break;

      default:
        logger.info(`Received unaggregated or custom event type: ${eventType}`);
        break;
    }
  }

  private async handleQuizStarted(date: string, data: Record<string, unknown>): Promise<void> {
    const quizId = String(data.quizId || '');
    const creatorId = String(data.creatorId || '');
    const userId = data.userId ? String(data.userId) : null;
    const totalQuestions = Number(data.totalQuestions) || 5;

    if (!quizId || !creatorId) return;

    // DailyQuizMetric
    let metric = await DailyQuizMetric.findOne({ date, quizId });
    if (!metric) {
      const initialStats: IQuestionStat[] = [];
      for (let i = 1; i <= totalQuestions; i++) {
        initialStats.push({
          questionId: `q_${i}`,
          questionNumber: i,
          questionIndex: i,
          questionText: `Question ${i}`,
          reachedCount: i === 1 ? 1 : 0,
          dropOffCount: 0,
          correctCount: 0,
          totalAnswered: 0,
          totalTimeMs: 0,
        });
      }
      metric = await DailyQuizMetric.create({
        date,
        quizId,
        creatorId,
        title: (data.quizTitle as string) || (data.title as string) || '',
        category: (data.category as string) || 'General',
        difficulty: (data.difficulty as string) || 'Intermediate',
        starts: 1,
        completions: 0,
        abandonments: 0,
        totalQuestions,
        questionStats: initialStats,
        uniqueLearners: userId ? [userId] : [],
      });
      this.updateDropOffCounts(metric);
      await metric.save();
    } else {
      metric.starts += 1;
      if (userId && !metric.uniqueLearners.includes(userId)) {
        metric.uniqueLearners.push(userId);
      }
      if (!metric.questionStats || metric.questionStats.length === 0) {
        const count = Math.max(totalQuestions, 1);
        metric.questionStats = [];
        for (let i = 1; i <= count; i++) {
          metric.questionStats.push({
            questionId: `q_${i}`,
            questionNumber: i,
            questionIndex: i,
            questionText: `Question ${i}`,
            reachedCount: i === 1 ? metric.starts : 0,
            dropOffCount: 0,
            correctCount: 0,
            totalAnswered: 0,
            totalTimeMs: 0,
          });
        }
      } else {
        const firstStat = metric.questionStats.find(
          (s) => s.questionIndex === 1 || s.questionNumber === 1
        ) || metric.questionStats[0];
        if (firstStat) {
          firstStat.reachedCount += 1;
        }
      }
      this.updateDropOffCounts(metric);
      await metric.save();
    }

    // DailyCreatorMetric
    await DailyCreatorMetric.findOneAndUpdate(
      { date, creatorId },
      {
        $inc: { totalStarts: 1, totalAttempts: 1 },
        ...(userId ? { $addToSet: { uniqueLearners: userId } } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  private async handleQuizCompleted(date: string, data: Record<string, unknown>): Promise<void> {
    const quizId = String(data.quizId || '');
    const creatorId = String(data.creatorId || '');
    const userId = data.userId ? String(data.userId) : null;
    const score = Number(data.score) || 0;
    const maxScore = Number(data.maxScore || data.totalMarks) || 100;
    const totalQuestions = Number(data.totalQuestions) || 5;
    const answeredCount = Number(data.answeredCount || data.questionsAnswered || 0);
    const answers = Array.isArray(data.answers) ? data.answers : [];
    const correctCount = Number(
      data.correctCount !== undefined
        ? data.correctCount
        : answers.filter((a: any) => a.correct === true || a.isCorrect === true).length
    );
    const timeSeconds = Number(
      data.totalTimeSeconds !== undefined
        ? data.totalTimeSeconds
        : data.totalTimeMs
        ? Math.round(Number(data.totalTimeMs) / 1000)
        : 0
    );

    if (!quizId || !creatorId) return;

    let metric = await DailyQuizMetric.findOne({ date, quizId });
    if (!metric) {
      metric = new DailyQuizMetric({
        date,
        quizId,
        creatorId,
        title: (data.quizTitle as string) || (data.title as string) || '',
        category: (data.category as string) || 'General',
        difficulty: (data.difficulty as string) || 'Intermediate',
        starts: 1,
        completions: 1,
        abandonments: 0,
        totalScore: score,
        totalMaxScore: maxScore,
        totalQuestions,
        totalTimeSeconds: timeSeconds,
        totalAnswersGiven: answeredCount,
        totalCorrectAnswers: correctCount,
        questionStats: [],
        uniqueLearners: userId ? [userId] : [],
      });
    } else {
      metric.completions += 1;
      metric.totalScore += score;
      metric.totalMaxScore += maxScore;
      metric.totalTimeSeconds += timeSeconds;
      metric.totalAnswersGiven += answeredCount;
      metric.totalCorrectAnswers += correctCount;
      if (userId && !metric.uniqueLearners.includes(userId)) {
        metric.uniqueLearners.push(userId);
      }
    }

    // Process questions and dropoffs from answers array
    if (answers.length > 0) {
      // Ensure questionStats has entries
      if (!metric.questionStats || metric.questionStats.length === 0) {
        const count = Math.max(answers.length, totalQuestions);
        for (let i = 1; i <= count; i++) {
          metric.questionStats.push({
            questionId: `q_${i}`,
            questionNumber: i,
            questionIndex: i,
            questionText: `Question ${i}`,
            reachedCount: i === 1 ? Math.max(metric.starts, 1) : 0,
            dropOffCount: 0,
            correctCount: 0,
            totalAnswered: 0,
            totalTimeMs: 0,
          });
        }
      }

      answers.forEach((ans: any, idx: number) => {
        const qIndex = Number(ans.questionIndex || ans.questionNumber || idx + 1);
        let stat = metric!.questionStats.find(
          (s) => s.questionIndex === qIndex || s.questionId === ans.questionId
        );
        if (!stat) {
          stat = {
            questionId: ans.questionId ? String(ans.questionId) : `q_${qIndex}`,
            questionNumber: qIndex,
            questionIndex: qIndex,
            questionText: `Question ${qIndex}`,
            reachedCount: qIndex === 1 ? Math.max(metric!.starts, 1) : 0,
            dropOffCount: 0,
            correctCount: 0,
            totalAnswered: 0,
            totalTimeMs: 0,
          };
          metric!.questionStats.push(stat);
        }

        // Only increment reachedCount for Question k > 1.
        // Question 1 reach was already counted when the quiz attempt started (handleQuizStarted).
        if (qIndex > 1) {
          stat.reachedCount += 1;
        }
        stat.totalAnswered += 1;
        if (ans.correct === true || ans.isCorrect === true) {
          stat.correctCount += 1;
        }
        const timeMs = Number(ans.timeSpentMs || (ans.timeSpentSeconds ? ans.timeSpentSeconds * 1000 : 0));
        stat.totalTimeMs += timeMs;
      });
    }

    this.updateDropOffCounts(metric);
    await metric.save();

    // Update DailyCreatorMetric
    await DailyCreatorMetric.findOneAndUpdate(
      { date, creatorId },
      {
        $inc: {
          totalCompletions: 1,
          totalScore: score,
          totalMaxScore: maxScore,
          totalAnswersGiven: answeredCount,
          totalCorrectAnswers: correctCount,
        },
        ...(userId ? { $addToSet: { uniqueLearners: userId } } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  private async handleQuizAbandoned(date: string, data: Record<string, unknown>): Promise<void> {
    const quizId = String(data.quizId || '');
    const creatorId = String(data.creatorId || '');
    const answers = Array.isArray(data.answers) ? data.answers : [];
    const lastQuestionNumber = Number(
      data.lastQuestionNumber || data.lastQuestionIndex || data.questionsAnswered || answers.length || 0
    );

    if (!quizId || !creatorId) return;

    let metric = await DailyQuizMetric.findOne({ date, quizId });
    if (metric) {
      metric.abandonments += 1;

      // Ensure questionStats exists if needed
      if (!metric.questionStats || metric.questionStats.length === 0) {
        const count = Math.max(answers.length, lastQuestionNumber, metric.totalQuestions || 5);
        for (let i = 1; i <= count; i++) {
          metric.questionStats.push({
            questionId: `q_${i}`,
            questionNumber: i,
            questionIndex: i,
            questionText: `Question ${i}`,
            reachedCount: i === 1 ? Math.max(metric.starts, 1) : 0,
            dropOffCount: 0,
            correctCount: 0,
            totalAnswered: 0,
            totalTimeMs: 0,
          });
        }
      }

      const answeredIndices = new Set<number>();

      // If answers are provided, update reach counts
      if (answers.length > 0) {
        answers.forEach((ans: any, idx: number) => {
          const qIndex = Number(ans.questionIndex || ans.questionNumber || idx + 1);
          answeredIndices.add(qIndex);
          const stat = metric!.questionStats.find(
            (s) => s.questionIndex === qIndex || s.questionId === ans.questionId
          );
          if (stat) {
            // Only increment reachedCount for Question k > 1.
            // Question 1 reach was already counted upon quiz start (handleQuizStarted).
            if (qIndex > 1) {
              stat.reachedCount += 1;
            }
            stat.totalAnswered += 1;
            if (ans.correct === true || ans.isCorrect === true) {
              stat.correctCount += 1;
            }
          }
        });
      }

      // If lastQuestionNumber indicates progress beyond answered questions, update reach for unattempted reached questions
      if (lastQuestionNumber > 1 && metric.questionStats.length > 0) {
        for (let qNum = 2; qNum <= lastQuestionNumber; qNum++) {
          if (!answeredIndices.has(qNum)) {
            const stat = metric.questionStats.find(
              (s) => s.questionIndex === qNum || s.questionNumber === qNum
            );
            if (stat) {
              stat.reachedCount += 1;
            }
          }
        }
      }

      this.updateDropOffCounts(metric);
      await metric.save();
    }

    await DailyCreatorMetric.findOneAndUpdate(
      { date, creatorId },
      { $inc: { totalAbandonments: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  private async handleQuizQuestionAnswered(date: string, data: Record<string, unknown>): Promise<void> {
    const quizId = String(data.quizId || '');
    const questionId = String(data.questionId || '');
    const isCorrect = Boolean(data.isCorrect || data.correct);
    const timeTakenMs = Number(data.timeTakenMs || 0);
    const questionIndex = Number(data.questionIndex || data.questionNumber || 1);

    if (!quizId) return;

    const metric = await DailyQuizMetric.findOne({ date, quizId });
    if (metric) {
      metric.totalAnswersGiven += 1;
      if (isCorrect) metric.totalCorrectAnswers += 1;

      let stat = metric.questionStats.find(
        (s) => s.questionId === questionId || s.questionIndex === questionIndex
      );
      if (!stat) {
        stat = {
          questionId,
          questionIndex,
          questionNumber: questionIndex,
          questionText: `Question ${questionIndex}`,
          reachedCount: questionIndex === 1 ? Math.max(metric.starts, 1) : 1,
          dropOffCount: 0,
          correctCount: isCorrect ? 1 : 0,
          totalAnswered: 1,
          totalTimeMs: timeTakenMs,
        };
        metric.questionStats.push(stat);
      } else {
        if (questionIndex > 1) {
          stat.reachedCount += 1;
        }
        stat.totalAnswered += 1;
        if (isCorrect) stat.correctCount += 1;
        stat.totalTimeMs += timeTakenMs;
      }

      this.updateDropOffCounts(metric);
      await metric.save();
    }
  }

  private updateDropOffCounts(metric: IDailyQuizMetric): void {
    if (!metric.questionStats || metric.questionStats.length === 0) return;

    metric.questionStats.sort((a, b) => {
      const idxA = a.questionIndex ?? a.questionNumber ?? 0;
      const idxB = b.questionIndex ?? b.questionNumber ?? 0;
      return idxA - idxB;
    });

    const q1Stat = metric.questionStats.find(
      (s) => s.questionIndex === 1 || s.questionNumber === 1
    ) || metric.questionStats[0];

    if (q1Stat && metric.starts > 0) {
      q1Stat.reachedCount = Math.max(metric.starts, q1Stat.reachedCount);
    }

    const len = metric.questionStats.length;
    for (let i = 0; i < len; i++) {
      const current = metric.questionStats[i];
      if (!current) continue;
      const next = i + 1 < len ? metric.questionStats[i + 1] : null;
      if (next) {
        current.dropOffCount = Math.max(0, current.reachedCount - next.reachedCount);
      } else {
        current.dropOffCount = 0;
      }
    }
  }

  private async handleChallengeCreated(date: string, data: Record<string, unknown>): Promise<void> {
    const challengeId = String(data.challengeId || '');
    const creatorId = String(data.creatorId || '');
    if (!challengeId || !creatorId) return;

    await DailyChallengeMetric.findOneAndUpdate(
      { challengeId },
      {
        $setOnInsert: {
          creatorId,
          title: (data.title as string) || '',
          category: (data.category as string) || 'General',
          difficulty: (data.difficulty as string) || 'Intermediate',
          status: (data.status as string) || 'active',
          deadlineAt: data.deadlineAt ? new Date(data.deadlineAt as string) : undefined,
          durationMinutes: Number(data.durationMinutes) || 60,
          totalQuestions: Number(data.totalQuestions) || 5,
          totalParticipants: 0,
          totalSubmissions: 0,
          participantCount: 0,
          submissionCount: 0,
          averageScore: 0,
          scores: [],
          scoreDistribution: [],
          submissionTimeline: [],
          date,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await DailyCreatorMetric.findOneAndUpdate(
      { date, creatorId },
      { $inc: { activeChallenges: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  private async handleChallengeParticipated(date: string, data: Record<string, unknown>): Promise<void> {
    const challengeId = String(data.challengeId || '');
    const creatorId = String(data.creatorId || '');
    if (!challengeId) return;

    await DailyChallengeMetric.findOneAndUpdate(
      { challengeId },
      { $inc: { totalParticipants: 1, participantCount: 1 } },
      { upsert: true, new: true }
    );

    if (creatorId) {
      await DailyCreatorMetric.findOneAndUpdate(
        { date, creatorId },
        { $inc: { challengeParticipants: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  }

  private async handleChallengeSubmitted(date: string, data: Record<string, unknown>): Promise<void> {
    const challengeId = String(data.challengeId || '');
    const creatorId = String(data.creatorId || '');
    const userId = String(data.userId || '');
    const score = Number(data.score) || 0;
    const maxScore = Number(data.maxScore || data.totalMarks) || 100;
    const percentage = Number(
      data.percentage !== undefined
        ? data.percentage
        : maxScore > 0
        ? (score / maxScore) * 100
        : score
    );
    const totalTimeMs = Number(
      data.totalTimeMs || (data.timeTakenSeconds ? Number(data.timeTakenSeconds) * 1000 : 0)
    );
    const submittedAt = data.submittedAt ? new Date(data.submittedAt as string) : new Date();

    if (!challengeId) return;

    let challenge = await DailyChallengeMetric.findOne({ challengeId });
    if (!challenge) {
      challenge = new DailyChallengeMetric({
        challengeId,
        creatorId,
        title: (data.title as string) || '',
        category: (data.category as string) || 'General',
        difficulty: (data.difficulty as string) || 'Intermediate',
        status: 'active',
        totalParticipants: 1,
        participantCount: 1,
        totalSubmissions: 1,
        submissionCount: 1,
        averageScore: score,
        scores: [{ userId, score, percentage, totalTimeMs, submittedAt }],
        scoreDistribution: computeScoreDistribution([{ percentage }]),
        submissionTimeline: [{ timestamp: submittedAt.toISOString(), submissionsCount: 1 }],
        date,
      });
    } else {
      challenge.totalSubmissions += 1;
      challenge.submissionCount += 1;
      challenge.scores.push({ userId, score, percentage, totalTimeMs, submittedAt });
      const sum = challenge.scores.reduce((acc, s) => acc + s.score, 0);
      challenge.averageScore = challenge.scores.length > 0 ? Number((sum / challenge.scores.length).toFixed(2)) : 0;
      challenge.scoreDistribution = computeScoreDistribution(challenge.scores);
      challenge.submissionTimeline.push({ timestamp: submittedAt.toISOString(), submissionsCount: 1 });
    }

    await challenge.save();

    if (creatorId) {
      await DailyCreatorMetric.findOneAndUpdate(
        { date, creatorId },
        { $inc: { totalSubmissions: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  }

  private async handleMarketplaceListingViewed(date: string, data: Record<string, unknown>): Promise<void> {
    const listingId = String(data.listingId || '');
    const creatorId = String(data.sellerId || data.creatorId || '');
    const listingTitle = String(data.listingTitle || data.title || '');

    if (!listingId || !creatorId) return;

    await DailyMarketplaceMetric.findOneAndUpdate(
      { date, listingId },
      {
        $setOnInsert: { creatorId, listingTitle, currency: 'USD' },
        $inc: { views: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  private async handleMarketplaceListingPurchased(date: string, data: Record<string, unknown>): Promise<void> {
    const listingId = String(data.listingId || '');
    const creatorId = String(data.sellerId || data.creatorId || '');
    const buyerId = data.buyerId ? String(data.buyerId) : null;
    const amount = Number(data.amount) || 0;
    const platformFee = Number(data.platformFee) || 0;
    const amountCents = data.amountCents !== undefined ? Number(data.amountCents) : Math.round(amount * 100);
    const feeCents = data.platformFeeCents !== undefined ? Number(data.platformFeeCents) : Math.round(platformFee * 100);
    const netCents = data.netEarningsCents !== undefined ? Number(data.netEarningsCents) : amountCents - feeCents;
    const netEarnings = data.creatorEarnings !== undefined ? Number(data.creatorEarnings) : amount - platformFee;
    const listingTitle = String(data.listingTitle || data.title || '');

    if (!listingId || !creatorId) return;

    await DailyMarketplaceMetric.findOneAndUpdate(
      { date, listingId },
      {
        $setOnInsert: { creatorId, currency: 'USD' },
        ...(listingTitle ? { $set: { listingTitle } } : {}),
        $inc: {
          purchases: 1,
          grossRevenue: amount,
          grossRevenueCents: amountCents,
          platformFee,
          platformFeesCents: feeCents,
          netEarnings,
          netEarningsCents: netCents,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await DailyCreatorMetric.findOneAndUpdate(
      { date, creatorId },
      {
        $inc: {
          grossRevenueCents: amountCents,
          platformFeesCents: feeCents,
          netEarningsCents: netCents,
          totalEarnings: netEarnings,
          totalEarningsCents: netCents,
        },
        ...(buyerId ? { $addToSet: { uniqueLearners: buyerId } } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  private async handleMarketplaceRefundProcessed(date: string, data: Record<string, unknown>): Promise<void> {
    const listingId = String(data.listingId || '');
    const creatorId = String(data.sellerId || data.creatorId || '');
    const amount = Number(data.amount) || 0;
    const feeRefund = Number(data.platformFeeRefunded) || 0;
    const amountCents = data.refundAmountCents !== undefined ? Number(data.refundAmountCents) : Math.round(amount * 100);
    const feeRefundCents = data.platformFeeRefundCents !== undefined ? Number(data.platformFeeRefundCents) : Math.round(feeRefund * 100);
    const netDeductionCents = data.netEarningsDeductionCents !== undefined ? Number(data.netEarningsDeductionCents) : amountCents - feeRefundCents;
    const netDeduction = data.creatorDeduction !== undefined ? Number(data.creatorDeduction) : amount - feeRefund;

    if (!listingId || !creatorId) return;

    await DailyMarketplaceMetric.findOneAndUpdate(
      { date, listingId },
      {
        $setOnInsert: { creatorId, currency: 'USD' },
        $inc: {
          refunds: 1,
          grossRevenue: -amount,
          grossRevenueCents: -amountCents,
          platformFee: -feeRefund,
          platformFeesCents: -feeRefundCents,
          netEarnings: -netDeduction,
          netEarningsCents: -netDeductionCents,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await DailyCreatorMetric.findOneAndUpdate(
      { date, creatorId },
      {
        $inc: {
          refundsCents: amountCents,
          netEarningsCents: -netDeductionCents,
          totalEarnings: -netDeduction,
          totalEarningsCents: -netDeductionCents,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  private async handleAudienceUserFollowed(date: string, data: Record<string, unknown>): Promise<void> {
    const creatorId = String(data.creatorId || '');
    const action = String(data.action || 'follow');
    const isFollow = action === 'follow' || action === 'followed';

    if (!creatorId) return;

    await DailyAudienceMetric.findOneAndUpdate(
      { date, creatorId },
      {
        $inc: {
          newFollowers: isFollow ? 1 : 0,
          unfollowers: !isFollow ? 1 : 0,
          netFollowers: isFollow ? 1 : -1,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await DailyCreatorMetric.findOneAndUpdate(
      { date, creatorId },
      {
        $inc: {
          newFollowers: isFollow ? 1 : 0,
          unfollowers: !isFollow ? 1 : 0,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  private async handleAudienceDiscoverySourceLogged(date: string, data: Record<string, unknown>): Promise<void> {
    const creatorId = String(data.creatorId || '');
    const query = String(data.searchQuery || data.searchTerm || '').trim();
    const source = String(data.source || data.referrer || data.referrerUrl || data.sourceType || 'direct').trim();
    const device = String(data.device || 'desktop').toLowerCase();
    const isMobile = device.includes('mobile') || device.includes('ios') || device.includes('android');

    if (!creatorId) return;

    let audience = await DailyAudienceMetric.findOne({ date, creatorId });
    if (!audience) {
      audience = new DailyAudienceMetric({
        date,
        creatorId,
        newFollowers: 0,
        unfollowers: 0,
        netFollowers: 0,
        newLearners: 1,
        returningLearners: 0,
        searchQueries: query ? [{ query, count: 1 }] : [],
        referralSources: source ? [{ source, count: 1 }] : [],
        deviceBreakdown: {
          desktop: isMobile ? 0 : 1,
          mobile: isMobile ? 1 : 0,
        },
      });
    } else {
      if (isMobile) {
        audience.deviceBreakdown.mobile += 1;
      } else {
        audience.deviceBreakdown.desktop += 1;
      }

      if (query) {
        const existingQuery = audience.searchQueries.find((q) => q.query.toLowerCase() === query.toLowerCase());
        if (existingQuery) {
          existingQuery.count += 1;
        } else {
          audience.searchQueries.push({ query, count: 1 });
        }
      }

      if (source) {
        const existingSource = audience.referralSources.find((s) => s.source.toLowerCase() === source.toLowerCase());
        if (existingSource) {
          existingSource.count += 1;
        } else {
          audience.referralSources.push({ source, count: 1 });
        }
      }
    }

    await audience.save();
  }
}

export const aggregationService = new AggregationService();
export default aggregationService;
