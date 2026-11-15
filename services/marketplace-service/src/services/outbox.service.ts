import mongoose, { Schema, type Document, type Model } from 'mongoose';
import crypto from 'node:crypto';

export interface IOutboxEvent extends Document {
  eventId: string;
  eventType: string;
  version: string;
  producer: string;
  timestamp: Date;
  traceId?: string;
  data: Record<string, unknown>;
  status: 'pending' | 'processing' | 'published' | 'failed';
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date;
  publishedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const outboxEventSchema = new Schema<IOutboxEvent>(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true, index: true },
    version: { type: String, default: '1.0.0' },
    producer: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    traceId: { type: String },
    data: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'published', 'failed'],
      default: 'pending',
      index: true,
    },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 5 },
    nextRetryAt: { type: Date, default: Date.now, index: true },
    publishedAt: { type: Date },
    lastError: { type: String },
  },
  {
    timestamps: true,
    collection: 'outbox_events',
  }
);

outboxEventSchema.index({ status: 1, nextRetryAt: 1 });

export const OutboxEvent: Model<IOutboxEvent> =
  mongoose.models.OutboxEvent || mongoose.model<IOutboxEvent>('OutboxEvent', outboxEventSchema);

const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL || 'http://127.0.0.1:5015';
let workerIntervalId: NodeJS.Timeout | null = null;

export interface StageOutboxEventOptions {
  eventType: string;
  producer?: string;
  data: Record<string, unknown>;
  traceId?: string;
  eventId?: string;
  session?: mongoose.ClientSession | null;
}

export async function stageOutboxEvent({
  eventType,
  producer = 'marketplace-service',
  data,
  traceId,
  eventId = crypto.randomUUID(),
  session = null,
}: StageOutboxEventOptions): Promise<IOutboxEvent | null> {
  try {
    const envelope = {
      eventId,
      eventType,
      version: '1.0.0',
      producer,
      timestamp: new Date(),
      traceId: traceId || `trace_${crypto.randomUUID()}`,
      data,
      status: 'pending' as const,
      retryCount: 0,
      maxRetries: 5,
      nextRetryAt: new Date(),
    };

    let doc: IOutboxEvent;
    if (session) {
      try {
        const docs = await OutboxEvent.create([envelope], { session });
        doc = docs[0]!;
      } catch {
        doc = await OutboxEvent.create(envelope);
      }
    } else {
      doc = await OutboxEvent.create(envelope);
    }

    setImmediate(() => {
      if (doc?._id) {
        publishOutboxEvent(doc._id as mongoose.Types.ObjectId).catch(() => {});
      }
    });

    return doc;
  } catch (error) {
    console.error(`[Outbox] Failed to stage event ${eventType}:`, (error as Error).message);
    return null;
  }
}

export async function publishOutboxEvent(outboxId: mongoose.Types.ObjectId | string): Promise<void> {
  try {
    const event = await OutboxEvent.findById(outboxId);
    if (!event || event.status === 'published') return;

    const payload = {
      eventId: event.eventId,
      eventType: event.eventType,
      version: event.version,
      producer: event.producer,
      timestamp: event.timestamp.toISOString(),
      traceId: event.traceId,
      data: event.data,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${ANALYTICS_SERVICE_URL}/api/v1/analytics/events/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        await OutboxEvent.findByIdAndUpdate(outboxId, {
          status: 'published',
          publishedAt: new Date(),
          lastError: null,
        });
      } else {
        const errText = await response.text().catch(() => '');
        await handlePublishFailure(event, `HTTP ${response.status}: ${errText}`);
      }
    } catch (networkError) {
      clearTimeout(timeoutId);
      await handlePublishFailure(event, (networkError as Error).message);
    }
  } catch (error) {
    console.error('[Outbox] Error during publishOutboxEvent:', (error as Error).message);
  }
}

async function handlePublishFailure(event: IOutboxEvent, errorMessage: string): Promise<void> {
  try {
    const retryCount = (event.retryCount || 0) + 1;
    const isFailed = retryCount >= (event.maxRetries || 5);
    const backoffMs = Math.min(60000, 1000 * Math.pow(2, retryCount)) + Math.random() * 500;

    await OutboxEvent.findByIdAndUpdate(event._id, {
      status: isFailed ? 'failed' : 'pending',
      retryCount,
      nextRetryAt: new Date(Date.now() + backoffMs),
      lastError: errorMessage,
    });
  } catch (err) {
    console.error('[Outbox] Failed to update publish failure:', (err as Error).message);
  }
}

export async function processOutboxQueue(batchSize = 20): Promise<void> {
  try {
    const now = new Date();
    const candidateEvents = await OutboxEvent.find({
      status: { $in: ['pending', 'failed'] },
      nextRetryAt: { $lte: now },
      retryCount: { $lt: 5 },
    })
      .sort({ nextRetryAt: 1 })
      .limit(batchSize);

    for (const event of candidateEvents) {
      const claimed = await OutboxEvent.findOneAndUpdate(
        { _id: event._id, status: { $in: ['pending', 'failed'] } },
        { $set: { status: 'processing', updatedAt: new Date() } }
      );
      if (claimed) {
        await publishOutboxEvent(event._id as mongoose.Types.ObjectId);
      }
    }
  } catch (error) {
    console.error('[OutboxWorker] Error processing queue:', (error as Error).message);
  }
}

export function startOutboxWorker(intervalMs = 5000): void {
  if (workerIntervalId) return;
  workerIntervalId = setInterval(() => {
    processOutboxQueue().catch(() => {});
  }, intervalMs);
  if (workerIntervalId.unref) workerIntervalId.unref();
}

export function stopOutboxWorker(): void {
  if (workerIntervalId) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
  }
}
