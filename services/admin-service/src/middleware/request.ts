import type { Request } from 'express';
import type { Types } from 'mongoose';
import { AppError } from './error.middleware.js';

export interface AccountIdentity {
  _id: Types.ObjectId;
  name?: string | null | undefined;
  username?: string | null | undefined;
  email?: string | null | undefined;
  role?: string | null | undefined;
}

interface AdminIdentity extends AccountIdentity {
  permissions: readonly string[];
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AccountIdentity;
    adminUser?: AdminIdentity;
  }
}

export function requestCookie(req: Request, key: string): string | undefined {
  const cookies: unknown = req.cookies;
  if (typeof cookies !== 'object' || cookies === null || !Object.hasOwn(cookies, key)) return undefined;
  const value: unknown = Reflect.get(cookies, key);
  return typeof value === 'string' ? value : undefined;
}

export function requireAdminUser(req: Request): AdminIdentity {
  if (!req.adminUser) throw new AppError('Unauthorized: Admin authentication required.', 401);
  return req.adminUser;
}

export function routeId(req: Request) {
  if (typeof req.params.id !== 'string' || !req.params.id) throw new AppError('Invalid identifier', 400);
  return req.params.id;
}

export function pagination(query: Request['query'], defaultLimit = 20) {
  const page = Math.max(1, parseInt(String(query.page ?? ''), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? ''), 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}
