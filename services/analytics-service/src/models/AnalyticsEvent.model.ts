import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IAnalyticsEvent extends Document {
  eventId: string;
  eventType: string;
  version: string;
  timestamp: Date;
  producer: string;
  traceId?: string;
  creatorId?: string;
  quizId?: string;
  challengeId?: string;
  data: Record<string, unknown>;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AnalyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    version: {
      type: String,
      default: '1.0.0',
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    producer: {
      type: String,
      required: true,
      trim: true,
    },
    traceId: {
      type: String,
      required: false,
      trim: true,
    },
    creatorId: {
      type: String,
      required: false,
      index: true,
      trim: true,
    },
    quizId: {
      type: String,
      required: false,
      index: true,
      trim: true,
    },
    challengeId: {
      type: String,
      required: false,
      index: true,
      trim: true,
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'analytics_events',
  }
);

AnalyticsEventSchema.index({ creatorId: 1, timestamp: -1 });
AnalyticsEventSchema.index({ eventType: 1, timestamp: -1 });
AnalyticsEventSchema.index({ timestamp: -1 });

export const AnalyticsEvent: Model<IAnalyticsEvent> =
  mongoose.models.AnalyticsEvent ||
  mongoose.model<IAnalyticsEvent>('AnalyticsEvent', AnalyticsEventSchema, 'analytics_events');

export default AnalyticsEvent;
