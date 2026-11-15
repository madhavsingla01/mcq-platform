import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IProcessedEvent extends Document {
  eventId: string;
  eventType: string;
  producer: string;
  traceId?: string;
  processedAt: Date;
  status: 'processed' | 'duplicate' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const ProcessedEventSchema = new Schema<IProcessedEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
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
    processedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ['processed', 'duplicate', 'failed'],
      default: 'processed',
    },
  },
  {
    timestamps: true,
    collection: 'processed_events',
  }
);

ProcessedEventSchema.index({ processedAt: -1 });

export const ProcessedEvent: Model<IProcessedEvent> =
  mongoose.models.ProcessedEvent ||
  mongoose.model<IProcessedEvent>('ProcessedEvent', ProcessedEventSchema, 'processed_events');

export default ProcessedEvent;
