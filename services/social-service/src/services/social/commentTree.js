const idString = (value) => String(value?._id || value || '');

export const buildCommentTree = (rootComments, replies) => {
  const commentsById = new Map(
    [...rootComments, ...replies].map((comment) => [
      idString(comment._id),
      { ...comment, replies: [] },
    ])
  );

  for (const reply of replies) {
    const parent = commentsById.get(idString(reply.parentComment));
    if (parent) {
      parent.replies.push(commentsById.get(idString(reply._id)));
    }
  }

  return rootComments
    .map((comment) => commentsById.get(idString(comment._id)))
    .filter(Boolean);
};
