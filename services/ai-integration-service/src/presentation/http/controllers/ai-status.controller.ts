import type { RequestHandler } from 'express';
import type { AuthenticatedUser } from '../../../domain/entities/authenticated-user.js';
import { AppError } from '../../../shared/errors/app-error.js';

export const aiStatusController: RequestHandler<
  Record<string, string>, unknown, unknown, unknown, { user?: AuthenticatedUser }
> = (_req, res, next) => {
  const { user } = res.locals;
  if (!user) return next(new AppError('Authentication required', 401, 'UNAUTHENTICATED'));
  res.json({
    success: true,
    data: {
      enabled: false,
      connectors: [],
      message: 'AI connectors are not configured',
      requestedBy: user.id,
    },
  });
};
