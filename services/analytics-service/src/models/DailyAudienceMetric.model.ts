import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface ISearchQueryStat {
  query: string;
  count: number;
}

export interface IReferralSourceStat {
  source: string;
  count: number;
}

export interface IDailyAudienceMetric extends Document {
  date: string; // YYYY-MM-DD
  creatorId: string;
  newFollowers: number;
  unfollowers: number;
  netFollowers: number;
  newLearners: number;
  returningLearners: number;
  searchQueries: ISearchQueryStat[];
  referralSources: IReferralSourceStat[];
  deviceBreakdown: {
    desktop: number;
    mobile: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const DailyAudienceMetricSchema = new Schema<IDailyAudienceMetric>(
  {
    date: { type: String, required: true, index: true },
    creatorId: { type: String, required: true, index: true },
    newFollowers: { type: Number, default: 0 },
    unfollowers: { type: Number, default: 0 },
    netFollowers: { type: Number, default: 0 },
    newLearners: { type: Number, default: 0 },
    returningLearners: { type: Number, default: 0 },
    searchQueries: [
      {
        query: { type: String, required: true },
        count: { type: Number, default: 1 },
      },
    ],
    referralSources: [
      {
        source: { type: String, required: true },
        count: { type: Number, default: 1 },
      },
    ],
    deviceBreakdown: {
      desktop: { type: Number, default: 0 },
      mobile: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    collection: 'daily_audience_metrics',
  }
);

DailyAudienceMetricSchema.index({ date: 1, creatorId: 1 }, { unique: true });
DailyAudienceMetricSchema.index({ creatorId: 1, date: -1 });

export const DailyAudienceMetric: Model<IDailyAudienceMetric> =
  mongoose.models.DailyAudienceMetric ||
  mongoose.model<IDailyAudienceMetric>('DailyAudienceMetric', DailyAudienceMetricSchema, 'daily_audience_metrics');

export default DailyAudienceMetric;
