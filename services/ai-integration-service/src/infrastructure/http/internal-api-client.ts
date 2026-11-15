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
    return this.requestJson(origin, pathname, requestId, incomingHeaders);
  }

  async requestJson(
    origin: string,
    pathname: string,
    requestId: string,
    incomingHeaders: Record<string, string | string[] | undefined>,
    method: 'GET' | 'POST' | 'PUT' = 'GET',
    body?: object,
    delegation?: string,
  ): Promise<unknown> {
    const url = new URL(pathname, origin);
    if (url.origin !== origin) throw new Error('Invalid internal destination');
    const headers = new Headers({ accept: 'application/json', 'x-request-id': requestId });
    if (body) headers.set('content-type', 'application/json');
    if (delegation) headers.set('x-internal-quizfocus-delegation', delegation);

    for (const name of FORWARDED_HEADERS) {
      const value = incomingHeaders[name];
      if (name === 'cookie' && typeof value === 'string') {
        const cookies = value.split(';').map(cookie => cookie.trim()).filter(cookie =>
          cookie.startsWith('accessToken=') || (method !== 'GET' && cookie.startsWith('csrfToken=')));
        if (cookies.length) headers.set(name, cookies.join('; '));
      } else if (typeof value === 'string') {
        headers.set(name, value);
      }
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new InternalApiError(
        503,
        timedOut ? 'DEPENDENCY_TIMEOUT' : 'DEPENDENCY_UNAVAILABLE',
        timedOut ? 'Dependency timed out' : 'Dependency is unavailable',
      );
    }

    if (!response.ok) {
      let message = 'Dependency rejected the request';
      if (response.status === 400) {
        const payload: unknown = await response.json().catch(() => undefined);
        if (typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string') {
          message = payload.message.slice(0, 300);
        }
      }
      throw new InternalApiError(response.status, 'UPSTREAM_REJECTED', message);
    }

    try {
      const payload: unknown = await response.json();
      return payload;
    } catch {
      throw new InternalApiError(502, 'INVALID_DEPENDENCY_RESPONSE', 'Dependency returned an invalid response');
    }
  }
}
