import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');

test('each Social domain has an independently startable app and image', async () => {
  for (const service of ['social-feed-service', 'social-interactions-service', 'social-comments-service']) {
    await access(path.join(root, 'services', service, 'src', 'index.js'));
    await access(path.join(root, 'services', service, 'Dockerfile'));
    const manifest = JSON.parse(await read(`services/${service}/package.json`));
    assert.equal(manifest.scripts.start, 'node src/index.js');
    assert.equal(manifest.type, 'module');
  }
});

test('gateway and disposable verification stack are wired to all three domains', async () => {
  const [gateway, compose, verifier] = await Promise.all([
    read('services/api-gateway/src/server.ts'),
    read('docker-compose.yml'),
    read('scripts/verify-stack.mjs'),
  ]);
  for (const key of [
    'SOCIAL_FEED_SERVICE_URL',
    'SOCIAL_INTERACTIONS_SERVICE_URL',
    'SOCIAL_COMMENTS_SERVICE_URL',
  ]) {
    assert.match(gateway, new RegExp(key));
    assert.match(compose, new RegExp(key));
  }
  for (const name of ['social-feed-service', 'social-interactions-service', 'social-comments-service']) {
    assert.match(verifier, new RegExp(name));
    assert.match(compose, new RegExp(name));
  }
});