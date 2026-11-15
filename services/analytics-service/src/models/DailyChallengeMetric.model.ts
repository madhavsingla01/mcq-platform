import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IChallengeScoreEntry {
  userId: string;
  score: number;
  percentage: number;
  totalTimeMs: number;
  submittedAt: Date;
}

export interface IScoreDistributionEntry {
  range: string;
  count: number;
}

export interface ISubmissionTimelineEntry {
  timestamp: string;
  submissionsCount: number;
}

export interface IDailyChallengeMetric extends Document {
  challengeId: string;
  creatorId: string;
  title: string;
  category: string;
  difficulty: string;
  status: 'draft' | 'publishing' | 'active' | 'ended';
  deadlineAt?: Date;
  durationMinutes: number;
  totalQuestions: number;
  totalParticipants: number;
  totalSubmissions: number;
  participantCount: number;
  submissionCount: number;
  averageScore: number;
  scores: IChallengeScoreEntry[];
  scoreDistribution: IScoreDistributionEntry[];
  submissionTimeline: ISubmissionTimelineEntry[];
  date: string;
  createdAt: Date;
  updatedAt: Date;
}

const ChallengeScoreEntrySchema = new Schema<IChallengeScoreEntry>(
  {
    userId: { type: String, required: true },
    score: { type: Number, required: true },
    percentage: { type: Number, required: true },
    totalTimeMs: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ScoreDistributionEntrySchema = new Schema<IScoreDistributionEntry>(
  {
    range: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  { _id: false }
);

const SubmissionTimelineEntrySchema = new Schema<ISubmissionTimelineEntry>(
  {
    timestamp: { type: String, required: true },
    submissionsCount: { type: Number, default: 1 },
  },
  { _id: false }
);

const DailyChallengeMetricSchema = new Schema<IDailyChallengeMetric>(
  {
    challengeId: { type: String, required: true, unique: true, index: true },
    creatorId: { type: String, required: true, index: true },
    title: { type: String, default: '' },
    category: { type: String, default: 'General' },
    difficulty: { type: String, default: 'Intermediate' },
    status: { type: String, enum: ['draft', 'publishing', 'active', 'ended'], default: 'active' },
    deadlineAt: { type: Date },
    durationMinutes: { type: Number, default: 60 },
    totalQuestions: { type: Number, default: 5 },
    totalParticipants: { type: Number, default: 0 },
    totalSubmissions: { type: Number, default: 0 },
    participantCount: { type: Number, default: 0 },
    submissionCount: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    scores: { type: [ChallengeScoreEntrySchema], default: [] },
    scoreDistribution: { type: [ScoreDistributionEntrySchema], default: [] },
    submissionTimeline: { type: [SubmissionTimelineEntrySchema], default: [] },
    date: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: 'daily_challenge_metrics',
  }
);

DailyChallengeMetricSchema.index({ creatorId: 1, deadlineAt: -1 });

export const DailyChallengeMetric: Model<IDailyChallengeMetric> =
  mongoose.models.DailyChallengeMetric ||
  mongoose.model<IDailyChallengeMetric>('DailyChallengeMetric', DailyChallengeMetricSchema, 'daily_challenge_metrics');

export default DailyChallengeMetric;
