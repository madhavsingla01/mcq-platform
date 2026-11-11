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
} from 'lucide-react';
import api from '../../api/axios';
import { Spinner } from '../ui';
import ConfirmDeleteModal from '../ui/ConfirmDeleteModal';
import ShareModal from '../social/ShareModal';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'sonner';
import {
  appendCommentReply,
  countCommentTree,
  getCommentAncestorIds,
  updateCommentTree,
} from '../../utils/commentTree';
import './CommentsSection.css';

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

const getExpandedThreadIds = (comments) => {
  const expanded = {};
  for (const comment of comments) {
    if (comment.replies?.length) {
      expanded[comment._id] = true;
      Object.assign(expanded, getExpandedThreadIds(comment.replies));
    }
  }
  return expanded;
};

function CommentNode({
  comment,
  depth,
  user,
  isAuthenticated,
  editingId,
  editBody,
  setEditBody,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onLike,
  onReply,
  onShare,
  replyingTo,
  replyBody,
  setReplyBody,
  submittingReply,
  onSubmitReply,
  replyInputRef,
  expandedThreads,
  onToggleThread,
}) {
  const author = comment.author || {};
  const authorId = author._id || comment.author;
  const isOwner = Boolean(user?._id && authorId && String(user._id) === String(authorId));
  const isDeleted = comment.status === 'deleted';
  const isEditing = editingId === comment._id;
  const authorName = author.name || author.username || 'User';
  const authorUsername = author.username ? `@${author.username}` : '';
  const authorProfile = author.username ? `/@${author.username}` : null;
  const replies = comment.replies || [];
  const isThreadExpanded = Boolean(expandedThreads[comment._id]);
  const isReplyingHere = replyingTo?.parentCommentId === comment._id;
  const targetUser = replyingTo?.targetUser;
  const isRoot = depth === 0;

  return (
    <div
      className={isRoot ? 'comment-thread-block' : 'nested-comment-node'}
      id={`comment-${comment._id}`}
      style={{ '--comment-depth': Math.min(depth, 5) }}
    >
      <div className={`comment-item${isRoot ? '' : ' reply-item'}`}>
        <div className="comment-avatar-slot">
          {author.avatar ? (
            <img
              src={author.avatar}
              alt={authorName}
              className={`comment-avatar${isRoot ? '' : ' small'}`}
              loading="lazy"
              decoding="async"
              width={isRoot ? 36 : 28}
              height={isRoot ? 36 : 28}
            />
          ) : (
            <div className={`comment-avatar-placeholder${isRoot ? '' : ' small'}`}>
              <User size={isRoot ? 14 : 12} />
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
            {!isRoot && comment.replyToUser && (
              <span className="reply-to-tag">
                replied to @{comment.replyToUser.username || comment.replyToUser.name}
              </span>
            )}
            <span className="comment-dot">•</span>
            <span className="comment-timestamp">{timeAgo(comment.createdAt)}</span>
            {!isDeleted && comment.editedAt && <span className="comment-edited">(edited)</span>}

            {isOwner && !isEditing && !isDeleted && (
              <div className="comment-actions-right">
                <button
                  type="button"
                  className="btn-comment-action"
                  onClick={() => onStartEdit(comment)}
                  title={isRoot ? 'Edit comment' : 'Edit reply'}
                  aria-label={isRoot ? 'Edit comment' : 'Edit reply'}
                >
                  <Edit2 size={isRoot ? 12 : 11} />
                </button>
                <button
                  type="button"
                  className="btn-comment-action text-danger"
                  onClick={() => onDelete(comment)}
                  title={isRoot ? 'Delete comment' : 'Delete reply'}
                  aria-label={isRoot ? 'Delete comment' : 'Delete reply'}
                >
                  <Trash2 size={isRoot ? 12 : 11} />
                </button>
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="comment-edit-wrap">
              <textarea
                className="comment-edit-textarea"
                value={editBody}
                onChange={(event) => setEditBody(event.target.value)}
                rows={2}
                maxLength={1000}
              />
              <div className="comment-edit-buttons">
                <button
                  type="button"
                  className="btn-edit-save"
                  onClick={() => onSaveEdit(comment._id)}
                >
                  <Check size={14} />
                  <span>Save</span>
                </button>
                <button type="button" className="btn-edit-cancel" onClick={onCancelEdit}>
                  <X size={14} />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          ) : (
            <div className={`comment-body${isRoot ? '' : ' reply-body'}${isDeleted ? ' deleted-comment-body' : ''}`}>
              {isDeleted ? 'Comment is deleted' : comment.body}
            </div>
          )}

          <div className="comment-interactions-row">
            {!isDeleted && (
              <>
                <button
                  type="button"
                  className={`comment-pill-action like ${comment.isLiked ? 'active' : ''}`}
                  onClick={() => onLike(comment)}
                  title={comment.isLiked ? 'Unlike comment' : 'Like comment'}
                >
                  <Heart
                    size={isRoot ? 13 : 12}
                    fill={comment.isLiked ? '#FF4500' : 'none'}
                    color={comment.isLiked ? '#FF4500' : 'currentColor'}
                  />
                  <span>{(comment.likeCount || 0) > 0 ? comment.likeCount : 'Like'}</span>
                </button>
                <button
                  type="button"
                  className="comment-pill-action share"
                  onClick={() => onShare(comment)}
                  title={isRoot ? 'Share comment' : 'Share reply'}
                >
                  <Share2 size={isRoot ? 13 : 12} />
                  <span>Share</span>
                </button>
              </>
            )}
            <button
              type="button"
              className="comment-pill-action"
              onClick={() => onReply(comment)}
              title={isRoot ? 'Reply to comment' : 'Reply to user'}
            >
              <CornerDownRight size={isRoot ? 13 : 12} />
              <span>Reply</span>
            </button>
          </div>
        </div>
      </div>

      {isReplyingHere && (
        <form onSubmit={onSubmitReply} className="inline-reply-box">
          <div className="reply-header-info">
            <CornerDownRight size={13} className="reply-icon" />
            <span>
              Replying to{' '}
              <strong>@{targetUser?.username || targetUser?.name || 'comment'}</strong>
            </span>
            <button
              type="button"
              className="btn-cancel-reply-x"
              onClick={() => onReply(null)}
              title="Cancel reply"
              aria-label="Cancel reply"
            >
              <X size={12} />
            </button>
          </div>

          <div className="inline-reply-input-row">
            <input
              ref={replyInputRef}
              type="text"
              className="inline-reply-input"
              placeholder={`Write your reply to @${targetUser?.username || targetUser?.name || 'comment'}...`}
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
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

      {replies.length > 0 && (
        <div
          className="comment-replies-container"
          style={{ marginLeft: isRoot ? 48 : 24 }}
        >
          <button
            type="button"
            className="btn-toggle-thread"
            onClick={() => onToggleThread(comment._id)}
            aria-expanded={isThreadExpanded}
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
              {replies.map((reply) => (
                <CommentNode
                  key={reply._id}
                  comment={reply}
                  depth={depth + 1}
                  user={user}
                  isAuthenticated={isAuthenticated}
                  editingId={editingId}
                  editBody={editBody}
                  setEditBody={setEditBody}
                  onStartEdit={onStartEdit}
                  onCancelEdit={onCancelEdit}
                  onSaveEdit={onSaveEdit}
                  onDelete={onDelete}
                  onLike={onLike}
                  onReply={onReply}
                  onShare={onShare}
                  replyingTo={replyingTo}
                  replyBody={replyBody}
                  setReplyBody={setReplyBody}
                  submittingReply={submittingReply}
                  onSubmitReply={onSubmitReply}
                  replyInputRef={replyInputRef}
                  expandedThreads={expandedThreads}
                  onToggleThread={onToggleThread}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CommentsSection({ quizId, quiz = null, initialCount = 0, onCommentCountChange }) {
  const { user, isAuthenticated } = useAuthStore();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [error, setError] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState({});
  const [sharingComment, setSharingComment] = useState(null);
  const [commentToDelete, setCommentToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const replyInputRef = useRef(null);

  const fetchComments = async () => {
    if (!quizId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/social/quizzes/${quizId}/comments`, { params: { limit: 50 } });
      const fetched = data.data?.comments || [];
      setComments(fetched);
      setExpandedThreads(getExpandedThreadIds(fetched));
      onCommentCountChange?.(data.data?.totalComments ?? countCommentTree(fetched));
    } catch {
      // Quiet fail if quiz is not accessible.
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

  const handleSubmitTopLevel = async (event) => {
    event.preventDefault();
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
      const updated = [data.data.comment, ...comments];
      setComments(updated);
      setNewComment('');
      onCommentCountChange?.(countCommentTree(updated));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (event) => {
    event.preventDefault();
    if (!replyBody.trim() || submittingReply || !replyingTo) return;
    if (!isAuthenticated) {
      toast.error('Please log in to reply.');
      return;
    }

    setSubmittingReply(true);
    try {
      const { data } = await api.post(`/social/quizzes/${quizId}/comments`, {
        body: replyBody.trim(),
        parentComment: replyingTo.parentCommentId,
        replyToUser: replyingTo.targetUser?._id,
      });
      const parentId = replyingTo.parentCommentId;
      const ancestors = getCommentAncestorIds(comments, parentId) || [];
      const updated = appendCommentReply(comments, parentId, data.data.comment);
      setComments(updated);
      setExpandedThreads((previous) => ({
        ...previous,
        ...Object.fromEntries([...ancestors, parentId].map((id) => [id, true])),
      }));
      setReplyingTo(null);
      setReplyBody('');
      onCommentCountChange?.(countCommentTree(updated));
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Failed to post reply.');
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleToggleLike = async (comment) => {
    if (!isAuthenticated) {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }

    const nextLiked = !comment.isLiked;
    const nextCount = nextLiked
      ? (comment.likeCount || 0) + 1
      : Math.max((comment.likeCount || 0) - 1, 0);
    setComments((previous) => updateCommentTree(previous, comment._id, (item) => ({
      ...item,
      isLiked: nextLiked,
      likeCount: nextCount,
    })));

    try {
      await api[nextLiked ? 'post' : 'delete'](`/social/comments/${comment._id}/like`);
    } catch {
      setComments((previous) => updateCommentTree(previous, comment._id, (item) => ({
        ...item,
        isLiked: !nextLiked,
        likeCount: comment.likeCount,
      })));
    }
  };

  const handleStartEdit = (comment) => {
    setEditingId(comment._id);
    setEditBody(comment.body);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditBody('');
  };

  const handleSaveEdit = async (commentId) => {
    if (!editBody.trim()) return;
    try {
      const { data } = await api.patch(`/social/comments/${commentId}`, {
        body: editBody.trim(),
      });
      setComments((previous) => updateCommentTree(previous, commentId, (comment) => ({
        ...comment,
        ...data.data.comment,
      })));
      handleCancelEdit();
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Failed to update comment.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!commentToDelete) return;
    setIsDeleting(true);
    try {
      await api.delete(`/social/comments/${commentToDelete._id}`);
      setComments((previous) => updateCommentTree(previous, commentToDelete._id, (comment) => ({
        ...comment,
        body: 'Comment is deleted',
        status: 'deleted',
        likes: [],
        likeCount: 0,
        isLiked: false,
        isOwner: false,
      })));
      setCommentToDelete(null);
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Failed to delete comment.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReply = (comment) => {
    if (!comment) {
      setReplyingTo(null);
      return;
    }
    const author = comment.author?.name || comment.author?.username
      ? comment.author
      : null;
    setReplyingTo({
      parentCommentId: comment._id,
      targetUser: comment.status === 'deleted' ? null : author,
    });
  };

  const handleDelete = (comment) => {
    setCommentToDelete({
      _id: comment._id,
      isReply: Boolean(comment.parentComment),
    });
  };

  const toggleThread = (commentId) => {
    setExpandedThreads((previous) => ({ ...previous, [commentId]: !previous[commentId] }));
  };

  const totalCommentCount = countCommentTree(comments);

  return (
    <div className="quiz-comments-section" id="comments">
      <div className="quiz-comments-header">
        <div className="quiz-comments-title">
          <MessageSquare size={18} />
          <h3>Discussion &amp; Comments ({loading ? initialCount : totalCommentCount})</h3>
        </div>
      </div>

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
            onChange={(event) => setNewComment(event.target.value)}
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
        ) : comments.map((comment) => (
          <CommentNode
            key={comment._id}
            comment={comment}
            depth={0}
            user={user}
            isAuthenticated={isAuthenticated}
            editingId={editingId}
            editBody={editBody}
            setEditBody={setEditBody}
            onStartEdit={handleStartEdit}
            onCancelEdit={handleCancelEdit}
            onSaveEdit={handleSaveEdit}
            onDelete={handleDelete}
            onLike={handleToggleLike}
            onReply={handleReply}
            onShare={setSharingComment}
            replyingTo={replyingTo}
            replyBody={replyBody}
            setReplyBody={setReplyBody}
            submittingReply={submittingReply}
            onSubmitReply={handleSubmitReply}
            replyInputRef={replyInputRef}
            expandedThreads={expandedThreads}
            onToggleThread={toggleThread}
          />
        ))}
      </div>

      <ConfirmDeleteModal
        isOpen={Boolean(commentToDelete)}
        onClose={() => {
          if (!isDeleting) setCommentToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title={commentToDelete?.isReply ? 'Delete Reply?' : 'Delete Comment?'}
        message="Comment text will be replaced with “Comment is deleted”."
        details="Replies and the rest of the discussion will stay in place."
        confirmText={isDeleting ? 'Deleting...' : 'Delete Comment'}
        isDeleting={isDeleting}
      />

      <ShareModal
        isOpen={Boolean(sharingComment)}
        onClose={() => setSharingComment(null)}
        quiz={quiz || { _id: quizId }}
        comment={sharingComment}
      />
    </div>
  );
}
