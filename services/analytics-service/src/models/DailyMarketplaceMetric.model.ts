import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IDailyMarketplaceMetric extends Document {
  date: string; // YYYY-MM-DD
  creatorId: string;
  listingId: string;
  listingTitle: string;
  views: number;
  purchases: number;
  refunds: number;
  grossRevenue: number;
  grossRevenueCents: number;
  platformFee: number;
  platformFeesCents: number;
  netEarnings: number;
  netEarningsCents: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const DailyMarketplaceMetricSchema = new Schema<IDailyMarketplaceMetric>(
  {
    date: { type: String, required: true, index: true },
    creatorId: { type: String, required: true, index: true },
    listingId: { type: String, required: true, index: true },
    listingTitle: { type: String, default: '' },
    views: { type: Number, default: 0 },
    purchases: { type: Number, default: 0 },
    refunds: { type: Number, default: 0 },
    grossRevenue: { type: Number, default: 0 },
    grossRevenueCents: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    platformFeesCents: { type: Number, default: 0 },
    netEarnings: { type: Number, default: 0 },
    netEarningsCents: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
  },
  {
    timestamps: true,
    collection: 'daily_marketplace_metrics',
  }
);

DailyMarketplaceMetricSchema.index({ date: 1, listingId: 1 }, { unique: true });
DailyMarketplaceMetricSchema.index({ creatorId: 1, date: -1 });
DailyMarketplaceMetricSchema.index({ listingId: 1, date: -1 });

export const DailyMarketplaceMetric: Model<IDailyMarketplaceMetric> =
  mongoose.models.DailyMarketplaceMetric ||
  mongoose.model<IDailyMarketplaceMetric>('DailyMarketplaceMetric', DailyMarketplaceMetricSchema, 'daily_marketplace_metrics');

export default DailyMarketplaceMetric;
