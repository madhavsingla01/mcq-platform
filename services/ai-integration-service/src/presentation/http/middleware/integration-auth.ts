import type { RequestHandler } from 'express';
import type { AuthenticatedUser } from '../../../domain/entities/authenticated-user.js';
import { AppError } from '../../../shared/errors/app-error.js';

export type IntegrationHandler = RequestHandler<Record<string, string>, unknown, unknown, unknown, {
  user?: AuthenticatedUser;
  requestId: string;
  oauthScopes?: ReadonlySet<string>;
}>;

export const bearerOnly: IntegrationHandler = (req, _res, next) => {
  const authorization = req.get('authorization') ?? '';
  if (!/^Bearer \S+$/i.test(authorization)) {
    return next(new AppError('A bearer access token is required', 401, 'UNAUTHENTICATED'));
  }
  req.headers.authorization = 'Bearer ' + authorization.slice(7);
  delete req.headers.cookie;
  next();
};
