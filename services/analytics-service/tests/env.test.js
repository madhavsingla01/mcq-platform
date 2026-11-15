import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.PORT = '5015';
process.env.CLIENT_URL = 'http://localhost:5173,http://localhost:3000';
process.env.JWT_SECRET = 'quizfocus-local-development-secret-minimum-32-bytes-long';

const { validateEnv } = await import('../dist/config/env.js');

describe('Analytics Service — Environment Configuration Validation', () => {
  const validConfig = {
    PORT: '5015',
    NODE_ENV: 'test',
    CLIENT_URL: 'http://localhost:5173,http://localhost:3000',
    JWT_SECRET: 'quizfocus-local-development-secret-minimum-32-bytes-long',
    MONGO_URI: 'mongodb://127.0.0.1:27017/mcq-platform',
  };

  it('successfully validates and defaults PORT to 5015 when omitted', () => {
    const config = validateEnv(validConfig);
    assert.equal(config.PORT, 5015);
    assert.equal(config.NODE_ENV, 'test');
    assert.deepEqual(config.CLIENT_URL, ['http://localhost:5173', 'http://localhost:3000']);
    assert.equal(config.JWT_SECRET, validConfig.JWT_SECRET);
    assert.equal(config.MONGO_URI, validConfig.MONGO_URI);
    assert.equal(config.isDev, false);
    assert.equal(config.isProd, false);

    const defaulted = validateEnv({ ...validConfig, PORT: undefined });
    assert.equal(defaulted.PORT, 5015);
  });

  it('rejects invalid or out-of-range ports', () => {
    assert.throws(() => validateEnv({ ...validConfig, PORT: 'abc' }), /PORT must be an integer/);
    assert.throws(() => validateEnv({ ...validConfig, PORT: '0' }), /PORT must be an integer/);
    assert.throws(() => validateEnv({ ...validConfig, PORT: '-1' }), /PORT must be an integer/);
    assert.throws(() => validateEnv({ ...validConfig, PORT: '65536' }), /PORT must be an integer/);
  });

  it('rejects empty or missing NODE_ENV or CLIENT_URL', () => {
    assert.throws(() => validateEnv({ ...validConfig, NODE_ENV: '' }), /NODE_ENV is required/);
    assert.throws(() => validateEnv({ ...validConfig, CLIENT_URL: '' }), /CLIENT_URL must contain at least one allowed origin/);
    assert.throws(() => validateEnv({ ...validConfig, CLIENT_URL: '  ,  ' }), /CLIENT_URL must contain at least one allowed origin/);
  });

  it('rejects missing or under-length JWT_SECRET', () => {
    assert.throws(() => validateEnv({ ...validConfig, JWT_SECRET: '' }), /JWT_SECRET is required/);
    assert.throws(() => validateEnv({ ...validConfig, JWT_SECRET: 'short-secret-less-than-32-bytes' }), /JWT_SECRET must be at least 32 bytes/);
  });

  it('rejects placeholder JWT_SECRET in production mode while accepting genuine secrets', () => {
    assert.throws(
      () =>
        validateEnv({
          ...validConfig,
          NODE_ENV: 'production',
          JWT_SECRET: 'quizfocus-local-development-secret-minimum-32-bytes-long',
        }),
      /JWT_SECRET must be a configured, non-placeholder secret in production/
    );

    const prodConfig = validateEnv({
      ...validConfig,
      NODE_ENV: 'production',
      JWT_SECRET: 'genuine-prod-high-entropy-random-secret-key-at-least-32-bytes',
    });
    assert.equal(prodConfig.isProd, true);
  });

  it('rejects invalid MONGO_URI format', () => {
    assert.throws(
      () => validateEnv({ ...validConfig, MONGO_URI: 'http://localhost:27017' }),
      /MONGO_URI must be a valid MongoDB connection string/
    );
    assert.throws(
      () => validateEnv({ ...validConfig, MONGO_URI: '' }),
      /MONGO_URI is required/
    );
  });
});
