import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Heart, MessageCircle, UserPlus } from 'lucide-react';
import api from '../../api/axios';
import { Button, Spinner } from '../../components/ui';

const iconFor = (verb) => {
  if (verb === 'followed') return UserPlus;
  if (verb === 'commented') return MessageCircle;
  if (verb === 'quiz_liked') return Heart;
  return Bell;
};

const copyFor = (notification) => {
  const actor = notification.actor?.username ? `@${notification.actor.username}` : 'Someone';
  if (notification.verb === 'followed') return `${actor} followed you`;
  if (notification.verb === 'commented') return `${actor} commented on your quiz`;
  if (notification.verb === 'quiz_liked') return `${actor} liked your quiz`;
  if (notification.verb === 'quiz_attempted') return `${actor} attempted your quiz`;
  return `${actor} interacted with your quiz`;
};

const targetFor = (notification) => {
  if (notification.verb === 'followed' && notification.actor?.username) {
    return `/@${notification.actor.username}`;
  }
  if (notification.quiz?._id) {
    return `/quiz/${notification.quiz._id}`;
  }
  return '#';
};

const timeAgo = (value) => {
  const minutes = Math.max(Math.floor((Date.now() - new Date(value).getTime()) / 60000), 0);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

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
    await api.patch('/social/notifications/read-all');
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
    setUnread(0);
  };

  return (
    <>
      <div className="notifications-shell">
        <header className="notifications-header">
          <div>
            <h1>Notifications</h1>
            <p>{unread} unread updates</p>
          </div>
          <Button variant="secondary" onClick={markAllRead} disabled={!unread}>
            <CheckCheck size={17} />
            Mark read
          </Button>
        </header>

        {loading ? (
          <div className="notifications-state"><Spinner size={34} /></div>
        ) : notifications.length === 0 ? (
          <div className="notifications-state">No notifications yet.</div>
        ) : (
          <div className="notifications-list">
            {notifications.map((notification) => {
              const Icon = iconFor(notification.verb);
              return (
                <Link
                  key={notification._id}
                  to={targetFor(notification)}
                  className={`notification-row ${notification.readAt ? '' : 'unread'}`}
                >
                  <span className="notification-icon"><Icon size={19} /></span>
                  <span className="notification-copy">
                    <strong>{copyFor(notification)}</strong>
                    <small>{notification.quiz?.title || notification.comment?.body || 'Profile activity'} / {timeAgo(notification.createdAt)}</small>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <style>{styles}</style>
    </>
  );
}

const styles = `
  .notifications-shell {
    width: min(760px, 100%);
    margin: 0 auto;
  }

  .notifications-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    margin-bottom: 18px;
  }

  .notifications-header h1 {
    margin: 0;
    font-size: 28px;
    line-height: 1;
    font-weight: 900;
  }

  .notifications-header p {
    margin: 7px 0 0;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .notifications-list {
    border: 1px solid var(--color-border);
  }

  .notification-row {
    min-height: 70px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text);
    text-decoration: none;
  }

  .notification-row:last-child {
    border-bottom: none;
  }

  .notification-row.unread {
    background: var(--color-surface-alt);
  }

  .notification-icon {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
  }

  .notification-copy {
    min-width: 0;
  }

  .notification-copy strong,
  .notification-copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .notification-copy strong {
    font-size: 14px;
  }

  .notification-copy small {
    margin-top: 4px;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .notifications-state {
    min-height: 260px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
  }
`;
