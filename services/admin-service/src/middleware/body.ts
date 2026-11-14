import { z } from 'zod';
import { AppError } from './error.middleware.js';

export const reasonBody = z.object({ reason: z.string().optional() });

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError('Invalid request body.', 400);
  return parsed.data;
}
