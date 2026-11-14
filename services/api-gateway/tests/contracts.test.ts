import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorBody, proxyFailure, sanitizeProxyRequest } from '../src/contracts.js';

test('proxy sanitization removes client identity claims and sets trusted request context', () => {
  const removedHeaders: string[] = [];
  const forwardedHeaders = new Map<string, string | number | readonly string[]>();
  const proxyRequest = {
    removeHeader: (name: string) => { removedHeaders.push(name); },
    setHeader: (name: string, value: string | number | readonly string[]) => { forwardedHeaders.set(name, value); },
  };

  sanitizeProxyRequest(proxyRequest, {
    headers: {
      'x-user-id': 'spoofed',
      'x-auth-role': 'admin',
      'x-role': 'admin',
      'content-type': 'application/json',
    },
    requestId: 'request-1234',
    ip: '127.0.0.1',
  });

  assert.deepEqual(removedHeaders, ['x-user-id', 'x-auth-role', 'x-role']);
  assert.equal(forwardedHeaders.get('x-request-id'), 'request-1234');
  assert.equal(forwardedHeaders.get('x-forwarded-for'), '127.0.0.1');
});

test('proxy errors use stable public codes and do not expose downstream details', () => {
  assert.deepEqual(proxyFailure({ code: 'ECONNRESET' }), {
    status: 502,
    message: 'Downstream service unavailable',
  });
  assert.deepEqual(proxyFailure({ code: 'ETIMEDOUT', message: 'private upstream detail' }), {
    status: 504,
    message: 'Downstream service timed out',
  });
  assert.deepEqual(errorBody(502, 'Downstream service unavailable', 'request-1234'), {
    success: false,
    message: 'Downstream service unavailable',
    data: null,
    error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Downstream service unavailable' },
    requestId: 'request-1234',
  });
});
