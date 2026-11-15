import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IDailyCreatorMetric extends Document {
  date: string; // YYYY-MM-DD
  creatorId: string;
  activeQuizzes: number;
  totalStarts: number;
  totalAttempts: number;
  totalCompletions: number;
  totalAbandonments: number;
  totalScore: number;
  totalMaxScore: number;
  totalAnswersGiven: number;
  totalCorrectAnswers: number;
  uniqueLearners: string[];
  uniqueLearnersCount: number;
  grossRevenueCents: number;
  refundsCents: number;
  platformFeesCents: number;
  netEarningsCents: number;
  totalEarnings: number;
  totalEarningsCents: number;
  activeChallenges: number;
  challengeParticipants: number;
  newFollowers: number;
  unfollowers: number;
  createdAt: Date;
  updatedAt: Date;
}

const DailyCreatorMetricSchema = new Schema<IDailyCreatorMetric>(
  {
    date: { type: String, required: true, index: true },
    creatorId: { type: String, required: true, index: true },
    activeQuizzes: { type: Number, default: 0 },
    totalStarts: { type: Number, default: 0 },
    totalAttempts: { type: Number, default: 0 },
    totalCompletions: { type: Number, default: 0 },
    totalAbandonments: { type: Number, default: 0 },
    totalScore: { type: Number, default: 0 },
    totalMaxScore: { type: Number, default: 0 },
    totalAnswersGiven: { type: Number, default: 0 },
    totalCorrectAnswers: { type: Number, default: 0 },
    uniqueLearners: { type: [String], default: [] },
    uniqueLearnersCount: { type: Number, default: 0 },
    grossRevenueCents: { type: Number, default: 0 },
    refundsCents: { type: Number, default: 0 },
    platformFeesCents: { type: Number, default: 0 },
    netEarningsCents: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    totalEarningsCents: { type: Number, default: 0 },
    activeChallenges: { type: Number, default: 0 },
    challengeParticipants: { type: Number, default: 0 },
    newFollowers: { type: Number, default: 0 },
    unfollowers: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'daily_creator_metrics',
  }
);

DailyCreatorMetricSchema.index({ date: 1, creatorId: 1 }, { unique: true });
DailyCreatorMetricSchema.index({ creatorId: 1, date: -1 });

export const DailyCreatorMetric: Model<IDailyCreatorMetric> =
  mongoose.models.DailyCreatorMetric ||
  mongoose.model<IDailyCreatorMetric>('DailyCreatorMetric', DailyCreatorMetricSchema, 'daily_creator_metrics');

export default DailyCreatorMetric;
