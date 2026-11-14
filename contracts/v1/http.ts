import { z } from 'zod';

export const RequestId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const GatewayError = z.object({
  success: z.literal(false),
  message: z.string(),
  data: z.null(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
  requestId: RequestId,
});
export type GatewayError = z.infer<typeof GatewayError>;

export function successResponse<T extends z.ZodType>(data: T) {
  return z.object({ success: z.literal(true), data, message: z.string().optional() });
}

// Older services may supply a message, a nested error, or both.
export interface ApiFailure {
  status: number;
  code: string | null;
  message: string;
  requestId: string | null;
}

export function readApiFailure(input: unknown): ApiFailure {
  const error = z.looseObject({ response: z.unknown().optional() }).safeParse(input);
  const response = z.looseObject({
    status: z.int().optional(),
    data: z.unknown().optional(),
    headers: z.unknown().optional(),
  }).safeParse(error.data?.response);
  const data = response.data?.data;
  // Parse each legacy field independently to preserve valid information in a mixed response.
  const body = z.looseObject({}).safeParse(data).data;
  const nested = z.looseObject({}).safeParse(body?.error).data;
  const headers = z.looseObject({}).safeParse(response.data?.headers).data;
  const string = (value: unknown) => typeof value === 'string' ? value : undefined;
  return {
    status: response.data?.status ?? 0,
    code: string(nested?.code) ?? null,
    message: string(body?.message) ?? string(nested?.message) ??
      (response.data ? 'Request failed. Please try again.' : 'Could not connect. Please try again.'),
    requestId: string(body?.requestId) || string(headers?.['x-request-id']) || null,
  };
}
