import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, User, MessageSquare } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { messageService } from '../../services/message.service';
import { getSocket } from '../../services/socket.service';

export default function MobileHeader({ title }) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    messageService.getUnreadCount().then((count) => setUnreadCount(count)).catch(() => {});

    const socket = getSocket();
    if (!socket) return;

    const handleUpdate = () => {
      messageService.getUnreadCount().then((count) => setUnreadCount(count)).catch(() => {});
    };

    socket.on('conversation:updated', handleUpdate);
    socket.on('conversation:unread_cleared', handleUpdate);
    return () => {
      socket.off('conversation:updated', handleUpdate);
      socket.off('conversation:unread_cleared', handleUpdate);
    };
  }, []);

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 40,
      height: 'var(--header-height)',
      paddingTop: 'var(--safe-top)',
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: '16px',
      paddingRight: '16px',
    }}>
      {/* Brand or Page Title */}
      <div 
        onClick={() => navigate('/dashboard')}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
      >
        <div style={{
          width: '28px',
          height: '28px',
          borderRadius: '8px',
          background: 'var(--color-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          color: '#000000',
          fontSize: '15px'
        }}>
          Q
        </div>
        <span style={{ fontWeight: 800, fontSize: '17px', letterSpacing: '-0.4px', color: 'var(--color-text)' }}>
          {title || 'QuizFocus'}
        </span>
      </div>

      {/* Right Actions: Streak, Messages & Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Streak Pill */}
        <div 
          onClick={() => navigate('/challenges')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'var(--bg-elevated)',
            border: '1px solid rgba(255, 69, 0, 0.25)',
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill)',
            cursor: 'pointer',
          }}
        >
          <Flame size={15} color="var(--color-accent)" fill="var(--color-accent)" />
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}>
            {user?.streak ?? 0}
          </span>
        </div>

        {/* Direct Messages Button */}
        <button
          onClick={() => navigate('/messages')}
          aria-label="Direct Messages"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-secondary)',
            position: 'relative',
            cursor: 'pointer',
          }}
        >
          <MessageSquare size={16} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '-3px',
              right: '-3px',
              background: 'var(--color-accent)',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 800,
              width: '15px',
              height: '15px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #000000',
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Profile Avatar */}
        <button
          onClick={() => navigate('/profile')}
          aria-label="Profile"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-secondary)',
          }}
        >
          <User size={16} />
        </button>
      </div>
    </header>
  );
}
