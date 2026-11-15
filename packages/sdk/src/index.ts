import { z } from 'zod';
import { createDraft, draftDetail, draftError, draftId, draftKind, draftPage, draftSummary, idempotencyKey, patchDraft } from './contracts.js';
import type { CreateDraft, PatchDraft } from './contracts.js';

export type { CreateDraft, DraftDetail, DraftPage, DraftQuestion, DraftSummary, PatchDraft } from './contracts.js';
export type QuizDraftInput = Omit<Extract<CreateDraft, { kind: 'quiz' }>, 'kind'>;
export type ChallengeDraftInput = Omit<Extract<CreateDraft, { kind: 'challenge' }>, 'kind'>;
export interface RequestOptions { signal?: AbortSignal }
export interface WriteOptions extends RequestOptions { idempotencyKey: string }
export interface DraftListOptions { kind?: 'quiz' | 'challenge'; search?: string; page?: number; limit?: number }
export interface QuizFocusOptions {
  baseUrl: string | URL;
  accessToken: string | ((signal: AbortSignal) => string | Promise<string>);
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
}

interface ErrorInfo {
  code: string;
  status?: number;
  requestId?: string | undefined;
  details?: { path: string; message: string }[] | undefined;
  retryAfterMs?: number | undefined;
}
export class QuizFocusError extends Error {
  constructor(message: string, readonly info: ErrorInfo) {
    super(message);
    this.name = 'QuizFocusError';
  }
  get code() { return this.info.code; }
  get status() { return this.info.status; }
  get requestId() { return this.info.requestId; }
}

const paging = z.strictObject({
  page: z.int().min(1).max(9999).optional(),
  limit: z.int().min(1).max(100).optional(),
  kind: draftKind.optional(),
  search: z.string().trim().max(100).optional(),
});
const token = z.string().regex(/^[A-Za-z0-9._~+/-]+=*$/);
const retryStatuses = new Set([429, 502, 503, 504]);
function validate<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new QuizFocusError('Invalid request options or body', {
    code: 'INVALID_INPUT',
    details: result.error.issues.map(issue => ({ path: issue.path.map(String).join('.'), message: issue.message })),
  });
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(timestamp - Date.now(), 0) : undefined;
}

