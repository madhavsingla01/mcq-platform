import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createServiceEnvironment, readServicePort } from '../scripts/service-launch-config.js';

test('new Social service ports can come from examples and inherit existing Social config', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quizfocus-launch-config-'));
  try {
    const socialDirectory = path.join(root, 'services', 'social-service');
    const feedDirectory = path.join(root, 'services', 'social-feed-service');
    await mkdir(socialDirectory, { recursive: true });
    await mkdir(feedDirectory, { recursive: true });
    await writeFile(path.join(socialDirectory, '.env'), 'PORT=5005\nJWT_SECRET=test-only-shared-secret\nMONGO_URI=mongodb://localhost/test\n');
    await writeFile(path.join(feedDirectory, '.env.example'), 'PORT=5010\n');

    const port = readServicePort('social-feed-service', root);
    const env = createServiceEnvironment(
      { name: 'social-feed-service', port },
      [],
      root,
      { NODE_ENV: 'development' },
    );

    assert.equal(port, 5010);
    assert.equal(env.PORT, '5010');
    assert.equal(env.JWT_SECRET, 'test-only-shared-secret');
    assert.equal(env.MONGO_URI, 'mongodb://localhost/test');
    assert.equal(env.NODE_ENV, 'development');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('gateway receives local URLs for all new Social services unless explicitly configured', () => {
  const services = [
    { name: 'api-gateway', port: 5000 },
    { name: 'social-feed-service', port: 5010 },
    { name: 'social-interactions-service', port: 5011 },
    { name: 'social-comments-service', port: 5012 },
  ];
  const env = createServiceEnvironment(services[0], services, process.cwd(), {
    SOCIAL_INTERACTIONS_SERVICE_URL: 'http://custom-social-interactions:8011',
  });

  assert.equal(env.SOCIAL_FEED_SERVICE_URL, 'http://127.0.0.1:5010');
  assert.equal(env.SOCIAL_INTERACTIONS_SERVICE_URL, 'http://custom-social-interactions:8011');
  assert.equal(env.SOCIAL_COMMENTS_SERVICE_URL, 'http://127.0.0.1:5012');
});
