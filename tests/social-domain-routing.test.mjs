import assert from 'node:assert/strict';
import test from 'node:test';
import { socialServiceForPath } from '../services/api-gateway/src/social-routing.js';

test('social feed and profile routes retain their gateway contract', () => {
  for (const pathname of [
    '/feed',
    '/explore',
    '/challenges-overview',
    '/profile/alex',
    '/users/alex/quizzes',
    '/users/alex/activity',
    '/users/alex/followers',
    '/users/alex/following',
    '/users/alex/follow',
    '/notifications',
    '/notifications/unread-count',
    '/notifications/read-all',
    '/notifications/0123456789abcdef01234567/read',
  ]) {
    assert.equal(socialServiceForPath(pathname), 'feedProfile', pathname);
  }
});

test('social quiz reactions and sharing routes belong to interactions', () => {
  for (const pathname of [
    '/bookmarks',
    '/share-contacts',
    '/quizzes/0123456789abcdef01234567/like',
    '/quizzes/0123456789abcdef01234567/bookmark',
    '/quizzes/0123456789abcdef01234567/share',
    '/quizzes/0123456789abcdef01234567/share-direct',
  ]) {
    assert.equal(socialServiceForPath(pathname), 'interactions', pathname);
  }
});

test('quiz comments and comment mutations belong to comments', () => {
  for (const pathname of [
    '/quizzes/0123456789abcdef01234567/comments',
    '/comments/0123456789abcdef01234567',
    '/comments/0123456789abcdef01234567/like',
  ]) {
    assert.equal(socialServiceForPath(pathname), 'comments', pathname);
  }
});

test('unknown paths remain eligible for the legacy compatibility service', () => {
  assert.equal(socialServiceForPath('/unknown'), null);
});