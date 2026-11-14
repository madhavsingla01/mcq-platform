import type { RequestHandler } from 'express';
import type { AuthenticatedUser } from '../../../domain/entities/authenticated-user.js';

export const aiStatusController: RequestHandler = (_req, res) => {
  const user = res.locals.user as AuthenticatedUser;
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
