import type { IncomingMessage } from 'node:http';

declare module 'node:http' {
  interface IncomingMessage {
    requestId?: string;
    proxyTimedOut?: boolean;
  }
}

export function requestIdOf(req: IncomingMessage): string {
  if (!req.requestId) throw new Error('Gateway request context has not been initialized');
  return req.requestId;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
