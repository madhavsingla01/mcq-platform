import type { Request, Response, NextFunction } from 'express';
import { IngestionEnvelopeSchema } from '../validators/events.validator.js';
import { ProcessedEvent } from '../models/ProcessedEvent.model.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.model.js';
import { aggregationService } from '../services/aggregation.service.js';
import logger from '../utils/logger.js';

function extractCreatorId(data: Record<string, unknown>): string | undefined {
  if (typeof data.creatorId === 'string') return data.creatorId;
  if (typeof data.sellerId === 'string') return data.sellerId;
  return undefined;
}

export const ingestEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // 1. Validate envelope payload
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({
        success: false,
        message: 'Invalid payload: request body must be a JSON object',
        errors: ['Request body missing or malformed'],
      });
      return;
    }

    const parseResult = IngestionEnvelopeSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      res.status(400).json({
        success: false,
        message: issues[0] || 'Invalid event envelope',
        errors: issues,
      });
      return;
    }

    const envelope = parseResult.data;

    // 2. Fast check: has eventId already been processed?
    const existing = await ProcessedEvent.findOne({ eventId: envelope.eventId }).lean();
    if (existing) {
      res.status(200).json({
        success: true,
        processed: true,
        duplicate: true,
        eventId: envelope.eventId,
        message: 'Duplicate event detected, skipped processing',
        data: {
          processed: true,
          duplicate: true,
          eventId: envelope.eventId,
        },
      });
      return;
    }

    // 3. Atomic insertion to claim the eventId under concurrency
    try {
      await ProcessedEvent.create({
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        producer: envelope.producer,
        traceId: envelope.traceId,
        processedAt: new Date(),
        status: 'processed',
      });
    } catch (insertErr: unknown) {
      const err = insertErr as { code?: number; name?: string; message?: string };
      if (err.code === 11000 || err.name === 'MongoServerError' || err.message?.includes('E11000')) {
        // Concurrency duplicate caught
        res.status(200).json({
          success: true,
          processed: true,
          duplicate: true,
          eventId: envelope.eventId,
          message: 'Duplicate event detected, skipped processing',
          data: {
            processed: true,
            duplicate: true,
            eventId: envelope.eventId,
          },
        });
        return;
      }
      throw insertErr;
    }

    // 4. Record raw audit event and trigger aggregation
    try {
      const creatorId = extractCreatorId(envelope.data);
      const quizId = typeof envelope.data.quizId === 'string' ? envelope.data.quizId : undefined;
      const challengeId = typeof envelope.data.challengeId === 'string' ? envelope.data.challengeId : undefined;

      await AnalyticsEvent.create({
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        version: envelope.version,
        timestamp: new Date(envelope.timestamp),
        producer: envelope.producer,
        traceId: envelope.traceId,
        creatorId,
        quizId,
        challengeId,
        data: envelope.data,
        receivedAt: new Date(),
      });

      // Pass to aggregation read models
      if (aggregationService && typeof aggregationService.processEvent === 'function') {
        await aggregationService.processEvent(envelope);
      }

      res.status(200).json({
        success: true,
        processed: true,
        duplicate: false,
        eventId: envelope.eventId,
        message: 'Event processed successfully',
        data: {
          processed: true,
          duplicate: false,
          eventId: envelope.eventId,
        },
      });
    } catch (processingErr) {
      // In case of unexpected downstream failure, roll back processed lock so retry is possible
      await ProcessedEvent.deleteOne({ eventId: envelope.eventId }).catch(() => {});
      logger.error('Error during event aggregation:', processingErr);
      throw processingErr;
    }
  } catch (error) {
    next(error);
  }
};
