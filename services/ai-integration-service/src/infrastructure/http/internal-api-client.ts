import { InternalApiError } from '../../shared/errors/app-error.js';

const FORWARDED_HEADERS = ['authorization', 'cookie', 'x-csrf-token', 'x-client-session-id'] as const;

export class InternalApiClient {
  constructor(
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getJson(
    origin: string,
    pathname: string,
    requestId: string,
    incomingHeaders: Record<string, string | string[] | undefined>,
  ): Promise<unknown> {
    const url = new URL(pathname, origin);
    const headers = new Headers({ accept: 'application/json', 'x-request-id': requestId });

    for (const name of FORWARDED_HEADERS) {
      const value = incomingHeaders[name];
      if (name === 'cookie' && typeof value === 'string') {
        const accessToken = value.split(';').map((cookie) => cookie.trim())
          .find((cookie) => cookie.startsWith('accessToken='));
        if (accessToken) headers.set(name, accessToken);
      } else if (typeof value === 'string') {
        headers.set(name, value);
      }
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new InternalApiError(
        503,
        timedOut ? 'DEPENDENCY_TIMEOUT' : 'DEPENDENCY_UNAVAILABLE',
        timedOut ? 'Authentication service timed out' : 'Authentication service is unavailable',
      );
    }

    if (!response.ok) {
      throw new InternalApiError(response.status, 'AUTHENTICATION_REJECTED', 'Authentication service rejected the request');
    }

    try {
      const payload: unknown = await response.json();
      return payload;
    } catch {
      throw new InternalApiError(502, 'INVALID_DEPENDENCY_RESPONSE', 'Authentication service returned an invalid response');
    }
  }
}
