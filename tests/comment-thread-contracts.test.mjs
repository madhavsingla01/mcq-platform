import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCommentTree } from '../services/social-service/src/services/social/commentTree.js';
import {
  appendCommentReply,
  countCommentTree,
  getCommentAncestorIds,
  updateCommentTree,
} from '../apps/desktop-web/src/utils/commentTree.js';

test('comment trees preserve direct parent relationships and deleted nodes', () => {
  const tree = buildCommentTree(
    [{ _id: 'root', status: 'active' }],
    [
      { _id: 'reply', parentComment: 'root', status: 'deleted' },
      { _id: 'nested', parentComment: 'reply', status: 'active' },
    ],
  );

  assert.equal(tree[0]._id, 'root');
  assert.equal(tree[0].replies[0]._id, 'reply');
  assert.equal(tree[0].replies[0].status, 'deleted');
  assert.equal(tree[0].replies[0].replies[0]._id, 'nested');
  assert.deepEqual(buildCommentTree([], []), []);
});

test('comment UI tree updates nested replies, counts deleted placeholders, and finds ancestors', () => {
  const comments = [{
    _id: 'root',
    replies: [{
      _id: 'reply',
      replyCount: 0,
      replies: [],
    }],
  }];
  const nestedReply = { _id: 'nested', replies: [] };
  const updated = appendCommentReply(comments, 'reply', nestedReply);

  assert.equal(updated[0].replies[0].replyCount, 1);
  assert.deepEqual(getCommentAncestorIds(updated, 'nested'), ['root', 'reply']);
  assert.equal(countCommentTree(updated), 3);

  const deleted = updateCommentTree(updated, 'reply', (comment) => ({
    ...comment,
    status: 'deleted',
  }));
  assert.equal(deleted[0].replies[0].status, 'deleted');
  assert.equal(deleted[0].replies[0].replies[0]._id, 'nested');
  assert.equal(countCommentTree(deleted), 3);
  assert.equal(updateCommentTree(updated, 'missing', () => null), updated);
});
