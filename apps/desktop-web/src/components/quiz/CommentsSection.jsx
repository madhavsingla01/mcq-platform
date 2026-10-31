import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Send,
  Trash2,
  Edit2,
  Check,
  X,
  User,
  Heart,
  Share2,
  CornerDownRight,
  ChevronDown,
  ChevronUp,
  Copy,
} from 'lucide-react';
import api from '../../api/axios';
import { Spinner } from '../ui';
import ConfirmDeleteModal from '../ui/ConfirmDeleteModal';
import ShareModal from '../social/ShareModal';
import { useAuthStore } from '../../store/authStore';

const timeAgo = (value) => {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(Math.floor(diff / 60000), 0);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
};

export default function CommentsSection({ quizId, quiz = null, initialCount = 0, onCommentCountChange }) {
  const { user, isAuthenticated } = useAuthStore();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [error, setError] = useState('');

  // Replying state: { parentCommentId, targetUser }
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  // Expanded replies map: { [commentId]: boolean }
  const [expandedThreads, setExpandedThreads] = useState({});

  // Share modal state for sharing a comment
  const [sharingComment, setSharingComment] = useState(null);

  // Delete modal state: { id, isReply, parentId }
  const [commentToDelete, setCommentToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const replyInputRef = useRef(null);

  const calculateTotalComments = (commentList) => {
    return commentList.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0);
  };

  const fetchComments = async () => {
    if (!quizId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/social/quizzes/${quizId}/comments`, { params: { limit: 50 } });
      const fetched = data.data?.comments || [];
      setComments(fetched);
      const total = data.data?.totalComments ?? calculateTotalComments(fetched);
      if (onCommentCountChange) onCommentCountChange(total);
    } catch {
      // Quiet fail if quiz not accessible
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [quizId]);

  useEffect(() => {
    if (replyingTo && replyInputRef.current) {
      replyInputRef.current.focus();
    }
  }, [replyingTo]);

  // Post a new top-level comment
  const handleSubmitTopLevel = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;
    if (!isAuthenticated) {
      setError('Please log in to leave a comment.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(`/social/quizzes/${quizId}/comments`, {
        body: newComment.trim(),
      });
      const created = data.data.comment;
      const updated = [created, ...comments];
      setComments(updated);
      setNewComment('');
      if (onCommentCountChange) onCommentCountChange(calculateTotalComments(updated));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  // Post a reply (comment on comment)
  const handleSubmitReply = async (e) => {
    e.preventDefault();
    if (!replyBody.trim() || submittingReply || !replyingTo) return;
    if (!isAuthenticated) {
      alert('Please log in to reply.');
      return;
    }

    setSubmittingReply(true);
    try {
      const { data } = await api.post(`/social/quizzes/${quizId}/comments`, {
        body: replyBody.trim(),
        parentComment: replyingTo.parentCommentId,
        replyToUser: replyingTo.targetUser?._id,
      });

      const newReply = data.data.comment;

      setComments((prev) =>
        prev.map((c) => {
          if (c._id === replyingTo.parentCommentId) {
            const replies = c.replies || [];
            return {
              ...c,
              replies: [...replies, newReply],
              replyCount: (c.replyCount || replies.length) + 1,
            };
          }
          return c;
        })
      );

      // Auto expand thread so new reply is visible
      setExpandedThreads((prev) => ({ ...prev, [replyingTo.parentCommentId]: true }));
      setReplyingTo(null);
      setReplyBody('');

      if (onCommentCountChange) {
        onCommentCountChange(calculateTotalComments(comments) + 1);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to post reply.');
    } finally {
      setSubmittingReply(false);
    }
  };

  // Like or unlike a comment or reply
  const handleToggleLike = async (comment, isReply = false, parentId = null) => {
    if (!isAuthenticated) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }

    const nextLiked = !comment.isLiked;
    const nextCount = nextLiked ? (comment.likeCount || 0) + 1 : Math.max((comment.likeCount || 0) - 1, 0);

    // Optimistic state update
    if (isReply && parentId) {
      setComments((prev) =>
        prev.map((p) => {
          if (p._id === parentId) {
            return {
              ...p,
              replies: (p.replies || []).map((r) =>
                r._id === comment._id ? { ...r, isLiked: nextLiked, likeCount: nextCount } : r
              ),
            };
          }
          return p;
        })
      );
    } else {
      setComments((prev) =>
        prev.map((c) => (c._id === comment._id ? { ...c, isLiked: nextLiked, likeCount: nextCount } : c))
      );
    }

    try {
      const method = nextLiked ? 'post' : 'delete';
      await api[method](`/social/comments/${comment._id}/like`);
    } catch {
      // Revert on error
      if (isReply && parentId) {
        setComments((prev) =>
          prev.map((p) => {
            if (p._id === parentId) {
              return {
                ...p,
                replies: (p.replies || []).map((r) =>
                  r._id === comment._id ? { ...r, isLiked: !nextLiked, likeCount: comment.likeCount } : r
                ),
              };
            }
            return p;
          })
        );
      } else {
        setComments((prev) =>
          prev.map((c) =>
            c._id === comment._id ? { ...c, isLiked: !nextLiked, likeCount: comment.likeCount } : c
          )
        );
      }
    }
  };

  // Share a comment (open full share dialog)
  const handleShareComment = (comment) => {
    setSharingComment(comment);
  };

  // Edit comment
  const handleStartEdit = (comment) => {
    setEditingId(comment._id);
    setEditBody(comment.body);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditBody('');
  };

  const handleSaveEdit = async (commentId, isReply = false, parentId = null) => {
    if (!editBody.trim()) return;
    try {
      const { data } = await api.patch(`/social/comments/${commentId}`, {
        body: editBody.trim(),
      });
      const updated = data.data.comment;

      if (isReply && parentId) {
        setComments((prev) =>
          prev.map((p) => {
            if (p._id === parentId) {
              return {
                ...p,
                replies: (p.replies || []).map((r) => (r._id === commentId ? { ...r, ...updated } : r)),
              };
            }
            return p;
          })
        );
      } else {
        setComments((prev) =>
          prev.map((c) => (c._id === commentId ? { ...c, ...updated } : c))
        );
      }
      setEditingId(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update comment.');
    }
  };

  // Delete comment via modal
  const handleConfirmDelete = async () => {
    if (!commentToDelete) return;
    setIsDeleting(true);
    try {
      await api.delete(`/social/comments/${commentToDelete.id}`);

      if (commentToDelete.isReply && commentToDelete.parentId) {
        setComments((prev) =>
          prev.map((p) => {
            if (p._id === commentToDelete.parentId) {
              const nextReplies = (p.replies || []).filter((r) => r._id !== commentToDelete.id);
              return {
                ...p,
                replies: nextReplies,
                replyCount: Math.max((p.replyCount || 1) - 1, 0),
              };
            }
            return p;
          })
        );
      } else {
        setComments((prev) => prev.filter((c) => c._id !== commentToDelete.id));
      }

      setCommentToDelete(null);

      // Recalculate count
      setTimeout(() => {
        setComments((latest) => {
          if (onCommentCountChange) onCommentCountChange(calculateTotalComments(latest));
          return latest;
        });
      }, 50);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete comment.');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleThread = (commentId) => {
    setExpandedThreads((prev) => ({ ...prev, [commentId]: !prev[commentId] }));
  };

  const totalCommentCount = calculateTotalComments(comments);

  return (
    <div className="quiz-comments-section" id="comments">
      <div className="quiz-comments-header">
        <div className="quiz-comments-title">
          <MessageSquare size={18} />
          <h3>Discussion & Comments ({totalCommentCount})</h3>
        </div>
      </div>

      {/* New Top-Level Comment Input */}
      <form onSubmit={handleSubmitTopLevel} className="new-comment-form">
        {error && <div className="comment-error-alert">{error}</div>}
        <div className="new-comment-input-wrap">
          <input
            type="text"
            className="new-comment-input"
            placeholder={
              isAuthenticated
                ? 'Add a thought or comment on this quiz...'
                : 'Log in to join the discussion...'
            }
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            disabled={!isAuthenticated || submitting}
            maxLength={1000}
          />
          <button
            type="submit"
            className="btn-submit-comment"
            disabled={!newComment.trim() || submitting || !isAuthenticated}
            title="Post comment"
          >
            {submitting ? <Spinner size={16} /> : <Send size={15} />}
            <span>Post</span>
          </button>
        </div>
      </form>

      {/* Comments List */}
      <div className="comments-list">
        {loading ? (
          <div className="comments-loading">
            <Spinner size={24} />
            <span>Loading discussion...</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="comments-empty">
            <p>No comments yet. Be the first to share your thoughts on this quiz!</p>
          </div>
        ) : (
          comments.map((comment) => {
            const author = comment.author || {};
            const authorId = author._id || comment.author;
            const isOwner = Boolean(user?._id && authorId && String(user._id) === String(authorId));
            const isEditing = editingId === comment._id;
            const authorName = author.name || author.username || 'User';
            const authorUsername = author.username ? `@${author.username}` : '';
            const authorProfile = author.username ? `/@${author.username}` : null;
            const replies = comment.replies || [];
            const isThreadExpanded = Boolean(expandedThreads[comment._id]);
            const isReplyingHere = replyingTo?.parentCommentId === comment._id;

            return (
              <div key={comment._id} className="comment-thread-block" id={`comment-${comment._id}`}>
                {/* Parent Comment Item */}
                <div className="comment-item">
                  <div className="comment-avatar-slot">
                    {author.avatar ? (
                      <img
                        src={author.avatar}
                        alt={authorName}
                        className="comment-avatar"
                        loading="lazy"
                        decoding="async"
                        width="28"
                        height="28"
                      />
                    ) : (
                      <div className="comment-avatar-placeholder">
                        <User size={14} />
                      </div>
                    )}
                  </div>

                  <div className="comment-content">
                    <div className="comment-meta">
                      {authorProfile ? (
                        <Link to={authorProfile} className="comment-author-link">
                          {authorName}
                        </Link>
                      ) : (
                        <span className="comment-author-name">{authorName}</span>
                      )}
                      {authorUsername && <span className="comment-handle">{authorUsername}</span>}
                      <span className="comment-dot">•</span>
                      <span className="comment-timestamp">{timeAgo(comment.createdAt)}</span>
                      {comment.editedAt && <span className="comment-edited">(edited)</span>}

                      {isOwner && !isEditing && (
                        <div className="comment-actions-right">
                          <button
                            type="button"
                            className="btn-comment-action"
                            onClick={() => handleStartEdit(comment)}
                            title="Edit comment"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn-comment-action text-danger"
                            onClick={() =>
                              setCommentToDelete({ id: comment._id, isReply: false, parentId: null })
                            }
                            title="Delete comment"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="comment-edit-wrap">
                        <textarea
                          className="comment-edit-textarea"
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          rows={2}
                          maxLength={1000}
                        />
                        <div className="comment-edit-buttons">
                          <button
                            type="button"
                            className="btn-edit-save"
                            onClick={() => handleSaveEdit(comment._id, false)}
                          >
                            <Check size={14} />
                            <span>Save</span>
                          </button>
                          <button
                            type="button"
                            className="btn-edit-cancel"
                            onClick={handleCancelEdit}
                          >
                            <X size={14} />
                            <span>Cancel</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="comment-body">{comment.body}</div>
                    )}

                    {/* Interaction Buttons Row: Like, Reply, Share */}
                    <div className="comment-interactions-row">
                      <button
                        type="button"
                        className={`comment-pill-action like ${comment.isLiked ? 'active' : ''}`}
                        onClick={() => handleToggleLike(comment, false)}
                        title={comment.isLiked ? 'Unlike comment' : 'Like comment'}
                      >
                        <Heart
                          size={13}
                          fill={comment.isLiked ? '#FF4500' : 'none'}
                          color={comment.isLiked ? '#FF4500' : 'currentColor'}
                        />
                        <span>{(comment.likeCount || 0) > 0 ? comment.likeCount : 'Like'}</span>
                      </button>

                      <button
                        type="button"
                        className="comment-pill-action"
                        onClick={() => {
                          setReplyingTo({
                            parentCommentId: comment._id,
                            targetUser: author,
                          });
                        }}
                        title="Reply to comment"
                      >
                        <CornerDownRight size={13} />
                        <span>Reply</span>
                      </button>

                      <button
                        type="button"
                        className="comment-pill-action share"
                        onClick={() => handleShareComment(comment)}
                        title="Share comment"
                      >
                        <Share2 size={13} />
                        <span>Share</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Inline Reply Form (when replying to parent or within thread) */}
                {isReplyingHere && (
                  <form onSubmit={handleSubmitReply} className="inline-reply-box">
                    <div className="reply-header-info">
                      <CornerDownRight size={13} className="reply-icon" />
                      <span>
                        Replying to{' '}
                        <strong>
                          @{replyingTo.targetUser?.username || replyingTo.targetUser?.name || 'user'}
                        </strong>
                      </span>
                      <button
                        type="button"
                        className="btn-cancel-reply-x"
                        onClick={() => setReplyingTo(null)}
                        title="Cancel reply"
                      >
                        <X size={12} />
                      </button>
                    </div>

                    <div className="inline-reply-input-row">
                      <input
                        ref={replyInputRef}
                        type="text"
                        className="inline-reply-input"
                        placeholder={`Write your reply to @${
                          replyingTo.targetUser?.username || replyingTo.targetUser?.name || 'user'
                        }...`}
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        maxLength={1000}
                        disabled={submittingReply}
                      />
                      <button
                        type="submit"
                        className="btn-submit-reply"
                        disabled={!replyBody.trim() || submittingReply}
                        title="Post reply"
                      >
                        {submittingReply ? <Spinner size={13} /> : <Send size={13} />}
                        <span>Reply</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* Collapsible Replies Sub-Thread */}
                {replies.length > 0 && (
                  <div className="comment-replies-container">
                    <button
                      type="button"
                      className="btn-toggle-thread"
                      onClick={() => toggleThread(comment._id)}
                    >
                      {isThreadExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      <span>
                        {isThreadExpanded
                          ? `Hide ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`
                          : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                      </span>
                    </button>

                    {isThreadExpanded && (
                      <div className="replies-nested-list">
                        {replies.map((reply) => {
                          const repAuthor = reply.author || {};
                          const repAuthorId = repAuthor._id || reply.author;
                          const repIsOwner = Boolean(user?._id && repAuthorId && String(user._id) === String(repAuthorId));
                          const repIsEditing = editingId === reply._id;
                          const repAuthorName = repAuthor.name || repAuthor.username || 'User';
                          const repAuthorUsername = repAuthor.username ? `@${repAuthor.username}` : '';
                          const repAuthorProfile = repAuthor.username ? `/@${repAuthor.username}` : null;
                          const targetUser = reply.replyToUser;

                          return (
                            <div key={reply._id} className="reply-item" id={`comment-${reply._id}`}>
                              <div className="comment-avatar-slot">
                                {repAuthor.avatar ? (
                                  <img
                                    src={repAuthor.avatar}
                                    alt={repAuthorName}
                                    className="comment-avatar small"
                                    loading="lazy"
                                    decoding="async"
                                    width="22"
                                    height="22"
                                  />
                                ) : (
                                  <div className="comment-avatar-placeholder small">
                                    <User size={12} />
                                  </div>
                                )}
                              </div>

                              <div className="comment-content">
                                <div className="comment-meta">
                                  {repAuthorProfile ? (
                                    <Link to={repAuthorProfile} className="comment-author-link">
                                      {repAuthorName}
                                    </Link>
                                  ) : (
                                    <span className="comment-author-name">{repAuthorName}</span>
                                  )}
                                  {repAuthorUsername && (
                                    <span className="comment-handle">{repAuthorUsername}</span>
                                  )}

                                  {targetUser && (
                                    <span className="reply-to-tag">
                                      replied to @{targetUser.username || targetUser.name}
                                    </span>
                                  )}

                                  <span className="comment-dot">•</span>
                                  <span className="comment-timestamp">{timeAgo(reply.createdAt)}</span>
                                  {reply.editedAt && <span className="comment-edited">(edited)</span>}

                                  {repIsOwner && !repIsEditing && (
                                    <div className="comment-actions-right">
                                      <button
                                        type="button"
                                        className="btn-comment-action"
                                        onClick={() => handleStartEdit(reply)}
                                        title="Edit reply"
                                      >
                                        <Edit2 size={11} />
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-comment-action text-danger"
                                        onClick={() =>
                                          setCommentToDelete({
                                            id: reply._id,
                                            isReply: true,
                                            parentId: comment._id,
                                          })
                                        }
                                        title="Delete reply"
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {repIsEditing ? (
                                  <div className="comment-edit-wrap">
                                    <textarea
                                      className="comment-edit-textarea"
                                      value={editBody}
                                      onChange={(e) => setEditBody(e.target.value)}
                                      rows={2}
                                      maxLength={1000}
                                    />
                                    <div className="comment-edit-buttons">
                                      <button
                                        type="button"
                                        className="btn-edit-save"
                                        onClick={() => handleSaveEdit(reply._id, true, comment._id)}
                                      >
                                        <Check size={14} />
                                        <span>Save</span>
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-edit-cancel"
                                        onClick={handleCancelEdit}
                                      >
                                        <X size={14} />
                                        <span>Cancel</span>
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="comment-body reply-body">{reply.body}</div>
                                )}

                                {/* Reply Interaction Row */}
                                <div className="comment-interactions-row">
                                  <button
                                    type="button"
                                    className={`comment-pill-action like ${reply.isLiked ? 'active' : ''}`}
                                    onClick={() => handleToggleLike(reply, true, comment._id)}
                                    title={reply.isLiked ? 'Unlike reply' : 'Like reply'}
                                  >
                                    <Heart
                                      size={12}
                                      fill={reply.isLiked ? '#FF4500' : 'none'}
                                      color={reply.isLiked ? '#FF4500' : 'currentColor'}
                                    />
                                    <span>{(reply.likeCount || 0) > 0 ? reply.likeCount : 'Like'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    className="comment-pill-action"
                                    onClick={() => {
                                      setReplyingTo({
                                        parentCommentId: comment._id,
                                        targetUser: repAuthor,
                                      });
                                    }}
                                    title="Reply to user"
                                  >
                                    <CornerDownRight size={12} />
                                    <span>Reply</span>
                                  </button>

                                  <button
                                    type="button"
                                    className="comment-pill-action share"
                                    onClick={() => handleShareComment(reply)}
                                    title="Share reply"
                                  >
                                    <Share2 size={12} />
                                    <span>Share</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Consistent Delete Warning Modal */}
      <ConfirmDeleteModal
        isOpen={Boolean(commentToDelete)}
        onClose={() => {
          if (!isDeleting) setCommentToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title={commentToDelete?.isReply ? 'Delete Reply?' : 'Delete Comment?'}
        message="Are you sure you want to permanently delete this comment?"
        details={
          commentToDelete?.isReply
            ? 'This action cannot be undone. This reply will be permanently removed from the discussion.'
            : 'This action cannot be undone. All replies and interactions under this comment will also be permanently deleted from the database.'
        }
        confirmText={isDeleting ? 'Deleting...' : 'Delete Permanently'}
        isDeleting={isDeleting}
      />

      {/* Share Comment Dialog */}
      <ShareModal
        isOpen={Boolean(sharingComment)}
        onClose={() => setSharingComment(null)}
        quiz={quiz || { _id: quizId }}
        comment={sharingComment}
      />

      <style>{commentsStyles}</style>
    </div>
  );
}

const commentsStyles = `
  .quiz-comments-section {
    margin-top: 24px;
    padding: 24px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 16px;
  }

  .quiz-comments-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .quiz-comments-title {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--color-text);
  }

  .quiz-comments-title h3 {
    font-size: 17px;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.01em;
  }

  .new-comment-form {
    margin-bottom: 24px;
  }

  .comment-error-alert {
    padding: 10px 14px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.25);
    color: #EF4444;
    font-size: 13px;
    border-radius: 10px;
    margin-bottom: 12px;
  }

  .new-comment-input-wrap {
    display: flex;
    gap: 10px;
  }

  .new-comment-input {
    flex: 1;
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    color: var(--color-text);
    font-size: 14px;
    outline: none;
    transition: all 0.15s ease;
  }

  .new-comment-input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(255, 69, 0, 0.12);
  }

  .btn-submit-comment {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 20px;
    border-radius: 12px;
    border: none;
    background: var(--color-primary);
    color: #ffffff;
    font-size: 13px;
    font-weight: 650;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-submit-comment:hover:not(:disabled) {
    background: var(--color-primary-hover);
    transform: translateY(-1px);
  }

  .btn-submit-comment:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .comments-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .comments-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 40px 0;
    color: var(--color-text-secondary);
    font-size: 14px;
  }

  .comments-empty {
    text-align: center;
    padding: 36px 16px;
    color: var(--color-text-secondary);
    font-size: 14px;
    background: var(--color-surface-alt);
    border-radius: 12px;
    border: 1px dashed var(--color-border);
  }

  .comment-thread-block {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--color-border);
  }

  .comment-thread-block:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .comment-item {
    display: flex;
    gap: 12px;
  }

  .comment-avatar-slot {
    flex-shrink: 0;
  }

  .comment-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
  }

  .comment-avatar.small {
    width: 28px;
    height: 28px;
  }

  .comment-avatar-placeholder {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
  }

  .comment-avatar-placeholder.small {
    width: 28px;
    height: 28px;
  }

  .comment-content {
    flex: 1;
    min-width: 0;
  }

  .comment-meta {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }

  .comment-author-link,
  .comment-author-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text);
    text-decoration: none;
  }

  .comment-author-link:hover {
    color: var(--color-primary);
  }

  .comment-handle {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .reply-to-tag {
    font-size: 11px;
    font-weight: 500;
    color: var(--color-primary);
    background: rgba(255, 69, 0, 0.08);
    padding: 1px 6px;
    border-radius: 4px;
  }

  .comment-dot {
    font-size: 10px;
    color: var(--color-text-muted);
  }

  .comment-timestamp {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .comment-edited {
    font-size: 11px;
    color: var(--color-text-muted);
    font-style: italic;
  }

  .comment-actions-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-comment-action {
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .btn-comment-action:hover {
    color: var(--color-text);
    background: var(--color-surface-alt);
  }

  .btn-comment-action.text-danger:hover {
    color: #EF4444;
    background: rgba(239, 68, 68, 0.12);
  }

  .comment-body {
    font-size: 14px;
    line-height: 1.5;
    color: var(--color-text);
    word-break: break-word;
    margin-bottom: 8px;
  }

  .comment-body.reply-body {
    font-size: 13.5px;
  }

  .comment-interactions-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .comment-pill-action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: none;
    padding: 3px 6px;
    border-radius: 6px;
    color: var(--color-text-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .comment-pill-action:hover {
    color: var(--color-text);
    background: var(--color-surface-alt);
  }

  .comment-pill-action.like.active {
    color: #FF4500;
  }

  .comment-pill-action.like.active:hover {
    background: rgba(255, 69, 0, 0.1);
  }

  /* Inline reply box */
  .inline-reply-box {
    margin-left: 48px;
    margin-top: 6px;
    padding: 10px 14px;
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: replyFadeIn 0.15s ease-out;
  }

  @keyframes replyFadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .reply-header-info {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .reply-icon {
    color: var(--color-primary);
  }

  .btn-cancel-reply-x {
    margin-left: auto;
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .btn-cancel-reply-x:hover {
    color: var(--color-text);
    background: var(--color-surface);
  }

  .inline-reply-input-row {
    display: flex;
    gap: 8px;
  }

  .inline-reply-input {
    flex: 1;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 13px;
    outline: none;
  }

  .inline-reply-input:focus {
    border-color: var(--color-primary);
  }

  .btn-submit-reply {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    border-radius: 8px;
    border: none;
    background: var(--color-primary);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-submit-reply:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .btn-submit-reply:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Nested Replies Sub-Thread */
  .comment-replies-container {
    margin-left: 48px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 4px;
  }

  .btn-toggle-thread {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: var(--color-primary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 4px 0;
    align-self: flex-start;
  }

  .btn-toggle-thread:hover {
    text-decoration: underline;
  }

  .replies-nested-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
    border-left: 2px solid var(--color-border);
    padding-left: 14px;
    margin-left: 4px;
  }

  .reply-item {
    display: flex;
    gap: 10px;
  }

  .comment-edit-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 6px 0;
  }

  .comment-edit-textarea {
    width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--color-primary);
    background: var(--color-surface-alt);
    color: var(--color-text);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    resize: vertical;
  }

  .comment-edit-buttons {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .btn-edit-save {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 12px;
    border-radius: 6px;
    border: none;
    background: var(--color-primary);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-edit-cancel {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 12px;
    border-radius: 6px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
`;
