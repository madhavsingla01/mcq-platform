import { z } from 'zod';
import { ObjectId } from './domain.js';
import { successResponse } from './http.js';

const probeDetails = z.object({
  service: z.string().optional(),
  status: z.string().optional(),
  timestamp: z.string().optional(),
  memoryUsageMb: z.int().nonnegative().optional(),
});

export const SystemHealthResponse = successResponse(z.object({
  overallStatus: z.enum(['healthy', 'degraded']),
  services: z.array(z.object({
    name: z.string(),
    port: z.union([z.string(), z.int()]).nullable(),
    url: z.string().optional(),
    status: z.enum(['healthy', 'degraded', 'offline']),
    statusCode: z.int().optional(),
    latencyMs: z.int().nonnegative().nullable(),
    self: z.boolean().optional(),
    details: probeDetails.optional(),
    error: z.string().optional(),
  })),
  databases: z.array(z.object({
    name: z.string(),
    state: z.enum(['disconnected', 'connected', 'connecting', 'disconnecting', 'unknown']),
  })),
  timestamp: z.iso.datetime(),
  uptimeSeconds: z.int().nonnegative(),
}));

export type SystemHealth = z.infer<typeof SystemHealthResponse>['data'];

export const ModerationTargetType = z.enum([
  'quiz', 'challenge', 'user', 'comment', 'question', 'feedback',
]);
export const ModerationCategory = z.enum([
  'spam', 'harassment', 'inappropriate', 'impersonation', 'cheating',
  'copyright', 'misinformation', 'other',
]);
export const ReportSubmitInput = z.object({
  targetType: ModerationTargetType,
  targetId: z.string().trim().min(1, 'Target ID is required'),
  targetTitle: z.string().trim().default(''),
  category: ModerationCategory.default('other'),
  reason: z.string().trim().min(1, 'Reason is required'),
  description: z.string().trim().default(''),
  details: z.string().trim().optional(),
});
export const ReportSubmitResponse = z.object({
  success: z.literal(true),
  message: z.string(),
  reportId: z.string(),
  data: z.object({
    report: z.looseObject({
      _id: z.union([ObjectId, z.string()]),
      targetType: ModerationTargetType,
      targetId: z.string(),
      category: ModerationCategory,
      reason: z.string(),
      status: z.string(),
    }),
  }),
});
