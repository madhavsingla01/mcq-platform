export const MESSAGE_LIMIT = 2000;
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export const messageId = (value) => String(value?._id || value || '');

// Socket delivery can beat the HTTP response. Reconcile by both identifiers so
// retries and an acknowledgement never render a message twice.
export function mergeMessages(previous, incoming) {
  const merged = [...previous];
  for (const item of incoming) {
    if (!item?._id) continue;
    const index = merged.findIndex((existing) =>
      messageId(existing) === messageId(item) ||
      (item.clientMessageId && item.clientMessageId === existing.clientMessageId &&
        messageId(item.sender) === messageId(existing.sender))
    );
    if (index < 0) merged.push(item);
    else merged[index] = { ...merged[index], ...item, isOptimistic: Boolean(item.isOptimistic) };
  }
  return merged.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || messageId(a).localeCompare(messageId(b)));
}

export function deletedMessage(message) {
  return { ...message, isDeleted: true, text: 'This message was deleted',
    quiz: null, quizMetadata: null, media: null, comment: null, link: null, replyTo: null, reactions: [] };
}

// Use the same revoke handling for history and search results. A quote can be
// visible even when the original message is outside the currently loaded page.
export function applyMessageDeletion(messages, messageIdToDelete, mode = 'everyone') {
  if (mode === 'me') return messages.filter((message) => messageId(message) !== String(messageIdToDelete));
  return messages.map((message) => messageId(message) === String(messageIdToDelete)
    ? deletedMessage(message)
    : messageId(message.replyTo?.messageId) === String(messageIdToDelete)
      ? { ...message, replyTo: null } : message);
}

export function applyReadReceipt(messages, { readerId, messageIds }, currentUserId) {
  const ids = Array.isArray(messageIds) ? new Set(messageIds.map(String)) : null;
  return messages.map((message) => {
    if (messageId(message.sender) !== String(currentUserId) || (ids && !ids.has(messageId(message)))) return message;
    const readBy = message.readBy || [];
    return readBy.some((id) => messageId(id) === String(readerId))
      ? { ...message, deliveryStatus: 'read' } : { ...message, deliveryStatus: 'read', readBy: [...readBy, readerId] };
  });
}

export function canEditMessage(message, now = Date.now()) {
  return message?.type === 'text' && !message.isDeleted && !message.isOptimistic &&
    now - new Date(message.createdAt).getTime() <= EDIT_WINDOW_MS;
}

const draftKey = (userId, conversationId) => `mcq.chat.draft:${userId}:${conversationId}`;
export function readDraft(userId, conversationId) {
  if (!userId || !conversationId) return '';
  try { return sessionStorage.getItem(draftKey(userId, conversationId)) || ''; } catch { return ''; }
}
export function writeDraft(userId, conversationId, text) {
  if (!userId || !conversationId) return;
  try {
    if (text) sessionStorage.setItem(draftKey(userId, conversationId), text.slice(0, MESSAGE_LIMIT));
    else sessionStorage.removeItem(draftKey(userId, conversationId));
  } catch { /* Drafts are optional when browser storage is unavailable. */ }
}
