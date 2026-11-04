import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Heart, MessageCircle, UserPlus, Check, Search, X } from 'lucide-react';
import api from '../../api/axios';
import { Button, Spinner, EmptyState } from '../../components/ui';
import './Notifications.css';

const iconFor = (verb) => {
  if (verb === 'commented') return MessageCircle;
  if (verb === 'quiz_liked' || verb === 'comment_liked') return Heart;
  return Bell;
};

const copyFor = (notification) => {
  const actor = notification.actor?.username ? `@${notification.actor.username}` : 'Someone';
  const quizTitle = notification.quiz?.title ? ` "${notification.quiz.title}"` : '';
  if (notification.verb === 'commented') return `${actor} commented on your quiz${quizTitle}`;
  if (notification.verb === 'quiz_liked') return `${actor} liked your quiz${quizTitle}`;
  if (notification.verb === 'comment_liked') return `${actor} liked your comment`;
  return `${actor} interacted with your content`;
};

const targetFor = (notification) => {
  if (notification.quiz?._id) {
    return `/quiz/${notification.quiz._id}${notification.comment?._id ? `#comment-${notification.comment._id}` : ''}`;
  }
  if (notification.actor?.username) {
    return `/@${notification.actor.username}`;
  }
  return '#';
};

const timeAgo = (value) => {
  const minutes = Math.max(Math.floor((Date.now() - new Date(value).getTime()) / 60000), 0);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
};

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/social/notifications');
      setNotifications(data.data.notifications || []);
      setUnread(data.data.unread || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markAllRead = async () => {
    try {
      await api.patch('/social/notifications/read-all');
      setNotifications((current) =>
        current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() }))
      );
      setUnread(0);
    } catch {}
  };

  const markSingleRead = async (id, e) => {
    e?.preventDefault();
    e?.stopPropagation();
    try {
      await api.patch(`/social/notifications/${id}/read`);
      setNotifications((current) =>
        current.map((item) => (item._id === id ? { ...item, readAt: new Date().toISOString() } : item))
      );
      setUnread((prev) => Math.max(prev - 1, 0));
    } catch {}
  };

  const filteredNotifications = notifications.filter((notification) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [
      copyFor(notification),
      notification.actor?.username,
      notification.quiz?.title,
      notification.comment?.body,
    ].some((value) => value?.toLowerCase().includes(query));
  });

  return (
    <div className="notifications-shell">
        <header className="notifications-header consistent-page-header">
          <div className="notifications-title-wrap">
            <h1 className="consistent-page-title">Notifications</h1>
            {unread > 0 && <span className="unread-count-pill">{unread} new</span>}
          </div>
          <div className="notifications-header-actions">
            <Button variant="secondary" onClick={markAllRead} disabled={!unread}>
              <CheckCheck size={16} />
              <span>Mark all read</span>
            </Button>
            <label className="notifications-search consistent-page-search consistent-search-field">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                className="consistent-search-input"
                placeholder="Search"
                aria-label="Search notifications"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </label>
          </div>
        </header>

        {loading ? (
          <div className="notifications-state">
            <Spinner size={32} />
            <span>Loading notifications...</span>
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={<Bell size={24} />}
            title="No notifications yet"
            action={{
              label: "Explore Quizzes",
              to: "/explore"
            }}
          />
        ) : filteredNotifications.length === 0 ? (
          <div className="notifications-state">No notifications match “{searchQuery}”.</div>
        ) : (
          <div className="notifications-list">
            {filteredNotifications.map((notification) => {
              const Icon = iconFor(notification.verb);
              const isUnread = !notification.readAt;

              return (
                <div
                  key={notification._id}
                  className={`notification-row ${isUnread ? 'unread' : ''}`}
                >
                  <Link
                    to={targetFor(notification)}
                    className="notification-link"
                    onClick={() => {
                      if (isUnread) markSingleRead(notification._id);
                    }}
                  >
                    <span className={`notification-icon-wrap ${notification.verb}`}>
                      <Icon size={18} />
                    </span>
                    <span className="notification-copy">
                      <strong>{copyFor(notification)}</strong>
                      <small>
                        {notification.quiz?.title || notification.comment?.body || 'Community activity'} • {timeAgo(notification.createdAt)}
                      </small>
                    </span>
                  </Link>

                  {isUnread && (
                    <button
                      type="button"
                      className="btn-mark-single-read"
                      onClick={(e) => markSingleRead(notification._id, e)}
                      title="Mark as read"
                    >
                      <Check size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
  );
}
