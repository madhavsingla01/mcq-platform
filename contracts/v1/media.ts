import { z } from 'zod';
import { successResponse } from './http.js';

export const MediaDeletionResponse = z.object({ success: z.literal(true), message: z.string() });
export const ValidatedImageUrlResponse = successResponse(z.object({
  valid: z.literal(true),
  url: z.url(),
  host: z.string(),
  extension: z.string().nullable(),
  secure: z.literal(true),
}));
