import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.PORT = '5012';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/social-route-tests';
process.env.JWT_SECRET = 'social-route-tests-secret-value-at-least-32-bytes';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.MAX_FILE_SIZE_GUEST = '20480';
process.env.MAX_FILE_SIZE_AUTH = '10485760';
process.env.MAX_IMPORT_ROWS = '10000';
process.env.CACHE_DEFAULT_TTL_MS = '30000';

const { default: router } = await import('../src/routes/social.routes.js');
const paths = router.stack
  .filter((layer) => layer.route)
  .map((layer) => layer.route.path);

test('comments service owns quiz comment and comment interaction routes', () => {
  assert.deepEqual(paths, [
    '/quizzes/:quizId/comments',
    '/quizzes/:quizId/comments',
    '/comments/:commentId',
    '/comments/:commentId',
    '/comments/:commentId/like',
    '/comments/:commentId/like',
  ]);
});
