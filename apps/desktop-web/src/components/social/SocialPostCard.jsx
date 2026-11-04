import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bookmark,
  Check,
  MessageCircle,
  Play,
  Send,
  Share2,
  Trophy,
  User,
  Heart,
} from 'lucide-react';
import api from '../../api/axios';
import { useAuthStore } from '../../store/authStore';
import ShareModal from './ShareModal';
import './SocialPostCard.css';

const compactNumber = (value = 0) => {
  const number = Number(value) || 0;
  if (number >= 1000000) return `${Math.round(number / 100000) / 10}m`;
  if (number >= 1000) return `${Math.round(number / 100) / 10}k`;
  return String(number);
};

const timeAgo = (value) => {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(Math.floor(diff / 60000), 0);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString();
};

export default function SocialPostCard({ quiz, onQuizUpdate }) {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const [item, setItem] = useState(quiz);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [shareModalOpen, setShareModalOpen] = useState(false);

  useEffect(() => setItem(quiz), [quiz]);

  const social = item.social || {};
  const uploader = item.uploader || {};
  const quizUrl = `/quiz/${item._id}`;
  const authorUrl = uploader.username ? `/@${uploader.username}` : '#';
  const canInteract = isAuthenticated;

  const handleAuthRequired = () => {
    if (!canInteract) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return false;
    }
    return true;
  };

  const updateQuiz = (updatedQuiz) => {
    setItem(updatedQuiz);
    onQuizUpdate?.(updatedQuiz);
  };

  const toggleLike = async () => {
    if (!handleAuthRequired() || busyAction) return;
    setBusyAction('like');
    try {
      const method = social.likedByMe ? 'delete' : 'post';
      const { data } = await api[method](`/social/quizzes/${item._id}/like`);
      updateQuiz(data.data.quiz);
    } finally {
      setBusyAction('');
    }
  };

  const toggleBookmark = async () => {
    if (!handleAuthRequired() || busyAction) return;
    setBusyAction('bookmark');
    try {
      const method = social.bookmarkedByMe ? 'delete' : 'post';
      const { data } = await api[method](`/social/quizzes/${item._id}/bookmark`);
      updateQuiz(data.data.quiz);
    } finally {
      setBusyAction('');
    }
  };

  const shareQuiz = () => {
    setShareModalOpen(true);
  };

  const fetchComments = async () => {
    setCommentsLoading(true);
    try {
      const { data } = await api.get(`/social/quizzes/${item._id}/comments`, { params: { limit: 20 } });
      setComments(data.data.comments || []);
    } finally {
      setCommentsLoading(false);
    }
  };

  const toggleComments = async () => {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next && comments.length === 0) {
      await fetchComments();
    }
  };

  const submitComment = async (event) => {
    event.preventDefault();
    if (!handleAuthRequired() || !commentBody.trim()) return;
    setSubmittingComment(true);
    try {
      const { data } = await api.post(`/social/quizzes/${item._id}/comments`, { body: commentBody.trim() });
      setComments((current) => [data.data.comment, ...current]);
      setCommentBody('');
      updateQuiz({
        ...item,
        social: {
          ...social,
          commentCount: (social.commentCount || 0) + 1,
        },
        commentCount: (item.commentCount || 0) + 1,
      });
    } finally {
      setSubmittingComment(false);
    }
  };

  const metaLine = useMemo(() => {
    const parts = [
      item.category || 'General',
      `${item.questionCount || 0} questions`,
      `${compactNumber(item.totalAttempts || 0)} attempts`,
    ];
    return parts.join(' / ');
  }, [item.category, item.questionCount, item.totalAttempts]);

  return (
    <article className="social-post">
      <header className="social-post-head">
        <Link to={authorUrl} className="social-post-author">
          <span className="social-post-avatar">
            {uploader.avatar ? (
              <img
                src={uploader.avatar}
                alt=""
                loading="lazy"
                decoding="async"
                width="28"
                height="28"
              />
            ) : (
              <User size={18} />
            )}
          </span>
          <span>
            <strong>{uploader.name || uploader.username || 'QuizFocus user'}</strong>
            <small>{uploader.username ? `@${uploader.username}` : 'public quiz'} / {timeAgo(item.createdAt)}</small>
          </span>
        </Link>
        {item.difficulty ? <span className="social-post-pill">{item.difficulty}</span> : null}
      </header>

      <Link to={quizUrl} className="social-post-main">
        <div className="social-post-kicker">{metaLine}</div>
        <h2>{item.title}</h2>
        {item.description ? <p>{item.description}</p> : null}
        <div className="social-post-stats">
          <span><Trophy size={15} /> {Math.round(item.avgScore || 0)}% avg</span>
          <span>{compactNumber(social.likeCount ?? item.likeCount)} likes</span>
          <span>{compactNumber(social.commentCount ?? item.commentCount)} comments</span>
        </div>
      </Link>

      <div className="social-post-actions" aria-label="Quiz interactions">
        <button type="button" onClick={toggleLike} className={social.likedByMe ? 'active' : ''} disabled={busyAction === 'like'} title="Like">
          <Heart size={22} fill={social.likedByMe ? 'currentColor' : 'none'} />
          <span>{compactNumber(social.likeCount ?? item.likeCount)}</span>
        </button>
        <button type="button" onClick={toggleComments} className={commentsOpen ? 'active' : ''} title="Comments">
          <MessageCircle size={22} />
          <span>{compactNumber(social.commentCount ?? item.commentCount)}</span>
        </button>
        <button type="button" onClick={shareQuiz} disabled={busyAction === 'share'} title="Share">
          {copied ? <Check size={22} /> : <Share2 size={22} />}
          <span>{compactNumber(social.shareCount ?? item.shareCount)}</span>
        </button>
        <button type="button" onClick={toggleBookmark} className={social.bookmarkedByMe ? 'active' : ''} disabled={busyAction === 'bookmark'} title="Bookmark">
          <Bookmark size={22} fill={social.bookmarkedByMe ? 'currentColor' : 'none'} />
        </button>
        <Link to={quizUrl} className="social-post-start">
          <Play size={18} fill="currentColor" />
          <span>Start</span>
        </Link>
      </div>

      {commentsOpen ? (
        <section className="social-comments">
          {commentsLoading ? <div className="social-comment-state">Loading comments...</div> : null}
          {!commentsLoading && comments.length === 0 ? <div className="social-comment-state">No comments yet.</div> : null}
          {comments.map((comment) => (
            <div key={comment._id} className="social-comment">
              <Link to={comment.author?.username ? `/@${comment.author.username}` : '#'} className="social-comment-name">
                @{comment.author?.username || 'user'}
              </Link>
              <p>{comment.body}</p>
            </div>
          ))}
          <form onSubmit={submitComment} className="social-comment-form">
            <input
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder={isAuthenticated ? `Comment as @${user?.username}` : 'Log in to comment'}
              disabled={!isAuthenticated || submittingComment}
              maxLength={1000}
            />
            <button type="submit" disabled={!commentBody.trim() || submittingComment} title="Post comment">
              <Send size={18} />
            </button>
          </form>
        </section>
      ) : null}

      {/* Share Modal */}
      {shareModalOpen && (
        <ShareModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          quiz={item}
        />
      )}
    </article>
  );
}
