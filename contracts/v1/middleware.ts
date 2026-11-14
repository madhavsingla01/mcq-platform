import type { z } from 'zod';
import { RequestId } from './http.js';
import type { GatewayError } from './http.js';

export interface RequestValidationSchemas<
  TBody extends z.ZodType = z.ZodType,
  TQuery extends z.ZodType = z.ZodType,
  TParams extends z.ZodType = z.ZodType,
> {
  body?: TBody;
  query?: TQuery;
  params?: TParams;
}

export interface ValidationRequestLike {
  body?: unknown;
  query?: unknown;
  params?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  requestId?: string;
  get?(name: string): string | undefined;
}

export interface ValidationResponseLike {
  status(code: number): this;
  json(body: unknown): this | void;
}

export type ValidationNextFunction = (err?: unknown) => void;

export interface ValidationErrorDetail {
  target: 'body' | 'query' | 'params';
  path: string[];
  message: string;
}

/**
 * Express-compatible boundary validation middleware.
 * Validates body, query, and params using Zod schemas.
 * On failure, sends standard 400 GatewayError envelope.
 * On success, assigns parsed/coerced data to req without type assertions ('as') or 'any'.
 */
export function validateRequest<
  TBody extends z.ZodType = z.ZodType<unknown>,
  TQuery extends z.ZodType = z.ZodType<unknown>,
  TParams extends z.ZodType = z.ZodType<unknown>,
>(schemas: RequestValidationSchemas<TBody, TQuery, TParams>) {
  return (
    req: ValidationRequestLike,
    res: ValidationResponseLike,
    next: ValidationNextFunction,
  ): void => {
    const errors: ValidationErrorDetail[] = [];

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params ?? {});
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({ target: 'params', path: issue.path.map(String), message: issue.message });
        }
      } else {
        req.params = result.data;
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query ?? {});
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({ target: 'query', path: issue.path.map(String), message: issue.message });
        }
      } else {
        req.query = result.data;
      }
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({ target: 'body', path: issue.path.map(String), message: issue.message });
        }
      } else {
        req.body = result.data;
      }
    }

    if (errors.length > 0) {
      const headerReqId = typeof req.headers?.['x-request-id'] === 'string'
        ? req.headers['x-request-id']
        : undefined;
      const getReqId = req.get ? req.get('x-request-id') : undefined;
      const resolvedHeaderReqId = typeof getReqId === 'string' ? getReqId : headerReqId;
      const directReqId = typeof req.requestId === 'string' ? req.requestId : undefined;
      const candidate = directReqId ?? resolvedHeaderReqId;
      const rawReqId = candidate && candidate.length >= 8 && candidate.length <= 64
        ? candidate
        : 'req_unknown';

      const validReqId = RequestId.safeParse(rawReqId).success ? rawReqId : 'req_unknown';
      const formattedMessage = errors
        .map((e) => (e.path.length > 0 ? `${e.target}.${e.path.join('.')}: ${e.message}` : `${e.target}: ${e.message}`))
        .join('; ');

      const errorPayload: GatewayError = {
        success: false,
        message: formattedMessage,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: formattedMessage,
          details: errors,
        },
        requestId: validReqId,
      };

      res.status(400).json(errorPayload);
      return;
    }

    next();
  };
}
