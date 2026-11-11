const idString = (value) => String(value?._id || value || '');

export const countCommentTree = (comments = []) =>
  comments.reduce((count, comment) => count + 1 + countCommentTree(comment.replies || []), 0);

export const updateCommentTree = (comments, commentId, update) => {
  let changed = false;
  const nextComments = comments.map((comment) => {
    if (idString(comment._id) === idString(commentId)) {
      changed = true;
      return update(comment);
    }

    if (comment.replies?.length) {
      const nextReplies = updateCommentTree(comment.replies, commentId, update);
      if (nextReplies !== comment.replies) {
        changed = true;
        return { ...comment, replies: nextReplies };
      }
    }

    return comment;
  });

  return changed ? nextComments : comments;
};

export const appendCommentReply = (comments, parentId, reply) =>
  updateCommentTree(comments, parentId, (parent) => ({
    ...parent,
    replies: [...(parent.replies || []), reply],
    replyCount: (parent.replyCount || 0) + 1,
  }));

export const getCommentAncestorIds = (comments, commentId, ancestors = []) => {
  for (const comment of comments) {
    if (idString(comment._id) === idString(commentId)) {
      return ancestors;
    }

    const nextAncestors = [...ancestors, comment._id];
    const found = getCommentAncestorIds(comment.replies || [], commentId, nextAncestors);
    if (found) {
      return found;
    }
  }

  return null;
};
