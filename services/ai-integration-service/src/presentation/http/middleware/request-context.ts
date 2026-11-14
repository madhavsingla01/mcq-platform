import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

export const requestContext: RequestHandler = (req, res, next) => {
  const supplied = req.get('x-request-id');
  const requestId = supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};
