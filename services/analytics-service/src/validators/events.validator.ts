import { z } from 'zod';
import { wireDate } from '@quizfocus/contracts';

export { wireDate };

export const IngestionEnvelopeSchema = z
  .object({
    eventId: z.string().uuid({ message: 'eventId must be a valid UUID' }),
    eventType: z.string().min(1, { message: 'eventType is required' }),
    version: z.string().min(1).default('1.0.0'),
    timestamp: wireDate,
    producer: z.string().min(1).default('unknown'),
    traceId: z.string().optional(),
    data: z.record(z.string(), z.unknown()),
  })
  .refine(
    (envelope) => {
      const eventTime = new Date(envelope.timestamp).getTime();
      const maxFutureAllowed = Date.now() + 24 * 60 * 60 * 1000;
      return Number.isFinite(eventTime) && eventTime <= maxFutureAllowed;
    },
    {
      message: 'Event timestamp cannot be more than 24 hours in the future',
      path: ['timestamp'],
    }
  );

export type IngestionEnvelope = z.infer<typeof IngestionEnvelopeSchema>;
