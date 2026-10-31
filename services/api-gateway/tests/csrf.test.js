import { jest } from '@jest/globals';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, csrfProtection } from '../src/middleware/csrf.middleware.js';

const createReq = ({ method = 'POST', path = '/api/v1/quizzes', cookies = {}, headerValue = null } = {}) => ({
  method,
  path,
  cookies,
  get: (headerName) => (headerName === CSRF_HEADER_NAME ? headerValue : undefined),
});

const createRes = () => ({});

describe('csrfProtection', () => {
  it('allows safe methods without a token', () => {
    const next = jest.fn();
    csrfProtection(createReq({ method: 'GET', cookies: { accessToken: 'auth' } }), createRes(), next);

    expect(next).toHaveBeenCalledWith();
  });

  it('allows unauthenticated unsafe requests without a token', () => {
    const next = jest.fn();
    csrfProtection(createReq({ method: 'POST' }), createRes(), next);

    expect(next).toHaveBeenCalledWith();
  });

  it('rejects authenticated unsafe requests with a missing token', () => {
    const next = jest.fn();
    csrfProtection(createReq({ method: 'POST', cookies: { accessToken: 'auth' } }), createRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
    expect(next.mock.calls[0][0].message).toBe('Invalid CSRF token');
  });

  it('allows authenticated unsafe requests when cookie and header tokens match', () => {
    const next = jest.fn();
    csrfProtection(
      createReq({
        method: 'PATCH',
        cookies: { accessToken: 'auth', [CSRF_COOKIE_NAME]: 'token' },
        headerValue: 'token',
      }),
      createRes(),
      next
    );

    expect(next).toHaveBeenCalledWith();
  });

  it('allows login even when a stale auth cookie exists', () => {
    const next = jest.fn();
    csrfProtection(
      createReq({ method: 'POST', path: '/api/v1/auth/login', cookies: { accessToken: 'stale' } }),
      createRes(),
      next
    );

    expect(next).toHaveBeenCalledWith();
  });
});