function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort)).catch(() => {});
  });
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export class QuizFocusClient {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetcher: typeof fetch;
  private readonly accessToken: QuizFocusOptions['accessToken'];

  constructor(options: QuizFocusOptions) {
    const url = z.url().transform(value => new URL(value)).safeParse(String(options.baseUrl));
    if (!url.success) throw new QuizFocusError('Invalid Gateway URL', { code: 'INVALID_BASE_URL' });
    const gateway = url.data;
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(gateway.hostname);
    if ((gateway.protocol !== 'https:' && !(gateway.protocol === 'http:' && loopback)) ||
        gateway.username || gateway.password || gateway.search || gateway.hash || gateway.pathname !== '/') {
      throw new QuizFocusError('Use a secure Gateway origin without a path or credentials', { code: 'INVALID_BASE_URL' });
    }
    this.endpoint = gateway.origin + '/api/v1/ai/drafts';
    this.timeoutMs = validate(z.int().min(1).max(120_000), options.timeoutMs ?? 15_000);
    this.maxRetries = validate(z.int().min(0).max(3), options.maxRetries ?? 1);
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.accessToken = typeof options.accessToken === 'function' ? options.accessToken : validate(token, options.accessToken);
  }

  readonly drafts = {
    list: (query: DraftListOptions = {}, options?: RequestOptions) => this.list(query, options),
    get: (id: string, options?: RequestOptions) => this.getDraft(id, options),
    create: (draft: CreateDraft, options: WriteOptions) => this.createDraft(draft, options),
    update: (id: string, patch: PatchDraft, options: WriteOptions) => this.updateDraft(id, patch, options),
    pages: (query: DraftListOptions = {}, options?: RequestOptions) => this.listPages(query, options),
  };

  readonly quizzes = {
    listDrafts: (query: Omit<DraftListOptions, 'kind'> = {}, options?: RequestOptions) => this.list({ ...query, kind: 'quiz' }, options),
    createDraft: (draft: QuizDraftInput, options: WriteOptions) => this.createDraft({ ...draft, kind: 'quiz' }, options),
  };

  readonly challenges = {
    listDrafts: (query: Omit<DraftListOptions, 'kind'> = {}, options?: RequestOptions) => this.list({ ...query, kind: 'challenge' }, options),
    createDraft: (draft: ChallengeDraftInput, options: WriteOptions) => this.createDraft({ ...draft, kind: 'challenge' }, options),
  };

  private async list(query: DraftListOptions, options?: RequestOptions) {
    const parsed = validate(paging, query);
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(parsed)) {
      if (value !== undefined) params.set(name, String(value));
    }
    return this.request('GET', params.size ? '?' + params : '', draftPage, options);
  }

  private async *listPages(query: DraftListOptions, options?: RequestOptions) {
    let page = validate(paging, query).page ?? 1;
    while (page <= 9999) {
      const result = await this.list({ ...query, page }, options);
      yield result;
      if (page >= result.pagination.pages || !result.drafts.length) return;
      page += 1;
    }
  }

  private async getDraft(id: string, options?: RequestOptions) {
    return this.request('GET', '/' + validate(draftId, id), draftDetail, options);
  }

  private async createDraft(input: CreateDraft, options: WriteOptions) {
    return this.request('POST', '', draftSummary, options, validate(createDraft, input), validate(idempotencyKey, options?.idempotencyKey));
  }

  private async updateDraft(id: string, input: PatchDraft, options: WriteOptions) {
    return this.request('PATCH', '/' + validate(draftId, id), draftSummary, options, validate(patchDraft, input), validate(idempotencyKey, options?.idempotencyKey));
  }

  private async request<T extends z.ZodType>(
    method: 'GET' | 'POST' | 'PATCH', path: string, schema: T, options?: RequestOptions, body?: unknown, key?: string,
  ): Promise<z.output<T>> {
    const deadline = Date.now() + this.timeoutMs;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.timeoutMs);
    const signal = options?.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
    const responseSchema = z.object({ success: z.literal(true), data: z.unknown(), requestId: z.string() });
    try {
      signal.throwIfAborted();
      const accessToken = typeof this.accessToken === 'function'
        ? validate(token, await abortable(Promise.resolve(this.accessToken(signal)), signal)) : this.accessToken;
      const headers = new Headers({ Accept: 'application/json', Authorization: 'Bearer ' + accessToken });
      if (key) headers.set('Idempotency-Key', key);
      const json = body === undefined ? undefined : JSON.stringify(body);
      if (json !== undefined) headers.set('Content-Type', 'application/json');
      for (let attempt = 0; ; attempt += 1) {
        let failure: QuizFocusError;
        let retryable = false;
        try {
          const response = await abortable(this.fetcher(this.endpoint + path, {
            method, headers, signal, ...(json === undefined ? {} : { body: json }),
            cache: 'no-store', credentials: 'omit', redirect: 'manual',
          }), signal);
          const requestId = response.headers.get('X-Request-ID') ?? undefined;
          if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
            throw new QuizFocusError('The Gateway returned an unexpected redirect', { code: 'REDIRECT_REJECTED', status: response.status, requestId });
          }
          const payload: unknown = await abortable(response.json(), signal).catch(() => undefined);
          signal.throwIfAborted();
          if (response.ok) {
            const parsed = responseSchema.safeParse(payload);
            if (parsed.success) {
              const result = schema.safeParse(parsed.data.data);
              if (result.success) return result.data;
            }
            throw new QuizFocusError('The Gateway returned an invalid response', { code: 'INVALID_RESPONSE', status: response.status, requestId });
          }
          const server = draftError.safeParse(payload);
          failure = new QuizFocusError(server.success ? server.data.message : 'QuizFocus request failed', {
            code: server.success ? server.data.error.code : 'HTTP_ERROR',
            requestId: server.success ? server.data.requestId : requestId,
            ...(server.success ? { details: server.data.error.details } : {}),
            status: response.status,
            retryAfterMs: parseRetryAfter(response.headers.get('Retry-After')),
          });
          retryable = retryStatuses.has(response.status);
        } catch (error) {
          signal.throwIfAborted();
          if (error instanceof QuizFocusError) throw error;
          failure = new QuizFocusError('Unable to reach the QuizFocus Gateway', { code: 'NETWORK_ERROR' });
          retryable = true;
        }
        const backoff = Math.max(failure.info.retryAfterMs ?? 0, 125 * 2 ** attempt + Math.random() * 75);
        if (!retryable || attempt >= this.maxRetries || backoff >= deadline - Date.now()) throw failure;
        await pause(backoff, signal);
      }
    } catch (error) {
      if (options?.signal?.aborted) throw new QuizFocusError('Request cancelled', { code: 'ABORTED' });
      if (timeout.signal.aborted) throw new QuizFocusError('The QuizFocus request timed out', { code: 'TIMEOUT' });
      if (error instanceof QuizFocusError) throw error;
      throw new QuizFocusError('Could not obtain an access token', { code: 'AUTH_TOKEN_ERROR' });
    } finally {
      clearTimeout(timer);
    }
  }
}
